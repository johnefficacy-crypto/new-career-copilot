"""Admin / RBAC / audit / source registry / scraper / notifications / marketplace-admin.

Phase 1 = placeholders backed by Mongo for real interactions where possible.
Phase 2 will replace scraper + eligibility queue internals.
"""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.security import (
    hash_password,
    get_current_user,
    iso,
    now_utc,
    require_admin,
    require_super_admin,
    serialize_user,
)
from app.server_deps import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


async def _log(db, actor: dict, action: str, meta: dict | None = None) -> None:
    await db.audit_logs.insert_one(
        {
            "actor_id": actor["_id"],
            "actor_email": actor.get("email"),
            "actor_role": actor.get("role"),
            "action": action,
            "meta": meta or {},
            "created_at": now_utc(),
        }
    )


# -------- overview --------


@router.get("/overview", dependencies=[Depends(require_admin())])
async def overview():
    db = get_db()
    users_total = await db.users.count_documents({})
    users_pro = await db.users.count_documents({"plan": {"$in": ["pro", "elite"]}})
    recs_total = await db.recruitments.count_documents({})
    threads = await db.community_threads.count_documents({})
    mentor_bookings = await db.mentor_bookings.count_documents({})
    return {
        "kpis": [
            {"label": "Users", "value": users_total, "delta": "+12 / 7d", "tone": "emerald"},
            {"label": "Paid (Pro+Elite)", "value": users_pro, "delta": "conv. 4.2%", "tone": "clay"},
            {"label": "Recruitments", "value": recs_total, "delta": "+2 this week", "tone": "sage"},
            {"label": "Community threads", "value": threads, "delta": "24 replies/day", "tone": "dusk"},
            {"label": "Mentor bookings", "value": mentor_bookings, "delta": "₹42.8K GMV", "tone": "amber"},
            {"label": "Scraper health", "value": "OK", "delta": "Phase-2", "tone": "emerald"},
        ],
        "recent_audit": await _recent_audit(db, 8),
    }


async def _recent_audit(db, limit: int = 20) -> list[dict]:
    out = []
    async for a in db.audit_logs.find().sort("created_at", -1).limit(limit):
        out.append(
            {
                "id": str(a["_id"]),
                "actor_email": a.get("actor_email"),
                "action": a.get("action"),
                "created_at": iso(a.get("created_at")),
                "meta": a.get("meta"),
            }
        )
    return out


# -------- users / RBAC --------


@router.get("/users", dependencies=[Depends(require_admin())])
async def list_users():
    db = get_db()
    items = []
    async for u in db.users.find().sort("created_at", -1):
        items.append(serialize_user(u) | {"last_login_at": iso(u.get("last_login_at"))})
    return {"items": items}


class RoleUpdate(BaseModel):
    role: str = Field(pattern="^(user|mentor|admin|super_admin)$")


@router.put("/users/{user_id}/role")
async def set_role(
    user_id: str,
    body: RoleUpdate,
    actor: dict = Depends(require_super_admin()),
):
    db = get_db()
    try:
        oid = ObjectId(user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid id") from e
    await db.users.update_one({"_id": oid}, {"$set": {"role": body.role}})
    await _log(db, actor, "user.role.update", {"user_id": user_id, "role": body.role})
    return {"ok": True}


class AdminCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="admin", pattern="^(admin|mentor)$")
    scope: list[str] = Field(default_factory=list)  # e.g. ["scraper", "content"]


@router.post("/users/create", dependencies=[Depends(require_super_admin())])
async def create_admin(body: AdminCreate, actor: dict = Depends(require_super_admin())):
    db = get_db()
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already exists")
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": body.role,
        "scope": body.scope,
        "onboarded": True,
        "plan": "elite",
        "created_at": now_utc(),
    }
    res = await db.users.insert_one(doc)
    await _log(db, actor, "user.admin.create", {"email": email, "role": body.role, "scope": body.scope})
    return {"id": str(res.inserted_id), "email": email, "role": body.role}


# -------- audit --------


@router.get("/audit", dependencies=[Depends(require_admin())])
async def audit(limit: int = 100):
    db = get_db()
    return {"items": await _recent_audit(db, min(limit, 500))}


# -------- source registry (placeholder) --------

