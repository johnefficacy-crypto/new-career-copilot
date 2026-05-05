"""Auth router: register, login, logout, me, refresh, forgot/reset password."""
from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    iso,
    now_utc,
    serialize_user,
    verify_password,
)
from app.server_deps import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

LOCKOUT_THRESHOLD = 7
LOCKOUT_MINUTES = 15


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


def _set_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )


async def _check_lockout(db, identifier: str) -> None:
    doc = await db.login_attempts.find_one({"identifier": identifier})
    if not doc:
        return
    if doc.get("count", 0) >= LOCKOUT_THRESHOLD:
        locked_until = doc.get("locked_until")
        if locked_until and locked_until > now_utc():
            raise HTTPException(
                status_code=429,
                detail="Too many failed attempts. Try again shortly.",
            )


async def _record_failure(db, identifier: str) -> None:
    doc = await db.login_attempts.find_one({"identifier": identifier})
    count = (doc.get("count", 0) if doc else 0) + 1
    update = {"identifier": identifier, "count": count, "updated_at": now_utc()}
    if count >= LOCKOUT_THRESHOLD:
        update["locked_until"] = now_utc() + timedelta(minutes=LOCKOUT_MINUTES)
    await db.login_attempts.update_one(
        {"identifier": identifier}, {"$set": update}, upsert=True
    )


async def _clear_failures(db, identifier: str) -> None:
    await db.login_attempts.delete_one({"identifier": identifier})


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register")
async def register(body: RegisterBody, request: Request, response: Response):
    db = get_db()
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": "user",
        "onboarded": False,
        "plan": "free",
        "goal_exams": [],
        "created_at": now_utc(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id

    access = create_access_token(str(result.inserted_id), email, "user")
    refresh = create_refresh_token(str(result.inserted_id))
    _set_cookies(response, access, refresh)
    return {
        "user": serialize_user(doc),
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
    }


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    db = get_db()
    email = body.email.lower().strip()
    identifier = f"{_client_ip(request)}:{email}"
    await _check_lockout(db, identifier)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        await _record_failure(db, identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await _clear_failures(db, identifier)

    access = create_access_token(str(user["_id"]), email, user.get("role", "user"))
    refresh = create_refresh_token(str(user["_id"]))
    _set_cookies(response, access, refresh)

    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {"last_login_at": now_utc()}}
    )
    return {
        "user": serialize_user(user),
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
    }


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": serialize_user(user)}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token: Optional[str] = request.cookies.get("refresh_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(uid)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(str(user["_id"]), user["email"], user.get("role", "user"))
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24,
        path="/",
    )
    return {"access_token": access, "token_type": "bearer"}


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody):
    db = get_db()
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one(
            {
                "token": token,
                "user_id": user["_id"],
                "used": False,
                "created_at": now_utc(),
                "expires_at": now_utc() + timedelta(hours=1),
            }
        )
        # Phase 1: log the link. Email dispatch is Phase 2.
        print(f"[password-reset] {email} → /auth/reset-password?token={token}")
    return {"ok": True, "message": "If the email exists, a reset link was sent."}


@router.post("/reset-password")
async def reset_password(body: ResetBody):
    db = get_db()
    doc = await db.password_reset_tokens.find_one({"token": body.token})
    if not doc or doc.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or used token")
    if doc.get("expires_at") and doc["expires_at"] < now_utc():
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"_id": doc["user_id"]},
        {"$set": {"password_hash": hash_password(body.password)}},
    )
    await db.password_reset_tokens.update_one(
        {"_id": doc["_id"]}, {"$set": {"used": True, "used_at": now_utc()}}
    )
    return {"ok": True}
