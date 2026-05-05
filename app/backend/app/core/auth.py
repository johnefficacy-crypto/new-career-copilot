"""Supabase access-token verification for FastAPI.

Phase 1.5: MongoDB + custom JWT have been removed. Authentication is now
delegated entirely to Supabase Auth. Every protected backend route validates
the access token by calling Supabase's auth admin endpoint.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.supabase_client import get_supabase_admin

security = HTTPBearer(auto_error=False)


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
    return {
        "id": getattr(user, "id", None) or claims.get("sub"),
        "email": getattr(user, "email", None) or claims.get("email"),
        "name": metadata.get("name") or metadata.get("full_name"),
        "avatar": metadata.get("avatar_url"),
        "role": role,
        "onboarded": bool(metadata.get("onboarded", False)),
        "plan": metadata.get("plan", "free"),
        "goal_exams": metadata.get("goal_exams", []),
        "created_at": getattr(user, "created_at", None),
        "claims": claims,
    }


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    """Validate the Supabase access token and return the resolved user."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    token = credentials.credentials

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

    return _serialize_user(user, claims)


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None
