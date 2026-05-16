"""Compose the /api/study/mission-control response (PR3).

Pulls together:
- Latest persona snapshot (PR1) — computes one if missing.
- Tiny-question selector (PR2) — for the progressive question card.
- Existing Study OS rows: active plan, today's tasks, focus summary,
  weekly review.

Every external read is wrapped — if any optional source is unavailable
we degrade to safe defaults instead of failing the endpoint.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from app.exam_intelligence.coverage import locked_topic_coverage
from app.exam_intelligence.lookup import resolve_exam_by_id
from app.exam_intelligence.status import exam_intelligence_status
from app.study_os.competition_context import competition_context
from app.study_os.update_context import (
    empty_policy_update_context,
    policy_update_context,
)
from app.persona.snapshots import (
    compute_persona_snapshot,
    get_latest_persona_snapshot,
)
from app.persona_questions.selector import select_next_question
from app.study_os.task_reasoning import (
    build_task_reasoning,
    build_task_reasoning_detail,
)

logger = logging.getLogger("career_copilot.study_os.mission_control")

MISSION_CONTROL_SOURCE = "mission_control_v1"


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("study_os.mission_control read failed: %s", exc)
        return default


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _week_start_iso() -> str:
    now = datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return monday.date().isoformat()


# ─── Exam intelligence ────────────────────────────────────────────────────
def _load_exam_intelligence(supabase: Any, user_id: str) -> dict[str, Any]:
    """Read the user's target exam and look up verified intelligence status.

    Returns the status dict from ``exam_intelligence_status`` — always a
    dict, with ``available=False`` when nothing is verified.
    """
    profile_rows = _safe(
        lambda: (
            supabase.table("profiles")
            .select("target_exam, goal_exams")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    profile = profile_rows[0] if profile_rows else {}
    target = profile.get("target_exam")
    if not target:
        # Fall back to the first preference exam if profile lacks a single target.
        prefs = _safe(
            lambda: (
                supabase.table("aspirant_preferences")
                .select("target_exams")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        ) or []
        exams = (prefs[0] if prefs else {}).get("target_exams") or []
        if isinstance(exams, list) and exams:
            target = exams[0]
    if not target:
        return {
            "available": False,
            "exam_id": None,
            "exam_slug": None,
            "exam_name": None,
            "verified_topics": 0,
            "verified_pyq_tags": 0,
            "verified_syllabus_mentions": 0,
        }
    try:
        return exam_intelligence_status(supabase, target)
    except Exception as exc:  # noqa: BLE001
        logger.warning("mission_control exam intelligence lookup failed: %s", exc)
        return {
            "available": False,
            "exam_id": None,
            "exam_slug": target,
            "exam_name": None,
            "verified_topics": 0,
            "verified_pyq_tags": 0,
            "verified_syllabus_mentions": 0,
        }


# ─── Exam context (verified-only) ─────────────────────────────────────────
def _days_remaining_for_exam(supabase: Any, exam_id: str) -> int | None:
    """Days until the soonest upcoming cycle's ``exam_start`` for ``exam_id``.

    Returns ``None`` when no future cycle date is available — the UI is
    expected to handle partial metadata.
    """
    today = datetime.now(timezone.utc).date()
    rows = _safe(
        lambda: (
            supabase.table("exam_cycles")
            .select("exam_start")
            .eq("exam_id", exam_id)
            .gte("exam_start", today.isoformat())
            .order("exam_start")
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not rows or not rows[0].get("exam_start"):
        return None
    try:
        start = datetime.fromisoformat(str(rows[0]["exam_start"])).date()
    except (ValueError, TypeError):
        return None
    return max(0, (start - today).days)


def _load_exam_context(supabase: Any, exam_intel: dict[str, Any]) -> dict[str, Any]:
    """Build the ``exam_context`` block.

    ``high_yield_topics`` is populated ONLY from ``exam_topic_coverage``
    rows whose ``reviewer_status='locked'`` — pending / reviewed / rejected
    coverage never reaches the aspirant.
    """
    empty = {
        "exam_id": None,
        "exam_family": None,
        "exam": (exam_intel or {}).get("exam_slug"),
        "cycle": None,
        "phase": None,
        "days_remaining": None,
        "verified_intelligence_status": "none",
        "high_yield_topics": [],
    }
    if not exam_intel or not exam_intel.get("exam_id"):
        return empty

    exam_id = exam_intel["exam_id"]
    locked = _safe(lambda: locked_topic_coverage(supabase, exam_id), default=[]) or []

    family_name = None
    exam_row = _safe(lambda: resolve_exam_by_id(supabase, exam_id), default=None)
    if exam_row and exam_row.get("exam_family_id"):
        fam_rows = _safe(
            lambda: (
                supabase.table("exam_families")
                .select("name")
                .eq("id", exam_row["exam_family_id"])
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        ) or []
        if fam_rows:
            family_name = fam_rows[0].get("name")

    available = bool(exam_intel.get("available"))
    if locked:
        status = "verified"
    elif available:
        status = "partial"
    else:
        status = "none"

    high_yield_topics = [
        {
            "topic": t.get("topic"),
            "priority_score": t.get("priority_score"),
            "confidence_score": t.get("confidence_score"),
            "status": t.get("status"),
        }
        for t in locked[:10]
    ]
    return {
        "exam_id": exam_id,
        "exam_family": family_name,
        "exam": exam_intel.get("exam_name") or exam_intel.get("exam_slug"),
        "cycle": None,
        "phase": None,
        "days_remaining": _days_remaining_for_exam(supabase, exam_id),
        "verified_intelligence_status": status,
        "high_yield_topics": high_yield_topics,
    }


# ─── Competition context (verified-only) ──────────────────────────────────
def _load_competition_context(
    supabase: Any, exam_intel: dict[str, Any], exam_context: dict[str, Any]
) -> dict[str, Any]:
    """Build the ``competition_context`` block.

    Reads ``exam_competition_metrics`` via ``competition_context``, reusing
    the ``days_remaining`` already computed for ``exam_context`` so the
    cycle-pressure read is not duplicated.
    """
    exam_id = (exam_intel or {}).get("exam_id")
    days_remaining = (exam_context or {}).get("days_remaining")
    return _safe(
        lambda: competition_context(
            supabase, exam_id, days_remaining=days_remaining
        ),
        default=competition_context(None, None),
    )


# ─── Policy / update context (discovery + verified-only) ──────────────────
def _load_policy_update_context(
    supabase: Any, exam_intel: dict[str, Any]
) -> dict[str, Any]:
    """Return the ``policy_update_context`` block.

    Verified official updates may carry ``affects_*`` flags; non-official
    aggregator / research / opportunity rows are discovery-only and never
    influence plan / deadline / eligibility.
    """
    exam_id = (exam_intel or {}).get("exam_id")
    return _safe(
        lambda: policy_update_context(supabase, exam_id),
        default=empty_policy_update_context(),
    )


# ─── Safe user-facing explanation ─────────────────────────────────────────
def _safe_user_explanation(
    snapshot: dict[str, Any],
    metrics: dict[str, Any],
    review: dict[str, Any],
    study_policy: dict[str, Any],
) -> list[str]:
    """Plain-language explanations safe to show an aspirant.

    Derived from progress signals + policy shape. Never contains a raw
    persona dimension label — those stay internal.
    """
    out: list[str] = []
    total = int(metrics.get("tasks_total") or 0)
    rate = metrics.get("task_completion_rate")
    backlog = int(review.get("backlog_count") or 0)
    learning = (snapshot.get("dimensions") or {}).get("learning_behavior")
    size = (study_policy or {}).get("preferred_task_size")

    if total and rate is not None and rate < 0.5:
        out.append(
            "Today's plan is lighter because your recent task completion rate dropped."
        )
    if backlog >= 3:
        out.append(
            f"Revision and catch-up are prioritized because {backlog} tasks are in your backlog."
        )
    if learning == "high_mock_low_review":
        out.append(
            "Mock review is prioritized because your recent mocks haven't been reviewed yet."
        )
    if size == "small" and not out:
        out.append("Tasks are kept short today to match your available study time.")
    if not out:
        out.append("Your plan reflects your recent study activity and current goals.")
    return out


# ─── Plan reasoning (tagged) ──────────────────────────────────────────────
def _plan_reasoning(
    snapshot: dict[str, Any],
    exam_context: dict[str, Any],
    metrics: dict[str, Any],
    review: dict[str, Any],
    study_policy: dict[str, Any],
    update_context: dict[str, Any],
    competition_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Tagged reasoning behind today's plan.

    Each entry carries a ``reason_type`` in ``{persona, exam_intelligence,
    competition_pressure, policy_update, progress}`` so the UI can keep the
    signal channels visually separated.
    """
    out: list[dict[str, Any]] = []
    competition_context = competition_context or {}

    # persona
    size = (study_policy or {}).get("preferred_task_size")
    max_tasks = (study_policy or {}).get("max_tasks_per_day")
    bits: list[str] = []
    if max_tasks:
        bits.append(f"up to {max_tasks} tasks/day")
    if size:
        bits.append(f"{size} blocks")
    if bits:
        out.append(
            {
                "reason_type": "persona",
                "summary": "Task count and sizing (" + ", ".join(bits) + ") come from your current study policy.",
            }
        )
    else:
        out.append(
            {
                "reason_type": "persona",
                "summary": "Task sizing follows your current study policy.",
            }
        )

    # exam_intelligence
    high_yield = exam_context.get("high_yield_topics") or []
    if high_yield:
        top = high_yield[0].get("topic")
        exam = exam_context.get("exam")
        suffix = f" for {exam}." if exam else "."
        out.append(
            {
                "reason_type": "exam_intelligence",
                "summary": f"{top} is prioritized as a verified priority topic{suffix}",
            }
        )
    elif exam_context.get("verified_intelligence_status") == "partial":
        out.append(
            {
                "reason_type": "exam_intelligence",
                "summary": "Verified exam intelligence is still partial — topic prioritization is limited until more is locked.",
            }
        )

    # competition_pressure
    if competition_context.get("available"):
        pressure = competition_context.get("cycle_pressure") or {}
        level = pressure.get("pressure_level")
        if level in {"medium", "high"}:
            days = pressure.get("days_remaining")
            near = days is not None and days <= 45
            if level == "high" and near:
                summary = (
                    "Revision and timed practice are prioritized — this cycle has "
                    "high competition pressure and the exam is near."
                )
            elif level == "high":
                summary = (
                    "Accuracy drills and PYQ practice are weighted up because this "
                    "cycle has high competition pressure."
                )
            else:
                summary = (
                    "Practice volume is nudged up to match the competition pressure "
                    "for this cycle."
                )
            out.append({"reason_type": "competition_pressure", "summary": summary})

    # progress
    backlog = int(review.get("backlog_count") or 0)
    mocks = int(review.get("mocks_taken") or 0)
    total = int(metrics.get("tasks_total") or 0)
    rate = metrics.get("task_completion_rate") or 0
    if backlog >= 3:
        out.append(
            {
                "reason_type": "progress",
                "summary": f"Catch-up work is prioritized because {backlog} tasks are in your backlog.",
            }
        )
    elif total and rate < 0.5:
        out.append(
            {
                "reason_type": "progress",
                "summary": "Today's task count is reduced because recent completion has been low.",
            }
        )
    elif mocks == 0:
        out.append(
            {
                "reason_type": "progress",
                "summary": "No mocks logged this week — retrieval practice is favored over new theory.",
            }
        )

    # policy_update — only verified official updates reach this channel.
    official_updates = update_context.get("official_updates") or []
    if official_updates:
        first = official_updates[0]
        update_type = (first.get("update_type") or "").replace("_", " ")
        if update_context.get("affects_vacancy"):
            summary = (
                "Vacancy was updated from an official source, so plan priority "
                "was recalculated."
            )
        elif update_context.get("affects_syllabus"):
            summary = (
                "An official syllabus change was verified — affected topics are "
                "flagged for coverage review before they reach the plan."
            )
        elif update_type:
            summary = f"A verified official update ({update_type}) affects this plan."
        else:
            summary = "A verified official update affects this plan."
        out.append({"reason_type": "policy_update", "summary": summary})

    return out


