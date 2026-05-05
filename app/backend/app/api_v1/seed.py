"""Seed: super_admin, demo accounts, mock recruitments & community data."""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from app.security import hash_password, now_utc, verify_password


async def _seed_user(db, email_env: str, password_env: str, defaults: dict) -> None:
    email = os.environ.get(email_env, defaults["email"]).lower()
    password = os.environ.get(password_env, defaults["password"])
    existing = await db.users.find_one({"email": email})
    if existing is None:
        doc = {
            "email": email,
            "password_hash": hash_password(password),
            "name": defaults["name"],
            "role": defaults["role"],
            "onboarded": defaults.get("onboarded", True),
            "plan": defaults.get("plan", "free"),
            "goal_exams": defaults.get("goal_exams", []),
            "created_at": now_utc(),
        }
        await db.users.insert_one(doc)
    else:
        # Rotate password if .env value changed
        if not verify_password(password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password_hash": hash_password(password), "role": defaults["role"]}},
            )


async def seed_users(db) -> None:
    await _seed_user(
        db,
        "SUPER_ADMIN_EMAIL",
        "SUPER_ADMIN_PASSWORD",
        {
            "email": "superadmin@careercopilot.in",
            "password": "SuperAdmin@2026",
            "name": "Super Admin",
            "role": "super_admin",
            "onboarded": True,
            "plan": "elite",
        },
    )
    await _seed_user(
        db,
        "SEED_DEMO_EMAIL",
        "SEED_DEMO_PASSWORD",
        {
            "email": "aspirant@careercopilot.in",
            "password": "Aspirant@2026",
            "name": "Priya Sharma",
            "role": "user",
            "onboarded": True,
            "plan": "free",
            "goal_exams": ["ssc-cgl-2026", "ibps-po-xv"],
        },
    )
    await _seed_user(
        db,
        "SEED_MENTOR_EMAIL",
        "SEED_MENTOR_PASSWORD",
        {
            "email": "mentor@careercopilot.in",
            "password": "Mentor@2026",
            "name": "Rohan Iyer",
            "role": "mentor",
            "onboarded": True,
            "plan": "elite",
        },
    )


