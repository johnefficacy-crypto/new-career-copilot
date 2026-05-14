"""Answer validation + persistence for tiny questions.

Validation is intentionally strict: an answer must match the
question's ``data_type`` and, for single/multi-select, must come from
the registered options. We never AI-interpret a free-form answer in PR2.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.persona_questions.answers")


class AnswerValidationError(ValueError):
    """Raised when an answer cannot be coerced/validated against the question."""


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona_questions.answers supabase call failed: %s", exc)
        return default


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
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1", "y"}:
            return True
        if lowered in {"false", "no", "0", "n"}:
            return False
    raise AnswerValidationError("answer must be boolean")


def _coerce_number(value: Any) -> float:
    if isinstance(value, bool):  # bool is an int subclass; reject early.
        raise AnswerValidationError("answer must be number, not boolean")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            raise AnswerValidationError("answer must be number")
        try:
            return float(stripped)
        except ValueError as exc:
            raise AnswerValidationError("answer must be number") from exc
    raise AnswerValidationError("answer must be number")


def validate_answer(question: dict[str, Any], answer_value: Any) -> Any:
    """Validate and normalize ``answer_value`` against ``question``.

    Returns the normalized value to persist. Raises
    ``AnswerValidationError`` on rejection. Inactive questions are
    rejected so the caller can return a clean 400.
    """
    if not question:
        raise AnswerValidationError("unknown question_key")
    if question.get("is_active") is False:
        raise AnswerValidationError("question is not active")

    data_type = question.get("data_type")
    if data_type == "single_select":
        allowed = _option_values(question)
        if answer_value not in allowed:
            raise AnswerValidationError("answer must be one of the listed options")
        return answer_value
    if data_type == "multi_select":
        if not isinstance(answer_value, list) or not answer_value:
            raise AnswerValidationError("answer must be a non-empty list")
        allowed = _option_values(question)
        bad = [v for v in answer_value if v not in allowed]
        if bad:
            raise AnswerValidationError("answer contains values not in options")
        # Preserve input order but drop duplicates deterministically.
        seen: list[Any] = []
        for v in answer_value:
            if v not in seen:
                seen.append(v)
        return seen
    if data_type == "boolean":
        return _coerce_boolean(answer_value)
    if data_type == "number":
        return _coerce_number(answer_value)
    if data_type == "text":
        if not isinstance(answer_value, str) or not answer_value.strip():
            raise AnswerValidationError("answer must be a non-empty string")
        return answer_value.strip()
    if data_type == "date":
        if not isinstance(answer_value, str) or not answer_value.strip():
            raise AnswerValidationError("answer must be an ISO-8601 date string")
        try:
            datetime.fromisoformat(answer_value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise AnswerValidationError("answer must be an ISO-8601 date string") from exc
        return answer_value
    if data_type == "json":
        if answer_value is None:
            raise AnswerValidationError("answer must not be null")
        return answer_value
    raise AnswerValidationError(f"unsupported data_type: {data_type}")


def save_question_answer(
    supabase: Any,
    user_id: str,
    question_key: str,
    answer_value: Any,
    normalized_value: Any,
    *,
    source: str = "persona_tiny_question",
    confidence: float | None = None,
    needs_review: bool = False,
) -> dict[str, Any]:
    if not user_id:
        raise ValueError("user_id is required")
    if not question_key:
        raise ValueError("question_key is required")
    payload: dict[str, Any] = {
        "user_id": user_id,
        "question_key": question_key,
        "answer_value": answer_value,
        "normalized_value": normalized_value,
        "skipped": False,
        "source": source,
        "needs_review": bool(needs_review),
    }
    if confidence is not None:
        payload["confidence"] = float(confidence)
    rows = _safe(
        lambda: supabase.table("persona_question_answers").insert(payload).execute().data,
        default=None,
    )
    if isinstance(rows, list) and rows:
        return rows[0]
    return payload


def save_question_skip(
    supabase: Any,
    user_id: str,
    question_key: str,
    *,
    dismissed_until_days: int | None = 14,
    reason: str | None = None,
) -> dict[str, Any]:
    """Record a skip in answers (for audit) and update the dismissal row."""
    if not user_id:
        raise ValueError("user_id is required")
    if not question_key:
        raise ValueError("question_key is required")

    skip_audit = {
        "user_id": user_id,
        "question_key": question_key,
        "answer_value": None,
        "normalized_value": None,
        "skipped": True,
        "source": "persona_tiny_question_skip",
    }
    _safe(
        lambda: supabase.table("persona_question_answers").insert(skip_audit).execute()
    )

    dismissed_until = None
    if dismissed_until_days and dismissed_until_days > 0:
        dismissed_until = (
            datetime.now(timezone.utc) + timedelta(days=int(dismissed_until_days))
        ).isoformat()

    upsert_payload = {
        "user_id": user_id,
        "question_key": question_key,
        "dismissed_until": dismissed_until,
        "reason": reason,
    }
    # Use upsert on (user_id, question_key) — supabase-py supports
    # on_conflict via the second arg; fall back to insert-then-update.
    rows = _safe(
        lambda: (
            supabase.table("persona_question_dismissals")
            .upsert(upsert_payload, on_conflict="user_id,question_key")
            .execute()
            .data
        ),
        default=None,
    )
    if rows is None:
        # Fallback path: insert; if conflict, update.
        inserted = _safe(
            lambda: supabase.table("persona_question_dismissals")
            .insert(upsert_payload)
            .execute()
            .data,
            default=None,
        )
        if inserted is None:
            _safe(
                lambda: supabase.table("persona_question_dismissals")
                .update(
                    {
                        "dismissed_until": dismissed_until,
                        "reason": reason,
                    }
                )
                .eq("user_id", user_id)
                .eq("question_key", question_key)
                .execute()
            )
    return {"skipped": True, "dismissed_until": dismissed_until}
