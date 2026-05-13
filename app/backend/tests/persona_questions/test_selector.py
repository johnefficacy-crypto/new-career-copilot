"""Tests for next-question selection rules (PR2)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.persona_questions.selector import select_next_question
from tests.persona_questions._stub import SBStub


def _q(question_key, *, priority=100, target_dimension=None, options=None):
    return {
        "question_key": question_key,
        "question_text": f"Q {question_key}?",
        "data_type": "single_select",
        "options": options or [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}],
        "priority": priority,
        "target_dimension": target_dimension,
        "is_active": True,
    }


def _bank_seed():
    return [
        _q("preparation_stage_self_assessment", priority=10, target_dimension="preparation_stage",
           options=[{"value": "just_starting", "label": "Just starting"}]),
        _q("weekday_study_availability", priority=20, target_dimension="time_constraint",
           options=[{"value": "less_than_1_hour", "label": "<1h"}]),
        _q("mock_behavior", priority=50, target_dimension="learning_behavior",
           options=[{"value": "avoid_mocks", "label": "Avoid"}]),
    ]


def test_returns_highest_priority_unanswered_active_question():
    sb = SBStub({"persona_question_bank": _bank_seed()})
    result = select_next_question(sb, "u-1")
    assert result["question"]["question_key"] == "preparation_stage_self_assessment"


def test_skips_already_answered_question():
    sb = SBStub({
        "persona_question_bank": _bank_seed(),
        "persona_question_answers": [
            {"user_id": "u-1", "question_key": "preparation_stage_self_assessment",
             "skipped": False, "created_at": "2026-01-01T00:00:00+00:00"}
        ],
    })
    result = select_next_question(sb, "u-1")
    assert result["question"]["question_key"] == "weekday_study_availability"


def test_skips_dismissed_question_until_expiry():
    future = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    sb = SBStub({
        "persona_question_bank": _bank_seed(),
        "persona_question_dismissals": [
            {"user_id": "u-1", "question_key": "preparation_stage_self_assessment",
             "dismissed_until": future},
        ],
    })
    result = select_next_question(sb, "u-1")
    assert result["question"]["question_key"] == "weekday_study_availability"


def test_expired_dismissal_does_not_skip_question():
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    sb = SBStub({
        "persona_question_bank": _bank_seed(),
        "persona_question_dismissals": [
            {"user_id": "u-1", "question_key": "preparation_stage_self_assessment",
             "dismissed_until": past},
        ],
    })
    result = select_next_question(sb, "u-1")
    assert result["question"]["question_key"] == "preparation_stage_self_assessment"


def test_prioritises_unknown_persona_dimension():
    sb = SBStub({
        "persona_question_bank": _bank_seed(),
        "aspirant_persona_snapshots": [
            {
                "user_id": "u-1",
                "persona_version": "v1",
                "dimensions": {
                    "discovery_stage": "targeted_exam_aspirant",
                    "preparation_stage": "beginner",
                    "time_constraint": "standard_availability",
                    "learning_behavior": "insufficient_data",  # unknown!
                    "execution_risk": "low",
                    "motivation_state": "stable",
                    "resource_constraint": "unknown",
                },
                "scores": {"profile_completeness": 0.7},
                "computed_at": "2026-01-01T00:00:00+00:00",
            }
        ],
    })
    # Even though preparation_stage_self_assessment has lowest priority,
    # learning_behavior is unknown so mock_behavior gets boosted to the top.
    result = select_next_question(sb, "u-1")
    assert result["question"]["question_key"] == "mock_behavior"


def test_returns_null_when_all_questions_answered():
    bank = _bank_seed()
    answered = [
        {"user_id": "u-1", "question_key": q["question_key"], "skipped": False,
         "created_at": f"2026-01-0{i+1}T00:00:00+00:00"}
        for i, q in enumerate(bank)
    ]
    sb = SBStub({"persona_question_bank": bank, "persona_question_answers": answered})
    result = select_next_question(sb, "u-1")
    assert result["question"] is None
    assert "No progressive question" in (result["reason"] or "")


def test_skipped_answer_does_not_disqualify_question():
    # A skip should only suppress via the dismissals table; a row in
    # persona_question_answers with skipped=True is just for audit.
    sb = SBStub({
        "persona_question_bank": _bank_seed(),
        "persona_question_answers": [
            {"user_id": "u-1", "question_key": "preparation_stage_self_assessment",
             "skipped": True, "created_at": "2026-01-01T00:00:00+00:00"}
        ],
    })
    result = select_next_question(sb, "u-1")
    assert result["question"]["question_key"] == "preparation_stage_self_assessment"


def test_empty_bank_returns_null():
    sb = SBStub({})
    result = select_next_question(sb, "u-1")
    assert result["question"] is None