# ─── Persona snapshot ──────────────────────────────────────────────────────
def _load_persona_snapshot(supabase: Any, user_id: str) -> dict[str, Any]:
    """Fetch (or compute) the latest persona snapshot.

    Always returns a dict — never None. If computing also fails we
    return an empty shape so the rest of the response can still build.
    """
    snapshot = _safe(lambda: get_latest_persona_snapshot(supabase, user_id), default=None)
    if snapshot:
        return snapshot
    computed = _safe(
        lambda: compute_persona_snapshot(
            supabase, user_id, reason="mission_control_first_read"
        ),
        default=None,
    )
    return computed or {
        "persona_version": "v1",
        "primary_persona": None,
        "dimensions": {},
        "scores": {},
        "evidence": [],
        "study_policy": {},
    }


# ─── Active plan + tasks ───────────────────────────────────────────────────
def _active_plan_id(supabase: Any, user_id: str) -> str | None:
    rows = _safe(
        lambda: (
            supabase.table("study_plans")
            .select("id, status, day, theme, target, start_date, end_date, "
                    "weekly_hours_goal, metadata")
            .eq("user_id", user_id)
            .eq("status", "active")
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not rows:
        return None
    return rows[0].get("id")


def _load_active_plan(supabase: Any, user_id: str) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("study_plans")
            .select(
                "id, status, theme, target, start_date, end_date, "
                "weekly_hours_goal, metadata"
            )
            .eq("user_id", user_id)
            .eq("status", "active")
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not rows:
        return None
    row = rows[0]
    return {
        "id": row.get("id"),
        "day": None,  # the existing /api/study/plan does not compute this
        "theme": row.get("theme") or "Adaptive weekly plan",
        "target": row.get("target") or "Complete planned blocks",
        "source": "existing_study_plan",
    }


def _load_today_tasks(supabase: Any, plan_id: str) -> list[dict[str, Any]]:
    if not plan_id:
        return []
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select(
                "id, day_label, subject, topic, microtopic, task_type, "
                "title, duration_mins, planned_minutes, status, "
                "completed_at, scheduled_date"
            )
            .eq("plan_id", plan_id)
            .order("day_label")
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []

    today_iso = _today_iso()
    shaped: list[dict[str, Any]] = []
    for r in rows:
        scheduled = (r.get("scheduled_date") or "").strip()
        # Keep tasks scheduled for today, plus anything actively in
        # progress / planned without a date.
        if scheduled and scheduled != today_iso:
            continue
        status = (r.get("status") or "planned").lower()
        shaped.append(
            {
                "id": r.get("id"),
                "title": r.get("title") or r.get("topic") or r.get("subject"),
                "time": r.get("day_label") or "Today",
                "status": status,
                "done": status == "completed",
                "subject": r.get("subject"),
                "topic": r.get("topic"),
                "task_type": r.get("task_type"),
                "planned_minutes": r.get("planned_minutes") or r.get("duration_mins"),
                "priority_score": None,
            }
        )
    return shaped


# ─── Focus + weekly review summary ────────────────────────────────────────
def _focus_summary(supabase: Any, user_id: str) -> dict[str, Any]:
    since_7d = _iso_days_ago(7)
    sessions = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("duration_mins, started_at, ended_at")
            .eq("user_id", user_id)
            .gte("started_at", since_7d)
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []
    total_minutes = sum((s.get("duration_mins") or 0) for s in sessions if s.get("ended_at"))
    return {
        "total_minutes_7d": int(total_minutes or 0),
        "total_hours_7d": round((total_minutes or 0) / 60.0, 2),
        "active_count": sum(1 for s in sessions if not s.get("ended_at")),
    }


def _weekly_review(
    supabase: Any, user_id: str, plan_id: str | None
) -> dict[str, Any]:
    week_start = _week_start_iso()
    sessions = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("duration_mins")
            .eq("user_id", user_id)
            .gte("started_at", week_start)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    mocks = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("id")
            .eq("user_id", user_id)
            .gte("attempted_at", week_start)
            .limit(100)
            .execute()
            .data
        ),
        default=[],
    ) or []
    completed = 0
    total_planned = 0
    skipped = 0
    backlog = 0
    if plan_id:
        completed_rows = _safe(
            lambda: (
                supabase.table("study_tasks")
                .select("id")
                .eq("plan_id", plan_id)
                .eq("status", "completed")
                .gte("completed_at", week_start)
                .limit(500)
                .execute()
                .data
            ),
            default=[],
        ) or []
        completed = len(completed_rows)
        total_planned = len(
            _safe(
                lambda: (
                    supabase.table("study_tasks")
                    .select("id")
                    .eq("plan_id", plan_id)
                    .gte("scheduled_date", week_start)
                    .limit(500)
                    .execute()
                    .data
                ),
                default=[],
            )
            or []
        )
        skipped = len(
            _safe(
                lambda: (
                    supabase.table("study_tasks")
                    .select("id")
                    .eq("plan_id", plan_id)
                    .eq("status", "skipped")
                    .gte("updated_at", week_start)
                    .limit(500)
                    .execute()
                    .data
                ),
                default=[],
            )
            or []
        )
        backlog = len(
            _safe(
                lambda: (
                    supabase.table("study_tasks")
                    .select("id")
                    .eq("plan_id", plan_id)
                    .in_("status", ["missed", "carried_forward"])
                    .limit(500)
                    .execute()
                    .data
                ),
                default=[],
            )
            or []
        )
    hours_studied = round(sum((s.get("duration_mins") or 0) for s in sessions) / 60.0, 2)
    return {
        "week_start": week_start,
        "hours_studied": hours_studied,
        "completed_tasks": completed,
        "total_planned": total_planned,
        "skipped_tasks": skipped,
        "backlog_count": backlog,
        "mocks_taken": len(mocks),
    }


