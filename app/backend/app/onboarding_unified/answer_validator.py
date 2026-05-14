"""Deterministic, allowlisted answer parsing for the unified engine.

Sprint-1 rule: **no AI in the answer path.** Free text is never parsed
into eligibility fields. Only these data types are accepted:

    single_select, multi_select, boolean, number, percentage, date, text

``text`` is accepted as a trimmed non-empty string but is treated as a
log-only value — the profile adapter never promotes a ``text`` answer to
a canonical eligibility field in this sprint.

Validation rejects anything it cannot deterministically normalise; the
API layer turns :class:`AnswerValidationError` into an HTTP 400.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

ALLOWLISTED_DATA_TYPES = (
    "single_select",
    "multi_select",
    "boolean",
    "number",
    "percentage",
    "date",
    "text",
)


class AnswerValidationError(ValueError):
    """Raised when an answer cannot be deterministically validated."""


def _option_values(question: dict[str, Any]) -> set[Any]:
    raw = question.get("options") or []
    values: set[Any] = set()
    if isinstance(raw, list):
        for opt in raw:
            if isinstance(opt, dict) and "value" in opt:
                values.add(opt.get("value"))
            elif isinstance(opt, str):
                values.add(opt)
    return values


def _coerce_boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "y", "1"}:
            return True
        if lowered in {"false", "no", "n", "0"}:
            return False
    raise AnswerValidationError("answer must be a yes/no value")


def _coerce_number(value: Any) -> float:
    if isinstance(value, bool):  # bool is an int subclass — reject early.
        raise AnswerValidationError("answer must be a number, not a yes/no value")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip().rstrip("%").strip()
        if stripped == "":
            raise AnswerValidationError("answer must be a number")
        try:
            return float(stripped)
        except ValueError as exc:
            raise AnswerValidationError("answer must be a number") from exc
    raise AnswerValidationError("answer must be a number")


def _coerce_percentage(value: Any) -> float:
    number = _coerce_number(value)
    if number < 0 or number > 100:
        raise AnswerValidationError("percentage must be between 0 and 100")
    return number


def _coerce_date(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AnswerValidationError("answer must be an ISO-8601 date string")
    try:
        datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise AnswerValidationError("answer must be an ISO-8601 date string") from exc
    return value.strip()


def validate_answer(question: dict[str, Any], answer_value: Any) -> Any:
    """Validate + normalise ``answer_value`` against ``question``.

    ``question`` must carry at least ``data_type`` (and ``options`` for the
    select types). Returns the normalised value to persist; raises
    :class:`AnswerValidationError` on rejection.
    """
    if not question:
        raise AnswerValidationError("unknown question")
    if question.get("is_active") is False:
        raise AnswerValidationError("question is not active")

    data_type = question.get("data_type")
    if data_type not in ALLOWLISTED_DATA_TYPES:
        raise AnswerValidationError(
            f"data_type '{data_type}' is not supported in this sprint"
        )

    if data_type == "single_select":
        allowed = _option_values(question)
        if not allowed:
            raise AnswerValidationError("question has no selectable options")
        if answer_value not in allowed:
            raise AnswerValidationError("answer must be one of the listed options")
        return answer_value

    if data_type == "multi_select":
        if not isinstance(answer_value, list) or not answer_value:
            raise AnswerValidationError("answer must be a non-empty list")
        allowed = _option_values(question)
        bad = [v for v in answer_value if v not in allowed]
        if bad:
            raise AnswerValidationError("answer contains values not in the options")
        deduped: list[Any] = []
        for v in answer_value:
            if v not in deduped:
                deduped.append(v)
        return deduped

    if data_type == "boolean":
        return _coerce_boolean(answer_value)

    if data_type == "number":
        return _coerce_number(answer_value)

    if data_type == "percentage":
        return _coerce_percentage(answer_value)

    if data_type == "date":
        return _coerce_date(answer_value)

    # text — accepted as a log-only value; never AI-parsed, never promoted
    # to a canonical eligibility field in this sprint.
    if not isinstance(answer_value, str) or not answer_value.strip():
        raise AnswerValidationError("answer must be a non-empty string")
    return answer_value.strip()
