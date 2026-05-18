"""Unified Guided Onboarding API (Sprint 1).

Surface:
    GET  /api/onboarding-unified/resolve          - create/resume a session
    POST /api/onboarding-unified/answer           - validate + save an answer
    POST /api/onboarding-unified/skip             - skip the current question
    POST /api/onboarding-unified/stitch-anonymous - claim anon progress on login
    POST /api/onboarding-unified/complete         - close the session

One session engine, two entry modes (CTA funnel + cold discovery). The
backend always chooses the next valid question; the deterministic
eligibility engine — never this API, never AI — owns eligibility
verdicts. Answers are validated with deterministic allowlisted parsers
only; no free text is AI-parsed in this sprint.

resolve / answer / skip / complete accept anonymous callers (the
``anonymous_id`` is generated client-side and kept in localStorage).
Only ``stitch-anonymous`` requires authentication.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user, get_optional_user
from app.db.supabase_client import get_supabase_admin
from app.onboarding_unified.answer_validator import (
    AnswerValidationError,
    validate_answer,
)
from app.onboarding_unified.anonymous_stitching import stitch_anonymous_sessions
from app.onboarding_unified.entry_resolver import (
    COLD_INTENTS,
    load_field_registry,
    normalize_intent,
    resolve_entry,
)
from app.onboarding_unified.profile_adapter import apply_profile_mapping
from app.onboarding_unified.question_selector import (
    build_progress,
    build_readiness,
    select_next_question,
)
from app.onboarding_unified.session import (
    belongs_to_caller,
    get_or_create_session,
    load_answer_log,
    load_session,
    mark_session_completed,
    record_answer,
    set_current_question,
    update_session,
)
from app.persona_questions.answers import (
    save_question_answer as save_persona_answer,
    save_question_skip as save_persona_skip,
)
from app.persona_questions.events import emit_question_signal

logger = logging.getLogger("career_copilot.api.onboarding_unified")

router = APIRouter(prefix="/onboarding-unified", tags=["onboarding-unified"])

# Intent → recommended next action once the session completes.
_NEXT_ACTION_BY_INTENT = {
    "check_eligibility": "view_eligibility",
    "prepare_exam": "open_study_plan",
    "track_deadlines": "open_tracker",
    "join_study_group": "open_community",
    "guide_me": "open_dashboard",
}


class AnswerBody(BaseModel):
    session_id: str = Field(..., min_length=1)
    question_source: str = Field(..., min_length=1)
    question_key: str | None = Field(default=None)
    field_key: str | None = Field(default=None)
    answer_value: Any = None
    anonymous_id: str | None = Field(default=None, max_length=200)


class SkipBody(BaseModel):
    session_id: str = Field(..., min_length=1)
    question_source: str = Field(..., min_length=1)
    question_key: str | None = Field(default=None)
    field_key: str | None = Field(default=None)
    anonymous_id: str | None = Field(default=None, max_length=200)


class StitchBody(BaseModel):
    anonymous_id: str = Field(..., min_length=1, max_length=200)


class CompleteBody(BaseModel):
    session_id: str = Field(..., min_length=1)
    anonymous_id: str | None = Field(default=None, max_length=200)


def _user_id(user: dict | None) -> str | None:
    return user.get("id") if user else None


def _build_state(
    supabase: Any,
    session: dict[str, Any],
    *,
    entry: dict[str, Any] | None = None,
    persist_current: bool = True,
) -> dict[str, Any]:
    """Assemble the full session-state payload the frontend renders."""
    next_question = select_next_question(supabase, session)
    answer_log = load_answer_log(supabase, session.get("id"))
    has_next = next_question is not None

    if persist_current:
        if has_next:
            set_current_question(
                supabase,
                session.get("id"),
                next_question["question"].get("question_key"),
                next_question["source"],
            )
        else:
            set_current_question(supabase, session.get("id"), None, None)

    progress = build_progress(session, answer_log, has_next)
    readiness = build_readiness(session, answer_log)

    state: dict[str, Any] = {
        "session_id": session.get("id"),
        "entry_mode": session.get("entry_mode"),
        "intent": session.get("intent"),
        "anonymous_id": session.get("anonymous_id"),
        "status": "completed" if not has_next else session.get("status", "active"),
        "question": next_question["question"] if has_next else None,
        "question_source": next_question["source"] if has_next else None,
        "reason": next_question["reason"] if has_next else None,
        "progress": progress,
        "readiness": readiness,
        "complete": not has_next,
    }
    if entry:
        state["recruitment"] = entry.get("recruitment")
        state["post"] = entry.get("post")
        state["fallback"] = entry.get("fallback", False)
        state["fallback_reason"] = entry.get("fallback_reason")
        state["message"] = entry.get("message")
    else:
        state["recruitment"] = None
        state["post"] = None
        state["fallback"] = False
    return state


@router.get("/resolve")
async def resolve(
    mode: str | None = None,
    intent: str | None = None,
    recruitment_slug: str | None = None,
    post_slug: str | None = None,
    anonymous_id: str | None = None,
    user: dict | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Create or resume a unified onboarding session and return its state."""
    supabase = get_supabase_admin()
    user_id = _user_id(user)

    if not user_id and not anonymous_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="anonymous_id is required for unauthenticated callers",
        )

    entry = resolve_entry(
        supabase,
        mode=mode,
        intent=intent,
        recruitment_slug=recruitment_slug,
        post_slug=post_slug,
    )

    session = get_or_create_session(
        supabase,
        user_id=user_id,
        anonymous_id=anonymous_id,
        entry_mode=entry["entry_mode"],
        intent=entry.get("intent"),
        recruitment_id=(entry.get("recruitment") or {}).get("id"),
        post_id=(entry.get("post") or {}).get("id"),
        source="funnel_cta" if recruitment_slug else "cold_discovery",
    )

    return _build_state(supabase, session, entry=entry)