def _weekly_hours_goal(snapshot: dict[str, Any]) -> float:
    policy = snapshot.get("study_policy") or {}
    target_min = policy.get("daily_minutes_target")
    try:
        target_min = float(target_min) if target_min is not None else 0.0
    except (TypeError, ValueError):
        target_min = 0.0
    # Rough conservative estimate: 6 productive days a week.
    return round((target_min * 6.0) / 60.0, 2)


# ─── Metrics + truth panel ─────────────────────────────────────────────────
def _metrics(
    today_tasks: list[dict[str, Any]],
    focus: dict[str, Any],
    review: dict[str, Any],
    weekly_hours_goal: float,
) -> dict[str, Any]:
    total = len(today_tasks)
    completed = sum(1 for t in today_tasks if t.get("done"))
    completion_rate = round(completed / total, 3) if total else 0.0
    hours_studied_7d = float(focus.get("total_hours_7d") or 0.0)
    hours_planned_week = float(weekly_hours_goal or 0.0)
    adherence: float | None = None
    if hours_planned_week:
        adherence = round(min(1.0, hours_studied_7d / hours_planned_week), 3)
    return {
        "tasks_total": total,
        "tasks_completed": completed,
        "task_completion_rate": completion_rate,
        "hours_studied_7d": hours_studied_7d,
        "hours_planned_week": hours_planned_week,
        "adherence": adherence,
        "backlog_count": int(review.get("backlog_count") or 0),
        "mocks_taken": int(review.get("mocks_taken") or 0),
        "revision_coverage": None,
    }


