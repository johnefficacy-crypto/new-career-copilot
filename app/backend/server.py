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

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api.auth import router as auth_router
from app.api.placeholders import router as placeholders_router
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
    yield
    await close_pool()


app = FastAPI(title="Career Copilot API", version="0.2.0", lifespan=lifespan)

# CORS — frontend origin + emergent preview by default.
cors_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
cors_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
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
api.include_router(placeholders_router)
app.include_router(api)


@app.get("/")
async def root():
    return {"service": "career-copilot-api", "docs": "/docs"}
