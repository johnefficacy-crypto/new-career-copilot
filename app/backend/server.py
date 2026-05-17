"""Career Copilot backend (Phase 1.5).

Authentication is delegated to Supabase Auth; the canonical database is
Supabase Postgres (accessed via asyncpg + the supabase-py admin client).

MongoDB and the local JWT/bcrypt shim from Phase 1 have been fully removed.
Phase-1 placeholder endpoints continue to serve the React app from
deterministic in-memory data; Phase 2 will swap each surface to its real
Supabase-backed implementation.
"""
from __future__ import annotations

import logging
import importlib

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env before importing anything that reads settings.
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.accountability import router as accountability_router
from app.api.admin_exam_intelligence import router as admin_exam_intel_router
from app.api.admin_overview import router as admin_overview_router
from app.api.ai import router as ai_router
from app.api.admin_persona import router as admin_persona_router
from app.api.admin_scrape import router as admin_scrape_router
from app.api.admin_study_os import router as admin_study_os_router
from app.api.admin_exam_intel_cms import router as admin_exam_intel_cms_router
from app.api.admin_community_governance import router as admin_community_governance_router
from app.api.admin_conflicts import router as admin_conflicts_router
from app.api.admin_eligibility import router as admin_eligibility_router
from app.api.admin_copyright import (
    public_router as copyright_public_router,
    admin_router as admin_copyright_router,
)
from app.api.admin_kpis import router as admin_kpis_router
from app.api.admin_ops import router as admin_ops_router

from app.api.blogs import router as blogs_router, admin_router as admin_blogs_router
from app.api.admin_moderation import (
    router as moderation_router,
    admin_router as admin_moderation_router,
)
from app.api.auth import router as auth_router
from app.api.admin_trust import router as admin_trust_router
from app.api.admin_verification_reports import router as admin_verification_reports_router
from app.api.evidence import router as evidence_router
from app.api.flashcards import router as flashcards_router
from app.api.mistakes import router as mistakes_router
from app.api.notes import router as notes_router
from app.api.reports import router as reports_router
from app.api.revision import router as revision_router
from app.api.exam_intelligence import router as exam_intelligence_router
from app.api.canonical import router as canonical_router
from app.api.community_runtime import router as community_runtime_router
from app.api.eligibility import router as eligibility_router
from app.api.notifications import router as notifications_router
from app.api.onboarding_unified import router as onboarding_unified_router
from app.api.payments import router as payments_router
from app.api.persona import router as persona_router
from app.api.persona_questions import router as persona_questions_router
from app.api.placeholders import router as placeholders_router
from app.api.study_compare import router as study_compare_router
from app.api.study_os import router as study_os_router
from app.notifications.scheduler import start_scheduler, stop_scheduler
from app.core.config import get_settings
from app.db.postgres import close_pool, get_pool

logger = logging.getLogger("career_copilot")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try to bring up the asyncpg pool eagerly so /api/db-health is cheap.
    try:
        await get_pool()
        logger.info("Postgres pool connected")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Postgres pool not available at startup: %s", exc)
    # APScheduler — in-process cron for notifications + recompute worker.
    try:
        start_scheduler()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Scheduler did not start: %s", exc)
    yield
    stop_scheduler()
    await close_pool()


app = FastAPI(title="Career Copilot API", version="0.2.0", lifespan=lifespan)

# CORS — frontend origin + emergent preview by default.
settings = get_settings()
cors_env = os.environ.get("CORS_ORIGINS", "")
if cors_env.strip():
    cors_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
else:
    cors_origins = settings.BACKEND_CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled backend error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


api = APIRouter(prefix="/api")


def _load_required_router(module_path: str, attr: str = "router") -> APIRouter:
    """Load a required APIRouter with an explicit runtime error message."""
    try:
        mod = importlib.import_module(module_path)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Failed to import router module '{module_path}': {exc}") from exc
    router_obj = getattr(mod, attr, None)
    if not isinstance(router_obj, APIRouter):
        raise RuntimeError(
            f"Module '{module_path}' does not expose APIRouter '{attr}'"
        )
    return router_obj


class Health(BaseModel):
    status: str
    service: str
    ts: str


class DbHealth(BaseModel):
    status: str
    postgres: str
    supabase: str
    supabase_url: str | None = None
    ts: str


@api.get("/health", response_model=Health)
async def health() -> Health:
    return Health(
        status="ok",
        service="career-copilot",
        ts=datetime.now(timezone.utc).isoformat(),
    )


