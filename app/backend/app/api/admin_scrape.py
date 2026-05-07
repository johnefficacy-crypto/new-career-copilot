"""Scraper trust-gate API.

Endpoints:
    GET  /api/sources                          (admin) — source registry list
    GET  /api/admin/sources                    (admin) — alias used by Sources.jsx
    POST /api/admin/scrape/run-dry             (admin) — run a pass with mock=True
    POST /api/admin/scrape/run                 (admin) — run a real pass (requires
                                                        ANTHROPIC_API_KEY for Claude)
    GET  /api/admin/scrape/runs                (admin) — recent scrape_runs
    GET  /api/admin/scrape/queue               (admin) — pending queue items
    POST /api/admin/scrape/promote/{run_id}    (admin) — promote pending items
                                                        from a run into recruitments
    GET  /api/admin/eligibility-queue          (admin) — Sources.jsx-shaped queue
                                                        view + KPI counts
    POST /api/admin/scrape/items/{queue_id}/reject  (admin) — mark an item rejected

Every successful admin write inserts an ``admin_audit_logs`` row.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user, require_permission
from app.db.supabase_client import get_supabase_admin
from app.scraping.alerts import alert_users_for_new_recruitment
from app.scraping.runner import promote_run, run_scraping_pass

logger = logging.getLogger("career_copilot.api.admin_scrape")


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    # Ensure a profiles row exists — scrape_runs.triggered_by_user FKs into profiles.
    try:
        supabase = get_supabase_admin()
        rows = (
            supabase.table("profiles").select("id").eq("id", user["id"]).limit(1).execute().data
            or []
        )
        if not rows:
            supabase.table("profiles").insert(
                {
                    "id": user["id"],
                    "full_name": user.get("name") or (user.get("email") or "").split("@")[0] or "Admin",
                    "is_admin": True,
                    "admin_role": user.get("role"),
                }
            ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin profile bootstrap skipped: %s", exc)
    return user


def _audit(supabase, actor: dict, action: str, *, entity_type: str | None = None,
           entity_id: str | None = None, new_value: Any = None) -> None:
    try:
        supabase.table("admin_audit_logs").insert(
            {
                "actor_id": actor.get("id"),
                "actor_email": actor.get("email"),
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "new_value": new_value,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit log insert failed: %s", exc)


# ════════════════════════════════════════════════════════════════════════════
#  Sources
# ════════════════════════════════════════════════════════════════════════════

router = APIRouter(tags=["admin-scrape"])


def _shape_source(row: dict[str, Any]) -> dict[str, Any]:
    """Return a UI-friendly source row (matches Sources.jsx)."""
    return {
        "id": row.get("id"),
        "org": row.get("source_name") or row.get("name"),
        "official_url": row.get("official_url") or row.get("base_url"),
        "notification_url": row.get("notification_url"),
        "url": row.get("notification_url") or row.get("base_url"),
        "kind": row.get("source_type") or row.get("adapter_type") or "html",
        "tier": row.get("tier"),
        "verification_status": row.get("verification_status"),
        "is_verified": row.get("is_verified"),
        "trust_score": row.get("trust_score"),
        "anti_bot_risk": row.get("anti_bot_risk"),
        "has_captcha": row.get("has_captcha"),
        "pdf_only": row.get("pdf_only"),
        "notes": row.get("notes"),
        "last_success_at": row.get("last_success_at"),
        "last_error": row.get("last_error"),
        "last_run": row.get("last_scraped_at"),
        "status": "ok" if (row.get("consecutive_fails") or 0) == 0 else "degraded",
        "is_active": row.get("is_active"),
        "consecutive_fails": row.get("consecutive_fails") or 0,
    }


@router.get("/sources")
def public_sources(_admin: dict = Depends(require_permission("sources.manage"))) -> dict[str, Any]:
    return _list_sources()


@router.get("/admin/sources")
def admin_sources(_admin: dict = Depends(require_permission("sources.manage"))) -> dict[str, Any]:
    return _list_sources()


def _list_sources() -> dict[str, Any]:
    supabase = get_supabase_admin()
    rows = (
        supabase.table("source_registry")
        .select("*")
        .order("tier")
        .order("source_name")
        .execute()
        .data
        or []
    )
    if not rows:
        # Fall back to legacy scrape_sources so the admin UI still has data.
        rows = (
            supabase.table("scrape_sources")
            .select("*")
            .order("tier")
            .order("name")
            .execute()
            .data
            or []
        )
    return {"items": [_shape_source(r) for r in rows]}


# ════════════════════════════════════════════════════════════════════════════
#  Run-dry / run / runs / queue
# ════════════════════════════════════════════════════════════════════════════


@router.post("/admin/scrape/run-dry")
def scrape_run_dry(
    body: dict | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Run a scrape pass in mock mode (no model call, deterministic output).

    Body (optional): ``{ "source_ids": ["uuid", ...] }``.
    """
    body = body or {}
    supabase = get_supabase_admin()
    summary = run_scraping_pass(
        supabase,
        triggered_by="admin",
        triggered_by_user=admin["id"],
        source_ids=body.get("source_ids"),
        mock=True,
    )
    _audit(supabase, admin, "scrape.run_dry", entity_type="scrape_runs",
           entity_id=summary["run_id"], new_value=summary)
    return summary


