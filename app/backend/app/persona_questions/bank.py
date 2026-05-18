"""Question registry helpers.

`persona_question_bank` is the source of truth for question metadata.
Helpers here read from it defensively — a missing or empty table never
crashes the API, it just yields "no question right now".

``list_active_questions`` is cached in-process for five minutes — the
onboarding-answer endpoint fires it on every call, and the bank is
admin-edited rarely. Admin writers must call
:func:`invalidate_bank_cache` after they mutate the table.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from cachetools import TTLCache

logger = logging.getLogger("career_copilot.persona_questions.bank")

_QUESTION_COLUMNS = (
    "id, question_key, field_key, question_text, help_text, data_type, "
    "options, target_dimension, target_profile_group, profile_table, "
    "profile_column, priority, trigger_rules, applies_when, is_active"
)

_BANK_CACHE: TTLCache = TTLCache(maxsize=1, ttl=300)
_BANK_CACHE_KEY = "active_questions"


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona_questions.bank supabase call failed: %s", exc)
        return default


def invalidate_bank_cache() -> None:
    """Drop the in-process question-bank cache.

    Call this from admin write paths after a bank row is created, edited
    or deactivated so the next read picks up the change.
    """
    _BANK_CACHE.clear()


def list_active_questions(supabase: Any) -> list[dict[str, Any]]:
    cached = _BANK_CACHE.get(_BANK_CACHE_KEY)
    if cached is not None:
        return list(cached)
    rows = _safe(
        lambda: (
            supabase.table("persona_question_bank")
            .select(_QUESTION_COLUMNS)
            .eq("is_active", True)
            .order("priority")
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []
    rows = list(rows)
    _BANK_CACHE[_BANK_CACHE_KEY] = rows
    return list(rows)


def get_question(supabase: Any, question_key: str) -> dict[str, Any] | None:
    if not question_key:
        return None
    rows = _safe(
        lambda: (
            supabase.table("persona_question_bank")
            .select(_QUESTION_COLUMNS)
            .eq("question_key", question_key)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def shape_question_for_api(question: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize a DB row into the API contract."""
    if not question:
        return None
    raw_options = question.get("options") or []
    options: list[dict[str, Any]] = []
    if isinstance(raw_options, list):
        for opt in raw_options:
            if isinstance(opt, dict) and "value" in opt:
                options.append(
                    {
                        "value": opt.get("value"),
                        "label": opt.get("label") or str(opt.get("value") or ""),
                    }
                )
            elif isinstance(opt, str):
                options.append({"value": opt, "label": opt})
    return {
        "question_key": question.get("question_key"),
        "question_text": question.get("question_text"),
        "help_text": question.get("help_text"),
        "data_type": question.get("data_type"),
        "options": options,
        "target_dimension": question.get("target_dimension"),
    }


def latest_question_answers(
    supabase: Any, user_id: str
) -> dict[str, dict[str, Any]]:
    """Return a {question_key: latest_answer_row} map for ``user_id``.

    The persona classifier and selector both need this. We read once and
    fold rows in Python so the call cost stays at one round-trip even
    for users with many answers.
    """
    if not user_id:
        return {}
    rows = _safe(
        lambda: (
            supabase.table("persona_question_answers")
            .select(
                "question_key, answer_value, normalized_value, skipped, "
                "source, confidence, needs_review, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row.get("question_key")
        if not key or key in latest:
            continue
        latest[key] = row
    return latest
