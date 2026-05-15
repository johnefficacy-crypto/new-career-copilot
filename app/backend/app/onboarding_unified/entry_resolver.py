"""Entry resolution for the unified onboarding engine.

Two entry modes resolve here:

* **CTA** — a ``recruitment_slug`` (optionally ``post_slug``) is present.
  We resolve the recruitment/post and load ONLY verified
  ``recruitment_question_requirements``. If no verified contract exists we
  return a safe fallback (``recruitment_contract_pending``) instead of
  inventing questions — unverified/generated questions are never exposed.
* **Cold / discovery** — no recruitment context. If the intent is unknown
  the engine opens with the fixed intent picker; once intent is known it
  continues with the existing ``persona_question_bank``.

This module never decides eligibility and never writes profile data.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable

logger = logging.getLogger("career_copilot.onboarding_unified.entry_resolver")

# Canonical cold-path intents — these are the only values the intent
# picker can produce. CTA intents are normalised but not constrained to
# this set (a blog CTA may carry e.g. ``documents_required``).
COLD_INTENTS = (
    "check_eligibility",
    "prepare_exam",
    "track_deadlines",
    "join_study_group",
    "guide_me",
)

# Common CTA slug spellings → canonical intent.
_INTENT_ALIASES = {
    "find_jobs": "check_eligibility",
    "find_eligible_jobs": "check_eligibility",
    "eligibility": "check_eligibility",
    "check_eligibility": "check_eligibility",
    "documents": "track_deadlines",
    "documents_required": "track_deadlines",
    "deadlines": "track_deadlines",
    "track_deadlines": "track_deadlines",
    "study_group": "join_study_group",
    "join_study_group": "join_study_group",
    "study_plan": "prepare_exam",
    "start_study_plan": "prepare_exam",
    "prepare_exam": "prepare_exam",
    "guide_me": "guide_me",
}

# The fixed cold-path opener. Shaped exactly like a persona question so the
# frontend can render it through the same question card.
INTENT_PICKER_KEY = "session_intent"

INTENT_PICKER_QUESTION: dict[str, Any] = {
    "question_key": INTENT_PICKER_KEY,
    "question_source": "intent_picker",
    "question_text": "What brought you here today?",
    "help_text": "This sets your starting point. You can change direction anytime.",
    "data_type": "single_select",
    "options": [
        {"value": "check_eligibility", "label": "Find jobs I'm eligible for"},
        {"value": "prepare_exam", "label": "Prepare for an exam"},
        {"value": "track_deadlines", "label": "Track deadlines/documents"},
        {"value": "join_study_group", "label": "Join a study group"},
        {"value": "guide_me", "label": "I'm confused — guide me"},
    ],
    "target_dimension": None,
    "is_active": True,
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("entry_resolver supabase call failed: %s", exc)
        return default


def normalize_intent(raw: str | None) -> str | None:
    """Lower-case, underscore-normalise and alias-map an intent string."""
    if not raw or not isinstance(raw, str):
        return None
    key = raw.strip().lower().replace("-", "_").replace(" ", "_")
    if not key:
        return None
    return _INTENT_ALIASES.get(key, key)


def slugify(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def resolve_recruitment(supabase: Any, slug: str | None) -> dict[str, Any] | None:
    if not slug:
        return None
    rows = _safe(
        lambda: (
            supabase.table("recruitments")
            .select("id, slug, name, publish_status, status")
            .eq("slug", slug)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def resolve_post(
    supabase: Any, recruitment_id: str | None, post_slug: str | None
) -> dict[str, Any] | None:
    """Resolve a post within a recruitment.

    ``posts`` has no slug column, so we match ``post_code`` or a slugified
    ``post_name`` in Python — best effort, never raises.
    """
    if not recruitment_id or not post_slug:
        return None
    rows = _safe(
        lambda: (
            supabase.table("posts")
            .select("id, post_name, post_code, recruitment_id")
            .eq("recruitment_id", recruitment_id)
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []
    target = post_slug.strip().lower()
    for row in rows:
        if (row.get("post_code") or "").strip().lower() == target:
            return row
        if slugify(row.get("post_name")) == target:
            return row
    return None


def load_field_registry(supabase: Any) -> dict[str, dict[str, Any]]:
    """Return a ``{field_key: registry_row}`` map for candidate fields."""
    rows = _safe(
        lambda: (
            supabase.table("candidate_field_registry")
            .select(
                "field_key, canonical_label, user_facing_label, data_type, "
                "profile_group, profile_table, profile_column, "
                "question_template, help_text, allowed_values, is_active"
            )
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {r["field_key"]: r for r in rows if r.get("field_key")}


def load_verified_recruitment_questions(
    supabase: Any,
    recruitment_id: str,
    post_id: str | None,
    registry: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Load ONLY ``reviewer_status='verified'`` requirement rows.

    Recruitment-level rows (``post_id is null``) apply to every post; if a
    ``post_id`` is given, post-specific rows are merged in. Unverified or
    rejected rows are never returned.
    """
    if not recruitment_id:
        return []
    if registry is None:
        registry = load_field_registry(supabase)

    rows = _safe(
        lambda: (
            supabase.table("recruitment_question_requirements")
            .select(
                "id, recruitment_id, post_id, field_key, requirement_type, "
                "required_for, priority, question_text, help_text, options, "
                "rule_operator, rule_value, applies_when, is_knockout, "
                "reviewer_status"
            )
            .eq("recruitment_id", recruitment_id)
            .eq("reviewer_status", "verified")
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []

    questions: list[dict[str, Any]] = []
    for row in rows:
        if row.get("reviewer_status") != "verified":
            continue
        row_post = row.get("post_id")
        # Recruitment-level rows always apply; post-level rows only when the
        # post matches the resolved post.
        if row_post and post_id and row_post != post_id:
            continue
        if row_post and not post_id:
            continue
        field_key = row.get("field_key")
        reg = registry.get(field_key, {}) if field_key else {}
        questions.append(
            {
                "question_key": field_key,
                "field_key": field_key,
                "question_source": "recruitment_question_requirements",
                "question_text": row.get("question_text")
                or reg.get("question_template")
                or "",
                "help_text": row.get("help_text") or reg.get("help_text"),
                "data_type": reg.get("data_type") or "single_select",
                "options": row.get("options") or reg.get("allowed_values") or [],
                "priority": row.get("priority") if row.get("priority") is not None else 100,
                "requirement_type": row.get("requirement_type"),
                "required_for": row.get("required_for") or "eligibility",
                "is_knockout": bool(row.get("is_knockout")),
                "is_active": True,
            }
        )
    questions.sort(key=lambda q: (int(q.get("priority") or 100), q.get("question_key") or ""))
    return questions


def resolve_entry(
    supabase: Any,
    *,
    mode: str | None = None,
    intent: str | None = None,
    recruitment_slug: str | None = None,
    post_slug: str | None = None,
) -> dict[str, Any]:
    """Resolve the entry context for a unified onboarding session.

    Returns a dict with: ``entry_mode``, ``intent``, ``recruitment``,
    ``post``, ``recruitment_questions``, ``fallback`` and an optional
    ``message``. It does NOT create a session — :mod:`session` does that.
    """
    normalized_intent = normalize_intent(intent)
    registry = load_field_registry(supabase)

    # ── CTA path: a recruitment slug is present ──────────────────────────
    if recruitment_slug:
        recruitment = resolve_recruitment(supabase, recruitment_slug)
        if not recruitment:
            return {
                "entry_mode": "cta",
                "intent": normalized_intent or "check_eligibility",
                "recruitment": None,
                "post": None,
                "recruitment_questions": [],
                "fallback": True,
                "fallback_reason": "recruitment_not_found",
                "message": (
                    "We couldn't find that recruitment yet. You can still "
                    "build your eligibility profile with a few quick questions."
                ),
            }

        post = resolve_post(supabase, recruitment.get("id"), post_slug)
        questions = load_verified_recruitment_questions(
            supabase, recruitment.get("id"), post.get("id") if post else None, registry
        )

        if not questions:
            # Verified contract missing — fall back safely, never invent
            # replacement eligibility questions.
            return {
                "entry_mode": "cta",
                "intent": normalized_intent or "check_eligibility",
                "recruitment": _shape_recruitment(recruitment),
                "post": _shape_post(post),
                "recruitment_questions": [],
                "fallback": True,
                "fallback_reason": "recruitment_contract_pending",
                "message": (
                    "This recruitment-specific check isn't ready yet. We can "
                    "still set up your eligibility profile so you're ready "
                    "the moment it goes live."
                ),
            }

        return {
            "entry_mode": "cta",
            "intent": normalized_intent or "check_eligibility",
            "recruitment": _shape_recruitment(recruitment),
            "post": _shape_post(post),
            "recruitment_questions": questions,
            "fallback": False,
            "message": None,
        }

    # ── Cold / discovery path ────────────────────────────────────────────
    entry_mode = "discovery" if (mode or "").strip().lower() == "discovery" else "cold"
    cold_intent = normalized_intent if normalized_intent in COLD_INTENTS else None
    return {
        "entry_mode": entry_mode,
        "intent": cold_intent,
        "recruitment": None,
        "post": None,
        "recruitment_questions": [],
        "fallback": False,
        "message": None,
    }


def _shape_recruitment(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": row.get("id"),
        "slug": row.get("slug"),
        "title": row.get("name"),
    }


def _shape_post(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": row.get("id"),
        "code": row.get("post_code"),
        "name": row.get("post_name"),
    }