def _truth_panel(
    today_tasks: list[dict[str, Any]],
    review: dict[str, Any],
    metrics: dict[str, Any],
) -> dict[str, Any]:
    total = metrics.get("tasks_total", 0)
    completed = metrics.get("tasks_completed", 0)
    warnings: list[str] = []
    if total == 0 and review.get("total_planned") == 0:
        summary = "No tasks planned for this week yet."
    elif total == 0:
        summary = "No tasks planned for today. The rest of your week still has planned blocks."
    else:
        summary = f"You have completed {completed} of {total} planned tasks today."
    backlog = int(review.get("backlog_count") or 0)
    if backlog >= 5:
        warnings.append(
            f"{backlog} tasks are in your backlog. Short catch-up blocks help recover."
        )
    return {
        "summary": summary,
        "corrections": [],
        "warnings": warnings,
    }


# ─── Next best action ──────────────────────────────────────────────────────
_INCOMPLETE_STATUSES = {"planned", "in_progress", "rescheduled", "carried_forward"}


def _scores_block(snapshot: dict[str, Any]) -> dict[str, Any]:
    scores = dict(snapshot.get("scores") or {})
    dims = snapshot.get("dimensions") or {}
    # Rough confidence proxy mirrors the selector: share of known dims.
    unknown_set = {"unknown", "insufficient_data", "", None}
    if dims:
        known = sum(1 for v in dims.values() if v not in unknown_set)
        confidence = round(known / len(dims), 3)
    else:
        confidence = 0.0
    scores.setdefault("confidence", confidence)

    execution = float(scores.get("execution") or 0.0)
    risk_dim = (dims.get("execution_risk") or "").lower()
    risk_bias = {"high": 0.3, "medium": 0.15, "low": 0.0}.get(risk_dim, 0.0)
    study_risk = round(min(1.0, max(0.0, (1.0 - execution) * 0.7 + risk_bias)), 3)
    scores.setdefault("study_risk", study_risk)
    return scores


