"""Tests for answer validation, persistence, and emit signal."""
from __future__ import annotations

import pytest

from app.persona_questions.answers import (
    AnswerValidationError,
    save_question_answer,
    save_question_skip,
    validate_answer,
)
from app.persona_questions.events import emit_question_signal
from tests.persona_questions._stub import SBStub


_SS_QUESTION = {
    "question_key": "mock_behavior",
    "data_type": "single_select",
    "options": [
        {"value": "avoid_mocks", "label": "Avoid"},
        {"value": "analyze_every_mock", "label": "Analyze every"},
    ],
    "is_active": True,
}


# ─── validate_answer ────────────────────────────────────────────────────────
def test_rejects_inactive_question():
    inactive = dict(_SS_QUESTION, is_active=False)
    with pytest.raises(AnswerValidationError):
        validate_answer(inactive, "avoid_mocks")


def test_rejects_invalid_single_select_option():
    with pytest.raises(AnswerValidationError):
        validate_answer(_SS_QUESTION, "not_a_real_value")


def test_accepts_valid_single_select():
    assert validate_answer(_SS_QUESTION, "avoid_mocks") == "avoid_mocks"


def test_accepts_valid_boolean_from_string():
    q = {"data_type": "boolean", "is_active": True}
    assert validate_answer(q, "yes") is True
    assert validate_answer(q, "no") is False
    assert validate_answer(q, True) is True


def test_rejects_non_numeric_number_answer():
    q = {"data_type": "number", "is_active": True}
    with pytest.raises(AnswerValidationError):
        validate_answer(q, "abc")


def test_accepts_numeric_string():
    q = {"data_type": "number", "is_active": True}
    assert validate_answer(q, "3.5") == 3.5


def test_text_must_be_non_empty():
    q = {"data_type": "text", "is_active": True}
    with pytest.raises(AnswerValidationError):
        validate_answer(q, "   ")
    assert validate_answer(q, "  hello  ") == "hello"


def test_multi_select_validates_each_value():
    q = {
        "data_type": "multi_select",
        "is_active": True,
        "options": [{"value": "a"}, {"value": "b"}, {"value": "c"}],
    }
    assert validate_answer(q, ["a", "b"]) == ["a", "b"]
    with pytest.raises(AnswerValidationError):
        validate_answer(q, ["a", "x"])
    with pytest.raises(AnswerValidationError):
        validate_answer(q, [])  # empty rejected


def test_date_must_be_iso8601():
    q = {"data_type": "date", "is_active": True}
    assert validate_answer(q, "2026-01-15") == "2026-01-15"
    with pytest.raises(AnswerValidationError):
        validate_answer(q, "tomorrow")


# ─── save_question_answer ──────────────────────────────────────────────────
def test_save_answer_payload_persists_to_supabase():
    sb = SBStub({"persona_question_answers": []})
    row = save_question_answer(sb, "u-1", "mock_behavior", "avoid_mocks", "avoid_mocks")
    assert row["user_id"] == "u-1"
    assert row["question_key"] == "mock_behavior"
    assert row["normalized_value"] == "avoid_mocks"
    assert row["skipped"] is False
    assert len(sb.db["persona_question_answers"]) == 1


def test_save_answer_requires_user_id_and_key():
    sb = SBStub({"persona_question_answers": []})
    with pytest.raises(ValueError):
        save_question_answer(sb, "", "mock_behavior", "x", "x")
    with pytest.raises(ValueError):
        save_question_answer(sb, "u-1", "", "x", "x")


# ─── save_question_skip ────────────────────────────────────────────────────
def test_skip_inserts_audit_and_dismissal():
    sb = SBStub({"persona_question_answers": [], "persona_question_dismissals": []})
    result = save_question_skip(
        sb, "u-1", "mock_behavior", dismissed_until_days=14, reason="not_now"
    )
    assert result["skipped"] is True
    assert result["dismissed_until"] is not None
    assert len(sb.db["persona_question_answers"]) == 1
    assert sb.db["persona_question_answers"][0]["skipped"] is True
    assert len(sb.db["persona_question_dismissals"]) == 1
    assert sb.db["persona_question_dismissals"][0]["user_id"] == "u-1"


# ─── emit_question_signal ──────────────────────────────────────────────────
def test_emit_signal_writes_user_signal_event_and_enqueues_recompute():
    sb = SBStub({
        "user_signal_events": [],
        "persona_recompute_queue": [],
    })
    result = emit_question_signal(sb, "u-1", "mock_behavior", "avoid_mocks")
    assert result["event_logged"] is True
    assert len(sb.db["user_signal_events"]) == 1
    event = sb.db["user_signal_events"][0]
    assert event["event_type"] == "persona_question_answered"
    assert event["payload"]["question_key"] == "mock_behavior"
    # Recompute row enqueued.
    assert len(sb.db["persona_recompute_queue"]) == 1
    assert sb.db["persona_recompute_queue"][0]["user_id"] == "u-1"
    assert result["drained"] >= 1
    assert sb.db["persona_recompute_queue"][0]["status"] in {"completed", "processing", "failed"}


def test_emit_signal_skipped_logs_event_but_no_recompute():
    sb = SBStub({"user_signal_events": [], "persona_recompute_queue": []})
    result = emit_question_signal(sb, "u-1", "mock_behavior", None, skipped=True)
    assert sb.db["user_signal_events"][0]["event_type"] == "persona_question_skipped"
    assert result["recompute"] == "skipped"
    assert sb.db["persona_recompute_queue"] == []
