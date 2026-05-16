"""Accountability runtime — mentor bookings backed by Supabase.

Supersedes the in-memory `/api/accountability/mentors/*` endpoints in
placeholders.py. Partners + groups already had a real (Supabase-backed)
implementation in placeholders' router_acc that we now lift out cleanly.
The marketplace mentor catalogue is still seed data, so mentor_slug is
stored alongside the optional mentor_id profile FK.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/accountability", tags=["accountability"])


# Reuse the marketplace mentor catalogue from placeholders so the same
# slug → display data mapping is shared until profile-backed mentors land.
from app.api.placeholders import MENTORS  # noqa: E402


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _shape_booking(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "mentor_id": row.get("mentor_id"),
        "mentor_slug": row.get("mentor_slug"),
        "mentor_name": row.get("metadata", {}).get("mentor_name"),
        "slot": row.get("slot"),
        "duration_minutes": row.get("duration_minutes") or 60,
        "price_inr": row.get("price_inr"),
        "notes": row.get("notes"),
        "agenda": row.get("agenda"),
        "status": row.get("status"),
        "payment_id": row.get("payment_id"),
        "payment_status": row.get("payment_status"),
        "metadata": row.get("metadata") or {},
        "confirmed_at": row.get("confirmed_at"),
        "cancelled_at": row.get("cancelled_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _resolve_mentor(mentor_id: str) -> tuple[str | None, str | None, dict | None]:
    """Resolve `mentor_id` into (profile_uuid, mentor_slug, catalogue_row)."""
    if _is_uuid(mentor_id):
        return mentor_id, None, None
    catalogue = next((m for m in MENTORS if m.get("id") == mentor_id), None)
    return None, mentor_id, catalogue


class MentorBook(BaseModel):
    mentor_id: str
    slot: str | None = Field(default=None, description="ISO datetime or human label until structured scheduling lands")
    duration_minutes: int = Field(default=60, ge=15, le=240)
    notes: str | None = None
    payment_id: str | None = None


@router.post("/mentors/book")
def book_mentor(body: MentorBook, user: dict = Depends(get_current_user)) -> dict:
    profile_uuid, slug, catalogue = _resolve_mentor(body.mentor_id)
    if not profile_uuid and not catalogue:
        raise HTTPException(status_code=404, detail="Mentor not found")
    price = (catalogue or {}).get("price_per_hour")
    duration_h = max(1, round(body.duration_minutes / 60))
    price_total = int(price * duration_h) if price else None

    sb = get_supabase_admin()
    payload: dict[str, Any] = {
        "user_id": user["id"],
        "mentor_id": profile_uuid,
        "mentor_slug": slug,
        "slot": body.slot if body.slot and "T" in body.slot else None,
        "agenda": body.notes,
        "notes": body.notes,
        "duration_minutes": body.duration_minutes,
        "price_inr": price_total,
        "payment_id": body.payment_id,
        "payment_status": "captured" if body.payment_id else "unpaid",
        "status": "pending_payment" if not body.payment_id else "awaiting_mentor",
        "metadata": {
            "mentor_name": (catalogue or {}).get("name"),
            "slot_label": body.slot if body.slot and "T" not in body.slot else None,
        },
    }
    row = sb.table("mentor_bookings").insert(payload).execute().data
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create booking")
    return _shape_booking(row[0])


@router.get("/mentors/bookings")
def list_bookings(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> dict:
    sb = get_supabase_admin()
    q = sb.table("mentor_bookings").select("*").eq("user_id", user["id"])
    if status:
        q = q.eq("status", status)
    rows = q.order("created_at", desc=True).limit(limit).execute().data or []
    return {"items": [_shape_booking(r) for r in rows]}


class CancelBody(BaseModel):
    reason: str | None = None


@router.post("/mentors/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str, body: CancelBody, user: dict = Depends(get_current_user)) -> dict:
    if not _is_uuid(booking_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = (
        sb.table("mentor_bookings")
        .select("status,metadata")
        .eq("id", booking_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    if row[0].get("status") in {"completed", "cancelled", "refunded"}:
        raise HTTPException(status_code=409, detail=f"Cannot cancel a {row[0]['status']} booking")
    updated = (
        sb.table("mentor_bookings")
        .update(
            {
                "status": "cancelled",
                "cancelled_at": _now_iso(),
                "updated_at": _now_iso(),
                "metadata": {**(row[0].get("metadata") or {}), "cancel_reason": body.reason},
            }
        )
        .eq("id", booking_id)
        .execute()
        .data
    )
    return _shape_booking(updated[0]) if updated else {"ok": True, "id": booking_id, "status": "cancelled"}


# ───────────────────────── Partners + Groups ─────────────────────────
# These already use Supabase via app.study_os.social_sessions; lifting the
# placeholder shim here keeps the contract identical for the frontend.


class PartnerReq(BaseModel):
    partner_id: str
    message: str | None = None
    pairing_goal: str = "discipline"


@router.get("/partners")
def list_partners(user: dict = Depends(get_current_user)) -> dict:
    from app.study_os.social_sessions import list_partner_suggestions, list_pairs

    sb = get_supabase_admin()
    pairs = list_pairs(sb, user["id"])
    suggestions = list_partner_suggestions(sb, user["id"], limit=10)
    return {"suggested": suggestions, "pairs": pairs}


@router.post("/partners/request")
def request_partner(body: PartnerReq, user: dict = Depends(get_current_user)) -> dict:
    from app.study_os.social_sessions import request_partner as svc_request

    try:
        return svc_request(
            get_supabase_admin(),
            user["id"],
            body.partner_id,
            pairing_goal=body.pairing_goal,
            message=body.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/groups")
def list_groups(user: dict = Depends(get_current_user)) -> dict:
    from app.study_os.social_sessions import list_groups as svc_list_groups

    return {"items": svc_list_groups(get_supabase_admin(), user["id"])}


class GroupJoinBody(BaseModel):
    group_id: str


@router.post("/groups/join")
def join_group(body: GroupJoinBody, user: dict = Depends(get_current_user)) -> dict:
    from app.study_os.social_sessions import join_group as svc_join

    try:
        return svc_join(get_supabase_admin(), user["id"], body.group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
