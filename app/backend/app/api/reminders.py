"""Reminders API (PR4).

User-owned reminders with CRUD. ``source='system'`` rows are seeded by
the platform and the API blocks user mutations on them; clients can
never write ``source='system'`` on create.

Rate limit: 30/min per user for POST/PUT/DELETE.
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, BaseModel, Field

from app.core.auth import (
    get_current_user,
    get_current_user_required_permanent,
)
from app.core.rate_limit import enforce as rate_limit_enforce
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.reminders")

router = APIRouter(prefix="/reminders", tags=["reminders"])

_DEFAULT_LIMIT = 50
_MAX_LIMIT = 100
_UPCOMING_LIMIT = 20

ReminderType = Literal["general", "deadline", "exam", "document", "payment", "study"]


class ReminderIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_at: AwareDatetime
    reminder_type: ReminderType = "general"


def _encode_cursor(created_at: str | None, row_id: str | None) -> str | None:
    if not created_at or not row_id:
        return None
    payload = json.dumps({"created_at": created_at, "id": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str | None) -> dict[str, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        decoded = json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid cursor") from exc
    if not isinstance(decoded, dict) or "created_at" not in decoded or "id" not in decoded:
        raise HTTPException(status_code=422, detail="Invalid cursor")
    return {"created_at": str(decoded["created_at"]), "id": str(decoded["id"])}


def _shape(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "dueAt": row.get("due_at"),
        "reminderType": row.get("reminder_type"),
        "source": row.get("source"),
        "dismissedAt": row.get("dismissed_at"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def _load_owned(supabase: Any, user_id: str, reminder_id: str) -> dict[str, Any]:
    """Return the reminder row when owned by ``user_id``; 404 otherwise.

    Combining "not found" and "not owned" into 404 avoids leaking the
    existence of another user's reminder.
    """
    rows = (
        supabase.table("reminders")
        .select("*")
        .eq("id", reminder_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return rows[0]


@router.get("/upcoming")
async def upcoming(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = (
        supabase.table("reminders")
        .select("*")
        .eq("user_id", user["id"])
        .is_("dismissed_at", "null")
        .gte("due_at", now_iso)
        .order("due_at", desc=False)
        .limit(_UPCOMING_LIMIT)
        .execute()
        .data
        or []
    )
    return {"items": [_shape(r) for r in rows]}


@router.get("")
async def list_reminders(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=_DEFAULT_LIMIT),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if limit < 1 or limit > _MAX_LIMIT:
        raise HTTPException(status_code=422, detail=f"limit must be between 1 and {_MAX_LIMIT}")
    decoded = _decode_cursor(cursor)

    supabase = get_supabase_admin()
    query = (
        supabase.table("reminders")
        .select("*")
        .eq("user_id", user["id"])
    )
    if decoded:
        query = query.lt("created_at", decoded["created_at"])
    fetched = (
        query.order("created_at", desc=True).limit(limit + 1).execute().data or []
    )

    next_cursor: str | None = None
    if len(fetched) > limit:
        page = fetched[:limit]
        last = page[-1]
        next_cursor = _encode_cursor(str(last.get("created_at")), str(last.get("id")))
    else:
        page = fetched

    return {"items": [_shape(r) for r in page], "next_cursor": next_cursor}


@router.post("")
async def create_reminder(
    body: ReminderIn,
    user: dict = Depends(get_current_user_required_permanent),
) -> dict[str, Any]:
    rate_limit_enforce(user["id"], "reminders.write")
    now = datetime.now(timezone.utc)
    if body.due_at <= now:
        raise HTTPException(status_code=422, detail="due_at must be in the future")
    payload = {
        "user_id": user["id"],
        "title": body.title,
        "due_at": body.due_at.isoformat(),
        "reminder_type": body.reminder_type,
        "source": "user",
    }
    supabase = get_supabase_admin()
    rows = supabase.table("reminders").insert(payload).execute().data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Insert failed")
    return _shape(rows[0])


@router.put("/{reminder_id}")
async def update_reminder(
    reminder_id: str,
    body: ReminderIn,
    user: dict = Depends(get_current_user_required_permanent),
) -> dict[str, Any]:
    rate_limit_enforce(user["id"], "reminders.write")
    supabase = get_supabase_admin()
    existing = _load_owned(supabase, user["id"], reminder_id)
    if existing.get("source") == "system":
        raise HTTPException(status_code=403, detail="System reminders are not editable")
    patch = {
        "title": body.title,
        "due_at": body.due_at.isoformat(),
        "reminder_type": body.reminder_type,
    }
    rows = (
        supabase.table("reminders")
        .update(patch)
        .eq("id", reminder_id)
        .eq("user_id", user["id"])
        .execute()
        .data
        or []
    )
    return _shape(rows[0] if rows else {**existing, **patch})


@router.delete("/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    user: dict = Depends(get_current_user_required_permanent),
) -> dict[str, Any]:
    rate_limit_enforce(user["id"], "reminders.write")
    supabase = get_supabase_admin()
    existing = _load_owned(supabase, user["id"], reminder_id)
    if existing.get("source") == "system":
        raise HTTPException(status_code=403, detail="System reminders cannot be deleted")
    supabase.table("reminders").delete().eq("id", reminder_id).eq(
        "user_id", user["id"]
    ).execute()
    return {"ok": True}


__all__ = ["router"]