@router.post("/admin/scrape/run")
def scrape_run(
    body: dict | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Run a real scrape pass (Claude extraction). Requires ANTHROPIC_API_KEY."""
    body = body or {}
    supabase = get_supabase_admin()
    summary = run_scraping_pass(
        supabase,
        triggered_by="admin",
        triggered_by_user=admin["id"],
        source_ids=body.get("source_ids"),
        mock=False,
    )
    _audit(supabase, admin, "scrape.run", entity_type="scrape_runs",
           entity_id=summary["run_id"], new_value=summary)
    return summary


@router.get("/admin/scrape/runs")
def list_scrape_runs(
    limit: int = Query(default=30, ge=1, le=100),
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    rows = (
        supabase.table("scrape_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    items = [
        {
            "id": r["id"],
            "source": (r.get("triggered_by") or "scheduled"),
            "at": r.get("started_at"),
            "finished_at": r.get("finished_at"),
            "mode": r.get("triggered_by"),
            "status": r["status"],
            "items_seen": r.get("items_found") or 0,
            "items_new": r.get("items_new") or 0,
            "items_duplicate": r.get("items_duplicate") or 0,
            "errors": r.get("error_log") or [],
            "sources_checked": r.get("sources_checked") or 0,
        }
        for r in rows
    ]
    return {"items": items}


@router.get("/admin/scrape/queue")
def list_scrape_queue(
    status: str | None = Query(default="pending"),
    limit: int = Query(default=50, ge=1, le=200),
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = (
        supabase.table("scrape_queue")
        .select("id, source_url, source_name, extracted_data, confidence_score, "
                "status, scrape_run_id, scraped_at, duplicate_of, reviewer_notes")
        .order("scraped_at", desc=True)
        .limit(limit)
    )
    if status and status != "all":
        q = q.eq("status", status)
    rows = q.execute().data or []
    return {"items": rows}


# ════════════════════════════════════════════════════════════════════════════
#  Promote / reject
# ════════════════════════════════════════════════════════════════════════════


@router.post("/admin/scrape/items/{queue_id}/promote")
def promote_queue_item(
    queue_id: str,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    from app.scraping.runner import promote_to_recruitments
    from app.scraping.schemas import ExtractedRecruitment

    supabase = get_supabase_admin()
    rows = (
        supabase.table("scrape_queue")
        .select("id, extracted_data, status")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    item = rows[0]
    if item["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Item is already {item['status']}")
    try:
        extracted = ExtractedRecruitment(**(item["extracted_data"] or {}))
        rec_id = promote_to_recruitments(extracted, supabase)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Promote failed: {exc}")
    supabase.table("scrape_queue").update(
        {
            "status": "approved",
            "reviewer_id": admin["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", queue_id).execute()
    alerts_sent = alert_users_for_new_recruitment(rec_id, supabase)
    _audit(supabase, admin, "scrape.promote_item", entity_type="scrape_queue",
           entity_id=queue_id, new_value={"recruitment_id": rec_id})
    return {"ok": True, "recruitment_id": rec_id, "alerts_sent": alerts_sent}


@router.post("/admin/scrape/promote/{run_id}")
def promote_run_endpoint(
    run_id: str,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    result = promote_run(run_id, supabase, reviewer_id=admin["id"])

    # Fan out per-recruitment alerts (eligibility must already be computed).
    alerts_sent = 0
    for rec_id in result.get("recruitment_ids", []):
        alerts_sent += alert_users_for_new_recruitment(rec_id, supabase)
    result["alerts_sent"] = alerts_sent

    _audit(supabase, admin, "scrape.promote_run", entity_type="scrape_runs",
           entity_id=run_id, new_value=result)
    return result


@router.post("/admin/scrape/items/{queue_id}/reject")
def reject_queue_item(
    queue_id: str,
    body: dict | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    body = body or {}
    supabase = get_supabase_admin()
    res = (
        supabase.table("scrape_queue")
        .update(
            {
                "status": "rejected",
                "reviewer_id": admin["id"],
                "reviewer_notes": body.get("notes"),
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", queue_id)
        .execute()
        .data
        or []
    )
    if not res:
        raise HTTPException(status_code=404, detail="Queue item not found")
    _audit(supabase, admin, "scrape.reject_item", entity_type="scrape_queue",
           entity_id=queue_id, new_value=body)
    return {"ok": True, "id": queue_id, "status": "rejected"}


# ════════════════════════════════════════════════════════════════════════════
#  Eligibility queue (admin view of pending scrape items + recompute backlog)
# ════════════════════════════════════════════════════════════════════════════


@router.get("/admin/eligibility-queue")
def eligibility_queue(_admin: dict = Depends(require_permission("scraper.manage"))) -> dict[str, Any]:
    """Two-pane KPI view consumed by ``EligibilityQueue.jsx``:

    * ``pending`` — scrape_queue rows awaiting promotion.
    * ``promoted_24h`` / ``rejected_24h`` — last-24h counts.
    * ``recompute_backlog`` — eligibility_recompute_queue depth (if table exists).
    """
    supabase = get_supabase_admin()
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    pending_rows = (
        supabase.table("scrape_queue")
        .select("id, source_name, extracted_data, confidence_score, scraped_at")
        .eq("status", "pending")
        .order("scraped_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )

    def _shape(p: dict[str, Any]) -> dict[str, Any]:
        d = p.get("extracted_data") or {}
        return {
            "id": p["id"],
            "slug": p["id"],
            "recruitment": (d.get("title") if isinstance(d, dict) else None) or p.get("source_name"),
            "source": p.get("source_name"),
            "confidence": float(p.get("confidence_score") or 0),
            "added": p.get("scraped_at"),
        }

    promoted_24h = (
        supabase.table("scrape_queue")
        .select("id", count="exact")
        .eq("status", "approved")
        .gte("reviewed_at", yesterday)
        .execute()
        .count
        or 0
    )
    rejected_24h = (
        supabase.table("scrape_queue")
        .select("id", count="exact")
        .eq("status", "rejected")
        .gte("reviewed_at", yesterday)
        .execute()
        .count
        or 0
    )

    recompute_backlog = 0
    try:
        recompute_backlog = (
            supabase.table("eligibility_recompute_queue")
            .select("id", count="exact")
            .eq("status", "queued")
            .execute()
            .count
            or 0
        )
    except Exception:
        pass

    return {
        "pending": [_shape(p) for p in pending_rows],
        "promoted_24h": promoted_24h,
        "rejected_24h": rejected_24h,
        "recompute_backlog": recompute_backlog,
    }
