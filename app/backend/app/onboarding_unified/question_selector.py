"""Deterministic next-question selection for the unified engine.

Selection order (deterministic, no AI):

1. **Hard cap** — never present more than
   :data:`MAX_QUESTIONS_PER_SESSION` questions in a session.
2. **Intent gate** — a cold/discovery session with no intent yet always
   gets the fixed intent picker first.
3. **CTA contract** — a CTA session draws from verified
   ``recruitment_question_requirements`` in priority order.
4. **Persona bank** — otherwise draw from the existing
   ``persona_question_bank`` (already-answered + dismissed questions are
   dropped; sensitive questions are dropped in cold/discovery mode).
5. Nothing left → the session is complete.

Already-answered and already-asked questions are never re-presented.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from app.onboarding_unified import MAX_QUESTIONS_PER_SESSION
from app.onboarding_unified.entry_resolver import (
    INTENT_PICKER_QUESTION,
    load_field_registry,
    load_verified_recruitment_questions,
)
from app.onboarding_unified.session import answered_keys, load_answer_log
from app.persona.snapshots import get_latest_persona_snapshot
from app.persona_questions.bank import list_active_questions, shape_question_for_api

logger = logging.getLogger("career_copilot.onboarding_unified.question_selector")

_UNKNOWN_DIMENSION_VALUES = {None, "", "unknown", "insufficient_data"}

# Field/question markers that make a question "sensitive". Sensitive
# questions are NEVER asked in generic cold/discovery onboarding; they may
# only surface in an explicit CTA eligibility contract.
SENSITIVE_MARKERS = (
    "caste",
    "reservation",
    "income",
    "ews",
    "disability",
    "pwbd",
    "serviceman",
    "ex_service",
    "family_situation",
    "religion",
)


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("question_selector supabase call failed: %s", exc)
        return default


def is_sensitive_question(question: dict[str, Any]) -> bool:
    """True when a question touches a sensitive identity/reservation field."""
    haystack = " ".join(
        str(question.get(k) or "").lower()
        for k in (
            "question_key",
            "field_key",
            "target_dimension",
            "target_profile_group",
            "profile_group",
            "requirement_type",
        )
    )
    return any(marker in haystack for marker in SENSITIVE_MARKERS)


def _persona_answered_keys(supabase: Any, user_id: str | None) -> set[str]:
    """Non-skipped persona answers already on record for an auth'd user."""
    if not user_id:
        return set()
    rows = _safe(
        lambda: (
            supabase.table("persona_question_answers")
            .select("question_key, skipped, created_at")
            .eq("user_id", user_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {
        r.get("question_key")
        for r in rows
        if r.get("question_key") and not r.get("skipped")
    }


def _active_dismissals(supabase: Any, user_id: str | None) -> set[str]:
    """Persona questions an auth'd user has dismissed ("not now")."""
    if not user_id:
        return set()
    rows = _safe(
        lambda: (
            supabase.table("persona_question_dismissals")
            .select("question_key, dismissed_until")
            .eq("user_id", user_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    now = datetime.now(timezone.utc)
    dismissed: set[str] = set()
    for row in rows:
        key = row.get("question_key")
        if not key:
            continue
        until = row.get("dismissed_until")
        if not until:
            dismissed.add(key)
            continue
        try:
            parsed = (
                datetime.fromisoformat(until.replace("Z", "+00:00"))
                if isinstance(until, str)
                else until
            )
            if parsed > now:
                dismissed.add(key)
        except Exception:  # noqa: BLE001
            dismissed.add(key)
    return dismissed


def _unknown_dimensions(snapshot: dict[str, Any] | None) -> set[str]:
    if not snapshot:
        return set()
    dims = snapshot.get("dimensions") or {}
    return {k for k, v in dims.items() if v in _UNKNOWN_DIMENSION_VALUES}


def _reason_for(question: dict[str, Any], source: str) -> str:
    """One-line 'why we ask' — prefer registered help_text, else a safe fallback."""
    help_text = question.get("help_text")
    if help_text:
        return help_text
    if source == "intent_picker":
        return "This sets your starting point so we ask only what's useful."
    if source == "recruitment_question_requirements":
        return "Used by the deterministic eligibility check for this recruitment."
    return "Helps tailor your study plan — your answer is never shown as a label."


def select_next_question(
    supabase: Any, session: dict[str, Any]
) -> dict[str, Any] | None:
    """Return the next question dict, or ``None`` when the session is done.

    The returned dict carries ``question`` (API-shaped), ``source`` and
    ``reason``. ``None`` means: cap reached or nothing left to ask.
    """
    if not session:
        return None

    question_count = int(session.get("question_count") or 0)
    if question_count >= MAX_QUESTIONS_PER_SESSION:
        return None

    answer_log = load_answer_log(supabase, session.get("id"))
    answered = answered_keys(answer_log)
    asked = {str(k) for k in (session.get("asked_question_keys") or [])}
    seen = answered | asked
    entry_mode = session.get("entry_mode") or "cold"
    user_id = session.get("user_id")
    if user_id:
        snapshot = _safe(lambda: get_latest_persona_snapshot(supabase, user_id), default=None)
    else:
        logger.debug("question_selector: anonymous session, skipping persona snapshot lookup")
        snapshot = None
    unknown_dims = _unknown_dimensions(snapshot)

    # 1. Intent gate — cold/discovery sessions open with the intent picker.
    if not session.get("intent"):
        if INTENT_PICKER_QUESTION["question_key"] not in seen:
            return {
                "question": _shape_intent_picker(),
                "source": "intent_picker",
                "reason": _reason_for(INTENT_PICKER_QUESTION, "intent_picker"),
            }

    # 2. CTA contract — verified recruitment requirements, priority order.
    if entry_mode == "cta" and session.get("recruitment_id"):
        registry = load_field_registry(supabase)
        recruitment_questions = load_verified_recruitment_questions(
            supabase,
            session.get("recruitment_id"),
            session.get("post_id"),
            registry,
        )
        for question in recruitment_questions:
            key = question.get("question_key")
            if not key or key in seen:
                continue
            return {
                "question": _shape_recruitment_question(question),
                "source": "recruitment_question_requirements",
                "reason": _reason_for(question, "recruitment_question_requirements"),
            }

    # 3. Persona bank — the existing progressive question infrastructure.
    persona_blocked = (
        _persona_answered_keys(supabase, user_id)
        | _active_dismissals(supabase, user_id)
    )
    cold_mode = entry_mode in ("cold", "discovery")
    candidates: list[dict[str, Any]] = []
    for question in list_active_questions(supabase):
        key = question.get("question_key")
        if not key or key in seen or key in persona_blocked:
            continue
        if cold_mode and is_sensitive_question(question):
            # Non-negotiable: sensitive fields never appear in cold onboarding.
            continue
        candidates.append(question)

    if candidates:
        candidates.sort(
            key=lambda q: (
                0 if (q.get("target_dimension") in unknown_dims) else 1,
                int(q.get("priority") or 100),
                q.get("question_key") or "",
            )
        )
        chosen = candidates[0]
        return {
            "question": shape_question_for_api(chosen),
            "source": "persona_question_bank",
            "reason": _reason_for(chosen, "persona_question_bank"),
        }

    # 4. Nothing left.
    return None


def _shape_intent_picker() -> dict[str, Any]:
    return {
        "question_key": INTENT_PICKER_QUESTION["question_key"],
        "question_text": INTENT_PICKER_QUESTION["question_text"],
        "help_text": INTENT_PICKER_QUESTION["help_text"],
        "data_type": INTENT_PICKER_QUESTION["data_type"],
        "options": list(INTENT_PICKER_QUESTION["options"]),
        "target_dimension": None,
    }


def _shape_recruitment_question(question: dict[str, Any]) -> dict[str, Any]:
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
        "field_key": question.get("field_key"),
        "question_text": question.get("question_text"),
        "help_text": question.get("help_text"),
        "data_type": question.get("data_type"),
        "options": options,
        "is_knockout": bool(question.get("is_knockout")),
        "required_for": question.get("required_for"),
    }


def build_progress(
    session: dict[str, Any],
    answer_log: list[dict[str, Any]],
    has_next: bool,
) -> dict[str, Any]:
    """Session progress for the '3 of 7' UI."""
    asked = int(session.get("question_count") or 0)
    answered = len(answered_keys(answer_log))
    total = MAX_QUESTIONS_PER_SESSION
    position = min(asked + 1, total) if has_next else min(asked, total)
    return {
        "position": position,
        "total": total,
        "asked": asked,
        "answered": answered,
        "remaining": max(0, total - asked),
        "complete": not has_next,
    }


# Capability buckets for the local readiness placeholder. These are
# profile-readiness signals, NOT eligibility match counts — the frontend
# must label them accordingly and never claim "matches X exams".
_READINESS_TARGETS = {
    "eligibility": 5,
    "study_os": 5,
    "document": 4,
    "community": 3,
}


def build_readiness(
    session: dict[str, Any], answer_log: list[dict[str, Any]]
) -> dict[str, Any]:
    """Local, deterministic profile-readiness placeholder per capability.

    This is computed purely from answered fields — it is NOT a deterministic
    eligibility verdict and must never be presented as a match count.
    """
    intent = session.get("intent")
    answered = [r for r in answer_log if not r.get("skipped")]
    persona_count = sum(
        1 for r in answered if r.get("question_source") == "persona_question_bank"
    )
    recruitment_count = sum(
        1
        for r in answered
        if r.get("question_source") == "recruitment_question_requirements"
    )
    has_intent = 1 if intent else 0

    signals = {
        "eligibility": recruitment_count
        + (1 if intent == "check_eligibility" else 0),
        "study_os": persona_count + (1 if intent == "prepare_exam" else 0),
        "document": recruitment_count + (1 if intent == "track_deadlines" else 0),
        "community": has_intent + (1 if intent == "join_study_group" else 0),
    }

    capabilities = {
        key: min(100, round((signals[key] / target) * 100))
        for key, target in _READINESS_TARGETS.items()
    }
    return {
        "kind": "profile_readiness",
        "capabilities": capabilities,
        "note": "Profile readiness — not an eligibility verdict or match count.",
    }
