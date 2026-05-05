"""Auth router: Supabase-backed `/api/auth/me`.

Phase 1.5 removed the local JWT/bcrypt/MongoDB auth path. Login/signup/logout
happen client-side via Supabase Auth (`@supabase/supabase-js`). The backend
only verifies the access token attached to subsequent API calls.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    """Return the Supabase-authenticated user that owns the access token."""
    return {"user": current_user}
