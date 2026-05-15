"""Admin read API for the Recruitment Verification Gateway.

PR7 scope — read-only listing + detail. No state mutation endpoints
yet (resolver re-run, override-conflict, promote, reject, bulk-apply
all land in PR2/PR3/PR6 as the plan ships them).

Endpoints:

    GET /api/admin/verification-reports
        ?lifecycle=&tier=&recommended_action=&limit=&offset=
    GET /api/admin/verification-reports/{id}

Filters are optional. The default listing returns active
(non-superseded) reports newest-first, fed by the ``idx_verification_reports_attention``
partial index from migration 075.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


logger = logging.getLogger("career_copilot.api.admin_verification_reports")


router = APIRouter()


_ALLOWED_LIFECYCLE = {"classified", "backfilled_needs_review", "superseded", "rejected"}
_ALLOWED_TIER = {"A_HIGH_STAKES", "B_TECHNICAL_CONDITIONAL", "C_STANDARD_LONG_TAIL"}
_ALLOWED_RECOMMENDED = {
    "await_official_proof", "request_admin_review",
    "promote_eligible", "block_publish", "no_action",
}


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


class VerificationReportListItem(BaseModel):
    """Subset of columns surfaced in the listing view.

    The detail endpoint returns the full row including jsonb columns;
    the list view trims down to what an attention queue actually needs
    so the payload stays small.
    """

    id: str
    scrape_queue_id: str | None
    recruitment_id: str | None
    lifecycle_status: str
    criticality_tier: str
    exam_family_key: str | None
    recommended_action: str
    trigger_reason: str
    report_version: int
    chain_root_id: str | None
    created_at: str
    updated_at: str


class VerificationReportListResponse(BaseModel):
    items: list[VerificationReportListItem]
    total: int | None = None
    limit: int
    offset: int


@router.get(
    "/admin/verification-reports",
    response_model=VerificationReportListResponse,
)
def list_verification_reports(
    lifecycle: str | None = Query(default=None),
    tier: str | None = Query(default=None),
    recommended_action: str | None = Query(default=None),
    include_superseded: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: dict = Depends(_require_admin),
) -> VerificationReportListResponse:
    """List verification reports for the admin attention queue.

    Defaults to active (non-superseded) reports newest-first. Filters
    are rejected with 422 if outside the PR1 enum sets.
    """
    if lifecycle is not None and lifecycle not in _ALLOWED_LIFECYCLE:
        raise HTTPException(status_code=422, detail=f"unknown lifecycle: {lifecycle!r}")
    if tier is not None and tier not in _ALLOWED_TIER:
        raise HTTPException(status_code=422, detail=f"unknown tier: {tier!r}")
    if recommended_action is not None and recommended_action not in _ALLOWED_RECOMMENDED:
        raise HTTPException(status_code=422, detail=f"unknown recommended_action: {recommended_action!r}")

    supabase = get_supabase_admin()
    q = (
        supabase.table("recruitment_verification_reports")
        .select(
            "id, scrape_queue_id, recruitment_id, lifecycle_status, "
            "criticality_tier, exam_family_key, recommended_action, "
            "trigger_reason, report_version, chain_root_id, "
            "created_at, updated_at"
        )
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    if not include_superseded:
        q = q.is_("superseded_by", None)
    if lifecycle is not None:
        q = q.eq("lifecycle_status", lifecycle)
    if tier is not None:
        q = q.eq("criticality_tier", tier)
    if recommended_action is not None:
        q = q.eq("recommended_action", recommended_action)

    rows = q.execute().data or []
    items = [VerificationReportListItem(**r) for r in rows]
    return VerificationReportListResponse(items=items, limit=limit, offset=offset)


@router.get("/admin/verification-reports/{report_id}")
def get_verification_report(
    report_id: str,
    _: dict = Depends(_require_admin),
) -> dict[str, Any]:
    """Return the full report row including jsonb columns.

    No mutation; safe to call from an admin detail drawer.
    """
    supabase = get_supabase_admin()
    rows = (
        supabase.table("recruitment_verification_reports")
        .select("*")
        .eq("id", report_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="verification_report not found")
    return rows[0]
