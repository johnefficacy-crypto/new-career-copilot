"""Deterministic rule-based persona classifier (v1).

NO AI. NO psychological diagnosis. NO inference of financial status from
caste / category / location / social background. Only signals that the
backend can defensibly observe (profile facts + study behaviour) feed
into the persona dimensions below.

Output schema:
    {
        "dimensions": {
            "discovery_stage": str,
            "preparation_stage": str,
            "time_constraint": str,
            "learning_behavior": str,
            "execution_risk": str,
            "motivation_state": str,
            "resource_constraint": str,
        },
        "scores": { ... 0.0–1.0 numeric scores ... },
        "primary_persona": str,
        "evidence": [ {dimension, value, reason, signal}, ... ],
    }
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# ─── Dimension labels (allow-listed) ───────────────────────────────────────
DISCOVERY_STAGES = {
    "confused_explorer",
    "targeted_exam_aspirant",
    "multi_exam_optimizer",
    "recruitment_specific_applicant",
    "unknown",
}

PREPARATION_STAGES = {
    "beginner",
    "intermediate",
    "repeater",
    "final_window_aspirant",
    "restarting_aspirant",
    "unknown",
}

TIME_CONSTRAINTS = {
    "low_availability",
    "standard_availability",
    "high_availability",
    "working_professional",
    "unknown",
}

LEARNING_BEHAVIORS = {
    "insufficient_data",
    "planner_poor_executor",
    "mock_avoider",
    "high_mock_low_review",
    "revision_backlog_heavy",
    "consistent_executor",
}

EXECUTION_RISKS = {"low", "medium", "high", "unknown"}

MOTIVATION_STATES = {"stable", "deadline_sensitive", "dropoff_risk", "unknown"}

RESOURCE_CONSTRAINTS = {"unknown", "budget_sensitive"}


# ─── Helpers ───────────────────────────────────────────────────────────────
def _evidence(items: list, dimension: str, value: str, reason: str, signal: Any) -> None:
    items.append(
        {
            "dimension": dimension,
            "value": value,
            "reason": reason,
            "signal": signal,
        }
    )


def _classify_discovery(signals: dict[str, Any], evidence: list) -> str:
    goal_count = int(signals.get("goal_exams_count") or 0)
    sectors = int(signals.get("preferred_sectors_count") or 0)
    if goal_count == 0 and sectors == 0:
        value = "confused_explorer"
        reason = "no_goal_exams_or_sectors"
    elif goal_count == 0 and sectors > 0:
        value = "confused_explorer"
        reason = "sectors_without_goal_exam"
    elif goal_count == 1:
        value = "targeted_exam_aspirant"
        reason = "single_goal_exam"
    elif goal_count > 1:
        value = "multi_exam_optimizer"
        reason = "multiple_goal_exams"
    else:
        value = "unknown"
        reason = "indeterminate_discovery"
    _evidence(
        evidence,
        "discovery_stage",
        value,
        reason,
        {"goal_exams_count": goal_count, "preferred_sectors_count": sectors},
    )
    return value


def _classify_preparation(signals: dict[str, Any], evidence: list) -> str:
    target_year = signals.get("target_exam_year")
    completeness = float(signals.get("profile_completeness") or 0.0)
    total_tasks_14d = int(signals.get("_total_tasks_14d") or 0)
    mocks = int(signals.get("mocks_taken_30d") or 0)
    now_year = datetime.now(timezone.utc).year

    if target_year is None and total_tasks_14d == 0 and mocks == 0:
        value = "unknown" if completeness < 0.3 else "beginner"
        reason = "no_target_year_no_activity"
    elif target_year is not None and target_year <= now_year:
        value = "final_window_aspirant"
        reason = "target_year_within_current_year"
    elif mocks >= 4:
        value = "intermediate"
        reason = "regular_mock_activity"
    elif total_tasks_14d > 0 and mocks == 0:
        value = "beginner"
        reason = "early_study_activity_no_mocks"
    elif total_tasks_14d >= 10 and mocks >= 1:
        value = "intermediate"
        reason = "sustained_task_and_mock_activity"
    else:
        value = "beginner"
        reason = "default_beginner_fallback"
    _evidence(
        evidence,
        "preparation_stage",
        value,
        reason,
        {
            "target_exam_year": target_year,
            "total_tasks_14d": total_tasks_14d,
            "mocks_taken_30d": mocks,
        },
    )
    return value


def _classify_time_constraint(signals: dict[str, Any], evidence: list) -> str:
    weekly_hours = signals.get("weekly_hours_goal")
    study_mode = (signals.get("study_mode") or "").lower()
    career_stage = (signals.get("_career_stage") or "").lower()

    if "working" in study_mode or "professional" in study_mode or "working" in career_stage:
        value = "working_professional"
        reason = "study_mode_or_career_stage_working"
    elif weekly_hours is None:
        value = "unknown"
        reason = "no_weekly_hours_goal"
    else:
        hours = float(weekly_hours)
        if hours <= 8:
            value = "low_availability"
            reason = "weekly_hours_goal_low"
        elif hours <= 28:
            value = "standard_availability"
            reason = "weekly_hours_goal_standard"
        else:
            value = "high_availability"
            reason = "weekly_hours_goal_high"
    _evidence(
        evidence,
        "time_constraint",
        value,
        reason,
        {"weekly_hours_goal": weekly_hours, "study_mode": signals.get("study_mode")},
    )
    return value


def _classify_learning_behavior(signals: dict[str, Any], evidence: list) -> str:
    total_tasks_14d = int(signals.get("_total_tasks_14d") or 0)
    completion_rate = signals.get("task_completion_rate_14d")
    missed = int(signals.get("missed_task_count_14d") or 0)
    mocks = int(signals.get("mocks_taken_30d") or 0)
    focus_minutes = int(signals.get("focus_minutes_7d") or 0)
    weekly_review = bool(signals.get("weekly_review_available"))

    if total_tasks_14d == 0 and focus_minutes == 0 and mocks == 0:
        value = "insufficient_data"
        reason = "no_study_activity"
    elif (
        total_tasks_14d >= 5
        and completion_rate is not None
        and completion_rate < 0.4
        and missed >= 3
    ):
        value = "planner_poor_executor"
        reason = "tasks_planned_but_low_completion_and_high_miss"
    elif total_tasks_14d >= 10 and mocks == 0:
        value = "mock_avoider"
        reason = "sustained_study_no_mocks"
    elif mocks >= 3 and not weekly_review:
        value = "high_mock_low_review"
        reason = "many_mocks_but_no_review_signal"
    elif missed >= 6 and (completion_rate or 0) < 0.5:
        value = "revision_backlog_heavy"
        reason = "high_missed_with_low_completion"
    elif completion_rate is not None and completion_rate >= 0.7:
        value = "consistent_executor"
        reason = "high_completion_rate"
    else:
        value = "insufficient_data"
        reason = "ambiguous_behaviour_signal"

    _evidence(
        evidence,
        "learning_behavior",
        value,
        reason,
        {
            "total_tasks_14d": total_tasks_14d,
            "completion_rate_14d": completion_rate,
            "missed_14d": missed,
            "mocks_30d": mocks,
            "focus_minutes_7d": focus_minutes,
            "weekly_review_available": weekly_review,
        },
    )
    return value


def _classify_execution_risk(signals: dict[str, Any], behavior: str, evidence: list) -> str:
    total_tasks_14d = int(signals.get("_total_tasks_14d") or 0)
    completion_rate = signals.get("task_completion_rate_14d")
    missed = int(signals.get("missed_task_count_14d") or 0)

    if total_tasks_14d == 0:
        value = "unknown"
        reason = "no_task_history"
    elif behavior == "planner_poor_executor" or (
        completion_rate is not None and completion_rate < 0.3
    ):
        value = "high"
        reason = "low_completion_or_planner_poor_executor"
    elif behavior == "revision_backlog_heavy" or missed >= 6:
        value = "high"
        reason = "missed_task_backlog"
    elif completion_rate is not None and completion_rate < 0.6:
        value = "medium"
        reason = "moderate_completion"
    else:
        value = "low"
        reason = "healthy_completion"
    _evidence(
        evidence,
        "execution_risk",
        value,
        reason,
        {"total_tasks_14d": total_tasks_14d, "completion_rate_14d": completion_rate, "missed_14d": missed},
    )
    return value


def _classify_motivation(signals: dict[str, Any], behavior: str, evidence: list) -> str:
    target_year = signals.get("target_exam_year")
    now_year = datetime.now(timezone.utc).year
    total_tasks_14d = int(signals.get("_total_tasks_14d") or 0)
    focus_minutes = int(signals.get("focus_minutes_7d") or 0)
    completion_rate = signals.get("task_completion_rate_14d")

    if target_year is None and total_tasks_14d == 0 and focus_minutes == 0:
        value = "unknown"
        reason = "no_motivation_signals"
    elif target_year is not None and target_year <= now_year:
        value = "deadline_sensitive"
        reason = "target_year_imminent"
    elif behavior in {"planner_poor_executor", "revision_backlog_heavy"} or (
        total_tasks_14d > 0 and focus_minutes == 0 and (completion_rate or 0) < 0.3
    ):
        value = "dropoff_risk"
        reason = "execution_signals_indicate_dropoff"
    else:
        value = "stable"
        reason = "default_stable_motivation"
    _evidence(
        evidence,
        "motivation_state",
        value,
        reason,
        {
            "target_exam_year": target_year,
            "total_tasks_14d": total_tasks_14d,
            "focus_minutes_7d": focus_minutes,
            "completion_rate_14d": completion_rate,
        },
    )
    return value


def _classify_resource_constraint(signals: dict[str, Any], evidence: list) -> str:
    # PR1 contract: only infer budget_sensitive from an explicit budget /
    # financial-constraint field. We intentionally never infer this from
    # category, caste, location, or social background.
    explicit = signals.get("budget_sensitive_explicit")
    if explicit is True:
        value = "budget_sensitive"
        reason = "explicit_budget_constraint_field"
    else:
        value = "unknown"
        reason = "no_explicit_budget_field"
    _evidence(
        evidence,
        "resource_constraint",
        value,
        reason,
        {"budget_sensitive_explicit": explicit},
    )
    return value


# ─── Primary persona label (internal only) ─────────────────────────────────
def _primary_persona(dimensions: dict[str, str]) -> str:
    time_c = dimensions.get("time_constraint")
    prep = dimensions.get("preparation_stage")
    discovery = dimensions.get("discovery_stage")

    if time_c == "working_professional" and prep == "beginner":
        return "working_beginner"
    if time_c == "working_professional":
        return "working_aspirant"
    if discovery == "confused_explorer":
        return "exploring_aspirant"
    if discovery == "multi_exam_optimizer":
        return "multi_exam_optimizer"
    if prep == "final_window_aspirant":
        return "final_window_aspirant"
    if prep == "repeater":
        return "repeater_aspirant"
    if prep == "intermediate":
        return "intermediate_aspirant"
    if prep == "beginner":
        return "beginner_aspirant"
    return "unclassified_aspirant"


# ─── Numeric scores ────────────────────────────────────────────────────────
def _scores(signals: dict[str, Any]) -> dict[str, float]:
    completion_rate = signals.get("task_completion_rate_14d")
    total_tasks = int(signals.get("_total_tasks_14d") or 0)
    focus_minutes = int(signals.get("focus_minutes_7d") or 0)
    mocks = int(signals.get("mocks_taken_30d") or 0)

    execution = (
        float(completion_rate) if completion_rate is not None else 0.0
    )
    consistency = min(1.0, focus_minutes / 600.0) if focus_minutes else 0.0
    mock_engagement = min(1.0, mocks / 5.0)
    planning = min(1.0, total_tasks / 20.0)

    return {
        "execution": round(execution, 3),
        "consistency": round(consistency, 3),
        "mock_engagement": round(mock_engagement, 3),
        "planning": round(planning, 3),
        "profile_completeness": round(float(signals.get("profile_completeness") or 0.0), 3),
    }


# ─── Tiny-question answer overrides (PR2) ──────────────────────────────────
#
# Answers from the progressive tiny-question card are deterministic, user-
# confirmed signals. They take precedence over inferred behaviour when the
# user has explicitly told us where they are. We never AI-interpret an
# answer — only the exact registered option value is honoured.

_PREP_ANSWER_TO_STAGE = {
    "just_starting": "beginner",
    "studied_before_restarting": "restarting_aspirant",
    "currently_preparing": None,  # leave inferred value alone
    "already_attempted_exam": "repeater",
    "final_revision_phase": "final_window_aspirant",
}

_WEEKDAY_ANSWER_TO_TIME = {
    "less_than_1_hour": "low_availability",
    "1_to_2_hours": "low_availability",
    "2_to_4_hours": None,  # leave inferred value alone
    "4_plus_hours": "high_availability",
}


def _apply_answer_overrides(
    dimensions: dict[str, str],
    signals: dict[str, Any],
    evidence: list,
) -> None:
    answers = signals.get("persona_question_answers") or {}
    if not isinstance(answers, dict) or not answers:
        return

    prep_answer = answers.get("preparation_stage_self_assessment")
    if prep_answer in _PREP_ANSWER_TO_STAGE and _PREP_ANSWER_TO_STAGE[prep_answer]:
        dimensions["preparation_stage"] = _PREP_ANSWER_TO_STAGE[prep_answer]
        _evidence(
            evidence,
            "preparation_stage",
            dimensions["preparation_stage"],
            "tiny_question_answer",
            {"preparation_stage_self_assessment": prep_answer},
        )

    weekday_answer = answers.get("weekday_study_availability")
    if (
        weekday_answer in _WEEKDAY_ANSWER_TO_TIME
        and _WEEKDAY_ANSWER_TO_TIME[weekday_answer]
        # don't override working_professional — that's a stronger flag
        and dimensions.get("time_constraint") != "working_professional"
    ):
        dimensions["time_constraint"] = _WEEKDAY_ANSWER_TO_TIME[weekday_answer]
        _evidence(
            evidence,
            "time_constraint",
            dimensions["time_constraint"],
            "tiny_question_answer",
            {"weekday_study_availability": weekday_answer},
        )

    mock_answer = answers.get("mock_behavior")
    if mock_answer == "avoid_mocks" or mock_answer == "not_started_mocks_yet":
        dimensions["learning_behavior"] = "mock_avoider"
        _evidence(
            evidence,
            "learning_behavior",
            "mock_avoider",
            "tiny_question_answer",
            {"mock_behavior": mock_answer},
        )
    elif mock_answer == "take_mocks_but_skip_analysis":
        dimensions["learning_behavior"] = "high_mock_low_review"
        _evidence(
            evidence,
            "learning_behavior",
            "high_mock_low_review",
            "tiny_question_answer",
            {"mock_behavior": mock_answer},
        )

    revision_answer = answers.get("revision_behavior")
    # Only apply the revision_backlog_heavy override when we don't already
    # have a stronger behaviour signal from mock_behavior.
    if revision_answer == "rarely" and dimensions.get("learning_behavior") in {
        "insufficient_data",
        "consistent_executor",
    }:
        dimensions["learning_behavior"] = "revision_backlog_heavy"
        _evidence(
            evidence,
            "learning_behavior",
            "revision_backlog_heavy",
            "tiny_question_answer",
            {"revision_behavior": revision_answer},
        )

    blocker_answer = answers.get("study_consistency_blocker")
    if blocker_answer in {"phone_distraction", "unclear_plan"}:
        current = dimensions.get("execution_risk")
        if current in {None, "unknown", "low"}:
            dimensions["execution_risk"] = "medium"
            _evidence(
                evidence,
                "execution_risk",
                "medium",
                "tiny_question_answer",
                {"study_consistency_blocker": blocker_answer},
            )


# ─── Entrypoint ────────────────────────────────────────────────────────────
def classify_persona(signals: dict[str, Any] | None) -> dict[str, Any]:
    """Pure function: signals -> persona dict. Safe with empty or partial input."""
    signals = signals or {}
    evidence: list[dict[str, Any]] = []

    discovery = _classify_discovery(signals, evidence)
    preparation = _classify_preparation(signals, evidence)
    time_constraint = _classify_time_constraint(signals, evidence)
    behavior = _classify_learning_behavior(signals, evidence)
    execution_risk = _classify_execution_risk(signals, behavior, evidence)
    motivation = _classify_motivation(signals, behavior, evidence)
    resource = _classify_resource_constraint(signals, evidence)

    dimensions: dict[str, str] = {
        "discovery_stage": discovery,
        "preparation_stage": preparation,
        "time_constraint": time_constraint,
        "learning_behavior": behavior,
        "execution_risk": execution_risk,
        "motivation_state": motivation,
        "resource_constraint": resource,
    }

    # PR2: deterministic overrides from tiny-question answers (no AI).
    _apply_answer_overrides(dimensions, signals, evidence)

    return {
        "dimensions": dimensions,
        "scores": _scores(signals),
        "primary_persona": _primary_persona(dimensions),
        "evidence": evidence,
    }
