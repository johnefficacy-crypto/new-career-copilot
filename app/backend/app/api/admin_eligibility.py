"""Admin eligibility, audit, and publish-impact endpoints.

Endpoints (all under ``/api`` via the include in ``server.py``):

  GET    /api/admin/eligibility-recompute-queue
  POST   /api/admin/eligibility-recompute-queue/{queue_id}/retry
  POST   /api/admin/recruitments/{recruitment_id}/recompute-eligibility
  GET    /api/admin/recruitments/{recruitment_id}/publish-impact
  GET    /api/admin/audit

Each admin write inserts an ``admin_audit_logs`` row so the inline audit
timeline endpoint can surface every action that touched a given entity.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin
from app.eligibility.recompute_queue import enqueue_eligibility_recompute

logger = logging.getLogger("career_copilot.api.admin_eligibility")
router = APIRouter(tags=["admin-eligibility"])


_TERMINAL_RECOMPUTE_STATUSES = frozenset({"failed", "stalled"})


def _audit(supabase, actor: dict, action: str, *, entity_type: str, entity_id: str | None = None, new_value: Any = None, notes: str = "admin_eligibility") -> None:
    try:
        supabase.table("admin_audit_logs").insert(
            {
                "actor_id": actor.get("id"),
                "actor_email": actor.get("email"),
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "new_value": new_value,
                "notes": notes,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("audit log insert failed (admin_eligibility)")


# ────────────────────────────────────────────────────────────────────────────
#  Eligibility recompute queue admin view
# ────────────────────────────────────────────────────────────────────────────


@router.get("/admin/eligibility-recompute-queue")
def list_recompute_queue(
    status: str | None = Query(default=None, description="queued|processing|pending|failed|processed; omit for all"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    recruitment_id: str | None = Query(default=None),
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """List eligibility_recompute_queue rows with optional filters.

    Status counts are computed in a single follow-up query so the UI can
    badge failed/pending/processing counts without paginating through every
    row. Failed rows carry ``last_error`` and ``attempt_count`` so the admin
    drawer can show why a retry might or might not help.
    """
    supabase = get_supabase_admin()
    base = (
        supabase.table("eligibility_recompute_queue")
        .select(
            "id, user_id, recruitment_id, post_id, reason, status, queued_at, claimed_at, processed_at, error_message, last_error, attempt_count, next_attempt_at, metadata",
            count="exact",
        )
        .order("queued_at", desc=True)
    )
    if status:
        base = base.eq("status", status)
    if recruitment_id:
        base = base.eq("recruitment_id", recruitment_id)
    res = base.range(offset, offset + limit - 1).execute()
    rows = res.data or []
    total = getattr(res, "count", None)

    # Counts per status, scoped to the same recruitment filter if present.
    counts: dict[str, int] = {}
    for st in ("pending", "queued", "processing", "failed", "processed"):
        cq = supabase.table("eligibility_recompute_queue").select("id", count="exact").eq("status", st)
        if recruitment_id:
            cq = cq.eq("recruitment_id", recruitment_id)
        try:
            counts[st] = cq.execute().count or 0
        except Exception:
            counts[st] = 0

    return {
        "items": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
        "counts": counts,
        "filters": {"status": status, "recruitment_id": recruitment_id},
    }


@router.post("/admin/eligibility-recompute-queue/{queue_id}/retry")
def retry_recompute_row(
    queue_id: str,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Reset a single recompute queue row to ``pending`` so the worker picks it up.

    Refuses to act on a row already in a working state (queued/processing/
    pending) — retrying a row that's about to run would double-process.
    Clears attempt_count back to 0 because the admin has reviewed the
    error and is explicitly opting back in; the next worker pass should
    treat this as a fresh attempt.
    """
    if not queue_id or len(queue_id) < 2:
        raise HTTPException(status_code=422, detail="Invalid queue_id")
    supabase = get_supabase_admin()
    rows = (
        supabase.table("eligibility_recompute_queue")
        .select("id, user_id, recruitment_id, status, attempt_count, last_error")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Recompute queue row not found")
    row = rows[0]
    if (row.get("status") or "").lower() not in _TERMINAL_RECOMPUTE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Row is {row.get('status')!r}; only failed or stalled rows can be retried.",
                "current_status": row.get("status"),
            },
        )
    update = {
        "status": "pending",
        "attempt_count": 0,
        "claimed_at": None,
        "processed_at": None,
        "next_attempt_at": None,
        "error_message": None,
        "last_error": None,
    }
    supabase.table("eligibility_recompute_queue").update(update).eq("id", queue_id).execute()
    _audit(
        supabase,
        admin,
        "eligibility.recompute.retry",
        entity_type="eligibility_recompute_queue",
        entity_id=queue_id,
        new_value={"previous_status": row.get("status"), "previous_attempt_count": row.get("attempt_count")},
    )
    return {"ok": True, "id": queue_id, "status": "pending"}


