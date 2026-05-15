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
import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.scraping.verification_gateway import run_resolver_stage
from app.scraping.verification_policy import RESOLVER_RERUN_LIMITS
from app.scraping.verification_reports import attach_admin_official_url


logger = logging.getLogger("career_copilot.api.admin_verification_reports")


router = APIRouter()


_ALLOWED_LIFECYCLE = {"classified", "backfilled_needs_review", "superseded", "rejected"}
_ALLOWED_TIER = {"A_HIGH_STAKES", "B_TECHNICAL_CONDITIONAL", "C_STANDARD_LONG_TAIL"}
_ALLOWED_RECOMMENDED = {
    "await_official_proof", "request_admin_review",
    "promote_eligible", "block_publish", "no_action",
    "confirm_suggested_proof",
}


# ── In-process rate-limit state (PR2 stop-gap) ─────────────────────────
#
# Process-local dicts; not durable across restarts. PR2 ships these as
# a stop-gap so a single instance enforces the rate-limit contract
# from the spec. A future PR moves them into Redis / Postgres when the
# service goes multi-instance.

_resolver_last_run_at: dict[str, float] = {}
_resolver_admin_hourly: dict[str, list[float]] = defaultdict(list)


def _check_resolver_rate_limit(report_id: str, admin_id: str) -> None:
    """Raise 429 if the report cooldown or per-admin hourly cap is hit."""
    now = time.time()
    cooldown = RESOLVER_RERUN_LIMITS["per_report_cooldown_seconds"]
    last = _resolver_last_run_at.get(report_id)
    if last is not None and (now - last) < cooldown:
        retry_in = int(cooldown - (now - last))
        raise HTTPException(
            status_code=429,
            detail=f"Resolver cooldown active for this report; retry in {retry_in}s.",
        )
    hourly_cap = RESOLVER_RERUN_LIMITS["per_admin_per_hour"]
    bucket = _resolver_admin_hourly[admin_id]
    cutoff = now - 3600
    bucket[:] = [t for t in bucket if t > cutoff]
    if len(bucket) >= hourly_cap:
        raise HTTPException(
            status_code=429,
            detail=f"Per-admin resolver re-run cap reached ({hourly_cap}/hour).",
        )
    bucket.append(now)
    _resolver_last_run_at[report_id] = now


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


# ── PR2 mutation endpoints ────────────────────────────────────────────


class RunResolverResponse(BaseModel):
    report_id: str
    classification_outcome: str
    resolver_status: str | None
    resolver_method: str | None
    resolver_confidence: float | None
    suggested_count: int


@router.post(
    "/admin/verification-reports/{report_id}/run-resolver",
    response_model=RunResolverResponse,
)
def run_resolver_for_report(
    report_id: str,
    admin: dict = Depends(_require_admin),
) -> RunResolverResponse:
    """Force a resolver re-run for one report.

    Subject to the per-report cooldown and per-admin hourly cap from
    ``verification_policy.RESOLVER_RERUN_LIMITS``. A 429 is the
    cooldown signal — the client should display the retry-in window
    rather than retry immediately.
    """
    admin_id = admin.get("id")
    if not admin_id:
        raise HTTPException(status_code=403, detail="admin id missing")
    _check_resolver_rate_limit(report_id, admin_id)

    supabase = get_supabase_admin()
    try:
        result = run_resolver_stage(supabase, report_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="verification_report not found")
    return RunResolverResponse(
        report_id=result.report_id or report_id,
        classification_outcome=result.classification_outcome,
        resolver_status=result.resolver_status,
        resolver_method=result.resolver_method,
        resolver_confidence=result.resolver_confidence,
        suggested_count=result.suggested_count,
    )


class ConfirmSuggestedProofRequest(BaseModel):
    chosen_url: str = Field(min_length=1)


@router.post("/admin/verification-reports/{report_id}/confirm-suggested-proof")
def confirm_suggested_proof(
    report_id: str,
    payload: ConfirmSuggestedProofRequest = Body(...),
    _: dict = Depends(_require_admin),
) -> dict[str, Any]:
    """Admin confirms one of the suggested URLs.

    The ``chosen_url`` MUST match one of the entries in the report's
    ``suggested_official_urls`` jsonb — anything else would let an
    admin bypass the resolver and inject an arbitrary URL, which is
    explicitly not the contract.

    On success: ``official_resolution_status`` flips to
    ``admin_attached`` and the original suggestion's method is
    preserved on the row for the audit trail.
    """
    supabase = get_supabase_admin()
    rows = (
        supabase.table("recruitment_verification_reports")
        .select("id, suggested_official_urls, official_resolution_method")
        .eq("id", report_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="verification_report not found")
    report = rows[0]
    suggestions = report.get("suggested_official_urls") or []
    match = next((u for u in suggestions if u.get("url") == payload.chosen_url), None)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="chosen_url must match an entry in suggested_official_urls",
        )
    method = match.get("method") or report.get("official_resolution_method") or "direct_link"
    updated = attach_admin_official_url(
        supabase, report_id,
        chosen_url=payload.chosen_url, original_method=method,
    )
    return updated
