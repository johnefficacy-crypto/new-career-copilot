"""Application tracker — user's timeline for each recruitment they apply to."""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.security import get_current_user, iso, now_utc
from app.server_deps import get_db

router = APIRouter(prefix="/tracker", tags=["tracker"])

STAGES = [
    "notified",
    "applied",
    "fee_paid",
    "admit_card",
    "appeared",
    "result",
]


class TrackerCreate(BaseModel):
    recruitment_slug: str
    stage: str = Field(default="notified")
    note: str | None = None


class TrackerUpdate(BaseModel):
    stage: str | None = None
    note: str | None = None


def _serialize(t: dict) -> dict:
    return {
        "id": str(t["_id"]),
        "recruitment_slug": t["recruitment_slug"],
        "recruitment_name": t.get("recruitment_name"),
        "organization_code": t.get("organization_code"),
        "stage": t.get("stage", "notified"),
        "note": t.get("note"),
        "history": [
            {"stage": h["stage"], "at": iso(h["at"])} for h in t.get("history", [])
        ],
        "updated_at": iso(t.get("updated_at")),
        "created_at": iso(t.get("created_at")),
    }


@router.get("")
async def list_tracker(user: dict = Depends(get_current_user)):
    db = get_db()
    items = []
    async for t in db.tracker_items.find({"user_id": user["_id"]}).sort("updated_at", -1):
        items.append(_serialize(t))
    return {"items": items, "stages": STAGES}


@router.post("")
async def add_tracker(body: TrackerCreate, user: dict = Depends(get_current_user)):
    if body.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    db = get_db()
    rec = await db.recruitments.find_one({"slug": body.recruitment_slug})
    if not rec:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    existing = await db.tracker_items.find_one(
        {"user_id": user["_id"], "recruitment_slug": body.recruitment_slug}
    )
    if existing:
        return _serialize(existing)
    doc = {
        "user_id": user["_id"],
        "recruitment_slug": body.recruitment_slug,
        "recruitment_name": rec["name"],
        "organization_code": rec.get("organization_code"),
        "stage": body.stage,
        "note": body.note,
        "history": [{"stage": body.stage, "at": now_utc()}],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    result = await db.tracker_items.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.put("/{item_id}")
async def update_tracker(
    item_id: str, body: TrackerUpdate, user: dict = Depends(get_current_user)
):
    if body.stage is not None and body.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    db = get_db()
    try:
        oid = ObjectId(item_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid id") from e
    existing = await db.tracker_items.find_one({"_id": oid, "user_id": user["_id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Tracker item not found")

    updates = {"updated_at": now_utc()}
    if body.note is not None:
        updates["note"] = body.note
    if body.stage is not None and body.stage != existing.get("stage"):
        updates["stage"] = body.stage
        updates["history"] = existing.get("history", []) + [
            {"stage": body.stage, "at": now_utc()}
        ]
    await db.tracker_items.update_one({"_id": oid}, {"$set": updates})
    updated = await db.tracker_items.find_one({"_id": oid})
    return _serialize(updated)


@router.delete("/{item_id}")
async def delete_tracker(item_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        oid = ObjectId(item_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid id") from e
    result = await db.tracker_items.delete_one({"_id": oid, "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tracker item not found")
    return {"ok": True}
