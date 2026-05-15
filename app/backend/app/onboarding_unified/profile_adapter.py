"""Allowlisted canonical profile writes for the unified engine.

``onboarding_session_answers`` is a log, not truth. Canonical profile
data is only ever written here, and only through a tiny allowlist:

* ``persona_question_bank`` answers reuse the existing PR2 adapter
  (:func:`app.persona_questions.profile_adapter.apply_safe_profile_mapping`).
* ``recruitment_question_requirements`` answers write a small allowlist of
  non-sensitive canonical fields, and never overwrite an existing value.
* ``intent_picker`` answers are never canonical — intent lives on the
  session row only.

Rules enforced here:
  * Anonymous callers (no ``user_id``) get no canonical write at all.
  * Sensitive fields (reservation/category/income/EWS/disability/PwBD/
    ex-serviceman/...) are never written by this adapter.
  * Existing non-empty canonical values are preserved.
  * A failure here never blocks the answer save.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from app.onboarding_unified.question_selector import SENSITIVE_MARKERS
from app.persona_questions.profile_adapter import apply_safe_profile_mapping

logger = logging.getLogger("career_copilot.onboarding_unified.profile_adapter")

# Recruitment field_keys we are willing to promote to canonical profile
# tables in this sprint. Intentionally tiny and non-sensitive.
_RECRUITMENT_FIELD_ALLOWLIST: dict[str, tuple[str, str]] = {
    "date_of_birth": ("profiles", "date_of_birth"),
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("onboarding_unified.profile_adapter call failed: %s", exc)
        return default


def _field_is_sensitive(field_key: str | None, registry_row: dict[str, Any] | None) -> bool:
    haystack = " ".join(
        str(v or "").lower()
        for v in (
            field_key,
            (registry_row or {}).get("profile_group"),
            (registry_row or {}).get("canonical_label"),
        )
    )
    return any(marker in haystack for marker in SENSITIVE_MARKERS)


def _write_profile_field(
    supabase: Any, user_id: str, table: str, column: str, value: Any
) -> dict[str, Any]:
    existing_rows = _safe(
        lambda: (
            supabase.table(table)
            .select(f"id, {column}")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    existing = existing_rows[0].get(column) if existing_rows else None
    if existing not in (None, "", []):
        return {
            "applied": False,
            "reason": "existing_value_preserved",
            "field": f"{table}.{column}",
        }
    updated = _safe(
        lambda: (
            supabase.table(table)
            .update({column: value})
            .eq("id", user_id)
            .execute()
            .data
        ),
        default=None,
    )
    if updated is None:
        return {"applied": False, "reason": "write_failed", "field": f"{table}.{column}"}
    return {"applied": True, "field": f"{table}.{column}", "value": value}


def apply_profile_mapping(
    supabase: Any,
    user_id: str | None,
    *,
    question_source: str,
    question: dict[str, Any],
    normalized_value: Any,
    registry: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Apply the allowlisted canonical write (if any) for one answer."""
    if not user_id:
        return {"applied": False, "reason": "anonymous_no_canonical_write"}
    if normalized_value is None:
        return {"applied": False, "reason": "missing_value"}

    if question_source == "intent_picker":
        return {"applied": False, "reason": "intent_is_session_only"}

    if question_source == "persona_question_bank":
        # Reuse the existing PR2 allowlisted adapter unchanged.
        return apply_safe_profile_mapping(supabase, user_id, question, normalized_value)

    if question_source == "recruitment_question_requirements":
        field_key = question.get("field_key") or question.get("question_key")
        registry_row = (registry or {}).get(field_key) if field_key else None
        if _field_is_sensitive(field_key, registry_row):
            return {"applied": False, "reason": "sensitive_field_not_written"}
        mapping = _RECRUITMENT_FIELD_ALLOWLIST.get(field_key)
        if not mapping:
            return {"applied": False, "reason": "not_in_allowlist"}
        table, column = mapping
        return _write_profile_field(supabase, user_id, table, column, normalized_value)

    return {"applied": False, "reason": "unknown_source"}