def _build_next_best_action(
    today_tasks: list[dict[str, Any]],
    progressive_question: dict[str, Any] | None,
    metrics: dict[str, Any],
    focus: dict[str, Any],
    snapshot: dict[str, Any],
    study_policy: dict[str, Any],
) -> dict[str, Any]:
    # Rule 1: incomplete task wins.
    pending = [t for t in today_tasks if (t.get("status") or "planned") in _INCOMPLETE_STATUSES]
    if pending:
        first = pending[0]
        return {
            "title": "Finish one short priority block",
            "description": "Start with the smallest planned task to build momentum.",
            "action_type": "study_task",
            "task_id": first.get("id"),
            "reason": (
                "You have pending tasks and your current policy favors "
                "short focus blocks."
            ),
        }

    # Rule 2: progressive question if no tasks.
    if not today_tasks and progressive_question:
        return {
            "title": "Answer one personalization question",
            "description": (
                "Your plan adapts when we know your study style. "
                "This takes seconds."
            ),
            "action_type": "progressive_question",
            "task_id": None,
            "question_key": progressive_question.get("question_key"),
            "reason": "No tasks scheduled — answering one tiny question improves the next plan.",
        }

    # Rule 5: no focus minutes this week.
    if not focus.get("total_minutes_7d"):
        return {
            "title": "Start a 25-minute focus session",
            "description": (
                "Logging a short focus session this week gives the plan "
                "real signal to adapt."
            ),
            "action_type": "focus_session",
            "task_id": None,
            "reason": "No focus sessions logged in the last 7 days.",
        }

    # Rule 6: high_mock_low_review → review/correction nudge.
    learning = (snapshot.get("dimensions") or {}).get("learning_behavior")
    if learning == "high_mock_low_review":
        return {
            "title": "Review your most recent mock",
            "description": (
                "Reviewing your latest mock — even briefly — pays more "
                "than taking another one immediately."
            ),
            "action_type": "mock_review",
            "task_id": None,
            "reason": "Recent mocks have outpaced reviews.",
        }

    # Rule 3: low weekly adherence.
    adherence = metrics.get("adherence")
    if adherence is not None and adherence < 0.4:
        return {
            "title": "Plug in one short focus block",
            "description": "A 30-minute block today keeps the week on track.",
            "action_type": "focus_session",
            "task_id": None,
            "reason": "Weekly adherence is currently low.",
        }

    # Rule 4: all tasks complete, suggest review.
    if today_tasks and all(t.get("done") for t in today_tasks):
        return {
            "title": "Review what worked today",
            "description": "A quick review locks in the day's gains.",
            "action_type": "weekly_review",
            "task_id": None,
            "reason": "All planned tasks for today are complete.",
        }

    # Final fallback — never empty.
    return {
        "title": "Open your study plan",
        "description": "Check what's scheduled and adjust if needed.",
        "action_type": "study_plan",
        "task_id": None,
        "reason": "No stronger signal right now — review and proceed.",
    }


