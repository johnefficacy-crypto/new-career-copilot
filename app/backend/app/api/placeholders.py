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


# NOTE: Phase 5 follow-up — placeholder /accountability/* routes removed.
# Every path under this prefix was a duplicate of the real router in
# ``app/api/accountability.py``. The real router wins at runtime via
# registration order in ``server.py``; the duplicates here were dead
# code that route precedence was masking. ``app/api/placeholders.py``
# is the catch-all fallback for surfaces that don't yet have a real
# implementation — once a real router lands, the placeholder duplicates
# should be deleted. Done here for the accountability surface.
router_acc = APIRouter(prefix="/accountability", tags=["accountability"])




# ───────────────────────────── Admin ───────────────────────────────────────

router_admin = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = user.get("role")
    if role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


# NOTE: POST /admin/users/create previously lived here as a placeholder.
# The real handler in ``app/api/admin_ops.py`` wins via registration
# order; the duplicate has been removed.


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


# NOTE: GET /admin/notifications, GET /admin/marketplace, GET /admin/ai-policy
# placeholders removed — duplicates of the real handlers in
# ``app/api/notifications.py`` and ``app/api/admin_ops.py``. The
# ``POST /admin/notifications/toggle`` placeholder stays because the
# real notifications router doesn't expose that exact path.


class NotifToggle(BaseModel):
    channel: str
    enabled: bool


@router_admin.post("/notifications/toggle")
async def admin_notif_toggle(body: NotifToggle, _admin: dict = Depends(_require_admin)):
    return {"ok": True, "channel": body.channel, "enabled": body.enabled}


# Aggregate router for easy include
router = APIRouter()
router.include_router(router_acc)
router.include_router(router_admin)
