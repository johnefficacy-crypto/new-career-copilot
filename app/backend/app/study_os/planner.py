"""Phase 7 — deterministic Study OS planner.

``generate_plan(supabase, user_id)`` composes a day's ``study_tasks`` from
the four Study OS input groups:

  User        — persona ``study_policy`` (task count / sizing),
                ``user_topic_mastery`` (weakness), ``user_topic_error_patterns``.
  Exam        — locked ``exam_topic_coverage`` (priority / high-yield),
                verified PYQ topic counts (frequency),
                ``topic_prerequisites`` (ordering).
  Competition — ``competition_context`` cycle pressure (intensity bias).
  Policy      — ``policy_update_context`` (informational; an official
                ``affects_syllabus`` change surfaces a flag).

Deterministic and defensive: no AI, no randomness — the same inputs always
produce the same plan. Persists one active ``study_plan`` per user, a
``study_plan_versions`` audit row, the day's ``study_tasks`` (each with a
``priority_score`` and a ``why_this_task`` explanation), and a
``study_adaptation_events`` row. ``generate_plan`` never raises.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from app.exam_intelligence.coverage import verified_pyq_topic_counts
from app.exam_intelligence.lookup import resolve_exam_by_id, resolve_exam_by_slug
from app.study_os.competition_context import competition_context
from app.study_os.plan_preferences import focus_weights, get_plan_preferences
from app.study_os.update_context import policy_update_context

logger = logging.getLogger("career_copilot.study_os.planner")

PLANNER_VERSION = "planner_v1"

# preferred_task_size -> minutes per task block.
_SIZE_MINUTES = {"small": 25, "medium": 40, "large": 60}
_DEFAULT_SIZE = "medium"
_DEFAULT_MAX_TASKS = 4

_TASK_LABEL = {
    "concept_learning": "Concept learning",
    "retrieval_practice": "Retrieval practice",
    "revision": "Revision",
}

# topic_prerequisites relation types that gate ordering.
_ORDERING_RELATIONS = {"requires", "recommended_before"}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("planner read/write failed: %s", exc)
        return default


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


# ─── Input gathering ──────────────────────────────────────────────────────
def _resolve_target_exam(supabase: Any, user_id: str) -> dict[str, Any] | None:
    """Resolve the user's target exam to a full ``exams`` row (or None)."""
    profile = (
        _safe(
            lambda: (
                supabase.table("profiles")
                .select("target_exam")
                .eq("id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    target = (profile[0] if profile else {}).get("target_exam")
    if not target:
        prefs = (
            _safe(
                lambda: (
                    supabase.table("aspirant_preferences")
                    .select("target_exams")
                    .eq("user_id", user_id)
                    .limit(1)
                    .execute()
                    .data
                ),
                default=[],
            )
            or []
        )
        exams = (prefs[0] if prefs else {}).get("target_exams") or []
        if isinstance(exams, list) and exams:
            target = exams[0]
    if not target:
        return None
    candidate = str(target)
    if len(candidate) == 36 and candidate.count("-") == 4:
        exam = resolve_exam_by_id(supabase, candidate)
        if exam:
            return exam
    return resolve_exam_by_slug(supabase, candidate)


def _days_remaining(supabase: Any, exam_id: str) -> int | None:
    today = datetime.now(timezone.utc).date()
    rows = (
        _safe(
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
        )
        or []
    )
    if not rows or not rows[0].get("exam_start"):
        return None
    try:
        start = datetime.fromisoformat(str(rows[0]["exam_start"])).date()
    except (ValueError, TypeError):
        return None
    return max(0, (start - today).days)


def _load_locked_coverage(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    """Locked ``exam_topic_coverage`` rows enriched with topic/subject names.

    Only ``reviewer_status='locked'`` rows are planner-ready — the same
    verified-only contract the rest of Study OS uses.
    """
    rows = (
        _safe(
            lambda: (
                supabase.table("exam_topic_coverage")
                .select(
                    "id, exam_cycle_id, exam_phase_id, section_id, topic_id, "
                    "exam_priority_score, is_high_yield, confidence_score, "
                    "coverage_depth, expected_difficulty, reviewer_status"
                )
                .eq("exam_id", exam_id)
                .eq("reviewer_status", "locked")
                .limit(2000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    topic_ids = list({r.get("topic_id") for r in rows if r.get("topic_id")})
    if not topic_ids:
        return []
    topic_rows = (
        _safe(
            lambda: (
                supabase.table("topics")
                # Include ``parent_topic_id`` + ``level`` so callers (e.g.
                # /api/study/topics) can render the Subject → Topic →
                # Microtopic → Concept hierarchy without a second round-trip.
                .select("id, name, slug, subject_id, is_active, parent_topic_id, level")
                .in_("id", topic_ids)
                .limit(2000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    topics_by_id = {t["id"]: t for t in topic_rows if t.get("id")}
    subject_ids = list(
        {t.get("subject_id") for t in topics_by_id.values() if t.get("subject_id")}
    )
    subjects_by_id: dict[str, dict[str, Any]] = {}
    if subject_ids:
        subj_rows = (
            _safe(
                lambda: (
                    supabase.table("subjects")
                    .select("id, name")
                    .in_("id", subject_ids)
                    .limit(500)
                    .execute()
                    .data
                ),
                default=[],
            )
            or []
        )
        subjects_by_id = {s["id"]: s for s in subj_rows if s.get("id")}

    out: list[dict[str, Any]] = []
    for r in rows:
        topic = topics_by_id.get(r.get("topic_id"))
        if not topic or topic.get("is_active") is False:
            continue
        subject = subjects_by_id.get(topic.get("subject_id")) or {}
        out.append(
            {
                "coverage_id": r.get("id"),
                "topic_id": r.get("topic_id"),
                "topic_name": topic.get("name") or topic.get("slug"),
                # Hierarchy fields surfaced for /api/study/topics. Null is
                # legitimate for root-level topics; never coerce to None
                # for non-root rows.
                "parent_topic_id": topic.get("parent_topic_id"),
                "topic_level": topic.get("level"),
                "subject_id": topic.get("subject_id"),
                "subject_name": subject.get("name"),
                "exam_cycle_id": r.get("exam_cycle_id"),
                "exam_phase_id": r.get("exam_phase_id"),
                "coverage_priority": _num(r.get("exam_priority_score")),
                "is_high_yield": bool(r.get("is_high_yield")),
                "confidence_score": r.get("confidence_score"),
            }
        )
    return out


def _load_prerequisites(
    supabase: Any, topic_ids: list[str]
) -> dict[str, set[str]]:
    """Map ``topic_id -> {prerequisite_topic_id}`` for ordering relations."""
    if not topic_ids:
        return {}
    rows = (
        _safe(
            lambda: (
                supabase.table("topic_prerequisites")
                .select("topic_id, prerequisite_topic_id, relation_type")
                .in_("topic_id", topic_ids)
                .limit(5000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    prereqs: dict[str, set[str]] = {}
    for r in rows:
        if r.get("relation_type") not in _ORDERING_RELATIONS:
            continue
        tid = r.get("topic_id")
        pid = r.get("prerequisite_topic_id")
        if tid and pid:
            prereqs.setdefault(tid, set()).add(pid)
    return prereqs


def _load_user_signals(
    supabase: Any, user_id: str, exam_id: str
) -> tuple[dict[str, float], set[str]]:
    """Return ``(mastery_by_topic, topics_with_error_patterns)``.

    When a topic has both an exam-scoped and a global mastery row the
    exam-scoped one wins.
    """
    mastery_rows = (
        _safe(
            lambda: (
                supabase.table("user_topic_mastery")
                .select("topic_id, exam_id, mastery_score")
                .eq("user_id", user_id)
                .limit(5000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    mastery: dict[str, float] = {}
    exam_scoped: set[str] = set()
    for r in mastery_rows:
        tid = r.get("topic_id")
        if not tid:
            continue
        is_exam = r.get("exam_id") == exam_id
        if tid in exam_scoped and not is_exam:
            continue
        mastery[tid] = _num(r.get("mastery_score"))
        if is_exam:
            exam_scoped.add(tid)

    error_rows = (
        _safe(
            lambda: (
                supabase.table("user_topic_error_patterns")
                .select("topic_id")
                .eq("user_id", user_id)
                .limit(5000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    error_topics = {r.get("topic_id") for r in error_rows if r.get("topic_id")}
    return mastery, error_topics


# ─── Scoring + task shaping ───────────────────────────────────────────────
# A pinned topic is boosted hard so it reliably earns a slot in the plan.
_PIN_BONUS = 30.0


def _score_topic(
    cov: dict[str, Any],
    pyq_count: int,
    mastery: float | None,
    has_errors: bool,
    *,
    weights: dict[str, float],
    pinned: bool,
) -> tuple[float, float]:
    """Return ``(priority_score, mastery_gap)`` for one coverage row.

    Transparent linear blend — see module docstring for the input groups.
    ``weights`` (coverage_w / mastery_w / high_yield_bonus) come from the
    user's chosen weighting ``focus``; a topic with no mastery row is
    treated as a moderate-high gap (55) so never-practised topics still
    earn attention without dominating. Pinned topics get a flat boost.
    """
    coverage_priority = cov["coverage_priority"]
    mastery_gap = (100.0 - mastery) if mastery is not None else 55.0
    pyq_factor = min(20.0, pyq_count * 5.0)
    high_yield_bonus = weights["high_yield_bonus"] if cov["is_high_yield"] else 0.0
    error_signal = 10.0 if has_errors else 0.0
    pin_bonus = _PIN_BONUS if pinned else 0.0
    score = (
        weights["coverage_w"] * coverage_priority
        + weights["mastery_w"] * mastery_gap
        + pyq_factor
        + high_yield_bonus
        + error_signal
        + pin_bonus
    )
    return round(_clamp(score), 2), round(mastery_gap, 2)


def _task_type(mastery: float | None, has_errors: bool) -> str:
    if mastery is None:
        return "concept_learning"
    if mastery < 45:
        return "concept_learning"
    if mastery < 75 or has_errors:
        return "retrieval_practice"
    return "revision"


def _order_topics(
    scored: list[dict[str, Any]], prereqs: dict[str, set[str]]
) -> list[dict[str, Any]]:
    """Prerequisite-aware, priority-greedy ordering.

    ``scored`` must already be sorted by ``priority_score`` descending.
    Repeatedly takes the highest-priority topic whose in-set prerequisites
    are all placed; falls back to plain priority order if blocked (cycle or
    prerequisite outside the candidate set).
    """
    all_ids = {c["topic_id"] for c in scored}
    placed: list[dict[str, Any]] = []
    placed_ids: set[str] = set()
    remaining = list(scored)
    while remaining:
        pick = None
        for c in remaining:
            in_set_prereqs = prereqs.get(c["topic_id"], set()) & all_ids
            if in_set_prereqs <= placed_ids:
                pick = c
                break
        if pick is None:
            pick = remaining[0]
        placed.append(pick)
        placed_ids.add(pick["topic_id"])
        remaining.remove(pick)
    return placed


def _why_summary(
    cov: dict[str, Any],
    task_type: str,
    pyq_count: int,
    mastery: float | None,
    pressure_level: str,
    pinned: bool,
) -> str:
    topic = cov["topic_name"]
    exam_bits = "a verified high-yield topic" if cov["is_high_yield"] else "a verified topic"
    bits = [f"{topic} is {exam_bits} for your exam"]
    if pinned:
        bits.append("you pinned it")
    if pyq_count:
        bits.append(f"{pyq_count} verified PYQ appearance(s)")
    if mastery is None:
        bits.append("you haven't practised it yet")
    else:
        bits.append(f"your recent accuracy is {round(mastery)}%")
    if pressure_level == "high":
        bits.append("competition pressure for this cycle is high")
    label = _TASK_LABEL.get(task_type, task_type).lower()
    return "; ".join(bits) + f" — scheduled as a {label} block."


def _build_tasks(
    ordered: list[dict[str, Any]],
    *,
    max_tasks: int,
    minutes: int,
    pressure_level: str,
    exam_id: str,
) -> list[dict[str, Any]]:
    today = _today_iso()
    tasks: list[dict[str, Any]] = []
    for cov in ordered[:max_tasks]:
        task_type = cov["_task_type"]
        label = _TASK_LABEL.get(task_type, "Study")
        why = {
            "coverage_priority": cov["coverage_priority"],
            "verified_pyq_count": cov["_pyq_count"],
            "mastery_score": cov["_mastery"],
            "mastery_gap": cov["_mastery_gap"],
            "high_yield": cov["is_high_yield"],
            "has_error_patterns": cov["_has_errors"],
            "pinned": cov["_pinned"],
            "competition_pressure": pressure_level,
            "priority_score": cov["_priority_score"],
            "summary": _why_summary(
                cov,
                task_type,
                cov["_pyq_count"],
                cov["_mastery"],
                pressure_level,
                cov["_pinned"],
            ),
        }
        tasks.append(
            {
                "user_id": None,  # filled in by _persist
                "title": f"{cov['topic_name']} · {label}",
                "task_type": task_type,
                "subject": cov.get("subject_name"),
                "topic": cov["topic_name"],
                "subject_id": cov.get("subject_id"),
                "topic_id": cov["topic_id"],
                "exam_id": exam_id,
                "exam_phase_id": cov.get("exam_phase_id"),
                "exam_topic_coverage_id": cov.get("coverage_id"),
                "scheduled_date": today,
                "day_label": "Today",
                "status": "planned",
                "planned_minutes": minutes,
                "priority_score": cov["_priority_score"],
                "why_this_task": why,
            }
        )
    return tasks


# ─── Persistence ──────────────────────────────────────────────────────────
def _active_plan(supabase: Any, user_id: str) -> dict[str, Any] | None:
    rows = (
        _safe(
            lambda: (
                supabase.table("study_plans")
                .select("id, status")
                .eq("user_id", user_id)
                .eq("status", "active")
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    return rows[0] if rows else None


def _next_version_number(supabase: Any, plan_id: str) -> int:
    rows = (
        _safe(
            lambda: (
                supabase.table("study_plan_versions")
                .select("version_number")
                .eq("plan_id", plan_id)
                .order("version_number", desc=True)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    if not rows:
        return 1
    try:
        return int(rows[0].get("version_number") or 0) + 1
    except (TypeError, ValueError):
        return 1


def _persist(
    supabase: Any,
    user_id: str,
    exam: dict[str, Any],
    plan_phase_id: str | None,
    tasks: list[dict[str, Any]],
    input_context: dict[str, Any],
    event_type: str,
) -> dict[str, Any]:
    exam_id = exam.get("id")
    today = _today_iso()

    plan = _active_plan(supabase, user_id)
    if plan:
        plan_id = plan["id"]
    else:
        created = _safe(
            lambda: (
                supabase.table("study_plans")
                .insert(
                    {
                        "user_id": user_id,
                        "status": "active",
                                                "start_date": today,
                        "exam_id": exam_id,
                        "active_phase_id": plan_phase_id,
                        "metadata": {"theme": f"{exam.get('name') or 'Exam'} adaptive plan", "target": "Cover locked high-yield topics"},
                        "generation_context": input_context,
                        "updated_at": _now_iso(),
                    }
                )
                .execute()
                .data
            ),
            default=[],
        ) or []
        if not created:
            return {"generated": False, "reason": "plan_persist_failed"}
        plan_id = created[0]["id"]

    version_number = _next_version_number(supabase, plan_id)
    version = _safe(
        lambda: (
            supabase.table("study_plan_versions")
            .insert(
                {
                    "plan_id": plan_id,
                    "user_id": user_id,
                    "version_number": version_number,
                    "generator_version": PLANNER_VERSION,
                    "reason": input_context.get("reason"),
                    "input_context": input_context,
                    "output_summary": {
                        "task_count": len(tasks),
                        "topics": [t["topic"] for t in tasks],
                    },
                    "activated_at": _now_iso(),
                }
            )
            .execute()
            .data
        ),
        default=[],
    ) or []
    plan_version_id = version[0]["id"] if version else None

    # Idempotent regeneration: clear today's still-planned tasks for this
    # plan, then insert the fresh set. Completed / in-progress tasks stay.
    _safe(
        lambda: (
            supabase.table("study_tasks")
            .delete()
            .eq("plan_id", plan_id)
            .eq("scheduled_date", today)
            .eq("status", "planned")
            .execute()
        )
    )

    task_rows = [
        {**t, "user_id": user_id, "plan_id": plan_id, "plan_version_id": plan_version_id}
        for t in tasks
    ]
    if task_rows:
        _safe(lambda: supabase.table("study_tasks").insert(task_rows).execute())

    _safe(
        lambda: (
            supabase.table("study_plans")
            .update(
                {
                    "current_plan_version_id": plan_version_id,
                    "active_phase_id": plan_phase_id,
                    "updated_at": _now_iso(),
                }
            )
            .eq("id", plan_id)
            .execute()
        )
    )

    _safe(
        lambda: (
            supabase.table("study_adaptation_events")
            .insert(
                {
                    "user_id": user_id,
                    "plan_id": plan_id,
                    "plan_version_id": plan_version_id,
                    "event_type": event_type,
                    "trigger_source": PLANNER_VERSION,
                    "trigger_payload": {"reason": input_context.get("reason")},
                    "change_summary": {
                        "task_count": len(tasks),
                        "version_number": version_number,
                    },
                }
            )
            .execute()
        )
    )

    return {
        "generated": True,
        "plan_id": plan_id,
        "plan_version_id": plan_version_id,
        "version_number": version_number,
    }


# ─── Public entrypoint ────────────────────────────────────────────────────
def _compute_plan(
    supabase: Any,
    user_id: str,
    *,
    reason: str,
) -> dict[str, Any]:
    """Compute (but do not persist) today's plan candidate.

    Returns one of two shapes:
      - failure: ``{"generated": False, "reason": "...", "exam": slug?}``
      - success: ``{"generated": True, "exam": <row>, "plan_phase_id": ...,
                    "tasks": [...], "input_context": {...},
                    "competition_pressure": "...", "focus": "...",
                    "policy_affects_syllabus": bool}``
    """
    if not user_id:
        return {"generated": False, "reason": "no_user"}

    exam = _resolve_target_exam(supabase, user_id)
    if not exam or not exam.get("id"):
        return {"generated": False, "reason": "no_target_exam"}
    exam_id = exam["id"]

    # User autonomy: weighting focus, plan-shape overrides, pin / mute.
    prefs = get_plan_preferences(supabase, user_id)
    muted = set(prefs.get("muted_topic_ids") or [])
    pinned = set(prefs.get("pinned_topic_ids") or [])
    weights = focus_weights(prefs.get("focus"))

    coverage = _load_locked_coverage(supabase, exam_id)
    if not coverage:
        return {
            "generated": False,
            "reason": "no_locked_coverage",
            "exam": exam.get("slug"),
        }
    coverage = [c for c in coverage if c["topic_id"] not in muted]
    if not coverage:
        return {
            "generated": False,
            "reason": "all_topics_muted",
            "exam": exam.get("slug"),
        }

    topic_ids = [c["topic_id"] for c in coverage]
    pyq_counts = verified_pyq_topic_counts(supabase, exam_id) or {}
    prereqs = _load_prerequisites(supabase, topic_ids)
    mastery, error_topics = _load_user_signals(supabase, user_id, exam_id)

    days_remaining = _days_remaining(supabase, exam_id)
    comp = competition_context(supabase, exam_id, days_remaining=days_remaining)
    pressure_level = (comp.get("cycle_pressure") or {}).get("pressure_level", "unknown")
    policy_updates = policy_update_context(supabase, exam_id)

    # Task count + sizing: a user preference overrides the persona policy.
    snapshot = (
        _safe(
            lambda: (
                supabase.table("aspirant_persona_snapshots")
                .select("study_policy")
                .eq("user_id", user_id)
                .order("computed_at", desc=True)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    study_policy = (snapshot[0] if snapshot else {}).get("study_policy") or {}
    pref_max = prefs.get("max_tasks_per_day")
    if pref_max:
        max_tasks = max(1, min(8, int(pref_max)))
    else:
        try:
            max_tasks = int(study_policy.get("max_tasks_per_day") or _DEFAULT_MAX_TASKS)
        except (TypeError, ValueError):
            max_tasks = _DEFAULT_MAX_TASKS
        max_tasks = max(1, min(8, max_tasks))
    size = (
        prefs.get("preferred_task_size")
        or study_policy.get("preferred_task_size")
        or _DEFAULT_SIZE
    )
    minutes = _SIZE_MINUTES.get(size, _SIZE_MINUTES[_DEFAULT_SIZE])

    # score every locked-coverage topic
    for cov in coverage:
        tid = cov["topic_id"]
        pyq_count = int(pyq_counts.get(tid, 0))
        topic_mastery = mastery.get(tid)
        has_errors = tid in error_topics
        is_pinned = tid in pinned
        score, gap = _score_topic(
            cov, pyq_count, topic_mastery, has_errors,
            weights=weights, pinned=is_pinned,
        )
        cov["_pyq_count"] = pyq_count
        cov["_mastery"] = topic_mastery
        cov["_mastery_gap"] = gap
        cov["_has_errors"] = has_errors
        cov["_pinned"] = is_pinned
        cov["_priority_score"] = score
        cov["_task_type"] = _task_type(topic_mastery, has_errors)

    coverage.sort(key=lambda c: c["_priority_score"], reverse=True)
    ordered = _order_topics(coverage, prereqs)

    # the phase carrying the most locked coverage drives the plan's phase
    phase_counts: dict[str, int] = {}
    for c in coverage:
        ph = c.get("exam_phase_id")
        if ph:
            phase_counts[ph] = phase_counts.get(ph, 0) + 1
    plan_phase_id = (
        max(phase_counts, key=phase_counts.get) if phase_counts else None
    )

    tasks = _build_tasks(
        ordered,
        max_tasks=max_tasks,
        minutes=minutes,
        pressure_level=pressure_level,
        exam_id=exam_id,
    )

    input_context = {
        "reason": reason,
        "generator_version": PLANNER_VERSION,
        "exam_id": exam_id,
        "exam_slug": exam.get("slug"),
        "locked_topic_count": len(coverage),
        "days_remaining": days_remaining,
        "competition_pressure": pressure_level,
        "policy_affects_syllabus": bool(policy_updates.get("affects_syllabus")),
        "study_policy": {"max_tasks_per_day": max_tasks, "preferred_task_size": size},
        "preferences": {
            "focus": prefs.get("focus"),
            "pinned_count": len(pinned),
            "muted_count": len(muted),
        },
    }

    return {
        "generated": True,
        "exam": exam,
        "plan_phase_id": plan_phase_id,
        "tasks": tasks,
        "input_context": input_context,
        "competition_pressure": pressure_level,
        "focus": prefs.get("focus"),
    }


def _task_summary(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "topic_id": t.get("topic_id"),
        "title": t["title"],
        "task_type": t["task_type"],
        "topic": t["topic"],
        "priority_score": t["priority_score"],
        "planned_minutes": t["planned_minutes"],
        "why_this_task": t["why_this_task"],
    }


def _active_plan_today_tasks(supabase: Any, user_id: str) -> list[dict[str, Any]]:
    """Return today's still-planned tasks for the user's active plan."""
    plan = _active_plan(supabase, user_id)
    if not plan:
        return []
    today = _today_iso()
    rows = (
        _safe(
            lambda: (
                supabase.table("study_tasks")
                .select(
                    "id, topic_id, title, task_type, topic, priority_score, "
                    "planned_minutes, why_this_task, status, scheduled_date"
                )
                .eq("plan_id", plan["id"])
                .eq("scheduled_date", today)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    return rows


def _diff_tasks(
    before: list[dict[str, Any]],
    after: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return a structured diff: ``added`` / ``removed`` / ``unchanged`` topic ids."""
    before_topics = {b.get("topic_id"): b for b in before if b.get("topic_id")}
    after_topics = {a.get("topic_id"): a for a in after if a.get("topic_id")}
    added = sorted(set(after_topics) - set(before_topics))
    removed = sorted(set(before_topics) - set(after_topics))
    unchanged = sorted(set(before_topics) & set(after_topics))
    return {
        "added": [_task_summary(after_topics[t]) for t in added],
        "removed": [
            {
                "topic_id": t,
                "title": before_topics[t].get("title"),
                "task_type": before_topics[t].get("task_type"),
                "status": before_topics[t].get("status"),
            }
            for t in removed
        ],
        "unchanged": unchanged,
        "added_count": len(added),
        "removed_count": len(removed),
        "unchanged_count": len(unchanged),
    }


def _risk_level(diff: dict[str, Any], before_count: int) -> str:
    """Rough risk label from how much of the plan is mutating."""
    if before_count == 0:
        return "low"
    total_changes = diff["added_count"] + diff["removed_count"]
    ratio = total_changes / max(1, before_count)
    if ratio >= 0.75:
        return "high"
    if ratio >= 0.4:
        return "medium"
    return "low"


def compute_draft_plan(supabase: Any, user_id: str) -> dict[str, Any]:
    """Compute today's plan candidate without mutating any persisted plan.

    Returns the same envelope as ``apply_plan`` but with ``applied=False``,
    no version row, no adaptation event, and the active plan's still-planned
    tasks for today as ``before_tasks``. Safe to call repeatedly.
    """
    try:
        computed = _compute_plan(supabase, user_id, reason="plan_draft")
        if not computed.get("generated"):
            return computed

        tasks = computed["tasks"]
        before = _active_plan_today_tasks(supabase, user_id)
        before_tasks = [
            {
                "topic_id": b.get("topic_id"),
                "title": b.get("title"),
                "task_type": b.get("task_type"),
                "topic": b.get("topic"),
                "priority_score": b.get("priority_score"),
                "planned_minutes": b.get("planned_minutes"),
                "why_this_task": b.get("why_this_task"),
                "status": b.get("status"),
            }
            for b in before
        ]
        after_tasks = [_task_summary(t) for t in tasks]
        diff = _diff_tasks(before_tasks, after_tasks)
        exam = computed["exam"]
        return {
            "applied": False,
            "generated": True,
            "exam": exam.get("slug"),
            "exam_name": exam.get("name"),
            "competition_pressure": computed["competition_pressure"],
            "focus": computed["focus"],
            "before_tasks": before_tasks,
            "after_tasks": after_tasks,
            "changes": diff,
            "risk_level": _risk_level(diff, len(before_tasks)),
            "generated_at": _now_iso(),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("compute_draft_plan failed for %s", user_id)
        return {
            "generated": False,
            "reason": "error",
            "error": str(exc)[:200],
        }


def apply_plan(
    supabase: Any,
    user_id: str,
    *,
    reason: str = "manual_apply",
    event_type: str = "manual_application",
) -> dict[str, Any]:
    """Apply today's computed plan. Always persists when ``generated=True``.

    Idempotent: ``_persist`` reuses the active plan, clears today's still-
    planned tasks for that plan, and inserts the fresh set; completed /
    in-progress tasks survive. Creates exactly one ``study_plan_versions``
    row and one ``study_adaptation_events`` row per call.
    """
    try:
        before = _active_plan_today_tasks(supabase, user_id)
        before_tasks = [
            {
                "topic_id": b.get("topic_id"),
                "title": b.get("title"),
                "task_type": b.get("task_type"),
                "topic": b.get("topic"),
                "priority_score": b.get("priority_score"),
                "planned_minutes": b.get("planned_minutes"),
                "why_this_task": b.get("why_this_task"),
                "status": b.get("status"),
            }
            for b in before
        ]

        computed = _compute_plan(supabase, user_id, reason=reason)
        if not computed.get("generated"):
            return computed

        tasks = computed["tasks"]
        exam = computed["exam"]
        persisted = _persist(
            supabase,
            user_id,
            exam,
            computed["plan_phase_id"],
            tasks,
            computed["input_context"],
            event_type,
        )
        if not persisted.get("generated"):
            return persisted

        after_tasks = [_task_summary(t) for t in tasks]
        diff = _diff_tasks(before_tasks, after_tasks)
        return {
            **persisted,
            "applied": True,
            "exam": exam.get("slug"),
            "exam_name": exam.get("name"),
            "task_count": len(tasks),
            "focus": computed["focus"],
            "competition_pressure": computed["competition_pressure"],
            "before_tasks": before_tasks,
            "after_tasks": after_tasks,
            "changes": diff,
            "risk_level": _risk_level(diff, len(before_tasks)),
            "tasks": after_tasks,  # back-compat with /api/study/plan/generate callers
            "generated_at": _now_iso(),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("apply_plan failed for %s", user_id)
        return {
            "generated": False,
            "reason": "error",
            "error": str(exc)[:200],
        }


def generate_plan(
    supabase: Any,
    user_id: str,
    *,
    reason: str = "manual_generation",
    event_type: str = "manual_regeneration",
) -> dict[str, Any]:
    """Generate and persist today's study plan for ``user_id``.

    Thin wrapper over :func:`apply_plan` — kept for callers of the existing
    ``/api/study/plan/generate`` route and for scheduled / signal-driven
    regenerations (``regen.regenerate_on_signal``).
    """
    return apply_plan(supabase, user_id, reason=reason, event_type=event_type)