# ─── Engine trace ──────────────────────────────────────────────────────────
def _engine_trace(
    snapshot: dict[str, Any],
    plan: dict[str, Any] | None,
    exam_intel: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    persona_available = bool(snapshot.get("persona_version"))
    policy_available = bool(snapshot.get("study_policy"))
    intel = exam_intel or {}
    intel_available = bool(intel.get("available"))
    if intel_available:
        bits = []
        if intel.get("exam_name"):
            bits.append(intel["exam_name"])
        if intel.get("verified_topics"):
            bits.append(f"{intel['verified_topics']} verified topics")
        if intel.get("verified_pyq_tags"):
            bits.append(f"{intel['verified_pyq_tags']} verified PYQ tags")
        if intel.get("verified_syllabus_mentions"):
            bits.append(f"{intel['verified_syllabus_mentions']} verified syllabus mentions")
        intel_details = " · ".join(bits) if bits else "Verified items available"
    else:
        intel_details = "Admin-reviewed exam intelligence is not connected yet"
    return [
        {
            "label": "User signals",
            "status": "available" if persona_available else "missing",
            "details": (
                f"Persona snapshot {snapshot.get('persona_version')}"
                if persona_available
                else "Persona snapshot not available yet"
            ),
        },
        {
            "label": "Study policy",
            "status": "available" if policy_available else "missing",
            "details": (
                "Task sizing and mix derived from persona"
                if policy_available
                else "No study policy derived yet"
            ),
        },
        {
            "label": "Study plan",
            "status": "available" if plan else "missing",
            "details": (
                "Existing active study plan"
                if plan
                else "No active study plan yet"
            ),
        },
        {
            "label": "Exam intelligence",
            "status": "available" if intel_available else "not_connected",
            "details": intel_details,
        },
    ]


# ─── Public entrypoint ─────────────────────────────────────────────────────
def build_mission_control(supabase: Any, user_id: str) -> dict[str, Any]:
    """Build the full mission-control response for ``user_id``.

    Defensive throughout — never raises. Optional sections degrade to
    empty/sentinel values when their source is unavailable.
    """
    snapshot = _load_persona_snapshot(supabase, user_id)
    dimensions = snapshot.get("dimensions") or {}
    study_policy = dict(snapshot.get("study_policy") or {})

    plan = _load_active_plan(supabase, user_id)
    plan_id = plan.get("id") if plan else _safe(
        lambda: _active_plan_id(supabase, user_id), default=None
    )
    today_tasks_raw = _load_today_tasks(supabase, plan_id) if plan_id else []

    focus = _focus_summary(supabase, user_id)
    weekly_hours_goal = _weekly_hours_goal(snapshot)
    review = _weekly_review(supabase, user_id, plan_id)
    exam_intel = _load_exam_intelligence(supabase, user_id)

    today_tasks: list[dict[str, Any]] = []
    has_active_plan = bool(plan_id)
    for task in today_tasks_raw:
        reasoning = build_task_reasoning(
            task,
            dimensions=dimensions,
            study_policy=study_policy,
            has_active_plan=has_active_plan,
        )
        today_tasks.append({**task, "reasoning": reasoning})

    progressive_question: dict[str, Any] | None = None
    try:
        sel = select_next_question(supabase, user_id)
        progressive_question = sel.get("question") if isinstance(sel, dict) else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("mission_control progressive_question failed: %s", exc)
        progressive_question = None

    metrics = _metrics(today_tasks, focus, review, weekly_hours_goal)
    truth_panel = _truth_panel(today_tasks, review, metrics)
    next_best_action = _build_next_best_action(
        today_tasks,
        progressive_question,
        metrics,
        focus,
        snapshot,
        study_policy,
    )
    scores = _scores_block(snapshot)
    engine_trace = _engine_trace(snapshot, plan, exam_intel)

    # Contract blocks: join persona + verified exam intelligence +
    # competition + policy updates + progress into an explainable,
    # aspirant-safe shape.
    exam_context = _load_exam_context(supabase, exam_intel)
    competition_ctx = _load_competition_context(supabase, exam_intel, exam_context)
    policy_update_ctx = _load_policy_update_context(supabase, exam_intel)
    # `update_context` is kept as a backward-compatible alias of the clearer
    # `policy_update_context` object — both point at the same shape.
    update_context = policy_update_ctx
    safe_user_explanation = _safe_user_explanation(
        snapshot, metrics, review, study_policy
    )
    plan_reasoning = _plan_reasoning(
        snapshot,
        exam_context,
        metrics,
        review,
        study_policy,
        update_context,
        competition_ctx,
    )

    preview_flags: list[str] = []
    if not (exam_intel and exam_intel.get("available")):
        preview_flags.append("exam_intelligence_not_connected")
    if not plan:
        preview_flags.append("no_active_study_plan")

    return {
        "date": _today_iso(),
        "user_context": {
            "persona_snapshot_id": snapshot.get("id"),
            "persona_version": snapshot.get("persona_version") or "v1",
            "primary_persona": snapshot.get("primary_persona"),
            "dimensions": dimensions,
            "scores": scores,
            "safe_user_explanation": safe_user_explanation,
        },
        "study_policy": study_policy,
        "plan": plan,
        "exam_context": exam_context,
        "competition_context": competition_ctx,
        "policy_update_context": policy_update_ctx,
        "update_context": update_context,
        "today_tasks": today_tasks,
        "metrics": metrics,
        "next_best_action": next_best_action,
        "truth_panel": truth_panel,
        "plan_reasoning": plan_reasoning,
        "progressive_question": progressive_question,
        "engine_trace": engine_trace,
        "exam_intelligence": exam_intel,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": MISSION_CONTROL_SOURCE,
            "preview_flags": preview_flags,
            "degraded": False,
        },
    }


