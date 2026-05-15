"""Deterministic tests for the rule-based persona classifier (v1)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.persona.classifier import classify_persona


def _base_signals(**overrides):
    base = {
        "profile_completeness": 0.5,
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
        "_career_stage": None,
        "_onboarding_completed": False,
        "_total_tasks_14d": 0,
    }
    base.update(overrides)
    return base


# ─── empty input ────────────────────────────────────────────────────────────
def test_empty_signals_produce_unknown_or_insufficient_data():
    result = classify_persona({})
    dims = result["dimensions"]
    assert dims["discovery_stage"] == "confused_explorer"
    assert dims["preparation_stage"] in {"unknown", "beginner"}
    assert dims["time_constraint"] == "unknown"
    assert dims["learning_behavior"] == "insufficient_data"
    assert dims["execution_risk"] == "unknown"
    assert dims["motivation_state"] == "unknown"
    assert dims["resource_constraint"] == "unknown"
    assert isinstance(result["evidence"], list) and result["evidence"]


def test_none_signals_does_not_crash():
    result = classify_persona(None)
    assert "dimensions" in result
    assert "scores" in result


# ─── discovery stage ────────────────────────────────────────────────────────
def test_zero_goal_exams_is_confused_explorer():
    result = classify_persona(_base_signals(goal_exams_count=0))
    assert result["dimensions"]["discovery_stage"] == "confused_explorer"


def test_single_goal_exam_is_targeted_aspirant():
    result = classify_persona(_base_signals(goal_exams_count=1))
    assert result["dimensions"]["discovery_stage"] == "targeted_exam_aspirant"


def test_multiple_goal_exams_is_multi_exam_optimizer():
    result = classify_persona(_base_signals(goal_exams_count=3))
    assert result["dimensions"]["discovery_stage"] == "multi_exam_optimizer"


# ─── time constraint ────────────────────────────────────────────────────────
def test_weekly_hours_le_8_is_low_availability():
    result = classify_persona(_base_signals(weekly_hours_goal=6))
    assert result["dimensions"]["time_constraint"] == "low_availability"


def test_weekly_hours_high_is_high_availability():
    result = classify_persona(_base_signals(weekly_hours_goal=40))
    assert result["dimensions"]["time_constraint"] == "high_availability"


def test_working_mode_overrides_to_working_professional():
    result = classify_persona(
        _base_signals(study_mode="working_professional", weekly_hours_goal=20)
    )
    assert result["dimensions"]["time_constraint"] == "working_professional"


# ─── learning behavior + execution risk ────────────────────────────────────
def test_high_miss_low_completion_is_planner_poor_executor_and_high_risk():
    signals = _base_signals(
        _total_tasks_14d=10,
        task_completion_rate_14d=0.2,
        missed_task_count_14d=5,
        goal_exams_count=1,
    )
    result = classify_persona(signals)
    assert result["dimensions"]["learning_behavior"] == "planner_poor_executor"
    assert result["dimensions"]["execution_risk"] == "high"


def test_mocks_zero_with_sustained_history_is_mock_avoider():
    signals = _base_signals(
        _total_tasks_14d=20,
        task_completion_rate_14d=0.75,
        missed_task_count_14d=1,
        mocks_taken_30d=0,
        goal_exams_count=1,
    )
    result = classify_persona(signals)
    assert result["dimensions"]["learning_behavior"] == "mock_avoider"


def test_consistent_executor_when_completion_high():
    signals = _base_signals(
        _total_tasks_14d=15,
        task_completion_rate_14d=0.8,
        missed_task_count_14d=1,
        mocks_taken_30d=5,
        weekly_review_available=True,
        goal_exams_count=1,
    )
    result = classify_persona(signals)
    assert result["dimensions"]["learning_behavior"] == "consistent_executor"
    assert result["dimensions"]["execution_risk"] == "low"


# ─── motivation ─────────────────────────────────────────────────────────────
def test_target_year_current_or_past_is_deadline_sensitive():
    current_year = datetime.now(timezone.utc).year
    result = classify_persona(_base_signals(target_exam_year=current_year))
    assert result["dimensions"]["motivation_state"] == "deadline_sensitive"
    assert result["dimensions"]["preparation_stage"] == "final_window_aspirant"


# ─── resource constraint contract ───────────────────────────────────────────
def test_budget_sensitive_never_inferred_from_category():
    signals = _base_signals()
    signals["category"] = "obc"  # category must NOT cause budget inference
    result = classify_persona(signals)
    assert result["dimensions"]["resource_constraint"] == "unknown"


def test_budget_sensitive_only_from_explicit_flag():
    signals = _base_signals(budget_sensitive_explicit=True)
    result = classify_persona(signals)
    assert result["dimensions"]["resource_constraint"] == "budget_sensitive"


# ─── primary persona label ─────────────────────────────────────────────────
def test_working_beginner_primary_persona():
    signals = _base_signals(
        study_mode="working_professional",
        weekly_hours_goal=10,
        goal_exams_count=1,
        target_exam_year=datetime.now(timezone.utc).year + 2,
    )
    result = classify_persona(signals)
    assert result["dimensions"]["time_constraint"] == "working_professional"
    assert result["primary_persona"] in {"working_beginner", "working_aspirant"}
