"""Phase-1 placeholder routers.

The frontend ships ~25 screens that call ~45 API endpoints. The original
implementation backed those endpoints with MongoDB collections. Phase 1.5
removed MongoDB; until each surface is properly wired to Supabase/Postgres
in Phase 2, we keep the screens navigable by serving deterministic
static/in-memory data here.

Nothing in this module talks to Mongo. Anything that mutates state lives
in a per-process in-memory store keyed by Supabase user id. This is safe
because every endpoint here is non-canonical.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user, get_optional_user, require_permission


# ───────────────────────────── Static seed data ─────────────────────────────

RECRUITMENTS: list[dict[str, Any]] = [
    {
        "slug": "ssc-cgl-2026",
        "name": "SSC CGL 2026",
        "organization": "Staff Selection Commission",
        "organization_code": "SSC",
        "type": "Central Govt",
        "stage": "apply",
        "status": "eligible",
        "apply_window": {"open": "2026-04-18", "close": "2026-05-17"},
        "exam_dates": {"tier_1": "2026-06-02", "tier_2": "2026-08-12"},
        "posts_total": 21,
        "posts_matched": 17,
        "vacancies": 17727,
        "min_age": 18,
        "max_age": 32,
        "min_qualification": "Bachelor's degree",
        "notification_url": "https://ssc.gov.in/",
        "summary": "Gateway to 17,000+ Group-B/C posts across central ministries.",
        "official_verified": True,
        "pay_band": "₹35,400 – ₹1,12,400",
        "exam_pattern": [
            "Tier I — 60 min CBT, 100 Qs",
            "Tier II — 150 min CBT, Quant + English + GA",
            "Document verification & skill test",
        ],
        "syllabus_snapshot": ["Quantitative Aptitude", "General Awareness", "English", "Reasoning"],
    },
    {
        "slug": "ibps-po-xv",
        "name": "IBPS PO XV",
        "organization": "Institute of Banking Personnel Selection",
        "organization_code": "IBPS",
        "type": "Banking",
        "stage": "prelims",
        "status": "urgent",
        "apply_window": {"open": "2026-03-12", "close": "2026-04-08"},
        "exam_dates": {"prelims": "2026-05-04", "mains": "2026-06-28"},
        "posts_total": 3,
        "posts_matched": 3,
        "vacancies": 4455,
        "min_age": 20,
        "max_age": 30,
        "min_qualification": "Bachelor's degree",
        "notification_url": "https://ibps.in/",
        "summary": "Probationary Officer recruitment across 11 participating banks.",
        "official_verified": True,
        "pay_band": "₹36,000 – ₹63,840",
        "exam_pattern": ["Prelims 60min", "Mains 200min + Descriptive", "Interview"],
        "syllabus_snapshot": ["Quant", "Reasoning", "English", "GA + BA"],
    },
    {
        "slug": "rbi-grade-b-2026",
        "name": "RBI Grade B 2026",
        "organization": "Reserve Bank of India",
        "organization_code": "RBI",
        "type": "Banking",
        "stage": "notification",
        "status": "conditional",
        "apply_window": {"open": "2026-04-28", "close": "2026-05-26"},
        "exam_dates": {"phase_1": "2026-06-15", "phase_2": "2026-07-20"},
        "posts_total": 4,
        "posts_matched": 2,
        "vacancies": 222,
        "min_age": 21,
        "max_age": 30,
        "min_qualification": "Bachelor's degree (60% aggregate)",
        "notification_url": "https://rbi.org.in/",
        "summary": "Officer recruitment for India's central bank — DEPR/DSIM/General.",
        "official_verified": True,
        "pay_band": "₹55,200 – ₹99,750",
        "exam_pattern": ["Phase I Objective 200", "Phase II Objective + Descriptive", "Interview"],
        "syllabus_snapshot": ["ESI", "F&M", "English Descriptive", "Quant+Reasoning"],
    },
    {
        "slug": "upsc-cse-2026",
        "name": "UPSC CSE 2026",
        "organization": "Union Public Service Commission",
        "organization_code": "UPSC",
        "type": "Central Govt",
        "stage": "notification",
        "status": "eligible",
        "apply_window": {"open": "2026-02-14", "close": "2026-03-05"},
        "exam_dates": {"prelims": "2026-05-31", "mains": "2026-09-20"},
        "posts_total": 1,
        "posts_matched": 1,
        "vacancies": 1056,
        "min_age": 21,
        "max_age": 32,
        "min_qualification": "Bachelor's degree",
        "notification_url": "https://upsc.gov.in/",
        "summary": "Civil services & allied services (IAS/IPS/IFS).",
        "official_verified": True,
        "pay_band": "₹56,100 – ₹2,50,000",
        "exam_pattern": ["Prelims (GS+CSAT)", "Mains 9 papers", "Interview"],
        "syllabus_snapshot": ["GS I-IV", "Optional subject", "Essay", "CSAT"],
    },
    {
        "slug": "sbi-clerk-2026",
        "name": "SBI Clerk 2026",
        "organization": "State Bank of India",
        "organization_code": "SBI",
        "type": "Banking",
        "stage": "notification",
        "status": "eligible",
        "apply_window": {"open": "2026-04-22", "close": "2026-05-18"},
        "exam_dates": {"prelims": "2026-06-06", "mains": "2026-07-14"},
        "posts_total": 5,
        "posts_matched": 5,
        "vacancies": 8773,
        "min_age": 20,
        "max_age": 28,
        "min_qualification": "Graduation in any discipline",
        "notification_url": "https://sbi.co.in/",
        "summary": "Junior Associate (Customer Support & Sales) recruitment.",
        "official_verified": True,
        "pay_band": "₹19,900 – ₹47,920",
        "exam_pattern": ["Prelims 60min", "Mains 160min"],
        "syllabus_snapshot": ["English", "Quant", "Reasoning", "GA"],
    },
    {
        "slug": "railway-ntpc-2026",
        "name": "Railway NTPC 2026",
        "organization": "Railway Recruitment Board",
        "organization_code": "RRB",
        "type": "Railways",
        "stage": "apply",
        "status": "eligible",
        "apply_window": {"open": "2026-04-05", "close": "2026-05-04"},
        "exam_dates": {"cbt_1": "2026-07-18"},
        "posts_total": 8,
        "posts_matched": 6,
        "vacancies": 11558,
        "min_age": 18,
        "max_age": 36,
        "min_qualification": "Class 12 / Graduation by post",
        "notification_url": "https://rrbcdg.gov.in/",
        "summary": "Non-Technical Popular Categories — station master, clerks, traffic asst.",
        "official_verified": True,
        "pay_band": "₹19,900 – ₹35,400",
        "exam_pattern": ["CBT 1", "CBT 2", "Typing / Aptitude test", "Document verification"],
        "syllabus_snapshot": ["Maths", "Reasoning", "GA"],
    },
]

COMMUNITY_CATEGORIES = [
    {"id": "official-updates", "label": "Official updates", "count": 14, "admin_only": True, "description": "Canonical notifications posted by moderators."},
    {"id": "form-help", "label": "Form help", "count": 42, "description": "Help filling applications, uploads, payments."},
    {"id": "preparation", "label": "Preparation", "count": 189, "description": "Strategy, time-tables, topic closure, book reviews."},
    {"id": "pyq-discussion", "label": "PYQ discussion", "count": 76, "description": "Breakdown of previous year questions."},
    {"id": "cutoffs-results", "label": "Cutoffs & results", "count": 31, "description": "Category-wise cutoffs, result tracking."},
    {"id": "mental-game", "label": "Mental game", "count": 58, "description": "Burnout, focus, routines, sleep — the invisible battle."},
]

COMMUNITY_THREADS_SEED = [
    {"slug": "ssc-cgl-2026-notification-released", "category": "official-updates", "title": "SSC CGL 2026 notification released · apply window 18 Apr – 17 May", "author": "Career Copilot", "badge": "Admin", "pinned": True, "body": "Official notification is live on ssc.nic.in. We've parsed post-wise eligibility and it's now visible under your matched recruitments. Apply window closes 17 May.", "votes": 482, "replies_count": 67, "tag": "Official"},
    {"slug": "quant-110-to-168-in-6-weeks", "category": "preparation", "title": "How I jumped from 110 to 168 in Quant in 6 weeks", "author": "Rahul V.", "badge": "Verified Topper", "body": "Three compounding habits: topic closure, 20-question daily sprint, weekly error log review. Happy to answer questions.", "votes": 214, "replies_count": 48, "tag": "Strategy"},
    {"slug": "form-mistake-signature-photo", "category": "form-help", "title": "Is my form rejected if I uploaded signature twice by mistake?", "author": "Aanya S.", "body": "Accidentally uploaded signature in the photo slot too. Will it be rejected? Can I edit?", "votes": 38, "replies_count": 22, "tag": "Question"},
    {"slug": "ibps-po-cutoff-trend-2021-2025", "category": "cutoffs-results", "title": "IBPS PO Prelims 2021 → 2025 category-wise cutoff trend", "author": "Nikhil T.", "body": "Compiled from official PDFs — General down, OBC flat. Breakdown inside.", "votes": 167, "replies_count": 34, "tag": "Resource"},
    {"slug": "dealing-with-study-burnout", "category": "mental-game", "title": "Hitting a wall at day 60 — how did you get past it?", "author": "Meera K.", "body": "Felt flat the last four days. Looking for routines that helped others reboot.", "votes": 78, "replies_count": 26, "tag": "Discussion"},
]

RESOURCES = [
    {"id": "quant-blueprint", "title": "Quant Blueprint 2.0", "provider": "Sarthak Gupta", "type": "course", "price": 1499, "rating": 4.8, "students": 12420, "exams": ["ssc-cgl-2026", "ibps-po-xv"], "cover": "#F9E5D1"},
    {"id": "polity-mnemonic-deck", "title": "Polity Mnemonic Deck", "provider": "Acharya Roy", "type": "flashcards", "price": 299, "rating": 4.9, "students": 6700, "exams": ["upsc-cse-2026"], "cover": "#E7EFE6"},
    {"id": "rbi-interview-prep", "title": "RBI Interview Command Prep", "provider": "Ex-RBI Pani­kar", "type": "mentorship", "price": 4999, "rating": 5.0, "students": 280, "exams": ["rbi-grade-b-2026"], "cover": "#EDE5F2"},
    {"id": "english-compounds", "title": "English Compound Sentences Drill", "provider": "Anya Mathur", "type": "practice-pack", "price": 599, "rating": 4.6, "students": 3300, "exams": ["ibps-po-xv", "sbi-clerk-2026"], "cover": "#F2EBE1"},
]

MENTORS = [
    {"id": "rohan-iyer", "name": "Rohan Iyer", "headline": "Ex-RBI Grade B · interview specialist", "price_per_hour": 2499, "rating": 4.9, "sessions": 134, "exams": ["rbi-grade-b-2026"], "languages": ["English", "Hindi"], "bio": "Cleared RBI Grade B 2018, served 3 years before mentoring full-time."},
    {"id": "priyanka-desai", "name": "Priyanka Desai", "headline": "AIR 42 UPSC CSE 2022 · answer writing", "price_per_hour": 3499, "rating": 5.0, "sessions": 88, "exams": ["upsc-cse-2026"], "languages": ["English"], "bio": "IRS officer. Focus: Mains answer architecture and essay framing."},
    {"id": "sandeep-reddy", "name": "Sandeep Reddy", "headline": "SSC CGL Quant trainer · topper of '19", "price_per_hour": 999, "rating": 4.7, "sessions": 412, "exams": ["ssc-cgl-2026"], "languages": ["English", "Telugu"], "bio": "Trained 8000+ students. Focus: shortcut-free accuracy building."},
    {"id": "fatima-ahmed", "name": "Fatima Ahmed", "headline": "IBPS PO · working CM with 6yr ops", "price_per_hour": 1499, "rating": 4.8, "sessions": 176, "exams": ["ibps-po-xv", "sbi-clerk-2026"], "languages": ["English", "Urdu"], "bio": "Mains strategy + banking awareness without bloat."},
]

PROVIDERS = [
    {"id": "sarthak-gupta", "name": "Sarthak Gupta", "type": "Individual", "courses": 4, "rating": 4.8, "exams": ["ssc-cgl-2026", "ibps-po-xv"]},
    {"id": "acharya-roy", "name": "Acharya Roy", "type": "Individual", "courses": 2, "rating": 4.9, "exams": ["upsc-cse-2026"]},
    {"id": "bankers-den", "name": "Bankers Den", "type": "Institute", "courses": 11, "rating": 4.5, "exams": ["ibps-po-xv", "sbi-clerk-2026", "rbi-grade-b-2026"]},
]

AFFILIATES = [
    {"id": "moneycontrol-books", "name": "MoneyControl Books", "type": "Publisher", "commission": "12%"},
    {"id": "examlog-app", "name": "ExamLog App", "type": "App", "commission": "₹80 per install"},
    {"id": "paper-pencil", "name": "Paper & Pencil", "type": "Stationery", "commission": "5%"},
]

# ─────────────────────── In-memory per-user state ───────────────────────────

_now = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731

# user_id -> set of recruitment slugs
_saved: dict[str, set[str]] = defaultdict(set)
# user_id -> list of tracker items
_tracker: dict[str, list[dict]] = defaultdict(list)
# user_id -> list of focus session dicts
_focus_sessions: dict[str, list[dict]] = defaultdict(list)
_focus_active: dict[str, dict | None] = defaultdict(lambda: None)
# user_id -> list of mock-test logs
_mocks: dict[str, list[dict]] = defaultdict(list)
# user_id -> profile patch (separate from auth metadata)
_profile_extras: dict[str, dict] = defaultdict(dict)
# Threads (created at runtime). Seeded once.
_threads: dict[str, dict] = {t["slug"]: dict(t, created_at=_now()) for t in COMMUNITY_THREADS_SEED}
_thread_posts: dict[str, list[dict]] = defaultdict(list)
_thread_votes: dict[str, set[str]] = defaultdict(set)  # slug -> set(user_id)
# Group/partner state
_group_members: dict[str, set[str]] = defaultdict(set)
_partner_requests: dict[str, list[str]] = defaultdict(list)
# Mentor bookings
_mentor_bookings: dict[str, list[dict]] = defaultdict(list)
# AI chat history
_ai_history: dict[str, list[dict]] = defaultdict(list)


# ───────────────────────────── Recruitments ─────────────────────────────────

router_recruitments = APIRouter(prefix="/recruitments", tags=["recruitments"])


def _annotate(rec: dict, user_id: str | None) -> dict:
    out = dict(rec)
    out["saved"] = bool(user_id and rec["slug"] in _saved[user_id])
    return out


@router_recruitments.get("")
async def list_recruitments(
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user: dict | None = Depends(get_optional_user),
):
    items = list(RECRUITMENTS)
    if status and status != "all":
        items = [r for r in items if r["status"] == status]
    if q:
        ql = q.lower()
        items = [r for r in items if ql in r["name"].lower() or ql in r["organization"].lower()]
    uid = user["id"] if user else None
    items = [_annotate(r, uid) for r in items]
    counts = {
        "all": len(RECRUITMENTS),
        "eligible": sum(1 for r in RECRUITMENTS if r["status"] == "eligible"),
        "urgent": sum(1 for r in RECRUITMENTS if r["status"] == "urgent"),
        "conditional": sum(1 for r in RECRUITMENTS if r["status"] == "conditional"),
    }
    return {"items": items, "counts": counts}


@router_recruitments.get("/saved")
async def saved_recruitments(user: dict = Depends(get_current_user)):
    slugs = _saved[user["id"]]
    items = [_annotate(r, user["id"]) for r in RECRUITMENTS if r["slug"] in slugs]
    return {"items": items}


@router_recruitments.post("/{slug}/save")
async def toggle_save(slug: str, user: dict = Depends(get_current_user)):
    rec = next((r for r in RECRUITMENTS if r["slug"] == slug), None)
    if not rec:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    saved = _saved[user["id"]]
    if slug in saved:
        saved.discard(slug)
        return {"saved": False}
    saved.add(slug)
    return {"saved": True}


@router_recruitments.get("/{slug}")
async def get_recruitment(slug: str, user: dict | None = Depends(get_optional_user)):
    rec = next((r for r in RECRUITMENTS if r["slug"] == slug), None)
    if not rec:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    out = _annotate(rec, user["id"] if user else None)
    out["eligibility_preview"] = {
        "verdict": rec.get("status", "pending"),
        "matched_posts": rec.get("posts_matched", 0),
        "total_posts": rec.get("posts_total", 0),
        "reasons": [
            {"field": "age", "ok": True, "note": f"Within {rec.get('min_age', 18)}–{rec.get('max_age', 32)}"},
            {"field": "qualification", "ok": True, "note": rec.get("min_qualification", "Graduate")},
            {"field": "category", "ok": True, "note": "Category window satisfied"},
        ],
        "computed_at": None,
        "source": "placeholder · phase-1.5",
    }
    return out


# ───────────────────────────── Profile ─────────────────────────────────────

router_profile = APIRouter(prefix="/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    category: str | None = None
    gender: str | None = None
    state: str | None = None
    date_of_birth: str | None = None
    qualification: str | None = None
    qualification_year: int | None = Field(default=None, ge=1990, le=2035)
    percentage: float | None = Field(default=None, ge=0, le=100)
    goal_exams: list[str] | None = None
    target_exam_year: int | None = Field(default=None, ge=2025, le=2035)
    weekly_hours_goal: float | None = Field(default=None, ge=0, le=80)
    onboarded: bool | None = None


@router_profile.get("/me")
async def get_profile(user: dict = Depends(get_current_user)):
    out = dict(user)
    out["profile"] = _profile_extras.get(user["id"], {})
    return out


@router_profile.put("/me")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    _profile_extras[user["id"]].update(patch)
    out = dict(user)
    out["profile"] = _profile_extras[user["id"]]
    return out


# ───────────────────────────── Tracker ─────────────────────────────────────

router_tracker = APIRouter(prefix="/tracker", tags=["tracker"])


class TrackerCreate(BaseModel):
    recruitment_slug: str
    stage: str = "saved"
    note: str | None = None


@router_tracker.get("")
async def list_tracker(user: dict = Depends(get_current_user)):
    return {"items": _tracker[user["id"]]}


@router_tracker.post("")
async def add_tracker(body: TrackerCreate, user: dict = Depends(get_current_user)):
    item = {
        "id": f"trk-{len(_tracker[user['id']]) + 1}",
        "recruitment_slug": body.recruitment_slug,
        "stage": body.stage,
        "note": body.note,
        "created_at": _now(),
    }
    _tracker[user["id"]].append(item)
    return item


@router_tracker.put("/{item_id}")
async def update_tracker(item_id: str, body: TrackerCreate, user: dict = Depends(get_current_user)):
    for it in _tracker[user["id"]]:
        if it["id"] == item_id:
            it.update(body.model_dump(exclude_none=True))
            it["updated_at"] = _now()
            return it
    raise HTTPException(status_code=404, detail="Tracker item not found")


@router_tracker.delete("/{item_id}")
async def delete_tracker(item_id: str, user: dict = Depends(get_current_user)):
    items = _tracker[user["id"]]
    _tracker[user["id"]] = [it for it in items if it["id"] != item_id]
    return {"ok": True}


# ───────────────────────────── Community ───────────────────────────────────

router_community = APIRouter(prefix="/community", tags=["community"])


def _thread_view(t: dict, with_body: bool = False) -> dict:
    out = {
        "id": t["slug"],
        "slug": t["slug"],
        "category": t["category"],
        "title": t["title"],
        "author": t.get("author", "Anonymous"),
        "badge": t.get("badge"),
        "pinned": bool(t.get("pinned")),
        "votes": t.get("votes", 0),
        "replies_count": t.get("replies_count", 0),
        "tag": t.get("tag"),
        "created_at": t.get("created_at"),
    }
    if with_body:
        out["body"] = t.get("body", "")
    else:
        body = t.get("body", "")
        out["excerpt"] = body if len(body) < 200 else body[:200] + "…"
    return out


@router_community.get("/categories")
async def categories():
    return {"items": COMMUNITY_CATEGORIES}


@router_community.get("/threads")
async def list_threads(
    category: str | None = Query(default=None),
    sort: str = Query(default="hot"),
):
    items = list(_threads.values())
    if category:
        items = [t for t in items if t["category"] == category]
    if sort == "new":
        items.sort(key=lambda t: (not t.get("pinned"), t.get("created_at", "")), reverse=True)
    elif sort == "unanswered":
        items = [t for t in items if t.get("replies_count", 0) == 0]
    else:
        items.sort(key=lambda t: (not t.get("pinned"), -t.get("votes", 0)))
    return {"items": [_thread_view(t) for t in items]}


@router_community.get("/threads/{slug}")
async def thread_detail(slug: str):
    t = _threads.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"thread": _thread_view(t, with_body=True), "posts": _thread_posts[slug]}


class ThreadCreate(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    category: str
    body: str = Field(min_length=10, max_length=4000)
    tag: str | None = Field(default="Discussion", max_length=24)


class PostCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


def _slugify(s: str) -> str:
    import re
    import time

    base = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]
    return f"{base}-{int(time.time())}"


@router_community.post("/threads")
async def create_thread(body: ThreadCreate, user: dict = Depends(get_current_user)):
    cat = next((c for c in COMMUNITY_CATEGORIES if c["id"] == body.category), None)
    if not cat:
        raise HTTPException(status_code=400, detail="Invalid category")
    if cat.get("admin_only") and user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Category is admin-only")
    slug = _slugify(body.title)
    doc = {
        "slug": slug,
        "title": body.title.strip(),
        "category": body.category,
        "body": body.body,
        "author": user.get("name") or user.get("email") or "Anonymous",
        "author_id": user["id"],
        "badge": {"mentor": "Mentor", "admin": "Admin", "super_admin": "Admin"}.get(user.get("role")),
        "tag": body.tag or "Discussion",
        "votes": 0,
        "replies_count": 0,
        "pinned": False,
        "created_at": _now(),
    }
    _threads[slug] = doc
    return _thread_view(doc, with_body=True)


@router_community.post("/threads/{slug}/posts")
async def add_post(slug: str, body: PostCreate, user: dict = Depends(get_current_user)):
    t = _threads.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    post = {
        "id": f"post-{len(_thread_posts[slug]) + 1}",
        "author": user.get("name") or user.get("email") or "Anonymous",
        "body": body.body,
        "votes": 0,
        "created_at": _now(),
        "accepted": False,
    }
    _thread_posts[slug].append(post)
    t["replies_count"] = t.get("replies_count", 0) + 1
    return post


@router_community.post("/threads/{slug}/vote")
async def vote_thread(slug: str, user: dict = Depends(get_current_user)):
    t = _threads.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    voters = _thread_votes[slug]
    uid = user["id"]
    if uid in voters:
        voters.discard(uid)
        t["votes"] = max(0, t.get("votes", 0) - 1)
        return {"voted": False}
    voters.add(uid)
    t["votes"] = t.get("votes", 0) + 1
    return {"voted": True}


# ───────────────────────────── Marketplace ─────────────────────────────────

router_marketplace = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router_marketplace.get("/resources")
async def list_resources(
    exam: str | None = Query(default=None),
    type: str | None = Query(default=None),
):
    items = list(RESOURCES)
    if exam:
        items = [r for r in items if exam in r.get("exams", [])]
    if type:
        items = [r for r in items if r.get("type") == type]
    return {"items": items}


@router_marketplace.get("/resources/{rid}")
async def resource_detail(rid: str):
    r = next((x for x in RESOURCES if x["id"] == rid), None)
    if not r:
        raise HTTPException(status_code=404, detail="Resource not found")
    out = dict(r)
    out["curriculum"] = [
        {"module": "Foundations", "lessons": 6, "duration": "2h 20m"},
        {"module": "Practice drills", "lessons": 12, "duration": "4h 40m"},
        {"module": "Tests + review", "lessons": 4, "duration": "3h 00m"},
    ]
    out["reviews"] = [
        {"name": "A. Mehta", "rating": 5, "text": "Saved me 3 months. The drills are brutal in the best way."},
        {"name": "K. Das", "rating": 4, "text": "Good structure, wish there were more mock tests."},
    ]
    return out


@router_marketplace.get("/mentors")
async def list_mentors(exam: str | None = Query(default=None)):
    items = list(MENTORS)
    if exam:
        items = [m for m in items if exam in m.get("exams", [])]
    return {"items": items}


@router_marketplace.get("/mentors/{mid}")
async def mentor_detail(mid: str):
    m = next((x for x in MENTORS if x["id"] == mid), None)
    if not m:
        raise HTTPException(status_code=404, detail="Mentor not found")
    out = dict(m)
    out["availability"] = [
        {"day": "Wed", "slots": ["17:00", "18:00", "21:00"]},
        {"day": "Fri", "slots": ["07:00", "19:00"]},
        {"day": "Sat", "slots": ["10:00", "14:00", "16:00", "20:00"]},
    ]
    out["testimonials"] = [
        {"name": "R. Singh", "text": "Cleared mains in 2nd attempt. The feedback loop was clinical."},
        {"name": "M. Patel", "text": "Actionable, zero fluff."},
    ]
    return out


@router_marketplace.get("/providers")
async def providers():
    return {"items": PROVIDERS}


@router_marketplace.get("/affiliates")
async def affiliates():
    return {"items": AFFILIATES}


# ───────────────────────────── Study OS ─────────────────────────────────────

router_study = APIRouter(prefix="/study", tags=["study"])


PLAN_TEMPLATE = [
    {"day": "Mon", "tasks": [
        {"id": "mon-1", "title": "Quant — Time & Work drill", "duration": 45, "done": False},
        {"id": "mon-2", "title": "GA — Polity revision", "duration": 30, "done": False},
        {"id": "mon-3", "title": "English — RC 2 sets", "duration": 30, "done": False},
    ]},
    {"day": "Tue", "tasks": [
        {"id": "tue-1", "title": "Quant — Mensuration", "duration": 60, "done": False},
        {"id": "tue-2", "title": "Reasoning — Puzzles", "duration": 45, "done": False},
    ]},
    {"day": "Wed", "tasks": [
        {"id": "wed-1", "title": "Mock test (sectional)", "duration": 90, "done": False},
        {"id": "wed-2", "title": "Error log review", "duration": 30, "done": False},
    ]},
    {"day": "Thu", "tasks": [
        {"id": "thu-1", "title": "GA — current affairs week", "duration": 45, "done": False},
        {"id": "thu-2", "title": "English — Cloze + Para", "duration": 30, "done": False},
    ]},
    {"day": "Fri", "tasks": [
        {"id": "fri-1", "title": "Quant — DI sets", "duration": 60, "done": False},
        {"id": "fri-2", "title": "Reasoning — Coding", "duration": 30, "done": False},
    ]},
    {"day": "Sat", "tasks": [
        {"id": "sat-1", "title": "Full-length mock", "duration": 180, "done": False},
        {"id": "sat-2", "title": "Mock review", "duration": 60, "done": False},
    ]},
    {"day": "Sun", "tasks": [
        {"id": "sun-1", "title": "Weekly truth panel", "duration": 30, "done": False},
        {"id": "sun-2", "title": "Plan next week", "duration": 30, "done": False},
    ]},
]

_user_plans: dict[str, list[dict]] = defaultdict(lambda: [dict(d, tasks=[dict(t) for t in d["tasks"]]) for d in PLAN_TEMPLATE])


@router_study.get("/plan")
async def get_plan(user: dict = Depends(get_current_user)):
    return {"days": _user_plans[user["id"]]}


class PlanToggle(BaseModel):
    task_id: str


@router_study.post("/plan/toggle")
async def toggle_task(body: PlanToggle, user: dict = Depends(get_current_user)):
    plan = _user_plans[user["id"]]
    for day in plan:
        for t in day["tasks"]:
            if t["id"] == body.task_id:
                t["done"] = not t.get("done", False)
                return t
    raise HTTPException(status_code=404, detail="Task not found")


class FocusStart(BaseModel):
    duration_minutes: int = Field(default=25, ge=5, le=180)
    label: str | None = None


@router_study.post("/focus/start")
async def focus_start(body: FocusStart, user: dict = Depends(get_current_user)):
    session = {
        "id": f"focus-{len(_focus_sessions[user['id']]) + 1}",
        "start": _now(),
        "duration_minutes": body.duration_minutes,
        "label": body.label or "Focus block",
        "status": "running",
    }
    _focus_active[user["id"]] = session
    return session


@router_study.post("/focus/stop")
async def focus_stop(user: dict = Depends(get_current_user)):
    active = _focus_active.get(user["id"])
    if not active:
        raise HTTPException(status_code=400, detail="No active session")
    active["status"] = "completed"
    active["end"] = _now()
    _focus_sessions[user["id"]].append(active)
    _focus_active[user["id"]] = None
    return active


@router_study.get("/focus/summary")
async def focus_summary(user: dict = Depends(get_current_user)):
    sessions = _focus_sessions[user["id"]]
    total_minutes = sum(s.get("duration_minutes", 0) for s in sessions)
    return {
        "active": _focus_active.get(user["id"]),
        "completed": sessions[-10:],
        "total_minutes": total_minutes,
        "streak_days": min(7, len(sessions)),
    }


# Mocks endpoints moved to app.api.study_os (production-grade, Supabase-backed).


@router_study.get("/subjects")
async def subjects(user: dict = Depends(get_current_user)):
    return {
        "items": [
            {"subject": "Quantitative Aptitude", "progress": 62, "trend": "up"},
            {"subject": "English Language", "progress": 48, "trend": "flat"},
            {"subject": "Reasoning", "progress": 71, "trend": "up"},
            {"subject": "General Awareness", "progress": 39, "trend": "down"},
        ]
    }


# Weekly review moved to app.api.study_os (production-grade, Supabase-backed).


# ───────────────────────── Accountability ──────────────────────────────────

router_acc = APIRouter(prefix="/accountability", tags=["accountability"])


@router_acc.get("/partners")
async def list_partners(user: dict = Depends(get_current_user)):
    return {
        "items": [
            {"id": "p-1", "name": "Karan M.", "exam": "ssc-cgl-2026", "match": 0.91, "stage": "Tier I prep", "city": "Pune"},
            {"id": "p-2", "name": "Aisha B.", "exam": "ibps-po-xv", "match": 0.86, "stage": "Prelims sprint", "city": "Hyderabad"},
            {"id": "p-3", "name": "Vikram J.", "exam": "ssc-cgl-2026", "match": 0.78, "stage": "Building base", "city": "Lucknow"},
        ]
    }


class PartnerReq(BaseModel):
    partner_id: str
    message: str | None = None


@router_acc.post("/partners/request")
async def request_partner(body: PartnerReq, user: dict = Depends(get_current_user)):
    _partner_requests[user["id"]].append(body.partner_id)
    return {"ok": True, "status": "pending"}


@router_acc.get("/groups")
async def list_groups(user: dict = Depends(get_current_user)):
    base = [
        {"id": "g-quant-sprint", "name": "Quant Sprint Squad", "members": 142, "exam": "ssc-cgl-2026"},
        {"id": "g-banking-mains", "name": "Banking Mains Crew", "members": 78, "exam": "ibps-po-xv"},
        {"id": "g-rbi-interview", "name": "RBI Interview Circle", "members": 31, "exam": "rbi-grade-b-2026"},
    ]
    for g in base:
        g["joined"] = user["id"] in _group_members[g["id"]]
    return {"items": base}


class JoinGroup(BaseModel):
    group_id: str


@router_acc.post("/groups/join")
async def join_group(body: JoinGroup, user: dict = Depends(get_current_user)):
    members = _group_members[body.group_id]
    if user["id"] in members:
        members.discard(user["id"])
        return {"joined": False}
    members.add(user["id"])
    return {"joined": True}


class MentorBook(BaseModel):
    mentor_id: str
    slot: str  # ISO datetime
    duration_minutes: int = 60
    notes: str | None = None


@router_acc.post("/mentors/book")
async def book_mentor(body: MentorBook, user: dict = Depends(get_current_user)):
    mentor = next((m for m in MENTORS if m["id"] == body.mentor_id), None)
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    booking = {
        "id": f"book-{len(_mentor_bookings[user['id']]) + 1}",
        "mentor_id": body.mentor_id,
        "mentor_name": mentor["name"],
        "slot": body.slot,
        "duration_minutes": body.duration_minutes,
        "notes": body.notes,
        "status": "pending_payment",
        "created_at": _now(),
    }
    _mentor_bookings[user["id"]].append(booking)
    return booking


@router_acc.get("/mentors/bookings")
async def list_bookings(user: dict = Depends(get_current_user)):
    return {"items": _mentor_bookings[user["id"]]}


# ───────────────────────────── AI Copilot ──────────────────────────────────

router_ai = APIRouter(prefix="/ai", tags=["ai"])


@router_ai.get("/guidance")
async def guidance(user: dict = Depends(get_current_user)):
    return {
        "greeting": f"Hey {user.get('name') or 'aspirant'} — your Quant trend is up.",
        "next_actions": [
            {"label": "Close one weak topic today", "type": "study"},
            {"label": "Take a 25-min focus block", "type": "focus"},
            {"label": "Review last mock errors", "type": "review"},
        ],
        "warnings": [
            "GA streak broken — pick it up before Friday.",
        ],
    }


class ChatBody(BaseModel):
    message: str
    thread_id: str | None = None


SCRIPTED_REPLIES = [
    "Got it. Based on your last 7 days, the highest-leverage move is closing one Quant topic — pick the weakest and run a 60-minute drill.",
    "Your focus streak is solid. Keep the morning slot sacred and add one full-length mock this weekend.",
    "Don't overthink the GA gap. Use a single curated source and a 30-minute daily slot — that's enough to recover by Friday.",
    "If RBI Grade B is on your list, prioritise ESI + F&M reading; objective is volume, not speed.",
    "Consistency over intensity. A 75-minute day for 5 days beats a 6-hour Sunday binge.",
]


@router_ai.post("/chat")
async def ai_chat(body: ChatBody, user: dict = Depends(get_current_user)):
    history = _ai_history[user["id"]]
    user_msg = {"role": "user", "content": body.message, "at": _now()}
    reply = SCRIPTED_REPLIES[len(history) % len(SCRIPTED_REPLIES)]
    bot_msg = {"role": "assistant", "content": reply, "at": _now()}
    history.extend([user_msg, bot_msg])
    return {"reply": bot_msg, "history": history[-20:]}


@router_ai.get("/history")
async def ai_history(user: dict = Depends(get_current_user)):
    return {"items": _ai_history[user["id"]]}


# ───────────────────────────── Admin ───────────────────────────────────────

router_admin = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = user.get("role")
    if role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


@router_admin.get("/overview")
async def admin_overview(_admin: dict = Depends(_require_admin)):
    return {
        "kpis": {
            "users": 1248,
            "recruitments": len(RECRUITMENTS),
            "threads": len(_threads),
            "open_flags": 3,
            "scrape_runs_today": 12,
            "queue_depth": 4,
        },
        "recent_audit": [
            {"actor": "system", "action": "scrape.run", "target": "ssc.gov.in", "at": _now()},
            {"actor": "super_admin", "action": "rbac.invite", "target": "ops_admin@cc.in", "at": _now()},
        ],
    }


@router_admin.get("/users")
async def admin_users(_admin: dict = Depends(_require_admin)):
    return {
        "items": [
            {"id": "u-1", "email": "aspirant@careercopilot.in", "name": "Priya Sharma", "role": "user", "plan": "free"},
            {"id": "u-2", "email": "mentor@careercopilot.in", "name": "Rohan Iyer", "role": "mentor", "plan": "elite"},
            {"id": "u-3", "email": "superadmin@careercopilot.in", "name": "Super Admin", "role": "super_admin", "plan": "elite"},
        ]
    }


class CreateAdminBody(BaseModel):
    email: str
    name: str
    role: str = "admin"
    scope: list[str] = []


@router_admin.post("/users/create")
async def admin_create_user(body: CreateAdminBody, user: dict = Depends(_require_admin)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only super_admin can invite admins")
    return {"ok": True, "invite": {"email": body.email, "role": body.role, "scope": body.scope}}


@router_admin.get("/audit")
async def admin_audit(_admin: dict = Depends(require_permission("audit.view"))):
    return {
        "items": [
            {"id": "a-1", "actor": "system", "action": "scrape.dry_run", "target": "ssc.gov.in", "at": _now()},
            {"id": "a-2", "actor": "super_admin", "action": "promote.recruitment", "target": "ssc-cgl-2026", "at": _now()},
            {"id": "a-3", "actor": "moderator", "action": "thread.unflag", "target": "form-mistake-signature-photo", "at": _now()},
        ]
    }


@router_admin.get("/sources-static")
async def admin_sources_static(_admin: dict = Depends(_require_admin)):
    return {
        "items": [
            {"id": "src-ssc", "name": "ssc.gov.in", "trust": "official", "last_run": _now(), "queue_depth": 2},
            {"id": "src-ibps", "name": "ibps.in", "trust": "official", "last_run": _now(), "queue_depth": 1},
            {"id": "src-rbi", "name": "rbi.org.in", "trust": "official", "last_run": _now(), "queue_depth": 0},
        ]
    }


@router_admin.get("/scraper/runs-static")
async def admin_scraper_runs_static(_admin: dict = Depends(_require_admin)):
    return {
        "items": [
            {"id": "run-12", "source": "ssc.gov.in", "status": "ok", "items_found": 4, "promoted": 2, "at": _now()},
            {"id": "run-11", "source": "ibps.in", "status": "queued", "items_found": 1, "promoted": 0, "at": _now()},
        ]
    }


@router_admin.get("/eligibility-queue-static")
async def admin_eligibility_queue_static(_admin: dict = Depends(_require_admin)):
    return {
        "items": [
            {"id": "eq-1", "user_id": "u-101", "recruitment": "ssc-cgl-2026", "verdict": "conditional", "reason": "qualification missing", "at": _now()},
            {"id": "eq-2", "user_id": "u-205", "recruitment": "rbi-grade-b-2026", "verdict": "rejected", "reason": "age out of range", "at": _now()},
        ]
    }


@router_admin.get("/notifications")
async def admin_notifications(_admin: dict = Depends(_require_admin)):
    return {
        "items": [
            {"id": "nt-1", "channel": "email", "status": "paused", "kill_switch": True},
            {"id": "nt-2", "channel": "in-app", "status": "active", "kill_switch": False},
        ],
        "kill_switch": True,
    }


class NotifToggle(BaseModel):
    channel: str
    enabled: bool


@router_admin.post("/notifications/toggle")
async def admin_notif_toggle(body: NotifToggle, _admin: dict = Depends(_require_admin)):
    return {"ok": True, "channel": body.channel, "enabled": body.enabled}


@router_admin.get("/marketplace")
async def admin_marketplace(_admin: dict = Depends(_require_admin)):
    return {
        "kpis": {"resources": len(RESOURCES), "mentors": len(MENTORS), "providers": len(PROVIDERS)},
        "flags": [],
    }


@router_admin.get("/community/flags")
async def admin_community_flags(_admin: dict = Depends(_require_admin)):
    return {"items": []}


@router_admin.get("/ai-policy")
async def admin_ai_policy(_admin: dict = Depends(_require_admin)):
    rules = [
        {
            "id": "deterministic_eligibility_authority",
            "rule": "AI must never override deterministic eligibility verdicts.",
            "enabled": True,
        },
        {
            "id": "source_registry_required",
            "rule": "AI must cite source registry for any recruitment claim.",
            "enabled": True,
        },
        {
            "id": "admin_review_for_promotion",
            "rule": "AI may extract structure from documents; canonical promotion still requires admin review.",
            "enabled": True,
        },
    ]
    return {
        "rules": rules,
        "guardrails": [r["rule"] for r in rules],
        "model": "phase-2:claude-sonnet",
        "swap_target": "phase-2:provider-wired",
        "active": False,
    }


# Aggregate router for easy include
router = APIRouter()
router.include_router(router_acc)
router.include_router(router_ai)
router.include_router(router_admin)
