"""Flashcards API.

Deck and card CRUD plus a review endpoint that runs the shared SM-2-lite
scheduler. Every review is also appended to flashcard_reviews so the
weekly-review service can compute lapse rate, retention, and time-on-task.
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


router = APIRouter(prefix="/flashcards", tags=["flashcards"])


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _shape_deck(row: dict, due_count: int | None = None) -> dict:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "description": row.get("description") or "",
        "exam_slug": row.get("exam_slug"),
        "subject_id": row.get("subject_id"),
        "topic_id": row.get("topic_id"),
        "is_shared": bool(row.get("is_shared")),
        "card_count": row.get("card_count") or 0,
        "due_count": due_count if due_count is not None else (row.get("due_count") or 0),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _shape_card(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "deck_id": row.get("deck_id"),
        "front": row.get("front"),
        "back": row.get("back"),
        "hint": row.get("hint"),
        "ease": float(row.get("ease") or DEFAULT_EASE),
        "interval_days": int(row.get("interval_days") or 0),
        "repetitions": int(row.get("repetitions") or 0),
        "lapses": int(row.get("lapses") or 0),
        "due_at": row.get("due_at"),
        "last_reviewed_at": row.get("last_reviewed_at"),
        "is_suspended": bool(row.get("is_suspended")),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _refresh_counts(sb, deck_id: str) -> None:
    total = sb.table("flashcards").select("id", count="exact").eq("deck_id", deck_id).execute()
    due = (
        sb.table("flashcards")
        .select("id", count="exact")
        .eq("deck_id", deck_id)
        .eq("is_suspended", False)
        .lte("due_at", _now_iso())
        .execute()
    )
    sb.table("flashcard_decks").update(
        {
            "card_count": getattr(total, "count", None) or 0,
            "due_count": getattr(due, "count", None) or 0,
            "updated_at": _now_iso(),
        }
    ).eq("id", deck_id).execute()


class DeckUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    exam_slug: str | None = None
    subject_id: str | None = None
    topic_id: str | None = None
    is_shared: bool = False


class CardUpsert(BaseModel):
    front: str = Field(min_length=1, max_length=4000)
    back: str = Field(min_length=1, max_length=4000)
    hint: str | None = None


class CardPatch(BaseModel):
    front: str | None = None
    back: str | None = None
    hint: str | None = None
    is_suspended: bool | None = None


class ReviewBody(BaseModel):
    rating: int = Field(ge=0, le=5)
    duration_ms: int | None = None


# ───────────────────────────── Decks ─────────────────────────────


@router.get("/decks")
def list_decks(user: dict = Depends(get_current_user)) -> dict:
    sb = get_supabase_admin()
    rows = (
        sb.table("flashcard_decks")
        .select("*")
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .execute()
        .data
        or []
    )
    return {"decks": [_shape_deck(r) for r in rows]}


@router.post("/decks")
def create_deck(body: DeckUpsert, user: dict = Depends(get_current_user)) -> dict:
    sb = get_supabase_admin()
    payload = body.model_dump()
    payload["user_id"] = user["id"]
    if payload.get("subject_id") and not _is_uuid(payload["subject_id"]):
        payload["subject_id"] = None
    if payload.get("topic_id") and not _is_uuid(payload["topic_id"]):
        payload["topic_id"] = None
    row = sb.table("flashcard_decks").insert(payload).execute().data
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create deck")
    return _shape_deck(row[0])


@router.patch("/decks/{deck_id}")
def update_deck(deck_id: str, body: DeckUpsert, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(deck_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    patch = {k: v for k, v in body.model_dump().items()}
    if patch.get("subject_id") and not _is_uuid(patch["subject_id"]):
        patch["subject_id"] = None
    if patch.get("topic_id") and not _is_uuid(patch["topic_id"]):
        patch["topic_id"] = None
    updated = (
        sb.table("flashcard_decks")
        .update({**patch, "updated_at": _now_iso()})
        .eq("id", deck_id)
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Deck not found")
    return _shape_deck(updated[0])


@router.delete("/decks/{deck_id}")
def delete_deck(deck_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(deck_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    sb.table("flashcard_decks").delete().eq("id", deck_id).eq("user_id", user["id"]).execute()
    return {"ok": True, "id": deck_id}


# ───────────────────────────── Cards ─────────────────────────────


@router.get("/decks/{deck_id}/cards")
def list_cards(
    deck_id: str,
    due_only: bool = False,
    limit: int = Query(default=200, ge=1, le=1000),
    user: dict = Depends(get_current_user),
) -> dict:
    if not _is_uuid(deck_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    q = sb.table("flashcards").select("*").eq("deck_id", deck_id).eq("user_id", user["id"])
    if due_only:
        q = q.eq("is_suspended", False).lte("due_at", _now_iso())
    rows = q.order("due_at").limit(limit).execute().data or []
    return {"cards": [_shape_card(r) for r in rows]}


@router.post("/decks/{deck_id}/cards")
def create_card(deck_id: str, body: CardUpsert, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(deck_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    deck = (
        sb.table("flashcard_decks")
        .select("id")
        .eq("id", deck_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    payload = body.model_dump()
    payload.update({"deck_id": deck_id, "user_id": user["id"], "due_at": _now_iso()})
    row = sb.table("flashcards").insert(payload).execute().data
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create card")
    _refresh_counts(sb, deck_id)
    return _shape_card(row[0])


@router.patch("/cards/{card_id}")
def update_card(card_id: str, body: CardPatch, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(card_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not patch:
        raise HTTPException(status_code=400, detail="Nothing to update")
    sb = get_supabase_admin()
    updated = (
        sb.table("flashcards")
        .update({**patch, "updated_at": _now_iso()})
        .eq("id", card_id)
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Card not found")
    return _shape_card(updated[0])


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(card_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    existing = (
        sb.table("flashcards")
        .select("deck_id")
        .eq("id", card_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    sb.table("flashcards").delete().eq("id", card_id).eq("user_id", user["id"]).execute()
    if existing:
        _refresh_counts(sb, existing[0]["deck_id"])
    return {"ok": True, "id": card_id}


# ───────────────────────────── Review ─────────────────────────────


@router.post("/cards/{card_id}/review")
def review_card(card_id: str, body: ReviewBody, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(card_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("flashcards")
        .select("*")
        .eq("id", card_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    card = row[0]
    state = srs_schedule(
        rating=body.rating,
        ease=float(card.get("ease") or DEFAULT_EASE),
        interval_days=int(card.get("interval_days") or 0),
        repetitions=int(card.get("repetitions") or 0),
        lapses=int(card.get("lapses") or 0),
    )
    now = _now_iso()
    updated = (
        sb.table("flashcards")
        .update({**state.to_dict(), "last_reviewed_at": now, "updated_at": now})
        .eq("id", card_id)
        .execute()
        .data
    )
    sb.table("flashcard_reviews").insert(
        {
            "card_id": card_id,
            "user_id": user["id"],
            "rating": body.rating,
            "duration_ms": body.duration_ms,
            "prev_interval_days": int(card.get("interval_days") or 0),
            "new_interval_days": state.interval_days,
        }
    ).execute()
    _refresh_counts(sb, card["deck_id"])
    return _shape_card(updated[0] if updated else {**card, **state.to_dict()})


@router.get("/due-summary")
def due_summary(user: dict = Depends(get_current_user)) -> dict:
    sb = get_supabase_admin()
    total = sb.table("flashcards").select("id", count="exact").eq("user_id", user["id"]).execute()
    due = (
        sb.table("flashcards")
        .select("id", count="exact")
        .eq("user_id", user["id"])
        .eq("is_suspended", False)
        .lte("due_at", _now_iso())
        .execute()
    )
    return {
        "total_cards": getattr(total, "count", None) or 0,
        "due_now": getattr(due, "count", None) or 0,
    }
