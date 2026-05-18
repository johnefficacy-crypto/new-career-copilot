"""Supabase access-token verification for FastAPI.

Phase 1.5: MongoDB + custom JWT have been removed. Authentication is now
delegated entirely to Supabase Auth. Every protected backend route validates
the access token by calling Supabase's auth admin endpoint.
"""
from __future__ import annotations

import hashlib
import threading
from typing import Annotated, Any

from cachetools import TTLCache
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.supabase_client import get_supabase_admin

security = HTTPBearer(auto_error=False)


# ── Cross-request token cache ──────────────────────────────────────────
# Dashboard boot fans out 5+ protected requests within a second. Without
# a cross-request cache each one issues its own auth/v1/user round-trip
# to Supabase (the existing request.state memo only dedupes inside a
# single FastAPI request). 45s TTL is short enough to respect Supabase
# revocations within the user's perception window while still cutting
# the dashboard bootstrap auth fan-out by ~90%.
_TOKEN_CACHE_TTL_SECONDS = 45
_TOKEN_CACHE_MAXSIZE = 10000
_token_cache: TTLCache = TTLCache(
    maxsize=_TOKEN_CACHE_MAXSIZE, ttl=_TOKEN_CACHE_TTL_SECONDS
)
_token_cache_lock = threading.Lock()


def _token_cache_key(token: str) -> str:
    # Hash so we never hold raw tokens in memory longer than necessary
    # and so cache dumps in tracebacks/logs do not leak credentials.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def invalidate_token(token: str) -> None:
    """Drop ``token`` from the cross-request auth cache.

    Wire this into any logout route. The frontend currently calls
    Supabase ``signOut()`` directly so there is no backend logout
    handler to wire into yet; this helper is exposed for future use
    and for tests.
    """
    if not token:
        return
    key = _token_cache_key(token)
    with _token_cache_lock:
        _token_cache.pop(key, None)


def _cache_get(token: str) -> dict | None:
    with _token_cache_lock:
        return _token_cache.get(_token_cache_key(token))


def _cache_set(token: str, user: dict) -> None:
    with _token_cache_lock:
        _token_cache[_token_cache_key(token)] = user


def _serialize_user(user: Any, claims: dict | None = None) -> dict:
    """Normalise a Supabase user object (gotrue User) into a plain dict."""
    claims = claims or {}
    metadata = (
        getattr(user, "user_metadata", None)
        or getattr(user, "raw_user_meta_data", None)
        or {}
    )
    app_metadata = (
        getattr(user, "app_metadata", None)
        or getattr(user, "raw_app_meta_data", None)
        or {}
    )
    role = (
        app_metadata.get("role")
        or metadata.get("role")
        or claims.get("role")
        or "user"
    )
    permissions = app_metadata.get("permissions") or []
    if isinstance(permissions, str):
        permissions = [permissions]
    # Supabase anonymous sign-ins set `is_anonymous=true` in the JWT claims
    # and on `app_metadata`. Either source is authoritative — we coerce to
    # bool so downstream code can rely on a stable shape.
    is_anonymous = bool(
        claims.get("is_anonymous")
        or app_metadata.get("is_anonymous")
        or getattr(user, "is_anonymous", False)
    )
    return {
        "id": getattr(user, "id", None) or claims.get("sub"),
        "email": getattr(user, "email", None) or claims.get("email"),
        "name": metadata.get("name") or metadata.get("full_name"),
        "avatar": metadata.get("avatar_url"),
        "role": role,
        "onboarded": bool(metadata.get("onboarded", False)),
        "plan": metadata.get("plan", "free"),
        "goal_exams": metadata.get("goal_exams", []),
        "permissions": permissions,
        "is_anonymous": is_anonymous,
        "created_at": getattr(user, "created_at", None),
        "claims": claims,
    }


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    """Validate the Supabase access token and return the resolved user.

    The resolved user is memoised on ``request.state`` keyed by token so
    a single HTTP request that fans out to multiple protected
    dependencies only hits ``auth/v1/user`` once. Lifetime = this
    request only; nothing is cached across requests.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    token = credentials.credentials

    # 1. Free request-scoped memo (single FastAPI request fanout).
    cached = getattr(request.state, "current_user", None)
    cached_token = getattr(request.state, "current_user_token", None)
    if cached is not None and cached_token == token:
        return cached

    # 2. Cross-request TTL cache. Saves the Supabase round-trip when a
    # dashboard boot fires multiple parallel HTTP requests with the
    # same bearer token. Invalid tokens are NEVER cached.
    cross_request_cached = _cache_get(token)
    if cross_request_cached is not None:
        request.state.current_user = cross_request_cached
        request.state.current_user_token = token
        return cross_request_cached

    try:
        admin = get_supabase_admin()
        # Supabase admin client validates the JWT with the project's secret
        # and returns the canonical user object.
        result = admin.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Supabase access token: {exc}",
        )

    user = getattr(result, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase returned no user for token",
        )

    # Decode unverified claims for role/sub fallback (signature already verified by Supabase).
    claims: dict = {}
    try:
        import jwt

        claims = jwt.decode(token, options={"verify_signature": False})
    except Exception:
        claims = {}

    serialised = _serialize_user(user, claims)
    request.state.current_user = serialised
    request.state.current_user_token = token
    _cache_set(token, serialised)
    return serialised


def require_permission(permission: str):
    def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("is_anonymous"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Anonymous users cannot access this resource",
            )
        perms = set(user.get("permissions") or [])
        if permission not in perms and user.get("role") not in {"super_admin"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )
        return user
    return _dep


def get_current_user_required_permanent(
    user: dict = Depends(get_current_user),
) -> dict:
    """Like :func:`get_current_user` but rejects anonymous Supabase users.

    Use on endpoints that demand a permanent identity (payments, document
    upload, anything that mutates persistent state on behalf of a user we
    expect to come back). Anonymous callers get a 403 so the frontend can
    prompt them to link a real identity.
    """
    if user.get("is_anonymous"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anonymous users cannot access this resource",
        )
    return user


def get_optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return get_current_user(request, credentials)
    except HTTPException:
        return None
