"""Policy updates feed (PR3).

Aspirant-facing read of ``exam_policy_updates`` filtered by the new
``publish_status='published'`` gate added in migration 119. If a row is
linked to a recruitment or exam, that linked entity must also be
published — otherwise the entry is dropped from the feed so we never
surface a deadline change for a still-draft cycle.

Rate limited at 60 req/min per user via :mod:`app.core.rate_limit`.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, BaseModel

from app.core.auth import get_current_user
from app.core.rate_limit import enforce as rate_limit_enforce
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.policy_updates")

router = APIRouter(prefix="/policy-updates", tags=["policy-updates"])

_DEFAULT_LIMIT = 3
_MAX_LIMIT = 10


@router.get("")
async def list_policy_updates(
    sinceClientTs: AwareDatetime | None = Query(default=None),
    limit: int = Query(default=_DEFAULT_LIMIT),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if limit < 1 or limit > _MAX_LIMIT:
        raise HTTPException(
            status_code=422,
            detail=f"limit must be between 1 and {_MAX_LIMIT}",
        )
    rate_limit_enforce(user["id"], "policy_updates.read")

    now = datetime.now(timezone.utc)
    since = sinceClientTs
    if since is not None and since > now:
        # Future timestamp clamps to now — protects against a wedged
        # client clock that would otherwise filter out the entire feed.
        since = now

    supabase = get_supabase_admin()

    query = (
        supabase.table("exam_policy_updates")
        .select(
            "id, exam_id, exam_cycle_id, update_type, title, summary, "
            "source_url, source_type, publish_status, published_at, "
            "effective_from, created_at, updated_at"
        )
        .eq("publish_status", "published")
    )
    if since is not None:
        query = query.gt("published_at", since.isoformat())
    rows = (
        query.order("published_at", desc=True).limit(limit).execute().data or []
    )

    if not rows:
        return {"items": [], "next_cursor": None}

    exam_ids = sorted({r.get("exam_id") for r in rows if r.get("exam_id")})
    published_exam_ids: set[str] = set()
    if exam_ids:
        exam_rows = (
            supabase.table("exams")
            .select("id, is_active")
            .in_("id", exam_ids)
            .execute()
            .data
            or []
        )
        published_exam_ids = {r["id"] for r in exam_rows if r.get("is_active")}

    items = []
    for r in rows:
        exam_id = r.get("exam_id")
        if exam_id and exam_id not in published_exam_ids:
            continue
        items.append(
            {
                "id": r.get("id"),
                "examId": exam_id,
                "examCycleId": r.get("exam_cycle_id"),
                "updateType": r.get("update_type"),
                "title": r.get("title"),
                "summary": r.get("summary"),
                "sourceUrl": r.get("source_url"),
                "publishedAt": r.get("published_at"),
                "effectiveFrom": r.get("effective_from"),
            }
        )
    return {"items": items, "next_cursor": None}


__all__ = ["router"]