def _resolve_question_key(body: AnswerBody | SkipBody) -> str | None:
    return body.question_key or body.field_key


def _load_owned_session(
    supabase: Any,
    session_id: str,
    user: dict | None,
    anonymous_id: str | None,
) -> dict[str, Any]:
    session = load_session(supabase, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    if not belongs_to_caller(
        session, user_id=_user_id(user), anonymous_id=anonymous_id
    ):
        # A caller may not answer/skip a session they don't own.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session does not belong to the caller",
        )
    return session


@router.post("/answer")
async def answer(
    body: AnswerBody,
    user: dict | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Validate + persist an answer to the session's current question."""
    supabase = get_supabase_admin()
    session = _load_owned_session(
        supabase, body.session_id, user, body.anonymous_id
    )
    if session.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not active",
        )

    current = select_next_question(supabase, session)
    if current is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session has no current question (cap reached or complete)",
        )

    question_key = _resolve_question_key(body)
    current_key = current["question"].get("question_key")
    # Strict: the only answerable question is the session's current one.
    # This rejects unknown keys and answers to out-of-session questions.
    if question_key != current_key or body.question_source != current["source"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="question_key/question_source is not the current question",
        )

    try:
        normalized = validate_answer(current["question"], body.answer_value)
    except AnswerValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    record_answer(
        supabase,
        session,
        question_source=current["source"],
        question_key=current_key,
        answer_value=body.answer_value,
        normalized_value=normalized,
        skipped=False,
    )

    user_id = _user_id(user)

    if current["source"] == "intent_picker":
        # Intent lives on the session row only — never a canonical field.
        normalized_intent = normalize_intent(normalized) or normalized
        update_session(supabase, session["id"], {"intent": normalized_intent})
        session["intent"] = normalized_intent
    else:
        # Allowlisted canonical write (best effort, never blocks).
        registry = load_field_registry(supabase)
        apply_profile_mapping(
            supabase,
            user_id,
            question_source=current["source"],
            question=current["question"],
            normalized_value=normalized,
            registry=registry,
            session_id=session.get("id"),
        )

    # Authenticated answers also land in their canonical per-source log so
    # existing pipelines (persona classifier / recruitment-aware onboarding)
    # pick them up immediately. Anonymous answers are fanned out at stitch.
    if user_id and current["source"] == "persona_question_bank":
        save_persona_answer(
            supabase, user_id, current_key, body.answer_value, normalized
        )
        emit_question_signal(supabase, user_id, current_key, normalized)
    elif user_id and current["source"] == "recruitment_question_requirements":
        _save_onboarding_answer(
            supabase, session, user_id, current_key, body.answer_value, normalized
        )

    return _build_state(supabase, session)


