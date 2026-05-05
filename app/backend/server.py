"""Career Copilot backend (Phase 1).

Provides authentication (custom JWT + bcrypt, MongoDB-backed), RBAC,
and the mock/placeholder product APIs consumed by the React app.

The original Supabase + asyncpg scaffolding is preserved in
`app/core/config.py`, `app/db/postgres.py`, and `app/db/supabase_client.py`
but is not used in Phase 1 runtime. To switch to Supabase, set
AUTH_MODE=supabase in the backend .env and wire the Supabase router.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.server_deps import db_state, get_db
from app.api_v1.auth import router as auth_router
from app.api_v1.recruitments import router as recruitments_router
from app.api_v1.profile import router as profile_router
from app.api_v1.tracker import router as tracker_router
from app.api_v1.community import router as community_router
from app.api_v1.marketplace import router as marketplace_router
from app.api_v1.study import router as study_router
from app.api_v1.accountability import router as accountability_router
from app.api_v1.ai import router as ai_router
from app.api_v1.admin import router as admin_router
from app.api_v1 import seed

logger = logging.getLogger("career_copilot")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_state.connect()
    db = db_state.db
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.recruitments.create_index("slug", unique=True)
    await db.saved_recruitments.create_index([("user_id", 1), ("recruitment_id", 1)], unique=True)
    await db.tracker_items.create_index("user_id")
    await db.community_threads.create_index("category")
    await db.community_posts.create_index("thread_id")
    await db.focus_sessions.create_index("user_id")
    await db.study_tasks.create_index([("user_id", 1), ("date", 1)])
    await db.mock_tests.create_index("user_id")
    await db.audit_logs.create_index("created_at")

    await seed.seed_all(db)
    seed.write_test_credentials()
    logger.info("Career Copilot backend started. DB=%s", os.environ.get("DB_NAME"))
    yield
    await db_state.close()


app = FastAPI(title="Career Copilot API", version="0.1.0", lifespan=lifespan)

# CORS
cors_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
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
    mongo: str
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
    db = get_db()
    await db.command("ping")
    return DbHealth(
        status="ok",
        mongo="connected",
        ts=datetime.now(timezone.utc).isoformat(),
    )


api.include_router(auth_router)
api.include_router(recruitments_router)
api.include_router(profile_router)
api.include_router(tracker_router)
api.include_router(community_router)
api.include_router(marketplace_router)
api.include_router(study_router)
api.include_router(accountability_router)
api.include_router(ai_router)
api.include_router(admin_router)

app.include_router(api)


@app.get("/")
async def root():
    return {"service": "career-copilot-api", "docs": "/docs"}
