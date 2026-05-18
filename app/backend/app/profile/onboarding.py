"""Unified onboarding-answer surface backed by ``profiles``.

The legacy ``onboarding_sessions`` engine (resolve/answer/skip/complete
+ stitch-anonymous) was anchored on an opaque ``anonymous_id`` that the
frontend had to ferry through every call. With Supabase anonymous auth
the user *always* has a real ``profiles.id`` from the first click, so
all we need on the server is a single endpoint that:

* validates the answer against the persona-question bank,
* writes the canonical value into the question's target column,
* records the answer (or the skip) in ``profiles.persona_seed`` so we
  can recompute personas later and skip questions on re-render, and
* advances ``profiles.onboarding_step`` / flips
  ``profiles.onboarding_completed`` when nothing's left to ask.

The endpoint is idempotent on the question_key: re-submitting an
already-answered question is a no-op overwrite + returns the next
question. The previous ``409 question_key/question_source is not the
current question`` behaviour was the root cause of the resolve-loop
bug, and is removed deliberately.

Anonymous users go through the same path as permanent users — the
``is_anonymous`` flag only matters for downstream gating.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
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
from app.persona_questions.bank import list_active_questions
from app.persona_questions.events import emit_question_signal
from app.persona.queue import enqueue_persona_recompute

logger = logging.getLogger("career_copilot.profile.onboarding")

router = APIRouter(prefix="/profile", tags=["profile-onboarding"])

# Tables we'll write per-user rows into when a bank row maps to them.
# Key is ``profile_table`` from the bank; value is the unique key column.
_PROFILE_SCOPED_TABLES: dict[str, str] = {
    "profiles": "id",
    "aspirant_preferences": "user_id",
    "aspirant_location": "user_id",
    "aspirant_reservations": "user_id",
}


class OnboardingAnswerBody(BaseModel):
    question_key: str = Field(..., min_length=1, max_length=200)
    value: Any = None
    skipped: bool = False


class OnboardingSkipAllBody(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_profile(supabase: Any, user_id: str) -> dict[str, Any]:
    rows = (
        supabase.table("profiles")
        .select(
            "id, email, full_name, onboarding_completed, onboarding_step, "
            "persona_seed, is_anonymous"
        )
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]
    # Bootstrap a row the same way `_ensure_profile_row` does — the
    # caller is authenticated, so we know the id is valid.
    supabase.table("profiles").insert({"id": user_id}).execute()
    rows = (
        supabase.table("profiles")
        .select(
            "id, email, full_name, onboarding_completed, onboarding_step, "
            "persona_seed, is_anonymous"
        )
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {"id": user_id}


def _persona_seed_keys(seed: Any) -> set[str]:
    """Return the question_keys the user has either answered or skipped."""
    if not isinstance(seed, dict):
        return set()
    return {k for k in seed.keys() if isinstance(k, str)}


def _question_by_key(
    bank: list[dict[str, Any]], question_key: str
) -> dict[str, Any] | None:
    for q in bank:
        if q.get("question_key") == question_key:
            return q
    return None


def _next_question(
    bank: list[dict[str, Any]],
    seed: dict[str, Any],
) -> dict[str, Any] | None:
    """Pick the first un-touched active question by priority.

    Trigger / applies_when evaluation is intentionally minimal here: the
    bank's primary filtering vector is ``priority`` + answered set. The
    legacy selector inspected the persona snapshot for unknown
    dimensions, but at onboarding time the snapshot is empty/absent and
    every dimension is unknown — so the ordering collapses to priority,
    which is what we want.
    """
    touched = _persona_seed_keys(seed)
    candidates = [
        q
        for q in bank
        if q.get("question_key") and q.get("question_key") not in touched
    ]
    if not candidates:
        return None
    candidates.sort(
        key=lambda q: (
            int(q.get("priority") or 100),
            q.get("question_key") or "",
        )
    )
    return candidates[0]


def _shape_question(question: dict[str, Any] | None) -> dict[str, Any] | None:
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


def _write_canonical(
    supabase: Any,
    user_id: str,
    profile_table: str | None,
    profile_column: str | None,
    value: Any,
) -> None:
    """Mirror the answer onto the bank-declared canonical column.

    Defensive: a missing/unknown table or column is logged and ignored;
    the persona_seed write below is the system of record either way.
    """
    if not profile_table or not profile_column:
        return
    if profile_table not in _PROFILE_SCOPED_TABLES:
        logger.info(
            "onboarding write skipped: table %s not in scoped allowlist",
            profile_table,
        )
        return
    key_col = _PROFILE_SCOPED_TABLES[profile_table]
    try:
        existing = (
            supabase.table(profile_table)
            .select(key_col)
            .eq(key_col, user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            supabase.table(profile_table).update({profile_column: value}).eq(
                key_col, user_id
            ).execute()
        else:
            supabase.table(profile_table).insert(
                {key_col: user_id, profile_column: value}
            ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "onboarding canonical write failed (%s.%s): %s",
            profile_table,
            profile_column,
            exc,
        )


def _merge_seed(
    supabase: Any,
    user_id: str,
    current_seed: Any,
    question_key: str,
    seed_value: Any,
) -> dict[str, Any]:
    seed = dict(current_seed) if isinstance(current_seed, dict) else {}
    seed[question_key] = seed_value
    try:
        supabase.table("profiles").update(
            {"persona_seed": seed, "updated_at": _now_iso()}
        ).eq("id", user_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("profiles.persona_seed update failed: %s", exc)
    return seed


def _set_step(
    supabase: Any,
    user_id: str,
    *,
    onboarding_step: str | None,
    onboarding_completed: bool,
) -> None:
    patch = {
        "onboarding_step": onboarding_step,
        "onboarding_completed": onboarding_completed,
        "updated_at": _now_iso(),
    }
    try:
        supabase.table("profiles").update(patch).eq("id", user_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("profiles onboarding-step update failed: %s", exc)


@router.get("/onboarding-next")
async def onboarding_next(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the current onboarding state without writing anything.

    Frontend uses this on mount to decide whether to skip straight to
    the dashboard (``onboarding_completed=true``) or render the next
    question. The shape mirrors ``/onboarding-answer`` so the same
    renderer handles both responses.
    """
    supabase = get_supabase_admin()
    profile = _load_profile(supabase, user["id"])
    if profile.get("onboarding_completed"):
        return {
            "next_question": None,
            "onboarding_completed": True,
            "profile": {
                "id": user["id"],
                "is_anonymous": bool(user.get("is_anonymous")),
                "onboarding_step": profile.get("onboarding_step"),
                "onboarding_completed": True,
            },
        }
    bank = list_active_questions(supabase)
    seed = profile.get("persona_seed") or {}
    nxt = _next_question(bank, seed)
    if nxt is None:
        # Nothing left to ask — flip the row so subsequent /next calls
        # don't have to recompute.
        _set_step(
            supabase,
            user["id"],
            onboarding_step=None,
            onboarding_completed=True,
        )
        return {
            "next_question": None,
            "onboarding_completed": True,
            "profile": {
                "id": user["id"],
                "is_anonymous": bool(user.get("is_anonymous")),
                "onboarding_step": None,
                "onboarding_completed": True,
            },
        }
    next_key = nxt.get("question_key")
    return {
        "next_question": _shape_question(nxt),
        "onboarding_completed": False,
        "profile": {
            "id": user["id"],
            "is_anonymous": bool(user.get("is_anonymous")),
            "onboarding_step": next_key,
            "onboarding_completed": False,
        },
    }


