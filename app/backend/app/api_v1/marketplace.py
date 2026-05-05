"""Marketplace: resources, providers, mentors, affiliates."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.server_deps import get_db

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.get("/resources")
async def resources(exam: str | None = Query(default=None), type: str | None = Query(default=None)):
    db = get_db()
    q: dict = {}
    if exam:
        q["exams"] = exam
    if type:
        q["type"] = type
    items = []
    async for r in db.resources.find(q):
        r.pop("_id", None)
        items.append(r)
    return {"items": items}


@router.get("/resources/{rid}")
async def resource_detail(rid: str):
    db = get_db()
    r = await db.resources.find_one({"id": rid})
    if not r:
        raise HTTPException(status_code=404, detail="Resource not found")
    r.pop("_id", None)
    r["curriculum"] = [
        {"module": "Foundations", "lessons": 6, "duration": "2h 20m"},
        {"module": "Practice drills", "lessons": 12, "duration": "4h 40m"},
        {"module": "Tests + review", "lessons": 4, "duration": "3h 00m"},
    ]
    r["reviews"] = [
        {"name": "A. Mehta", "rating": 5, "text": "Saved me 3 months. The drills are brutal in the best way."},
        {"name": "K. Das", "rating": 4, "text": "Good structure, wish there were more mock tests."},
    ]
    return r


@router.get("/mentors")
async def mentors(exam: str | None = Query(default=None)):
    db = get_db()
    q: dict = {}
    if exam:
        q["exams"] = exam
    items = []
    async for m in db.mentors.find(q):
        m.pop("_id", None)
        items.append(m)
    return {"items": items}


@router.get("/mentors/{mid}")
async def mentor_detail(mid: str):
    db = get_db()
    m = await db.mentors.find_one({"id": mid})
    if not m:
        raise HTTPException(status_code=404, detail="Mentor not found")
    m.pop("_id", None)
    m["availability"] = [
        {"day": "Wed", "slots": ["17:00", "18:00", "21:00"]},
        {"day": "Fri", "slots": ["07:00", "19:00"]},
        {"day": "Sat", "slots": ["10:00", "14:00", "16:00", "20:00"]},
    ]
    m["testimonials"] = [
        {"name": "R. Singh", "text": "Cleared mains in 2nd attempt. The feedback loop was clinical."},
        {"name": "M. Patel", "text": "Actionable, zero fluff."},
    ]
    return m


@router.get("/providers")
async def providers():
    db = get_db()
    items = []
    async for p in db.providers.find():
        p.pop("_id", None)
        items.append(p)
    return {"items": items}


@router.get("/affiliates")
async def affiliates():
    """Affiliate/partner listing — placeholder."""
    return {
        "items": [
            {"id": "moneycontrol-books", "name": "MoneyControl Books", "type": "Publisher", "commission": "12%"},
            {"id": "examlog-app", "name": "ExamLog App", "type": "App", "commission": "₹80 per install"},
            {"id": "paper-pencil", "name": "Paper & Pencil", "type": "Stationery", "commission": "5%"},
        ]
    }
