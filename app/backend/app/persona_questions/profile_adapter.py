"""Safe mapping of question answers to canonical profile/preference fields.

Most PR2 questions are NOT written back to canonical profile tables.
The persona classifier reads them directly from
``persona_question_answers``. Only a few questions have an obvious safe
mapping, and we apply those mappings defensively:

- Never overwrite a non-null/non-empty existing canonical value.
- Never write outside the explicit allowlist below.
- Never infer financial / category / family / location fields.

The allowlist is intentionally tiny in PR2; future PRs can extend it
once a canonical home is confirmed.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.persona_questions.profile_adapter")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("profile_adapter supabase call failed: %s", exc)
        return default


# Map: weekday answer -> (study_hours_per_day_low, study_hours_per_day_high)
# We use the mid-point of each band as the conservative estimate.
_WEEKDAY_HOURS = {
    "less_than_1_hour": 0.5,
    "1_to_2_hours": 1.5,
    "2_to_4_hours": 3.0,
    "4_plus_hours": 5.0,
}


def _read_preferences(supabase: Any, user_id: str) -> dict[str, Any]:
    rows = _safe(
        lambda: (
            supabase.table("aspirant_preferences")
            .select("user_id, study_hours_per_day, study_mode")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else {}


def _upsert_preferences(supabase: Any, user_id: str, patch: dict[str, Any]) -> None:
    if not patch:
        return
    payload = {"user_id": user_id, **patch}
    inserted = _safe(
        lambda: (
            supabase.table("aspirant_preferences")
            .upsert(payload, on_conflict="user_id")
            .execute()
            .data
        ),
        default=None,
    )
    if inserted is not None:
        return
    # Fallback: try insert; if it fails (conflict), update.
    fallback = _safe(
        lambda: (
            supabase.table("aspirant_preferences").insert(payload).execute().data
        ),
        default=None,
    )
    if fallback is None:
        _safe(
            lambda: (
                supabase.table("aspirant_preferences")
                .update(patch)
                .eq("user_id", user_id)
                .execute()
            )
        )


def apply_safe_profile_mapping(
    supabase: Any,
    user_id: str,
    question: dict[str, Any],
    normalized_value: Any,
) -> dict[str, Any]:
    """Apply the allowlisted safe mapping (if any) for this question.

    Returns a small dict describing what (if anything) was written so the
    caller can include it in events / responses. Failure here must never
    block the answer save — the answers row is the source of truth.
    """
    if not user_id or not question or normalized_value is None:
        return {"applied": False, "reason": "missing_input"}

    key = question.get("question_key")

    if key == "weekday_study_availability":
        hours = _WEEKDAY_HOURS.get(normalized_value)
        if hours is None:
            return {"applied": False, "reason": "unknown_band"}
        prefs = _read_preferences(supabase, user_id)
        existing = prefs.get("study_hours_per_day")
        # Only fill if the canonical field is empty.
        if existing not in (None, "", 0):
            return {
                "applied": False,
                "reason": "existing_value_preserved",
                "field": "aspirant_preferences.study_hours_per_day",
            }
        _upsert_preferences(supabase, user_id, {"study_hours_per_day": hours})
        return {
            "applied": True,
            "field": "aspirant_preferences.study_hours_per_day",
            "value": hours,
        }

    # All other questions stay answer-only in PR2. The classifier reads
    # them directly from persona_question_answers.
    return {"applied": False, "reason": "answer_only_in_pr2"}
