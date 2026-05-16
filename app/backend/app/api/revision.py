"""Revision Calendar API.

Read endpoints fan out a date range into a per-day map; write endpoints
schedule a heterogeneous source (note / flashcard deck / mistake / topic /
custom) and apply SM-2-lite intervals on completion.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.services.srs import schedule as srs_schedule


router = APIRouter(prefix="/revision", tags=["revision"])

SOURCE_KINDS = {"note", "flashcard_deck", "mistake", "topic", "custom"}


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _shape(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "source_kind": row.get("source_kind"),
        "source_id": row.get("source_id"),
        "title": row.get("title"),
        "exam_slug": row.get("exam_slug"),
        "subject_id": row.get("subject_id"),
        "topic_id": row.get("topic_id"),
        "scheduled_for": row.get("scheduled_for"),
        "interval_days": row.get("interval_days") or 1,
        "ease": float(row.get("ease") or 2.50),
        "repetitions": row.get("repetitions") or 0,
        "status": row.get("status") or "scheduled",
        "completed_at": row.get("completed_at"),
        "notes": row.get("notes"),
    }


class RevisionUpsert(BaseModel):
    source_kind: str
    source_id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    scheduled_for: date
    exam_slug: str | None = None
    subject_id: str | None = None
    topic_id: str | None = None
    notes: str | None = None


class CompleteBody(BaseModel):
    rating: int = Field(default=4, ge=0, le=5)


@router.get("")
def list_revisions(
    start: date = Query(default_factory=lambda: date.today()),
    days: int = Query(default=14, ge=1, le=120),
    status: str | None = None,
    user: dict = Depends(get_current_user),
) -> dict:
    end = start + timedelta(days=days)
    sb = get_supabase_admin()
    q = (
        sb.table("revision_items")
        .select("*")
        .eq("user_id", user["id"])
        .gte("scheduled_for", start.isoformat())
        .lte("scheduled_for", end.isoformat())
    )
    if status:
        q = q.eq("status", status)
    rows = q.order("scheduled_for").execute().data or []

    days_map: dict[str, list[dict]] = {}
    for r in rows:
        key = r.get("scheduled_for")
        days_map.setdefault(key, []).append(_shape(r))
    series = []
    cur = start
    while cur <= end:
        key = cur.isoformat()
        series.append({"date": key, "items": days_map.get(key, [])})
        cur = cur + timedelta(days=1)
    return {"start": start.isoformat(), "days": days, "calendar": series}


@router.get("/today")
def today(user: dict = Depends(get_current_user)) -> dict:
    today_ = date.today()
    sb = get_supabase_admin()
    rows = (
        sb.table("revision_items")
        .select("*")
        .eq("user_id", user["id"])
        .lte("scheduled_for", today_.isoformat())
        .eq("status", "scheduled")
        .order("scheduled_for")
        .limit(200)
        .execute()
        .data
        or []
    )
    return {"date": today_.isoformat(), "items": [_shape(r) for r in rows]}


@router.post("")
def create_revision(body: RevisionUpsert, user: dict = Depends(get_current_user)) -> dict:
    if body.source_kind not in SOURCE_KINDS:
        raise HTTPException(status_code=400, detail=f"source_kind must be one of {sorted(SOURCE_KINDS)}")
    sb = get_supabase_admin()
    payload = body.model_dump()
    payload["user_id"] = user["id"]
    payload["scheduled_for"] = body.scheduled_for.isoformat()
    if payload.get("source_id") and not _is_uuid(payload["source_id"]):
        payload["source_id"] = None
    if payload.get("subject_id") and not _is_uuid(payload["subject_id"]):
        payload["subject_id"] = None
    if payload.get("topic_id") and not _is_uuid(payload["topic_id"]):
        payload["topic_id"] = None
    row = sb.table("revision_items").insert(payload).execute().data
    if not row:
        raise HTTPException(status_code=500, detail="Failed to schedule revision")
    return _shape(row[0])


@router.post("/{item_id}/complete")
def complete(item_id: str, body: CompleteBody, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("revision_items")
        .select("*")
        .eq("id", item_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Revision item not found")
    it = row[0]
    state = srs_schedule(
        rating=body.rating,
        ease=float(it.get("ease") or 2.50),
        interval_days=int(it.get("interval_days") or 1),
        repetitions=int(it.get("repetitions") or 0),
    )
    now = _now_iso()
    sb.table("revision_items").update(
        {
            "status": "completed",
            "completed_at": now,
            "updated_at": now,
        }
    ).eq("id", item_id).execute()
    # Schedule the next revision according to SRS state.
    nxt = sb.table("revision_items").insert(
        {
            "user_id": user["id"],
            "source_kind": it.get("source_kind"),
            "source_id": it.get("source_id"),
            "title": it.get("title"),
            "exam_slug": it.get("exam_slug"),
            "subject_id": it.get("subject_id"),
            "topic_id": it.get("topic_id"),
            "scheduled_for": state.due_at.date().isoformat(),
            "interval_days": state.interval_days,
            "ease": round(state.ease, 2),
            "repetitions": state.repetitions,
            "status": "scheduled",
        }
    ).execute().data
    return {"completed": item_id, "next": _shape(nxt[0]) if nxt else None}


@router.post("/{item_id}/skip")
def skip(item_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    updated = (
        sb.table("revision_items")
        .update({"status": "skipped", "updated_at": _now_iso()})
        .eq("id", item_id)
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Revision item not found")
    return _shape(updated[0])


@router.delete("/{item_id}")
def cancel(item_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    sb.table("revision_items").delete().eq("id", item_id).eq("user_id", user["id"]).execute()
    return {"ok": True, "id": item_id}