# ────────────────────────────────────────────────────────────────────────────
#  Recompute by recruitment (fan-out)
# ────────────────────────────────────────────────────────────────────────────


class RecruitmentRecomputeBody(BaseModel):
    reason: str = Field(default="admin_manual_recompute", max_length=128)
    # Cap the fan-out per call. The eligibility worker drains async, but
    # the admin click triggering 500k inserts in one request would still
    # block the request thread; require the admin to confirm a larger
    # scope explicitly.
    max_users: int = Field(default=10_000, ge=1, le=100_000)


@router.post("/admin/recruitments/{recruitment_id}/recompute-eligibility")
def recompute_eligibility_for_recruitment(
    recruitment_id: str,
    body: RecruitmentRecomputeBody | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Enqueue an eligibility recompute for every onboarded user, scoped to
    one recruitment.

    Uses the same atomic RPC the publish trigger uses (``enqueue_eligibility_
    recompute``) so callers cannot create duplicate active rows. Returns the
    count of users targeted; the worker drains the queue asynchronously.
    """
    body = body or RecruitmentRecomputeBody()
    supabase = get_supabase_admin()

    rec_rows = (
        supabase.table("recruitments")
        .select("id, name, publish_status")
        .eq("id", recruitment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rec_rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")

    profiles = (
        supabase.table("profiles")
        .select("id")
        .eq("onboarding_completed", True)
        .limit(body.max_users)
        .execute()
        .data
        or []
    )
    enqueued = 0
    errors: list[str] = []
    for prof in profiles:
        uid = prof.get("id")
        if not uid:
            continue
        try:
            enqueue_eligibility_recompute(
                supabase,
                user_id=uid,
                reason=body.reason,
                recruitment_id=recruitment_id,
                metadata={"triggered_by": "admin", "actor_id": admin.get("id")},
            )
            enqueued += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{uid}: {exc}")

    _audit(
        supabase,
        admin,
        "eligibility.recompute.fan_out",
        entity_type="recruitment",
        entity_id=recruitment_id,
        new_value={"enqueued": enqueued, "errors": len(errors), "reason": body.reason},
    )

    return {
        "ok": True,
        "recruitment_id": recruitment_id,
        "enqueued": enqueued,
        "errors": errors[:20],
        "total_errors": len(errors),
        "candidate_user_count": len(profiles),
        "cap_hit": len(profiles) >= body.max_users,
    }


# ────────────────────────────────────────────────────────────────────────────
#  Publish impact preview
# ────────────────────────────────────────────────────────────────────────────


@router.get("/admin/recruitments/{recruitment_id}/publish-impact")
def publish_impact(
    recruitment_id: str,
    _admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    """Best-effort preview of what publishing this recruitment will trigger.

    Returns counts only — does not run the engine. Reading current
    ``eligibility_results`` rows is cheap and answers the most common
    question ("how many users does this affect?") without spending
    minutes computing fresh verdicts for every onboarded profile. If the
    recruitment was never previously published, ``eligibility_results``
    will be empty and we surface only the user-base fan-out estimate.
    """
    if not recruitment_id or len(recruitment_id) < 2:
        raise HTTPException(status_code=422, detail="Invalid recruitment_id")
    supabase = get_supabase_admin()

    rec_rows = (
        supabase.table("recruitments")
        .select("id, name, publish_status, apply_end_date, apply_start_date")
        .eq("id", recruitment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rec_rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    rec = rec_rows[0]

    # User base scoped to onboarded profiles — matches the trigger that
    # fans out on publish (migration 007).
    try:
        onboarded_count = (
            supabase.table("profiles")
            .select("id", count="exact")
            .eq("onboarding_completed", True)
            .execute()
            .count
            or 0
        )
    except Exception:
        onboarded_count = 0

    # Profile-completeness proxy: dob is the single most common missing
    # field that flips a verdict from definitive to conditional. A
    # heavier "completeness score" would need the engine itself.
    try:
        missing_dob_count = (
            supabase.table("profiles")
            .select("id", count="exact")
            .eq("onboarding_completed", True)
            .is_("dob", "null")
            .execute()
            .count
            or 0
        )
    except Exception:
        missing_dob_count = 0

    # Current verdicts (if the recruitment was previously published).
    eligible_count = 0
    conditional_count = 0
    ineligible_count = 0
    has_prior_results = False
    try:
        # Pull a representative page; we count by aggregating client-side
        # rather than three separate count queries to keep RTTs down.
        sample = (
            supabase.table("eligibility_results")
            .select("is_eligible, reasons", count="exact")
            .eq("recruitment_id", recruitment_id)
            .limit(10_000)
            .execute()
        )
        result_rows = sample.data or []
        has_prior_results = bool(getattr(sample, "count", 0) or 0)
        for row in result_rows:
            reasons = row.get("reasons") or []
            is_conditional = isinstance(reasons, list) and any(
                isinstance(r, dict) and r.get("is_unverifiable") for r in reasons
            )
            if is_conditional:
                conditional_count += 1
            elif row.get("is_eligible"):
                eligible_count += 1
            else:
                ineligible_count += 1
    except Exception:
        pass

    # Notification posture (best-effort): are any alerts already queued
    # for this recruitment? A published recruitment with notifications
    # globally disabled is a common silent-failure mode.
    notifications_queued = 0
    try:
        notifications_queued = (
            supabase.table("notification_alerts")
            .select("id", count="exact")
            .eq("recruitment_id", recruitment_id)
            .execute()
            .count
            or 0
        )
    except Exception:
        pass

    days_to_deadline = None
    try:
        if rec.get("apply_end_date"):
            end = datetime.fromisoformat(str(rec["apply_end_date"]).replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            days_to_deadline = max(0, (end - now).days)
    except Exception:
        pass

    return {
        "recruitment_id": recruitment_id,
        "name": rec.get("name"),
        "publish_status": rec.get("publish_status"),
        "user_base": {
            "onboarded_count": onboarded_count,
            "missing_dob_count": missing_dob_count,
        },
        "current_verdicts": {
            "has_prior_results": has_prior_results,
            "eligible": eligible_count,
            "conditional": conditional_count,
            "ineligible": ineligible_count,
        },
        "notifications": {
            "queued_for_this_recruitment": notifications_queued,
        },
        "deadline": {
            "apply_end_date": rec.get("apply_end_date"),
            "days_to_deadline": days_to_deadline,
        },
        # Estimated fan-out on next publish: every onboarded profile gets
        # one recompute row (the trigger dedupes). Make this explicit so
        # the admin can see "this will enqueue ~N recomputes".
        "expected_recompute_fanout": onboarded_count,
    }


# ────────────────────────────────────────────────────────────────────────────
#  Generic admin audit timeline
# ────────────────────────────────────────────────────────────────────────────


_AUDIT_ENTITY_TYPES = frozenset({
    "source",
    "organization",
    "recruitment",
    "scrape_queue",
    "scrape_field",
    "scrape_runs",
    "eligibility_recompute_queue",
    "eligibility_recompute",
})


@router.get("/admin/audit")
def list_audit_entries(
    entity_type: str = Query(..., description="One of the known admin entity types"),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Generic audit-log read so admin drawers can show an inline timeline.

    Existing per-entity audit endpoints in ``admin_trust.py`` (sources,
    organizations) remain — this is the new general-purpose surface used
    by the recruitment, scrape-queue, and recompute drawers.
    """
    if entity_type not in _AUDIT_ENTITY_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown entity_type: {entity_type!r}")
    supabase = get_supabase_admin()
    q = (
        supabase.table("admin_audit_logs")
        .select(
            "id, action, actor_id, actor_email, entity_type, entity_id, old_value, new_value, notes, metadata, created_at",
            count="exact",
        )
        .eq("entity_type", entity_type)
        .order("created_at", desc=True)
    )
    if entity_id:
        q = q.eq("entity_id", entity_id)
    res = q.range(offset, offset + limit - 1).execute()
    rows = res.data or []
    total = getattr(res, "count", None)
    return {"items": rows, "total": total, "limit": limit, "offset": offset}
