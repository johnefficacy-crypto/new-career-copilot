"""User profile + onboarding."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.security import get_current_user, now_utc, serialize_user
from app.server_deps import get_db

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    category: str | None = None  # general / obc / sc / st / ews
    gender: str | None = None
    state: str | None = None
    date_of_birth: str | None = None  # YYYY-MM-DD
    qualification: str | None = None
    qualification_year: int | None = Field(default=None, ge=1990, le=2035)
    percentage: float | None = Field(default=None, ge=0, le=100)
    goal_exams: list[str] | None = None
    target_exam_year: int | None = Field(default=None, ge=2025, le=2035)
    weekly_hours_goal: float | None = Field(default=None, ge=0, le=80)
    onboarded: bool | None = None


@router.get("/me")
async def get_profile(user: dict = Depends(get_current_user)):
    db = get_db()
    meta = await db.profile_meta.find_one({"user_id": user["_id"]}) or {}
    out = serialize_user(user)
    out["profile"] = {k: v for k, v in meta.items() if k not in {"_id", "user_id"}}
    return out


@router.put("/me")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    patch: dict[str, Any] = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    user_patch: dict[str, Any] = {}
    if "name" in patch:
        user_patch["name"] = patch.pop("name")
    if "goal_exams" in patch:
        user_patch["goal_exams"] = patch.pop("goal_exams")
    if "onboarded" in patch:
        user_patch["onboarded"] = patch.pop("onboarded")
    if user_patch:
        user_patch["updated_at"] = now_utc()
        await db.users.update_one({"_id": user["_id"]}, {"$set": user_patch})
    if patch:
        patch["updated_at"] = now_utc()
        await db.profile_meta.update_one(
            {"user_id": user["_id"]}, {"$set": patch}, upsert=True
        )
    user = await db.users.find_one({"_id": user["_id"]})
    meta = await db.profile_meta.find_one({"user_id": user["_id"]}) or {}
    out = serialize_user(user)
    out["profile"] = {k: v for k, v in meta.items() if k not in {"_id", "user_id"}}
    return out