DEFAULT_SOURCES = [
    {"id": "ssc-gov-in", "org": "SSC", "url": "https://ssc.gov.in/notice-board", "kind": "official", "trust": "A", "last_run": "3h ago", "status": "ok"},
    {"id": "rbi-org-in", "org": "RBI", "url": "https://rbi.org.in/Scripts/Career.aspx", "kind": "official", "trust": "A", "last_run": "1h ago", "status": "ok"},
    {"id": "ibps-in", "org": "IBPS", "url": "https://ibps.in/", "kind": "official", "trust": "A", "last_run": "4h ago", "status": "warn"},
    {"id": "upsc-gov-in", "org": "UPSC", "url": "https://upsc.gov.in/examinations", "kind": "official", "trust": "A", "last_run": "6h ago", "status": "ok"},
    {"id": "rrb-cdg", "org": "RRB", "url": "https://rrbcdg.gov.in/", "kind": "official", "trust": "A", "last_run": "9h ago", "status": "ok"},
]


@router.get("/sources", dependencies=[Depends(require_admin())])
async def sources():
    return {"items": DEFAULT_SOURCES}


# -------- eligibility queue (placeholder) --------


@router.get("/eligibility-queue", dependencies=[Depends(require_admin())])
async def eligibility_queue():
    return {
        "pending": [
            {"slug": "ssc-cgl-2026-po-2", "recruitment": "SSC CGL 2026 · Assistant Audit Officer", "added": "2h ago", "confidence": 0.74},
            {"slug": "ibps-po-xv-special", "recruitment": "IBPS PO XV · Specialist stream", "added": "5h ago", "confidence": 0.62},
        ],
        "promoted_24h": 11,
        "rejected_24h": 2,
    }


# -------- scraper monitor (placeholder) --------


@router.get("/scraper/runs", dependencies=[Depends(require_admin())])
async def scraper_runs():
    return {
        "items": [
            {"id": "run-914", "source": "ssc-gov-in", "at": "2h ago", "status": "ok", "items_seen": 42, "items_new": 3, "mode": "scheduled"},
            {"id": "run-913", "source": "rbi-org-in", "at": "3h ago", "status": "ok", "items_seen": 18, "items_new": 1, "mode": "scheduled"},
            {"id": "run-912", "source": "ibps-in", "at": "5h ago", "status": "warn", "items_seen": 0, "items_new": 0, "mode": "scheduled"},
            {"id": "run-911", "source": "upsc-gov-in", "at": "9h ago", "status": "ok", "items_seen": 12, "items_new": 0, "mode": "scheduled"},
        ]
    }


# -------- notifications (placeholder) --------


class NotifyToggle(BaseModel):
    channel: str  # deadline | new_match | community | digest
    enabled: bool


@router.get("/notifications", dependencies=[Depends(require_admin())])
async def notif_center():
    return {
        "channels": [
            {"channel": "deadline", "enabled": True, "last_sent": "Yesterday · 09:00", "rate_limit": "1/day"},
            {"channel": "new_match", "enabled": True, "last_sent": "Today · 07:14", "rate_limit": "burst 5/hr"},
            {"channel": "community", "enabled": False, "last_sent": "—", "rate_limit": "manual"},
            {"channel": "digest", "enabled": True, "last_sent": "Sun · 18:00", "rate_limit": "weekly"},
        ],
        "kill_switch": False,
    }


@router.post("/notifications/toggle")
async def notif_toggle(body: NotifyToggle, actor: dict = Depends(require_admin())):
    db = get_db()
    await _log(db, actor, "notif.toggle", {"channel": body.channel, "enabled": body.enabled})
    return {"ok": True}


# -------- marketplace admin --------


@router.get("/marketplace", dependencies=[Depends(require_admin())])
async def marketplace_admin():
    db = get_db()
    resources = await db.resources.count_documents({})
    mentors = await db.mentors.count_documents({})
    providers = await db.providers.count_documents({})
    return {
        "counts": {"resources": resources, "mentors": mentors, "providers": providers},
        "flags": [
            {"id": "flag-1", "kind": "dispute", "target": "rbi-interview-prep", "raised": "12h ago"},
        ],
    }


# -------- community moderation --------


@router.get("/community/flags", dependencies=[Depends(require_admin())])
async def community_flags():
    return {
        "items": [
            {"id": "flag-a", "thread": "dealing-with-study-burnout", "reason": "spam link", "raised": "3h ago"},
            {"id": "flag-b", "thread": "ibps-po-cutoff-trend-2021-2025", "reason": "misleading", "raised": "1d ago"},
        ]
    }


# -------- AI policy --------


@router.get("/ai-policy", dependencies=[Depends(require_admin())])
async def ai_policy():
    return {
        "rules": [
            {"id": "no-override", "rule": "AI never overrides deterministic eligibility verdicts.", "enabled": True},
            {"id": "quote-official", "rule": "AI must quote official notification clauses for any eligibility explanation.", "enabled": True},
            {"id": "no-predictions", "rule": "AI must not predict cutoffs as certain values.", "enabled": True},
        ],
        "model": "scripted · Phase 1",
        "swap_target": "Claude Sonnet · Phase 2",
    }
