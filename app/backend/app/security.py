"""Shared helpers: JWT, password hashing, RBAC guards."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Iterable

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.server_deps import get_db

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 1 day: Phase 1 is a demo shell
REFRESH_TTL_DAYS = 30

ROLE_HIERARCHY = {
    "user": 1,
    "mentor": 2,
    "admin": 5,
    "super_admin": 10,
}

bearer_scheme = HTTPBearer(auto_error=False)


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(status_code=401, detail="Token expired") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e


def _extract_token(request: Request, creds: HTTPAuthorizationCredentials | None) -> str | None:
    # Authorization header first
    if creds and creds.credentials:
        return creds.credentials
    # Cookie fallback
    return request.cookies.get("access_token")


def serialize_user(user: dict) -> dict:
    out = {
        "id": str(user["_id"]),
        "email": user.get("email"),
        "name": user.get("name"),
        "role": user.get("role", "user"),
        "avatar": user.get("avatar"),
        "goal_exams": user.get("goal_exams", []),
        "onboarded": bool(user.get("onboarded", False)),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None,
        "plan": user.get("plan", "free"),
    }
    return out


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    token = _extract_token(request, creds)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        oid = ObjectId(uid)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid user id") from e
    db = get_db()
    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    token = _extract_token(request, creds)
    if not token:
        return None
    try:
        payload = decode_token(token)
        uid = payload.get("sub")
        if not uid or payload.get("type") != "access":
            return None
        db = get_db()
        user = await db.users.find_one({"_id": ObjectId(uid)})
        return user
    except Exception:
        return None


def require_role(*allowed: str):
    """Return a FastAPI dependency that enforces a minimum role.

    Accepts either explicit role names (`user`, `mentor`, `admin`, `super_admin`)
    or a single minimum-role string via `ROLE_HIERARCHY`.
    """
    allowed_set = set(allowed)
    min_level = min((ROLE_HIERARCHY.get(r, 99) for r in allowed), default=99)

    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        role = user.get("role", "user")
        if role in allowed_set:
            return user
        # hierarchy climb: super_admin covers admin covers mentor covers user
        if ROLE_HIERARCHY.get(role, 0) >= min_level:
            return user
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return _dep


def require_admin():
    return require_role("admin", "super_admin")


def require_super_admin():
    return require_role("super_admin")


def require_mentor():
    return require_role("mentor", "admin", "super_admin")


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
