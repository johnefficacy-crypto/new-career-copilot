"""Tests for persona -> Study OS policy derivation."""
from __future__ import annotations

from app.persona.study_policy import derive_study_policy


def _dims(**overrides):
    base = {
        "discovery_stage": "targeted_exam_aspirant",
        "preparation_stage": "beginner",
        "time_constraint": "standard_availability",
        "learning_behavior": "insufficient_data",
        "execution_risk": "unknown",
        "motivation_state": "stable",
        "resource_constraint": "unknown",
    }
    base.update(overrides)
    return base


def test_empty_dimensions_produce_safe_default_policy():
    policy = derive_study_policy(None)
    assert policy["nudge_style"] == "direct_non_shaming"
    assert policy["max_tasks_per_day"] >= 1
    assert policy["preferred_task_size"] in {"small", "medium", "large"}
    assert "task_mix" in policy
    # Mix should sum to ~1.
    assert abs(sum(policy["task_mix"].values()) - 1.0) < 0.01


def test_low_availability_yields_small_size_and_low_task_count():
    policy = derive_study_policy(_dims(time_constraint="low_availability"))
    assert policy["preferred_task_size"] == "small"
    assert policy["max_tasks_per_day"] <= 2
    assert policy["daily_minutes_target"] <= 60
    assert policy["constraints"]["avoid_long_theory_blocks"] is True


def test_planner_poor_executor_reduces_task_count_and_uses_non_shaming_nudge():
    policy = derive_study_policy(
        _dims(time_constraint="standard_availability", learning_behavior="planner_poor_executor")
    )
    assert policy["preferred_task_size"] == "small"
    assert policy["max_tasks_per_day"] <= 3
    assert policy["nudge_style"] == "direct_non_shaming"
    assert policy["constraints"]["avoid_long_theory_blocks"] is True


def test_mock_avoider_includes_meaningful_retrieval_share():
    policy = derive_study_policy(_dims(learning_behavior="mock_avoider"))
    assert policy["task_mix"]["retrieval_practice"] >= 0.20


def test_high_mock_low_review_requires_mock_review_before_next_mock():
    policy = derive_study_policy(_dims(learning_behavior="high_mock_low_review"))
    assert policy["constraints"]["require_mock_review_before_next_mock"] is True
    assert policy["task_mix"]["mock_correction"] >= 0.15


def test_working_professional_enables_weekend_catchup():
    policy = derive_study_policy(_dims(time_constraint="working_professional"))
    assert policy["constraints"]["weekend_catchup_enabled"] is True
    assert policy["preferred_task_size"] == "small"


def test_high_execution_risk_shrinks_max_tasks():
    base = derive_study_policy(_dims(execution_risk="unknown"))
    risky = derive_study_policy(_dims(execution_risk="high"))
    assert risky["max_tasks_per_day"] <= base["max_tasks_per_day"]
    assert risky["preferred_task_size"] == "small"


def test_task_mix_always_normalised():
    for behavior in [
        "insufficient_data",
        "planner_poor_executor",
        "mock_avoider",
        "high_mock_low_review",
        "revision_backlog_heavy",
        "consistent_executor",
    ]:
        policy = derive_study_policy(_dims(learning_behavior=behavior))
        total = sum(policy["task_mix"].values())
        assert abs(total - 1.0) < 0.01, (behavior, total)
