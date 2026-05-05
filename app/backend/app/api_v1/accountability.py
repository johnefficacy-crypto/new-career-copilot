"""Accountability: partners, study groups, mentor bookings."""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.security import get_current_user, iso, now_utc
from app.server_deps import get_db

router = APIRouter(prefix="/accountability", tags=["accountability"])

SUGGESTED_PARTNERS = [
    {"id": "arjun-v", "name": "Arjun V.", "exam": "SSC CGL 2026", "city": "Pune", "study_hours": 6.5, "timezone": "IST", "streak": 18, "commitment": "5 days a week"},
    {"id": "naina-k", "name": "Naina K.", "exam": "IBPS PO XV", "city": "Hyderabad", "study_hours": 4.8, "timezone": "IST", "streak": 11, "commitment": "Daily"},
    {"id": "sahil-r", "name": "Sahil R.", "exam": "RBI Grade B", "city": "Bengaluru", "study_hours": 7.2, "timezone": "IST", "streak": 26, "commitment": "Daily"},
    {"id": "ishita-b", "name": "Ishita B.", "exam": "SSC CGL 2026", "city": "Lucknow", "study_hours": 5.1, "timezone": "IST", "streak": 9, "commitment": "Weekdays"},
]

GROUPS = [
    {"id": "morning-batch", "name": "Morning Batch · 5 AM club", "members": 4, "exam": "SSC CGL 2026", "vibe": "Disciplined"},
    {"id": "banking-warriors", "name": "Banking Warriors", "members": 11, "exam": "IBPS PO XV", "vibe": "Structured"},
    {"id": "rbi-focus", "name": "RBI Focus Room", "members": 6, "exam": "RBI Grade B", "vibe": "Serious & quiet"},
]


@router.get("/partners")
async def list_partners(user: dict = Depends(get_current_user)):
    return {"suggested": SUGGESTED_PARTNERS, "my_partner": None}


class PartnerRequest(BaseModel):
    partner_id: str
    message: str | None = Field(default=None, max_length=200)


@router.post("/partners/request")
async def request_partner(body: PartnerRequest, user: dict = Depends(get_current_user)):
    db = get_db()
    await db.partner_requests.insert_one(
        {
            "requester_id": user["_id"],
            "partner_id": body.partner_id,
            "message": body.message,
            "status": "pending",
            "created_at": now_utc(),
        }
    )
    return {"ok": True, "status": "pending"}


@router.get("/groups")
async def list_groups(user: dict = Depends(get_current_user)):
    return {"items": GROUPS}


class GroupJoin(BaseModel):
    group_id: str


@router.post("/groups/join")
async def join_group(body: GroupJoin, user: dict = Depends(get_current_user)):
    db = get_db()
    await db.group_members.update_one(
        {"user_id": user["_id"], "group_id": body.group_id},
        {"$set": {"joined_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True}


class MentorBook(BaseModel):
    mentor_id: str
    slot: str  # ISO or "Sat · 10:00"
    agenda: str | None = Field(default=None, max_length=300)


@router.post("/mentors/book")
async def book_mentor(body: MentorBook, user: dict = Depends(get_current_user)):
    db = get_db()
    mentor = await db.mentors.find_one({"id": body.mentor_id})
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    doc = {
        "user_id": user["_id"],
        "mentor_id": body.mentor_id,
        "mentor_name": mentor["name"],
        "slot": body.slot,
        "agenda": body.agenda,
        "status": "requested",
        "price": mentor.get("price_per_hour", 0),
        "created_at": now_utc(),
    }
    res = await db.mentor_bookings.insert_one(doc)
    return {"id": str(res.inserted_id), "status": "requested"}


@router.get("/mentors/bookings")
async def my_bookings(user: dict = Depends(get_current_user)):
    db = get_db()
    items = []
    async for b in db.mentor_bookings.find({"user_id": user["_id"]}).sort("created_at", -1):
        items.append(
            {
                "id": str(b["_id"]),
                "mentor_id": b["mentor_id"],
                "mentor_name": b.get("mentor_name"),
                "slot": b.get("slot"),
                "agenda": b.get("agenda"),
                "status": b.get("status"),
                "price": b.get("price"),
                "created_at": iso(b.get("created_at")),
            }
        )
    return {"items": items}
