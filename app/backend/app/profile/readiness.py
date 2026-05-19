"""Feature-unlock readiness — the honest replacement for a single "% ready".

The old ``/api/profile/completion`` panel summed disparate field groups
into a single vanity percentage. None of the displayed gauges mapped to
a real user-facing capability, so a high number meant nothing and a low
number caused panic.

This module returns one card per *capability*: "can I see exam
eligibility?", "can I auto-fill an application?". Each card lists the
specific missing fields so the UI can pop a focused mini-form to
collect them via :mod:`app.profile.onboarding` rather than throwing the
user back into full onboarding.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.profile.readiness")

router = APIRouter(prefix="/profile", tags=["profile-readiness"])


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("readiness supabase call failed: %s", exc)
        return default


def _is_present(value: Any) -> bool:
    """A field counts as "filled" when it carries information.

    None, empty string, empty list and empty dict all read as missing.
    Numeric zero is treated as a real answer — a user who declares "0
    weekly hours" has answered the question, even if the planner won't
    love them for it.
    """
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, (list, dict)) and not value:
        return False
    return True


@dataclass(frozen=True)
class _Feature:
    key: str
    label: str
    required_fields: tuple[str, ...]


_FEATURES: tuple[_Feature, ...] = (
    _Feature(
        key="exam_eligibility",
        label="See eligibility for any exam",
        required_fields=("date_of_birth", "category", "domicile_state"),
    ),
    _Feature(
        key="study_community",
        label="Join study communities",
        required_fields=("target_exam", "study_mode"),
    ),
    _Feature(
        key="auto_fill_applications",
        label="Auto-fill applications",
        required_fields=(
            "full_name",
            "phone",
            "photo_doc",
            "signature_doc",
            "category_certificate",
        ),
    ),
    _Feature(
        key="personalized_strategy",
        label="Personalized strategy",
        required_fields=("weekly_hours_goal", "study_mode"),
    ),
)


# Where each required field actually lives. The evaluator looks values
# up here so we don't drift if a field moves tables.
_FIELD_SOURCES: dict[str, tuple[str, str]] = {
    "full_name": ("profile", "full_name"),
    "phone": ("profile", "phone"),
    "date_of_birth": ("profile", "date_of_birth"),
    "category": ("reservations", "category"),
    "domicile_state": ("location", "state"),
    "target_exam": ("preferences", "target_exams"),
    "study_mode": ("preferences", "study_mode"),
    # weekly_hours_goal lives on aspirant_preferences.study_hours_per_day;
    # derived into profile dict by readiness loader. see canonical.py.
    "weekly_hours_goal": ("profile", "weekly_hours_goal"),
    # Document uploads haven't shipped yet, and `aspirant_documents`
    # doesn't exist as a table. Mapping these to the empty "documents"
    # source means they always read as missing — exactly what we want
    # until the upload pipeline lands — without firing a noisy warning
    # for a table we know isn't there.
    "photo_doc": ("documents", "photo_doc"),
    "signature_doc": ("documents", "signature_doc"),
    "category_certificate": ("documents", "category_certificate"),
}


def _load_sources(supabase: Any, user_id: str) -> dict[str, dict[str, Any]]:
    """One query per backing table. None of these are hot loops."""
    profile = (
        _safe(
            lambda: (
                supabase.table("profiles")
                .select(
                    "id, full_name, phone, date_of_birth, "
                    "target_exam, persona_seed, onboarding_completed, "
                    "onboarding_step, is_anonymous"
                )
                .eq("id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or [{}]
    )[0]
    preferences = (
        _safe(
            lambda: (
                supabase.table("aspirant_preferences")
                .select("user_id, target_exams, study_mode, study_hours_per_day")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or [{}]
    )[0]
    # weekly_hours_goal lives on aspirant_preferences.study_hours_per_day;
    # derive into profile dict so the existing ("profile",
    # "weekly_hours_goal") source mapping keeps working without a new
    # source category. Match canonical.py: int(round(x * 7)). Leave the
    # key absent on missing/bad values so completeness reads as missing.
    if preferences.get("study_hours_per_day") is not None:
        try:
            profile["weekly_hours_goal"] = int(round(float(preferences["study_hours_per_day"]) * 7))
        except (TypeError, ValueError):
            pass
    location = (
        _safe(
            lambda: (
                supabase.table("aspirant_location")
                .select("user_id, state, district")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or [{}]
    )[0]
    reservations = (
        _safe(
            lambda: (
                supabase.table("aspirant_reservations")
                .select("user_id, category, sub_category")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or [{}]
    )[0]
    # `aspirant_documents` doesn't exist yet (upload pipeline not shipped),
    # so we don't query it. The empty dict keeps the source-lookup logic
    # consistent: every document field reads as missing, as intended.
    return {
        "profile": profile,
        "preferences": preferences,
        "location": location,
        "reservations": reservations,
        "documents": {},
    }


def _missing_for(feature: _Feature, sources: dict[str, dict[str, Any]]) -> list[str]:
    missing: list[str] = []
    for field in feature.required_fields:
        source_key, column = _FIELD_SOURCES.get(field, (None, None))
        if source_key is None:
            missing.append(field)
            continue
        value = (sources.get(source_key) or {}).get(column)
        if not _is_present(value):
            missing.append(field)
    return missing


def build_readiness(sources: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for feature in _FEATURES:
        missing = _missing_for(feature, sources)
        cards.append(
            {
                "key": feature.key,
                "label": feature.label,
                "unlocked": not missing,
                "missing_fields": missing,
            }
        )
    return cards


@router.get("/readiness")
async def profile_readiness(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Return per-feature unlock cards for the dashboard.

    Output shape is stable: ``{"features": [{key, label, unlocked,
    missing_fields}, ...]}``. The frontend renders one card per item
    and pops an inline mini-form for the locked ones.
    """
    supabase = get_supabase_admin()
    sources = _load_sources(supabase, user["id"])
    return {"features": build_readiness(sources)}


__all__ = ["router", "build_readiness"]
