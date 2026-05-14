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
        # Internal extras — used by classifier but not part of the
        # documented signal contract.
        "_career_stage": profile.get("career_stage"),
        "_onboarding_completed": bool(profile.get("onboarding_completed")),
        "_total_tasks_14d": total_tasks,
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
        "_career_stage": None,
        "_onboarding_completed": False,
        "_total_tasks_14d": 0,
    }
