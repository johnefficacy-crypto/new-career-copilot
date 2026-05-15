"""Defensive signal collection for persona classification.

The classifier consumes a normalized signal dict so it never has to know
where a value originated. Every read here is wrapped — if a table is
missing or the call fails, we fall back to a safe default. PR1 must not
break Study OS or onboarding if persona signals are partially unavailable.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.persona.signals")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona signal read failed: %s", exc)
        return default


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


_PROFILE_COMPLETENESS_FIELDS = (
    "full_name",
    "phone",
    "gender",
    "date_of_birth",
    "domicile_state",
    "category",
    "nationality",
    "target_exam",
    "target_exam_year",
    "weekly_hours_goal",
    "career_stage",
)


def _profile_completeness(profile: dict[str, Any], prefs: dict[str, Any]) -> float:
    if not profile:
        return 0.0
    filled = 0
    total = len(_PROFILE_COMPLETENESS_FIELDS)
    for field in _PROFILE_COMPLETENESS_FIELDS:
        value = profile.get(field)
        if value not in (None, "", [], {}):
            filled += 1
    # Treat at least one target exam in preferences as a profile signal.
    target_exams = (prefs or {}).get("target_exams") or []
    if isinstance(target_exams, list) and target_exams:
        filled = min(total, filled + 1)
    if total == 0:
        return 0.0
    return round(filled / total, 3)


def _count_list(value: Any) -> int:
    if isinstance(value, list):
        return len(value)
    if isinstance(value, str) and value.strip():
        return 1
    return 0


def _goal_exams_count(profile: dict[str, Any], prefs: dict[str, Any]) -> int:
    target_exams = (prefs or {}).get("target_exams") or []
    if isinstance(target_exams, list):
        normalized = [e for e in target_exams if e]
        if normalized:
            return len(normalized)
    if profile.get("target_exam"):
        return 1
    return 0


def collect_user_signals(supabase: Any, user_id: str) -> dict[str, Any]:
    """Collect persona signals for a single user.

    Returns a normalized dict with all fields populated. Missing data is
    represented with safe defaults (None for unknown floats, 0 for
    counts, False for booleans) so downstream code never has to guard.
    """
    if not user_id:
        return _empty_signals()

    profile = _safe(
        lambda: (
            supabase.table("profiles")
            .select(
                "id, full_name, phone, gender, date_of_birth, domicile_state, "
                "category, nationality, target_exam, target_exam_year, "
                "weekly_hours_goal, career_stage, career_goal, onboarding_completed"
            )
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    profile = profile[0] if profile else {}

    prefs = _safe(
        lambda: (
            supabase.table("aspirant_preferences")
            .select(
                "target_exams, preferred_sectors, preferred_states, "
                "willing_to_relocate, study_mode, study_hours_per_day"
            )
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    prefs = prefs[0] if prefs else {}

    weekly_hours_goal: float | None = None
    if profile.get("weekly_hours_goal") is not None:
        try:
            weekly_hours_goal = float(profile.get("weekly_hours_goal"))
        except (TypeError, ValueError):
            weekly_hours_goal = None
    elif prefs.get("study_hours_per_day") is not None:
        try:
            weekly_hours_goal = round(float(prefs.get("study_hours_per_day")) * 7, 2)
        except (TypeError, ValueError):
            weekly_hours_goal = None

    target_exam_year: int | None = None
    if profile.get("target_exam_year") is not None:
        try:
            target_exam_year = int(profile.get("target_exam_year"))
        except (TypeError, ValueError):
            target_exam_year = None

    study_mode = prefs.get("study_mode") or profile.get("study_mode") or None

    # Study task signals — last 14 days.
    since_14d = _iso_days_ago(14)
    tasks_14d = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("id, status, updated_at")
            .eq("user_id", user_id)
            .gte("updated_at", since_14d)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []

    completed = sum(1 for t in tasks_14d if (t.get("status") or "").lower() == "completed")
    missed = sum(
        1
        for t in tasks_14d
        if (t.get("status") or "").lower() in {"missed", "carried_forward"}
    )
    skipped = sum(1 for t in tasks_14d if (t.get("status") or "").lower() == "skipped")
    total_tasks = len(tasks_14d)
    completion_rate: float | None
    if total_tasks > 0:
        completion_rate = round(completed / total_tasks, 3)
    else:
        completion_rate = None

    # Focus minutes — last 7 days from study_sessions.
    since_7d = _iso_days_ago(7)
    focus_rows = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("duration_mins, duration_minutes, session_type, started_at, starts_at")
            .eq("user_id", user_id)
            .gte("started_at", since_7d)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not focus_rows:
        # Fallback: legacy column name `starts_at` for pre-017 deployments.
        focus_rows = _safe(
            lambda: (
                supabase.table("study_sessions")
                .select("duration_minutes, starts_at")
                .eq("user_id", user_id)
                .gte("starts_at", since_7d)
                .limit(500)
                .execute()
                .data
            ),
            default=[],
        ) or []
    focus_minutes_7d = 0
    for row in focus_rows:
        mins = row.get("duration_mins") or row.get("duration_minutes") or 0
        try:
            focus_minutes_7d += int(mins or 0)
        except (TypeError, ValueError):
            continue

    # Mock tests — last 30 days.
    since_30d = _iso_days_ago(30)
    mocks_taken_30d = 0
    mock_rows = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("id, attempted_at, user_id")
            .eq("user_id", user_id)
            .gte("attempted_at", since_30d)
            .limit(200)
            .execute()
            .data
        ),
        default=None,
    )
    if mock_rows is not None:
        mocks_taken_30d = len(mock_rows)

    # Weekly review availability — heuristic: at least one completed task
    # this week is enough to render a meaningful review. The Study OS
    # WeeklyReview endpoint is the source of truth for the UI; persona
    # only needs a boolean signal.
    weekly_review_available = completed > 0

    # Tiny-question answers (PR2). Latest non-skipped answer wins per
    # question_key. Defensive read — missing table just yields {}.
    question_answers = _safe(
        lambda: (
            supabase.table("persona_question_answers")
            .select("question_key, normalized_value, answer_value, skipped, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    persona_question_answers: dict[str, Any] = {}
    for row in question_answers:
        key = row.get("question_key")
        if not key or key in persona_question_answers:
            continue
        if row.get("skipped"):
            continue
        value = row.get("normalized_value")
        if value is None:
            value = row.get("answer_value")
        persona_question_answers[key] = value

    # Study-OS comparison signals (PR 13). Pulled from the 30-day window of
    # study_behavior_daily_snapshots. Each value is None when no snapshots
    # exist yet — downstream classifier rules check for None before firing.
    study_signals = _collect_study_os_signals(supabase, user_id)

    return {
        "profile_completeness": _profile_completeness(profile, prefs),
        "goal_exams_count": _goal_exams_count(profile, prefs),
        "preferred_sectors_count": _count_list(prefs.get("preferred_sectors")),
        "preferred_states_count": _count_list(prefs.get("preferred_states")),
        "weekly_hours_goal": weekly_hours_goal,
        "study_mode": study_mode,
        "target_exam_year": target_exam_year,
        "task_completion_rate_14d": completion_rate,
        "missed_task_count_14d": missed,
        "skipped_task_count_14d": skipped,
        "focus_minutes_7d": focus_minutes_7d,
        "mocks_taken_30d": mocks_taken_30d,
        "weekly_review_available": weekly_review_available,
        "persona_question_answers": persona_question_answers,
        # PR 13 — study-OS comparison signals.
        "relative_consistency_percentile": study_signals["relative_consistency_percentile"],
        "relative_adherence_percentile": study_signals["relative_adherence_percentile"],
        "focus_reliability": study_signals["focus_reliability"],
        "overplanning_index": study_signals["overplanning_index"],
        "backlog_recovery_rate": study_signals["backlog_recovery_rate"],
        "mock_review_rate": study_signals["mock_review_rate"],
        "correction_completion_rate": study_signals["correction_completion_rate"],
        "multi_exam_load": study_signals["multi_exam_load"],
        # Internal extras — used by classifier but not part of the
        # documented signal contract.
        "_career_stage": profile.get("career_stage"),
        "_onboarding_completed": bool(profile.get("onboarding_completed")),
        "_total_tasks_14d": total_tasks,
    }


def _collect_study_os_signals(supabase: Any, user_id: str) -> dict[str, Any]:
    """Aggregate the spec's new persona signals from the last 30 days of
    `study_behavior_daily_snapshots`. Returns all keys as None / 0 when
    no data is available so the classifier sees a stable contract.
    """
    empty = {
        "relative_consistency_percentile": None,
        "relative_adherence_percentile": None,
        "focus_reliability": None,
        "overplanning_index": None,
        "backlog_recovery_rate": None,
        "mock_review_rate": None,
        "correction_completion_rate": None,
        "multi_exam_load": 0,
    }
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .select(
                "total_study_minutes, focus_minutes, focus_session_count, "
                "planned_tasks, completed_tasks, missed_tasks, backlog_count, "
                "mock_count, mock_review_count, correction_tasks_completed, "
                "consistency_score, behavior_adherence_score, snapshot_date"
            )
            .eq("user_id", user_id)
            .gte("snapshot_date", _iso_days_ago(30)[:10])
            .execute()
            .data
        ),
        default=None,
    )
    if not rows:
        return empty

    consistencies = [
        r.get("consistency_score") for r in rows if r.get("consistency_score") is not None
    ]
    adherences = [
        r.get("behavior_adherence_score")
        for r in rows
        if r.get("behavior_adherence_score") is not None
    ]
    sessions_total = sum(int(r.get("focus_session_count") or 0) for r in rows)
    focus_total = sum(int(r.get("focus_minutes") or 0) for r in rows)
    planned_total = sum(int(r.get("planned_tasks") or 0) for r in rows)
    completed_total = sum(int(r.get("completed_tasks") or 0) for r in rows)
    missed_total = sum(int(r.get("missed_tasks") or 0) for r in rows)
    mocks_total = sum(int(r.get("mock_count") or 0) for r in rows)
    mock_reviews = sum(int(r.get("mock_review_count") or 0) for r in rows)
    corrections = sum(int(r.get("correction_tasks_completed") or 0) for r in rows)
    backlogs = [int(r.get("backlog_count") or 0) for r in rows]

    consistency_avg = (
        sum(consistencies) / len(consistencies) if consistencies else None
    )
    adherence_avg = sum(adherences) / len(adherences) if adherences else None

    # Heuristic percentile until cohort_metric_snapshots is populated:
    # 0.9 → 90, 0.5 → 50. Calibrated against the cohort store would replace
    # this in a follow-up.
    rel_consistency_pct = (
        int(round(consistency_avg * 100)) if consistency_avg is not None else None
    )
    rel_adherence_pct = (
        int(round(adherence_avg * 100)) if adherence_avg is not None else None
    )

    focus_reliability = (
        focus_total / (sessions_total * 25)
        if sessions_total > 0
        else None
    )
    if focus_reliability is not None:
        focus_reliability = round(min(1.0, focus_reliability), 3)

    overplanning_index = (
        (missed_total + max(planned_total - completed_total - missed_total, 0))
        / planned_total
        if planned_total > 0
        else None
    )
    if overplanning_index is not None:
        overplanning_index = round(min(1.0, overplanning_index), 3)

    if len(backlogs) >= 2 and backlogs[0] > 0:
        recovered = max(backlogs[0] - backlogs[-1], 0)
        backlog_recovery_rate = round(recovered / backlogs[0], 3)
    else:
        backlog_recovery_rate = None

    mock_review_rate = round(mock_reviews / mocks_total, 3) if mocks_total > 0 else None
    correction_completion_rate = (
        round(corrections / mocks_total, 3) if mocks_total > 0 else None
    )

    # multi_exam_load — count of active user_exam_goals.
    goals = _safe(
        lambda: (
            supabase.table("user_exam_goals")
            .select("id, status")
            .eq("user_id", user_id)
            .eq("status", "active")
            .execute()
            .data
        ),
        default=None,
    ) or []
    multi_exam_load = len(goals)

    return {
        "relative_consistency_percentile": rel_consistency_pct,
        "relative_adherence_percentile": rel_adherence_pct,
        "focus_reliability": focus_reliability,
        "overplanning_index": overplanning_index,
        "backlog_recovery_rate": backlog_recovery_rate,
        "mock_review_rate": mock_review_rate,
        "correction_completion_rate": correction_completion_rate,
        "multi_exam_load": multi_exam_load,
    }


def _empty_signals() -> dict[str, Any]:
    return {
        "profile_completeness": 0.0,
        "goal_exams_count": 0,
        "preferred_sectors_count": 0,
        "preferred_states_count": 0,
        "weekly_hours_goal": None,
        "study_mode": None,
        "target_exam_year": None,
        "task_completion_rate_14d": None,
        "missed_task_count_14d": 0,
        "skipped_task_count_14d": 0,
        "focus_minutes_7d": 0,
        "mocks_taken_30d": 0,
        "weekly_review_available": False,
        "persona_question_answers": {},
        "relative_consistency_percentile": None,
        "relative_adherence_percentile": None,
        "focus_reliability": None,
        "overplanning_index": None,
        "backlog_recovery_rate": None,
        "mock_review_rate": None,
        "correction_completion_rate": None,
        "multi_exam_load": 0,
        "_career_stage": None,
        "_onboarding_completed": False,
        "_total_tasks_14d": 0,
    }
