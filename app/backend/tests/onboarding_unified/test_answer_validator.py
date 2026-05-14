"""Deterministic answer-validation tests (no AI parsing in this sprint)."""
from __future__ import annotations

import pytest

from app.onboarding_unified.answer_validator import (
    AnswerValidationError,
    validate_answer,
)

_SINGLE = {
    "data_type": "single_select",
    "options": [
        {"value": "a", "label": "A"},
        {"value": "b", "label": "B"},
    ],
    "is_active": True,
}


def test_rejects_invalid_single_select_option():
    with pytest.raises(AnswerValidationError):
        validate_answer(_SINGLE, "not_an_option")


def test_accepts_valid_single_select_option():
    assert validate_answer(_SINGLE, "a") == "a"


def test_rejects_inactive_question():
    with pytest.raises(AnswerValidationError):
        validate_answer({**_SINGLE, "is_active": False}, "a")


def test_boolean_coercion():
    q = {"data_type": "boolean", "is_active": True}
    assert validate_answer(q, "yes") is True
    assert validate_answer(q, "no") is False
    assert validate_answer(q, True) is True
    with pytest.raises(AnswerValidationError):
        validate_answer(q, "maybe")


def test_number_rejects_non_numeric():
    q = {"data_type": "number", "is_active": True}
    assert validate_answer(q, "3.5") == 3.5
    with pytest.raises(AnswerValidationError):
        validate_answer(q, "abc")


def test_percentage_range_enforced():
    q = {"data_type": "percentage", "is_active": True}
    assert validate_answer(q, "76%") == 76.0
    with pytest.raises(AnswerValidationError):
        validate_answer(q, 140)


def test_date_requires_iso():
    q = {"data_type": "date", "is_active": True}
    assert validate_answer(q, "2000-01-01") == "2000-01-01"
    with pytest.raises(AnswerValidationError):
        validate_answer(q, "01/01/2000")


def test_multi_select_dedupes_and_validates():
    q = {
        "data_type": "multi_select",
        "options": [{"value": "x"}, {"value": "y"}],
        "is_active": True,
    }
    assert validate_answer(q, ["x", "y", "x"]) == ["x", "y"]
    with pytest.raises(AnswerValidationError):
        validate_answer(q, ["x", "z"])


def test_unsupported_data_type_rejected():
    with pytest.raises(AnswerValidationError):
        validate_answer({"data_type": "json", "is_active": True}, {"a": 1})