@router.post("/onboarding-answer")
async def onboarding_answer(
    body: OnboardingAnswerBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Record one onboarding answer or skip and return the next question."""
    supabase = get_supabase_admin()
    user_id = user["id"]

    bank = list_active_questions(supabase)
    question = _question_by_key(bank, body.question_key)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown question_key: {body.question_key}",
        )

    profile = _load_profile(supabase, user_id)
    current_seed = profile.get("persona_seed") or {}

    if body.skipped:
        _write_canonical(
            supabase,
            user_id,
            question.get("profile_table"),
            question.get("profile_column"),
            None,
        )
        save_question_skip(
            supabase, user_id, body.question_key, dismissed_until_days=0
        )
        seed_value = "skipped"
        normalized: Any = None
    else:
        try:
            # `validate_answer` rejects answers that don't fit the bank's
            # declared data_type/options. The legacy engine raised a 400
            # here when the key wasn't "current" too — that branch is
            # gone, so re-submitting an answered key just overwrites.
            normalized = validate_answer(question, body.value)
        except AnswerValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        _write_canonical(
            supabase,
            user_id,
            question.get("profile_table"),
            question.get("profile_column"),
            normalized,
        )
        save_question_answer(
            supabase, user_id, body.question_key, body.value, normalized
        )
        emit_question_signal(supabase, user_id, body.question_key, normalized)
        seed_value = normalized if normalized is not None else body.value

    new_seed = _merge_seed(
        supabase, user_id, current_seed, body.question_key, seed_value
    )

    nxt = _next_question(bank, new_seed)
    if nxt is None:
        _set_step(
            supabase,
            user_id,
            onboarding_step=None,
            onboarding_completed=True,
        )
        # Persona snapshot recompute is best-effort and never blocks.
        try:
            enqueue_persona_recompute(
                supabase, user_id, reason="onboarding_completed"
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("persona recompute enqueue failed: %s", exc)
        return {
            "next_question": None,
            "onboarding_completed": True,
            "profile": {
                "id": user_id,
                "is_anonymous": bool(user.get("is_anonymous")),
                "onboarding_step": None,
                "onboarding_completed": True,
            },
        }

    next_key = nxt.get("question_key")
    _set_step(
        supabase,
        user_id,
        onboarding_step=next_key,
        onboarding_completed=False,
    )
    return {
        "next_question": _shape_question(nxt),
        "onboarding_completed": False,
        "profile": {
            "id": user_id,
            "is_anonymous": bool(user.get("is_anonymous")),
            "onboarding_step": next_key,
            "onboarding_completed": False,
        },
    }


@router.post("/onboarding-skip-all")
async def onboarding_skip_all(
    body: OnboardingSkipAllBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Defer the rest of onboarding and send the user to the dashboard.

    Sets ``onboarding_step='deferred'`` so the frontend can offer a
    one-click way to resume later, but flips ``onboarding_completed=true``
    so the dashboard/readiness panel is unblocked. Idempotent.
    """
    supabase = get_supabase_admin()
    user_id = user["id"]
    profile = _load_profile(supabase, user_id)
    seed = profile.get("persona_seed") or {}
    if not isinstance(seed, dict):
        seed = {}
    if body.reason:
        seed.setdefault("__deferred_reason", body.reason)
    try:
        supabase.table("profiles").update(
            {
                "onboarding_step": "deferred",
                "onboarding_completed": True,
                "persona_seed": seed,
                "updated_at": _now_iso(),
            }
        ).eq("id", user_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("skip-all update failed: %s", exc)
    return {
        "onboarding_completed": True,
        "onboarding_step": "deferred",
        "profile": {
            "id": user_id,
            "is_anonymous": bool(user.get("is_anonymous")),
            "onboarding_step": "deferred",
            "onboarding_completed": True,
        },
    }


__all__ = ["router"]
