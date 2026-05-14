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

from app.persona.snapshots import (
    compute_persona_snapshot,
    get_latest_persona_snapshot,
)
from app.persona_questions.selector import select_next_question
from app.study_os.task_reasoning import build_task_reasoning

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
) -> list[dict[str, Any]]:
    persona_available = bool(snapshot.get("persona_version"))
    policy_available = bool(snapshot.get("study_policy"))
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
            "status": "not_connected",
            "details": "Admin-reviewed exam intelligence is not connected yet",
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
    engine_trace = _engine_trace(snapshot, plan)

    preview_flags = ["exam_intelligence_not_connected"]
    if not plan:
        preview_flags.append("no_active_study_plan")

    return {
        "user_context": {
            "persona_version": snapshot.get("persona_version") or "v1",
            "primary_persona": snapshot.get("primary_persona"),
            "dimensions": dimensions,
            "scores": scores,
        },
        "study_policy": study_policy,
        "plan": plan,
        "today_tasks": today_tasks,
        "metrics": metrics,
        "next_best_action": next_best_action,
        "truth_panel": truth_panel,
        "progressive_question": progressive_question,
        "engine_trace": engine_trace,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": MISSION_CONTROL_SOURCE,
            "preview_flags": preview_flags,
        },
    }