def _save_onboarding_answer(
    supabase: Any,
    session: dict[str, Any],
    user_id: str,
    field_key: str,
    answer_value: Any,
    normalized_value: Any,
) -> None:
    try:
        supabase.table("onboarding_answers").insert(
            {
                "session_id": session.get("id"),
                "user_id": user_id,
                "field_key": field_key,
                "answer_value": answer_value,
                "normalized_value": normalized_value,
                "source": "unified_onboarding",
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("onboarding_answers insert failed: %s", exc)


@router.post("/skip")
async def skip(
    body: SkipBody,
    user: dict | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Skip the current question and advance the session."""
    supabase = get_supabase_admin()
    session = _load_owned_session(
        supabase, body.session_id, user, body.anonymous_id
    )
    if session.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Session is not active"
        )

    current = select_next_question(supabase, session)
    if current is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session has no current question to skip",
        )

    question_key = _resolve_question_key(body)
    current_key = current["question"].get("question_key")
    if question_key and question_key != current_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="question_key is not the current question",
        )

    record_answer(
        supabase,
        session,
        question_source=current["source"],
        question_key=current_key,
        answer_value=None,
        normalized_value=None,
        skipped=True,
    )

    # Respect the existing persona dismissal behaviour for persona questions.
    user_id = _user_id(user)
    if user_id and current["source"] == "persona_question_bank":
        save_persona_skip(supabase, user_id, current_key, dismissed_until_days=14)
        emit_question_signal(supabase, user_id, current_key, None, skipped=True)

    return _build_state(supabase, session)


@router.post("/stitch-anonymous")
async def stitch_anonymous(
    body: StitchBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Attach pre-login anonymous progress to the authenticated user."""
    supabase = get_supabase_admin()
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user has no id",
        )

    result = stitch_anonymous_sessions(supabase, body.anonymous_id, user_id)
    session = result.get("session")
    if session:
        result["state"] = _build_state(supabase, session)
    else:
        result["state"] = None
    return result


@router.post("/complete")
async def complete(
    body: CompleteBody,
    user: dict | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Close the session and return the recommended next action.

    Side-effect-idempotent: if the session is already ``completed``, the
    same JSON payload is returned and the eligibility recompute is NOT
    enqueued a second time. Deterministic eligibility recompute is
    enqueued (async, best-effort) only when the intent is eligibility AND
    the caller is authenticated — never before an authenticated
    completion, never in a blocking path.
    """
    supabase = get_supabase_admin()
    session = _load_owned_session(
        supabase, body.session_id, user, body.anonymous_id
    )

    intent = session.get("intent")
    next_action = _NEXT_ACTION_BY_INTENT.get(intent, "open_dashboard")
    user_id = _user_id(user)
    eligibility_eligible = intent == "check_eligibility" and bool(user_id)

    if session.get("status") != "completed":
        mark_session_completed(supabase, session["id"])
        if eligibility_eligible:
            _enqueue_eligibility_recompute(supabase, user_id)

    return {
        "completed": True,
        "session_id": session["id"],
        "intent": intent,
        "next_action": next_action,
        "recompute_enqueued": eligibility_eligible,
        "authenticated": bool(user_id),
    }


def _enqueue_eligibility_recompute(supabase: Any, user_id: str) -> bool:
    """Best-effort async enqueue — never blocks or raises into the request."""
    try:
        from app.eligibility.recompute_queue import enqueue_eligibility_recompute

        enqueue_eligibility_recompute(
            supabase, user_id, reason="unified_onboarding_complete"
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("eligibility recompute enqueue failed: %s", exc)
        return False


# Exposed for tests / callers that want the cold-path intent vocabulary.
__all__ = ["router", "COLD_INTENTS"]
