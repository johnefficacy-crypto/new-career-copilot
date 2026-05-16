"""Personal Notes API.

User-owned notes attached to exam/subject/topic metadata. Free tier capped
at NOTES_FREE_LIMIT in application logic (RLS already enforces ownership).
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/notes", tags=["notes"])

NOTES_FREE_LIMIT = 25


def _is_pro(user: dict) -> bool:
    plan = (user.get("plan") or "free").lower()
    return plan in {"pro", "elite", "premium"}


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _shape(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "body": row.get("body") or "",
        "exam_slug": row.get("exam_slug"),
        "subject_id": row.get("subject_id"),
        "topic_id": row.get("topic_id"),
        "source_url": row.get("source_url"),
        "tags": row.get("tags") or [],
        "is_pinned": bool(row.get("is_pinned")),
        "is_archived": bool(row.get("is_archived")),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


class NoteUpsert(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=20000)
    exam_slug: str | None = None
    subject_id: str | None = None
    topic_id: str | None = None
    source_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_pinned: bool = False


class NotePatch(BaseModel):
    title: str | None = None
    body: str | None = None
    exam_slug: str | None = None
    subject_id: str | None = None
    topic_id: str | None = None
    source_url: str | None = None
    tags: list[str] | None = None
    is_pinned: bool | None = None
    is_archived: bool | None = None


@router.get("")
def list_notes(
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = None,
    subject_id: str | None = None,
    archived: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(get_current_user),
) -> dict:
    sb = get_supabase_admin()
    query = sb.table("personal_notes").select("*").eq("user_id", user["id"])
    if not archived:
        query = query.eq("is_archived", False)
    if tag:
        query = query.contains("tags", [tag])
    if subject_id and _is_uuid(subject_id):
        query = query.eq("subject_id", subject_id)
    if q:
        like = f"%{q}%"
        query = query.or_(f"title.ilike.{like},body.ilike.{like}")
    rows = (
        query.order("is_pinned", desc=True)
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {
        "notes": [_shape(r) for r in rows],
        "count": len(rows),
        "plan": user.get("plan") or "free",
        "free_limit": NOTES_FREE_LIMIT,
        "is_pro": _is_pro(user),
    }


@router.get("/{note_id}")
def get_note(note_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(note_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("personal_notes")
        .select("*")
        .eq("id", note_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return _shape(row[0])


@router.post("")
def create_note(body: NoteUpsert, user: dict = Depends(get_current_user)) -> dict:
    sb = get_supabase_admin()
    if not _is_pro(user):
        existing = (
            sb.table("personal_notes")
            .select("id", count="exact")
            .eq("user_id", user["id"])
            .eq("is_archived", False)
            .execute()
        )
        count = getattr(existing, "count", None) or len(existing.data or [])
        if count >= NOTES_FREE_LIMIT:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "free_limit_reached",
                    "message": f"Free plan is limited to {NOTES_FREE_LIMIT} notes. Upgrade to Pro for unlimited.",
                    "limit": NOTES_FREE_LIMIT,
                },
            )
    payload = body.model_dump()
    payload["user_id"] = user["id"]
    if payload.get("subject_id") and not _is_uuid(payload["subject_id"]):
        payload["subject_id"] = None
    if payload.get("topic_id") and not _is_uuid(payload["topic_id"]):
        payload["topic_id"] = None
    inserted = sb.table("personal_notes").insert(payload).execute().data
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create note")
    return _shape(inserted[0])


@router.patch("/{note_id}")
def update_note(note_id: str, body: NotePatch, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(note_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None or k in {"body", "source_url", "exam_slug"}}
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    sb = get_supabase_admin()
    updated = (
        sb.table("personal_notes")
        .update({**patch, "updated_at": "now()"})
        .eq("id", note_id)
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Note not found")
    return _shape(updated[0])


@router.delete("/{note_id}")
def delete_note(note_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(note_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    sb.table("personal_notes").delete().eq("id", note_id).eq("user_id", user["id"]).execute()
    return {"ok": True, "id": note_id}