# ─── Task reasoning endpoint ──────────────────────────────────────────────
def _load_task_for_user(
    supabase: Any, user_id: str, task_id: str
) -> dict[str, Any] | None:
    """Load a study task, but only if its plan belongs to ``user_id``.

    Returns ``None`` when the task is missing or owned by another user —
    the route maps that to a 404 so task ids can't be probed.
    """
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select(
                "id, plan_id, title, subject, topic, microtopic, task_type, "
                "status, planned_minutes, duration_mins, scheduled_date"
            )
            .eq("id", task_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not rows:
        return None
    task = rows[0]
    plan_id = task.get("plan_id")
    if not plan_id:
        return None
    plan_rows = _safe(
        lambda: (
            supabase.table("study_plans")
            .select("id, user_id")
            .eq("id", plan_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not plan_rows or plan_rows[0].get("user_id") != user_id:
        return None
    return task


def build_task_reasoning_response(
    supabase: Any, user_id: str, task_id: str
) -> dict[str, Any] | None:
    """Compose the GET /api/study/task-reasoning/:task_id response.

    Returns ``None`` when the task is not found / not owned by the user.
    Never raises — every read is wrapped.
    """
    task = _load_task_for_user(supabase, user_id, task_id)
    if task is None:
        return None
    snapshot = _load_persona_snapshot(supabase, user_id)
    exam_intel = _load_exam_intelligence(supabase, user_id)
    exam_context = _load_exam_context(supabase, exam_intel)
    return build_task_reasoning_detail(
        task,
        dimensions=snapshot.get("dimensions") or {},
        study_policy=dict(snapshot.get("study_policy") or {}),
        exam_context=exam_context,
    )
