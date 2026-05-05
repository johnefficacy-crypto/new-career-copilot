from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.config import get_settings
from app.db.postgres import close_pool, get_pool
from app.db.supabase_client import get_supabase_admin

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("select 1")

    yield

    await close_pool()


app = FastAPI(title="Career Copilot API", lifespan=lifespan)
api = APIRouter(prefix="/api")


class Health(BaseModel):
    status: str
    service: str
    ts: str


class DbHealth(BaseModel):
    status: str
    postgres: str
    supabase: str
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
    pool = await get_pool()

    async with pool.acquire() as conn:
        await conn.fetchval("select 1")

    supabase = get_supabase_admin()

    # Change "profiles" if your DB does not have this table yet.
    supabase.table("profiles").select("id").limit(1).execute()

    return DbHealth(
        status="ok",
        postgres="connected",
        supabase="connected",
        ts=datetime.now(timezone.utc).isoformat(),
    )


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)