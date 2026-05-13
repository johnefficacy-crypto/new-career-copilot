"""Progressive Tiny Questions API (PR2).

Surface:
    GET  /api/persona/questions/next        - next best question for the caller
    POST /api/persona/questions/answer      - validate + save + signal/recompute
    POST /api/persona/questions/skip        - dismiss for N days
    GET  /api/persona/questions/history     - compact recent answer/skip history

Persona is internal. The /next endpoint returns a single tiny question
and a short, plain-language reason — never an internal persona label.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.persona_questions.answers import (
    AnswerValidationError,
    save_question_answer,
    save_question_skip,
    validate_answer,
)
from app.persona_questions.bank import get_question
from app.persona_questions.events import emit_question_signal
from app.persona_questions.profile_adapter import apply_safe_profile_mapping
from app.persona_questions.selector import select_next_question

logger = logging.getLogger("career_copilot.api.persona_questions")

router = APIRouter(prefix="/persona/questions", tags=["persona-questions"])


class AnswerBody(BaseModel):
    question_key: str = Field(..., min_length=1, max_length=120)
    answer_value: Any = None


class SkipBody(BaseModel):
    question_key: str = Field(..., min_length=1, max_length=120)
    dismissed_until_days: int | None = Field(default=14, ge=0, le=365)
    reason: str | None = Field(default=None, max_length=200)


def _require_user_id(user: dict) -> str:
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user has no id",
        )
    return user_id


@router.get("/next")
async def get_next_question(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = _require_user_id(user)
    supabase = get_supabase_admin()
    try:
        return select_next_question(supabase, user_id)
    except Exception as exc:  # noqa: BLE001
        # Tiny questions must never block the app. Return "nothing now"
        # instead of a 5xx if anything goes wrong.
        logger.warning("persona_questions.next failed for %s: %s", user_id, exc)
        return {
            "question": None,
            "reason": "No progressive question available right now",
            "persona_context": {"unknown_dimensions": [], "confidence": None},
        }


@router.post("/answer")
async def post_answer(
    body: AnswerBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = _require_user_id(user)
    supabase = get_supabase_admin()

    question = get_question(supabase, body.question_key)
    if not question or question.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown or inactive question_key",
        )

    try:
        normalized = validate_answer(question, body.answer_value)
    except AnswerValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    save_question_answer(
        supabase,
        user_id,
        body.question_key,
        body.answer_value,
        normalized,
    )

    # Best-effort canonical mapping (allowlisted, never overwrites).
    profile_mapping = apply_safe_profile_mapping(
        supabase, user_id, question, normalized
    )

    # Best-effort signal + recompute. Failures must not bubble up.
    event = emit_question_signal(supabase, user_id, body.question_key, normalized)

    next_question = None
    try:
        next_payload = select_next_question(supabase, user_id)
        next_question = next_payload.get("question")
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona_questions.next-after-answer failed: %s", exc)

    return {
        "saved": True,
        "persona_recompute": event.get("recompute"),
        "profile_mapping": profile_mapping,
        "next_question": next_question,
    }


@router.post("/skip")
async def post_skip(
    body: SkipBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = _require_user_id(user)
    supabase = get_supabase_admin()

    question = get_question(supabase, body.question_key)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown question_key",
        )

    result = save_question_skip(
        supabase,
        user_id,
        body.question_key,
        dismissed_until_days=body.dismissed_until_days,
        reason=body.reason,
    )
    # Log the skip as a signal event for analytics (no recompute).
    emit_question_signal(
        supabase, user_id, body.question_key, None, skipped=True
    )
    return {"skipped": True, "dismissed_until": result.get("dismissed_until")}


@router.get("/history")
async def get_history(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = _require_user_id(user)
    supabase = get_supabase_admin()
    try:
        rows = (
            supabase.table("persona_question_answers")
            .select(
                "question_key, normalized_value, answer_value, skipped, "
                "source, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona_questions.history failed for %s: %s", user_id, exc)
        rows = []

    return {
        "history": [
            {
                "question_key": r.get("question_key"),
                "normalized_value": r.get("normalized_value"),
                "skipped": bool(r.get("skipped")),
                "source": r.get("source"),
                "created_at": r.get("created_at"),
            }
            for r in rows
        ]
    }
