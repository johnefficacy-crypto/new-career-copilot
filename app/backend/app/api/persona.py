"""Persona API (internal aspirant persona v1).

Surface:
    GET  /api/persona/me              - latest snapshot for the caller
    POST /api/persona/recompute       - enqueue or compute for the caller

Persona is INTERNAL. The endpoint returns the snapshot for the
backend/Study OS layer to consume; the UI must not surface it as a
user-facing identity label.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.persona.queue import enqueue_persona_recompute
from app.persona.snapshots import (
    compute_persona_snapshot,
    get_latest_persona_snapshot,
)

logger = logging.getLogger("career_copilot.api.persona")

router = APIRouter(prefix="/persona", tags=["persona"])


class RecomputeBody(BaseModel):
    reason: str | None = None


def _serialize_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    if not snapshot:
        return {}
    return {
        "persona_version": snapshot.get("persona_version") or "v1",
        "primary_persona": snapshot.get("primary_persona"),
        "dimensions": snapshot.get("dimensions") or {},
        "scores": snapshot.get("scores") or {},
        "evidence": snapshot.get("evidence") or [],
        "study_policy": snapshot.get("study_policy") or {},
        "computed_at": snapshot.get("computed_at"),
    }


@router.get("/me")
async def get_my_persona(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user has no id",
        )
    supabase = get_supabase_admin()
    snapshot = get_latest_persona_snapshot(supabase, user_id)
    if not snapshot:
        # First-time read: compute synchronously so the caller gets a
        # usable persona without an extra round-trip.
        snapshot = compute_persona_snapshot(
            supabase, user_id, reason="first_read_auto_compute"
        )
    return {"snapshot": _serialize_snapshot(snapshot)}


@router.post("/recompute")
async def recompute_my_persona(
    body: RecomputeBody | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user has no id",
        )
    reason = (body.reason if body else None) or "manual_recompute"
    supabase = get_supabase_admin()
    # Enqueue a queue row so any future async worker has a record, and
    # also compute synchronously so the caller's next /me read is fresh.
    try:
        enqueue_persona_recompute(supabase, user_id, reason)
    except Exception as exc:  # noqa: BLE001
        # Queue failure must not block the synchronous recompute path.
        logger.warning("persona recompute enqueue failed for %s: %s", user_id, exc)
    try:
        compute_persona_snapshot(supabase, user_id, reason=reason)
        return {"status": "computed", "reason": reason}
    except Exception as exc:  # noqa: BLE001
        logger.exception("persona recompute failed for %s", user_id)
        # Surface as "queued" since the row is on the queue and a worker
        # can retry. Avoid a 500 — persona is non-critical.
        return {"status": "queued", "reason": reason, "error": str(exc)[:200]}