@api.get("/db-health", response_model=DbHealth)
async def db_health() -> DbHealth:
    settings = get_settings()
    supabase_status = "unreachable"
    try:
        # Authoritative liveness check — Supabase REST is the production path.
        from app.db.supabase_client import get_supabase_admin

        admin = get_supabase_admin()
        # Lightweight call against an existing canonical table; LIMIT 0 avoids
        # paying for a real read and works even if profiles is empty.
        admin.table("profiles").select("id").limit(1).execute()
        supabase_status = "connected"
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Supabase unreachable: {exc}")

    # asyncpg is best-effort. Direct Postgres hostnames are IPv6-only on
    # some Supabase tiers; if it fails we still report Supabase as healthy.
    postgres_status = "skipped"
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("SELECT 1")
        postgres_status = "connected"
    except Exception as exc:  # noqa: BLE001
        postgres_status = f"unreachable ({type(exc).__name__})"

    return DbHealth(
        status="ok",
        postgres=postgres_status,
        supabase=supabase_status,
        supabase_url=settings.NEXT_PUBLIC_SUPABASE_URL or None,
        ts=datetime.now(timezone.utc).isoformat(),
    )


api.include_router(auth_router)
api.include_router(eligibility_router)
api.include_router(notifications_router)
api.include_router(admin_scrape_router)  # admin scraper trust-gate routes
api.include_router(admin_conflicts_router)  # consensus conflict resolution
api.include_router(admin_trust_router)
api.include_router(admin_verification_reports_router)  # PR7 gateway read API
api.include_router(admin_eligibility_router)  # recompute queue, publish impact, generic audit
api.include_router(admin_persona_router)  # PR4 admin persona controls
api.include_router(admin_exam_intel_router)  # PR5 admin exam intelligence review
api.include_router(exam_intelligence_router)  # PR5 verified-only exam intelligence reads
api.include_router(evidence_router)  # universal evidence-drawer source endpoint
api.include_router(payments_router)  # razorpay + plans
api.include_router(persona_router)  # internal aspirant persona v1
api.include_router(persona_questions_router)  # PR2 progressive tiny questions
api.include_router(study_os_router)  # PR3 Study OS Mission Control — before canonical so /study/mission-control wins
api.include_router(admin_study_os_router)  # admin Study OS ops (flagged via ADMIN_STUDY_OS_ENABLED)
api.include_router(admin_exam_intel_cms_router)  # admin Exam Intelligence CMS — Phase 4 (same flag)
api.include_router(admin_community_governance_router)  # admin Community / Mentors / Resources governance (§4.1–§4.4)
api.include_router(study_compare_router)  # Study OS comparison + social + verification
api.include_router(onboarding_unified_router)  # unified guided onboarding — before placeholders
# Real Supabase-backed accountability + admin ops — must precede community_runtime
# and placeholders so route order wins for /accountability/mentors/* and /admin/*.
api.include_router(accountability_router)
api.include_router(_load_required_router("app.api.admin_ops"))
api.include_router(community_runtime_router)  # durable community/social routes — must precede canonical seed fallbacks
api.include_router(canonical_router)  # canonical Supabase routes — must precede placeholders
# NOTE: community_people_router was removed — every route under that prefix
# duplicated community_runtime_router's. The legacy file's own docstring
# said it was "being phased out in favour of community_runtime"; the
# real DB-backed router is the single owner now.
# Real Supabase-backed AI + admin overview — must precede placeholders so route order wins.
api.include_router(ai_router)
api.include_router(admin_overview_router)
# Phase-2 user surfaces: notes, flashcards, mistakes, revision, reports
api.include_router(notes_router)
api.include_router(flashcards_router)
api.include_router(mistakes_router)
api.include_router(revision_router)
api.include_router(reports_router)
# Moderation & trust workflows
api.include_router(moderation_router)  # /moderation/report, /moderation/my-reports
api.include_router(admin_moderation_router)  # /admin/moderation/...
api.include_router(admin_kpis_router)  # /admin/kpis/...
api.include_router(blogs_router)  # /blogs public list/detail
api.include_router(admin_blogs_router)  # /admin/blogs CRUD
api.include_router(copyright_public_router)  # /copyright/submit (public DMCA intake)
api.include_router(admin_copyright_router)  # /admin/copyright/...
api.include_router(placeholders_router)
app.include_router(api)


@app.get("/")
async def root():
    return {"service": "career-copilot-api", "docs": "/docs"}
