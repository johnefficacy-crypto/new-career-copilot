"""Eligibility API.

Endpoints (mirrors the reference repo):
    POST /api/eligibility/recompute
        - Service-role: body must include ``user_id``; runs for that user.
        - Supabase Bearer (regular user): always runs for the caller's
          own user id (body's ``user_id`` is ignored — users may not
          recompute for someone else).
    GET  /api/eligibility/results/me      → eligible + conditional only
    GET  /api/eligibility/results/me/all  → every row

All writes go through the deterministic engine (`app.eligibility.engine`).
AI never decides eligibility.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.errors import DatabaseError, ValidationError
from app.db.supabase_client import get_supabase_admin, get_supabase_admin_async
from app.eligibility.runner import (
    get_all_eligibility_results_async,
    get_eligible_recruitments_async,
    run_eligibility_for_user_async,
)

router = APIRouter(prefix="/eligibility", tags=["eligibility"])
_bearer = HTTPBearer(auto_error=False)


class RecomputeBody(BaseModel):
    user_id: str | None = None


def _is_service_role(token: str) -> bool:
    if not token:
        return False
    return token.strip() == (get_settings().SUPABASE_SERVICE_ROLE_KEY or "").strip()


def _audit_recompute(
    supabase,
    *,
    actor_id: str | None,
    actor_email: str | None,
    target_user_id: str,
    mode: str,
) -> None:
    try:
        supabase.table("admin_audit_logs").insert(
            {
                "actor_id": actor_id,
                "actor_email": actor_email,
                "action": "eligibility.recompute",
                "entity_type": "eligibility_recompute",
                "entity_id": target_user_id,
                "new_value": {"mode": mode},
                "notes": "eligibility_api_recompute",
            }
        ).execute()
    except Exception:
        # Preserve existing recompute behavior even if audit writes fail.
        pass


@router.post(
    "/recompute",
    summary="Recompute eligibility for a user",
    description=(
        "Service-role callers may specify `user_id` in request body. "
        "Regular users can recompute only for their own authenticated profile."
    ),
)
async def recompute(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    body: RecomputeBody = Body(default_factory=RecomputeBody),
) -> dict[str, Any]:
    presented = creds.credentials if creds else ""

    if _is_service_role(presented):
        # Service-to-service path (Edge Function consumer / cron worker).
        if not body.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Body must include { user_id: string } for service-role calls",
            )
            # type: ignore[unreachable]
        target_user_id = body.user_id
        actor_id = "service_role"
        actor_email = "service_role"
        mode = "service_role"
    else:
        # Regular user path — token must be a Supabase access token.
        try:
            user = get_current_user(creds)  # type: ignore[arg-type]
        except HTTPException:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized — provide a Supabase access token or service-role key",
            )
        target_user_id = user["id"]
        actor_id = user.get("id")
        actor_email = user.get("email")
        mode = "user_token"

    try:
        supabase = get_supabase_admin()
        result = await run_eligibility_for_user_async(target_user_id, supabase)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database operation failed") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Eligibility recompute failed") from exc
    _audit_recompute(
        supabase,
        actor_id=actor_id,
        actor_email=actor_email,
        target_user_id=target_user_id,
        mode=mode,
    )
    return {"ok": True, "user_id": target_user_id, **result}


async def _get_results_supabase_client() -> Any:
    """Prefer async Supabase client; fall back to sync client for compatibility."""
    try:
        return await get_supabase_admin_async()
    except RuntimeError:
        return get_supabase_admin()


@router.get(
    "/results/me",
    summary="Get eligible and conditional results for the current user",
)
async def results_me(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    try:
        supabase = await _get_results_supabase_client()
        items = await get_eligible_recruitments_async(user["id"], supabase)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Eligibility results unavailable") from exc
    return {"items": items, "count": len(items)}


@router.get(
    "/results/me/all",
    summary="Get all eligibility results for the current user",
)
async def results_me_all(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    try:
        supabase = await _get_results_supabase_client()
        items = await get_all_eligibility_results_async(user["id"], supabase)
    except DatabaseError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Eligibility results unavailable") from exc
    return {"items": items, "count": len(items)}