RECRUITMENTS = [
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


async def seed_recruitments(db) -> None:
    for r in RECRUITMENTS:
        await db.recruitments.update_one(
            {"slug": r["slug"]},
            {"$set": r, "$setOnInsert": {"created_at": now_utc()}},
            upsert=True,
        )


COMMUNITY_CATEGORIES = [
    {"id": "official-updates", "label": "Official updates", "count": 14, "admin_only": True, "description": "Canonical notifications posted by moderators."},
    {"id": "form-help", "label": "Form help", "count": 42, "description": "Help filling applications, uploads, payments."},
    {"id": "preparation", "label": "Preparation", "count": 189, "description": "Strategy, time-tables, topic closure, book reviews."},
    {"id": "pyq-discussion", "label": "PYQ discussion", "count": 76, "description": "Breakdown of previous year questions."},
    {"id": "cutoffs-results", "label": "Cutoffs & results", "count": 31, "description": "Category-wise cutoffs, result tracking."},
    {"id": "mental-game", "label": "Mental game", "count": 58, "description": "Burnout, focus, routines, sleep — the invisible battle."},
]


COMMUNITY_THREADS = [
    {
        "slug": "ssc-cgl-2026-notification-released",
        "category": "official-updates",
        "title": "SSC CGL 2026 notification released · apply window 18 Apr – 17 May",
        "author": "Career Copilot",
        "badge": "Admin",
        "pinned": True,
        "body": "Official notification is live on ssc.nic.in. We've parsed post-wise eligibility and it's now visible under your matched recruitments. Apply window closes 17 May.",
        "votes": 482,
        "replies_count": 67,
        "tag": "Official",
    },
    {
        "slug": "quant-110-to-168-in-6-weeks",
        "category": "preparation",
        "title": "How I jumped from 110 to 168 in Quant in 6 weeks",
        "author": "Rahul V.",
        "badge": "Verified Topper",
        "body": "Three compounding habits: topic closure, 20-question daily sprint, weekly error log review. Happy to answer questions.",
        "votes": 214,
        "replies_count": 48,
        "tag": "Strategy",
    },
    {
        "slug": "form-mistake-signature-photo",
        "category": "form-help",
        "title": "Is my form rejected if I uploaded signature twice by mistake?",
        "author": "Aanya S.",
        "body": "Accidentally uploaded signature in the photo slot too. Will it be rejected? Can I edit?",
        "votes": 38,
        "replies_count": 22,
        "tag": "Question",
    },
    {
        "slug": "ibps-po-cutoff-trend-2021-2025",
        "category": "cutoffs-results",
        "title": "IBPS PO Prelims 2021 → 2025 category-wise cutoff trend",
        "author": "Nikhil T.",
        "body": "Compiled from official PDFs — General down, OBC flat. Breakdown inside.",
        "votes": 167,
        "replies_count": 34,
        "tag": "Resource",
    },
    {
        "slug": "dealing-with-study-burnout",
        "category": "mental-game",
        "title": "Hitting a wall at day 60 — how did you get past it?",
        "author": "Meera K.",
        "body": "Felt flat the last four days. Looking for routines that helped others reboot.",
        "votes": 78,
        "replies_count": 26,
        "tag": "Discussion",
    },
]


async def seed_community(db) -> None:
    for c in COMMUNITY_CATEGORIES:
        await db.community_categories.update_one(
            {"id": c["id"]}, {"$set": c}, upsert=True
        )
    for t in COMMUNITY_THREADS:
        await db.community_threads.update_one(
            {"slug": t["slug"]},
            {"$set": t, "$setOnInsert": {"created_at": now_utc() - timedelta(hours=5)}},
            upsert=True,
        )


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


async def seed_marketplace(db) -> None:
    for r in RESOURCES:
        await db.resources.update_one({"id": r["id"]}, {"$set": r}, upsert=True)
    for m in MENTORS:
        await db.mentors.update_one({"id": m["id"]}, {"$set": m}, upsert=True)
    for p in PROVIDERS:
        await db.providers.update_one({"id": p["id"]}, {"$set": p}, upsert=True)


async def seed_all(db) -> None:
    await seed_users(db)
    await seed_recruitments(db)
    await seed_community(db)
    await seed_marketplace(db)


def write_test_credentials() -> None:
    Path("/app/memory").mkdir(parents=True, exist_ok=True)
    content = f"""# Career Copilot · Test Credentials (Phase 1)

| Role        | Email                            | Password             |
|-------------|----------------------------------|----------------------|
| Super Admin | {os.environ.get('SUPER_ADMIN_EMAIL', 'superadmin@careercopilot.in')} | {os.environ.get('SUPER_ADMIN_PASSWORD', 'SuperAdmin@2026')} |
| Admin       | _(create from /admin/rbac via super admin)_ | —                    |
| Mentor      | {os.environ.get('SEED_MENTOR_EMAIL', 'mentor@careercopilot.in')}    | {os.environ.get('SEED_MENTOR_PASSWORD', 'Mentor@2026')}     |
| User (demo) | {os.environ.get('SEED_DEMO_EMAIL', 'aspirant@careercopilot.in')}    | {os.environ.get('SEED_DEMO_PASSWORD', 'Aspirant@2026')}     |

## Auth endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET  /api/auth/me
- POST /api/auth/refresh
- POST /api/auth/forgot-password
- POST /api/auth/reset-password

Auth flow uses JWT Bearer tokens (returned in response body) plus SameSite=None cookies.
Frontend stores `access_token` in localStorage and sends it as `Authorization: Bearer <token>`.
"""
    Path("/app/memory/test_credentials.md").write_text(content, encoding="utf-8")
