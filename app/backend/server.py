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

from app.api.admin_exam_intelligence import router as admin_exam_intel_router
from app.api.admin_persona import router as admin_persona_router
from app.api.admin_scrape import router as admin_scrape_router
from app.api.admin_eligibility import router as admin_eligibility_router
from app.api.auth import router as auth_router
from app.api.admin_trust import router as admin_trust_router
from app.api.evidence import router as evidence_router
from app.api.exam_intelligence import router as exam_intelligence_router
from app.api.canonical import router as canonical_router
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
api.include_router(admin_trust_router)
api.include_router(admin_eligibility_router)  # recompute queue, publish impact, generic audit
api.include_router(admin_persona_router)  # PR4 admin persona controls
api.include_router(admin_exam_intel_router)  # PR5 admin exam intelligence review
api.include_router(exam_intelligence_router)  # PR5 verified-only exam intelligence reads
api.include_router(evidence_router)  # universal evidence-drawer source endpoint
api.include_router(payments_router)  # razorpay + plans
api.include_router(persona_router)  # internal aspirant persona v1
api.include_router(persona_questions_router)  # PR2 progressive tiny questions
api.include_router(study_os_router)  # PR3 Study OS Mission Control — before canonical so /study/mission-control wins
api.include_router(study_compare_router)  # Study OS comparison + social + verification
api.include_router(onboarding_unified_router)  # unified guided onboarding — before placeholders
api.include_router(canonical_router)  # canonical Supabase routes — must precede placeholders
api.include_router(placeholders_router)
app.include_router(api)


@app.get("/")
async def root():
    return {"service": "career-copilot-api", "docs": "/docs"}
