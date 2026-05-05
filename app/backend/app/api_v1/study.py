"""Study OS: plan, focus sessions, mock tests, subjects, weekly review."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.security import get_current_user, iso, now_utc
from app.server_deps import get_db

router = APIRouter(prefix="/study", tags=["study"])


# ------- Plan & Tasks -------

DEFAULT_PLAN = {
    "day": 41,
    "total_days": 90,
    "theme": "Arithmetic Sprint",
    "target": "SSC CGL Tier I · 10 June",
    "blocks": [
        {"time": "06:30–08:30", "title": "Quant · Arithmetic: Percentage & Ratio"},
        {"time": "08:45–09:30", "title": "Reading · Editorial + notes"},
        {"time": "14:00–15:00", "title": "Mock · SSC CGL Tier I · Set 42"},
        {"time": "15:15–16:00", "title": "Mock analysis · weakness log"},
        {"time": "19:00–20:00", "title": "Revision · Indian Polity Ch. 4"},
        {"time": "20:15–21:00", "title": "English · RC 2 passages"},
    ],
}


@router.get("/plan")
async def get_plan(user: dict = Depends(get_current_user)):
    db = get_db()
    today = now_utc().strftime("%Y-%m-%d")
    tasks = []
    async for t in db.study_tasks.find({"user_id": user["_id"], "date": today}):
        tasks.append(
            {
                "id": str(t["_id"]),
                "time": t.get("time"),
                "title": t.get("title"),
                "done": bool(t.get("done")),
            }
        )
    if not tasks:
        for i, b in enumerate(DEFAULT_PLAN["blocks"]):
            tasks.append({"id": f"seed-{i}", "time": b["time"], "title": b["title"], "done": i < 2})
    return {"plan": DEFAULT_PLAN, "tasks": tasks, "date": today}


class TaskToggle(BaseModel):
    task_id: str
    done: bool


@router.post("/plan/toggle")
async def toggle_task(body: TaskToggle, user: dict = Depends(get_current_user)):
    db = get_db()
    if body.task_id.startswith("seed-"):
        idx = int(body.task_id.split("-")[1])
        block = DEFAULT_PLAN["blocks"][idx]
        today = now_utc().strftime("%Y-%m-%d")
        await db.study_tasks.insert_one(
            {
                "user_id": user["_id"],
                "date": today,
                "time": block["time"],
                "title": block["title"],
                "done": body.done,
                "updated_at": now_utc(),
            }
        )
        return {"ok": True}
    try:
        oid = ObjectId(body.task_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Bad task id") from e
    await db.study_tasks.update_one(
        {"_id": oid, "user_id": user["_id"]},
        {"$set": {"done": body.done, "updated_at": now_utc()}},
    )
    return {"ok": True}


# ------- Focus sessions -------


class FocusStart(BaseModel):
    subject: str = Field(max_length=40)
    topic: str | None = Field(default=None, max_length=80)
    duration_min: int = Field(ge=5, le=240)


@router.post("/focus/start")
async def focus_start(body: FocusStart, user: dict = Depends(get_current_user)):
    db = get_db()
    doc = {
        "user_id": user["_id"],
        "subject": body.subject,
        "topic": body.topic,
        "planned_min": body.duration_min,
        "started_at": now_utc(),
        "completed": False,
    }
    res = await db.focus_sessions.insert_one(doc)
    return {"id": str(res.inserted_id), "started_at": iso(doc["started_at"])}


class FocusStop(BaseModel):
    id: str
    completed_min: int = Field(ge=0, le=500)
    focus_score: int | None = Field(default=None, ge=0, le=100)


@router.post("/focus/stop")
async def focus_stop(body: FocusStop, user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        oid = ObjectId(body.id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Bad id") from e
    sess = await db.focus_sessions.find_one({"_id": oid, "user_id": user["_id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.focus_sessions.update_one(
        {"_id": oid},
        {
            "$set": {
                "completed_min": body.completed_min,
                "focus_score": body.focus_score,
                "completed": True,
                "stopped_at": now_utc(),
            }
        },
    )
    return {"ok": True}


@router.get("/focus/summary")
async def focus_summary(user: dict = Depends(get_current_user)):
    db = get_db()
    since = now_utc() - timedelta(days=7)
    total_min = 0
    by_day: dict[str, float] = {}
    async for s in db.focus_sessions.find({"user_id": user["_id"], "started_at": {"$gte": since}}):
        mins = s.get("completed_min", 0) or 0
        total_min += mins
        d = s["started_at"].strftime("%a")
        by_day[d] = by_day.get(d, 0) + mins / 60
    order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    week = [{"d": d, "h": round(by_day.get(d, 0), 1)} for d in order]
    return {"total_hours_7d": round(total_min / 60, 1), "week": week}


# ------- Mock tests -------


class MockCreate(BaseModel):
    name: str = Field(max_length=80)
    exam_slug: str
    score: int = Field(ge=0, le=1000)
    max_score: int = Field(ge=1, le=1000)
    duration_min: int = Field(ge=1, le=480)
    attempted: int = Field(ge=0, le=500)
    correct: int = Field(ge=0, le=500)
    weak_topics: list[str] | None = None


@router.get("/mocks")
async def list_mocks(user: dict = Depends(get_current_user)):
    db = get_db()
    items = []
    async for m in db.mock_tests.find({"user_id": user["_id"]}).sort("created_at", -1):
        items.append(
            {
                "id": str(m["_id"]),
                "name": m["name"],
                "exam_slug": m["exam_slug"],
                "score": m["score"],
                "max_score": m["max_score"],
                "percentage": round(m["score"] / m["max_score"] * 100, 1),
                "duration_min": m["duration_min"],
                "attempted": m["attempted"],
                "correct": m["correct"],
                "weak_topics": m.get("weak_topics", []),
                "created_at": iso(m.get("created_at")),
            }
        )
    return {"items": items}


@router.post("/mocks")
async def add_mock(body: MockCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    doc = body.model_dump()
    doc["user_id"] = user["_id"]
    doc["created_at"] = now_utc()
    res = await db.mock_tests.insert_one(doc)
    return {"id": str(res.inserted_id)}


# ------- Subjects progress -------


@router.get("/subjects")
async def subjects(user: dict = Depends(get_current_user)):
    # deterministic placeholder per-user
    return {
        "items": [
            {"subject": "Quantitative Aptitude", "progress": 0.72, "hours": 42, "weak": ["DI graphs", "Geometry"]},
            {"subject": "Reasoning", "progress": 0.61, "hours": 28, "weak": ["Blood relations"]},
            {"subject": "English", "progress": 0.54, "hours": 22, "weak": ["Para-jumbles", "Cloze test"]},
            {"subject": "General Awareness", "progress": 0.39, "hours": 18, "weak": ["Economy", "Science & Tech"]},
            {"subject": "Current Affairs", "progress": 0.47, "hours": 14, "weak": ["International orgs"]},
        ]
    }


@router.get("/weekly-review")
async def weekly_review(user: dict = Depends(get_current_user)):
    return {
        "week_of": now_utc().strftime("%d %b %Y"),
        "hours_studied": 28.2,
        "hours_planned": 35,
        "adherence": 0.80,
        "mocks_taken": 3,
        "mock_trend": [62, 68, 74],
        "highlights": [
            "Closed 7 of 9 weak Quant topics",
            "Mock score trend +12 points (last 5)",
        ],
        "corrections": [
            "Revision backlog on Polity Ch. 4 — commit 2h Thursday",
            "Sleep dropped under 6h Thu/Fri — restore routine",
        ],
    }
