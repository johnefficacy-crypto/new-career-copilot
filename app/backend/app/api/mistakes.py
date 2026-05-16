"""Mistake Book API.

Captures wrong answers with root-cause tags and SRS scheduling. Supports
promotion of a mistake into a flashcard so the aspirant can drill the
concept through the regular flashcard review loop.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.services.srs import schedule as srs_schedule, DEFAULT_EASE


router = APIRouter(prefix="/mistakes", tags=["mistakes"])

ROOT_CAUSES = {"concept", "silly", "application", "time_pressure", "misread", "unknown"}


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
        "exam_slug": row.get("exam_slug"),
        "subject_id": row.get("subject_id"),
        "topic_id": row.get("topic_id"),
        "question_text": row.get("question_text"),
        "correct_answer": row.get("correct_answer"),
        "my_answer": row.get("my_answer"),
        "reason": row.get("reason"),
        "root_cause": row.get("root_cause") or "concept",
        "difficulty": row.get("difficulty"),
        "source_kind": row.get("source_kind") or "manual",
        "source_id": row.get("source_id"),
        "tags": row.get("tags") or [],
        "status": row.get("status") or "open",
        "review_count": row.get("review_count") or 0,
        "next_review_at": row.get("next_review_at"),
        "mastered_at": row.get("mastered_at"),
        "promoted_card_id": row.get("promoted_card_id"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


class MistakeCreate(BaseModel):
    question_text: str = Field(min_length=1, max_length=4000)
    correct_answer: str | None = None
    my_answer: str | None = None
    reason: str | None = None
    root_cause: str = "concept"
    difficulty: int | None = Field(default=None, ge=1, le=5)
    exam_slug: str | None = None
    subject_id: str | None = None
    topic_id: str | None = None
    source_kind: str = "manual"
    source_id: str | None = None
    tags: list[str] = Field(default_factory=list)


class MistakePatch(BaseModel):
    question_text: str | None = None
    correct_answer: str | None = None
    my_answer: str | None = None
    reason: str | None = None
    root_cause: str | None = None
    difficulty: int | None = None
    tags: list[str] | None = None
    status: str | None = None


class ReviewBody(BaseModel):
    rating: int = Field(ge=0, le=5)


@router.get("")
def list_mistakes(
    status: str | None = None,
    subject_id: str | None = None,
    root_cause: str | None = None,
    tag: str | None = None,
    due_only: bool = False,
    limit: int = Query(default=200, ge=1, le=1000),
    user: dict = Depends(get_current_user),
) -> dict:
    sb = get_supabase_admin()
    q = sb.table("mistake_entries").select("*").eq("user_id", user["id"])
    if status:
        q = q.eq("status", status)
    if subject_id and _is_uuid(subject_id):
        q = q.eq("subject_id", subject_id)
    if root_cause and root_cause in ROOT_CAUSES:
        q = q.eq("root_cause", root_cause)
    if tag:
        q = q.contains("tags", [tag])
    if due_only:
        q = q.lte("next_review_at", _now_iso()).neq("status", "mastered")
    rows = q.order("next_review_at").limit(limit).execute().data or []
    return {"mistakes": [_shape(r) for r in rows]}


@router.get("/summary")
def summary(user: dict = Depends(get_current_user)) -> dict:
    sb = get_supabase_admin()
    open_count = (
        sb.table("mistake_entries").select("id", count="exact").eq("user_id", user["id"]).eq("status", "open").execute()
    )
    mastered = (
        sb.table("mistake_entries").select("id", count="exact").eq("user_id", user["id"]).eq("status", "mastered").execute()
    )
    due = (
        sb.table("mistake_entries")
        .select("id", count="exact")
        .eq("user_id", user["id"])
        .neq("status", "mastered")
        .lte("next_review_at", _now_iso())
        .execute()
    )
    # Root-cause distribution (top 5)
    rows = (
        sb.table("mistake_entries")
        .select("root_cause")
        .eq("user_id", user["id"])
        .neq("status", "mastered")
        .limit(2000)
        .execute()
        .data
        or []
    )
    cause_counts: dict[str, int] = {}
    for r in rows:
        c = r.get("root_cause") or "unknown"
        cause_counts[c] = cause_counts.get(c, 0) + 1
    return {
        "open_count": getattr(open_count, "count", None) or 0,
        "mastered_count": getattr(mastered, "count", None) or 0,
        "due_count": getattr(due, "count", None) or 0,
        "by_root_cause": sorted(
            [{"cause": k, "count": v} for k, v in cause_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        ),
    }


@router.post("")
def create_mistake(body: MistakeCreate, user: dict = Depends(get_current_user)) -> dict:
    if body.root_cause not in ROOT_CAUSES:
        raise HTTPException(status_code=400, detail=f"Invalid root_cause; expected one of {sorted(ROOT_CAUSES)}")
    sb = get_supabase_admin()
    payload = body.model_dump()
    payload["user_id"] = user["id"]
    if payload.get("subject_id") and not _is_uuid(payload["subject_id"]):
        payload["subject_id"] = None
    if payload.get("topic_id") and not _is_uuid(payload["topic_id"]):
        payload["topic_id"] = None
    if payload.get("source_id") and not _is_uuid(payload["source_id"]):
        payload["source_id"] = None
    row = sb.table("mistake_entries").insert(payload).execute().data
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create mistake")
    return _shape(row[0])


@router.patch("/{mistake_id}")
def update_mistake(mistake_id: str, body: MistakePatch, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(mistake_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if "root_cause" in patch and patch["root_cause"] not in ROOT_CAUSES:
        raise HTTPException(status_code=400, detail="Invalid root_cause")
    sb = get_supabase_admin()
    updated = (
        sb.table("mistake_entries")
        .update({**patch, "updated_at": _now_iso()})
        .eq("id", mistake_id)
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Mistake not found")
    return _shape(updated[0])


@router.delete("/{mistake_id}")
def delete_mistake(mistake_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(mistake_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    sb.table("mistake_entries").delete().eq("id", mistake_id).eq("user_id", user["id"]).execute()
    return {"ok": True, "id": mistake_id}


@router.post("/{mistake_id}/review")
def review_mistake(mistake_id: str, body: ReviewBody, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(mistake_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("mistake_entries")
        .select("*")
        .eq("id", mistake_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Mistake not found")
    m = row[0]
    state = srs_schedule(
        rating=body.rating,
        ease=DEFAULT_EASE,
        interval_days=0,
        repetitions=int(m.get("review_count") or 0),
        lapses=0,
    )
    new_status = m.get("status") or "open"
    mastered_at = m.get("mastered_at")
    if state.repetitions >= 3 and body.rating >= 4:
        new_status = "mastered"
        mastered_at = _now_iso()
    elif new_status == "open":
        new_status = "reviewing"
    updated = (
        sb.table("mistake_entries")
        .update(
            {
                "review_count": (m.get("review_count") or 0) + 1,
                "next_review_at": state.due_at.isoformat(),
                "status": new_status,
                "mastered_at": mastered_at,
                "updated_at": _now_iso(),
            }
        )
        .eq("id", mistake_id)
        .execute()
        .data
    )
    return _shape(updated[0] if updated else m)


class PromoteBody(BaseModel):
    deck_id: str | None = None
    new_deck_name: str | None = None


@router.post("/{mistake_id}/promote")
def promote_to_card(mistake_id: str, body: PromoteBody, user: dict = Depends(get_current_user)) -> dict:
    """Create a flashcard from a mistake. Either deck_id or new_deck_name required."""
    if not _is_uuid(mistake_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    if not body.deck_id and not body.new_deck_name:
        raise HTTPException(status_code=400, detail="Provide deck_id or new_deck_name")
    sb = get_supabase_admin()
    m_row = (
        sb.table("mistake_entries")
        .select("*")
        .eq("id", mistake_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not m_row:
        raise HTTPException(status_code=404, detail="Mistake not found")
    m = m_row[0]

    deck_id = body.deck_id if body.deck_id and _is_uuid(body.deck_id) else None
    if not deck_id:
        deck_row = (
            sb.table("flashcard_decks")
            .insert(
                {
                    "user_id": user["id"],
                    "name": body.new_deck_name or "Mistake Drills",
                    "description": "Auto-created from Mistake Book",
                    "exam_slug": m.get("exam_slug"),
                    "subject_id": m.get("subject_id"),
                    "topic_id": m.get("topic_id"),
                }
            )
            .execute()
            .data
        )
        if not deck_row:
            raise HTTPException(status_code=500, detail="Failed to create deck")
        deck_id = deck_row[0]["id"]
    else:
        # Confirm ownership
        owned = (
            sb.table("flashcard_decks")
            .select("id")
            .eq("id", deck_id)
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
            .data
        )
        if not owned:
            raise HTTPException(status_code=404, detail="Deck not found")

    card_row = (
        sb.table("flashcards")
        .insert(
            {
                "deck_id": deck_id,
                "user_id": user["id"],
                "front": m.get("question_text"),
                "back": (m.get("correct_answer") or "") + ("\n\nWhy I missed it: " + m["reason"] if m.get("reason") else ""),
                "due_at": _now_iso(),
            }
        )
        .execute()
        .data
    )
    if not card_row:
        raise HTTPException(status_code=500, detail="Failed to create card")
    sb.table("mistake_entries").update({"promoted_card_id": card_row[0]["id"], "updated_at": _now_iso()}).eq(
        "id", mistake_id
    ).execute()
    return {"ok": True, "deck_id": deck_id, "card_id": card_row[0]["id"]}
