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
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user, require_permission
from app.core.errors import PromotionError
from app.common.indexing import group_by
from app.db.supabase_client import get_supabase_admin
from app.scraping.alerts import alert_users_for_new_recruitment
from app.scraping.runner import promote_run, run_scraping_pass
from app.scraping.intelligence import classify_item, duplicate_candidates, BLOCKED

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
        logger.exception("admin profile bootstrap skipped")
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
                "notes": "legacy_admin_scrape" ,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("audit log insert failed")


# ════════════════════════════════════════════════════════════════════════════
#  Sources
# ════════════════════════════════════════════════════════════════════════════

router = APIRouter(tags=["admin-scrape"])

_HIGH_RISK_FIELDS={"apply_end_date","official_notification_url","official_apply_url","organization_name","total_vacancies"}


class ScrapeRunBody(BaseModel):
    source_ids: list[str] | None = Field(default=None, max_length=50)
    limit: int = Field(default=25, ge=1, le=100)
    force: bool = False


class ReviewBody(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)
    corrected_value: str | int | float | bool | None = None


def _validate_queue_id(queue_id: str) -> None:
    qid = str(queue_id or "").strip()
    if len(qid) < 2:
        raise HTTPException(status_code=422, detail="Invalid queue_id format")

def _upsert_field_review(supabase, queue_id: str, field_name: str, status: str, admin: dict, notes: str | None=None, corrected_value=None):
    existing = (supabase.table("extracted_field_evidence").select("id, document_id").eq("scrape_queue_id", queue_id).eq("field_name", field_name).order("reviewed_at", desc=True, nullsfirst=False).order("created_at", desc=True).limit(1).execute().data or [])
    doc_id = (existing[0] or {}).get("document_id") if existing else None
    if not existing:
        qrows = (supabase.table("scrape_queue").select("id, source_id, source_url, scrape_run_id, extracted_data, notification_document_id").eq("id", queue_id).limit(1).execute().data or [])
        qrow = (qrows[0] or {}) if qrows else {}
        doc_id = doc_id or qrow.get("notification_document_id")
        if not doc_id:
            source_url = qrow.get("source_url")
            extracted_data = qrow.get("extracted_data") or {}
            content_hash = hashlib.sha256(f"scrape_queue:{queue_id}:{source_url}:{json.dumps(extracted_data, sort_keys=True, default=str)}".encode("utf-8")).hexdigest()
            nd_payload = {
                "source_id": qrow.get("source_id"),
                "scrape_run_id": qrow.get("scrape_run_id"),
                "source_url": source_url or f"manual://scrape_queue/{queue_id}",
                "final_url": source_url,
                "file_url": source_url or f"manual://scrape_queue/{queue_id}",
                "document_type": "unknown",
                "content_hash": content_hash,
                "raw_text": json.dumps(extracted_data, default=str),
                "metadata": {"created_by": "admin_field_review_fallback", "scrape_queue_id": queue_id},
            }
            try:
                nd_rows = supabase.table("notification_documents").insert(nd_payload).execute().data or []
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "fallback notification_document insert failed queue_id=%s source_url=%s content_hash=%s error=%s",
                    queue_id,
                    nd_payload.get("source_url"),
                    content_hash,
                    exc,
                )
                nd_rows = []
            if not nd_rows:
                nd_rows = (supabase.table("notification_documents").select("id").eq("content_hash", content_hash).limit(1).execute().data or [])
            if not nd_rows:
                logger.error(
                    "fallback notification_document unavailable; continuing field review without document queue_id=%s source_url=%s content_hash=%s",
                    queue_id,
                    nd_payload.get("source_url"),
                    content_hash,
                )
            else:
                doc_id = nd_rows[0]["id"]
                supabase.table("scrape_queue").update({"notification_document_id": doc_id}).eq("id", queue_id).execute()
        extracted_data = qrow.get("extracted_data") if qrow else {}
        extracted_value = corrected_value if corrected_value is not None else ((extracted_data or {}).get(field_name) if isinstance(extracted_data, dict) else None)
    else:
        qrows = (supabase.table("scrape_queue").select("id, extracted_data, notification_document_id").eq("id", queue_id).limit(1).execute().data or [])
        qrow = (qrows[0] or {}) if qrows else {}
        extracted_data = qrow.get("extracted_data") if qrow else {}
        extracted_value = corrected_value if corrected_value is not None else ((extracted_data or {}).get(field_name) if isinstance(extracted_data, dict) else None)
    payload={"scrape_queue_id": queue_id, "field_name": field_name, "document_id": doc_id, "reviewer_status": status, "reviewer_notes": notes, "reviewed_by": admin.get("id"), "reviewed_at": datetime.now(timezone.utc).isoformat(), "entity_type":"other","extraction_method":"manual","extracted_value":extracted_value}
    if corrected_value is not None:
        payload["corrected_value"]=corrected_value
    try:
        if existing:
            supabase.table("extracted_field_evidence").update(payload).eq("id", existing[0]["id"]).execute()
        else:
            supabase.table("extracted_field_evidence").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "extracted_field_evidence write failed queue_id=%s field_name=%s status=%s document_id=%s error=%s",
            queue_id,
            field_name,
            status,
            doc_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="Failed to write field evidence") from exc
    return payload

@router.post("/admin/scrape/items/{queue_id}/fields/{field_name}/verify")
def verify_field(queue_id: str, field_name: str, body: ReviewBody | None = None, admin: dict = Depends(require_permission("scraper.manage"))):
    _validate_queue_id(queue_id)
    if isinstance(body, dict):
        body = ReviewBody(**body)
    body=body or ReviewBody()
    sb=get_supabase_admin(); data=_upsert_field_review(sb, queue_id, field_name, "verified", admin, notes=body.notes)
    _audit(sb, admin, "scrape.field.verify", entity_type="scrape_field", entity_id=f"{queue_id}:{field_name}", new_value=data)
    return {"ok": True, **data}

@router.post("/admin/scrape/items/{queue_id}/fields/{field_name}/reject")
def reject_field(queue_id: str, field_name: str, body: ReviewBody | None = None, admin: dict = Depends(require_permission("scraper.manage"))):
    _validate_queue_id(queue_id)
    if isinstance(body, dict):
        body = ReviewBody(**body)
    body=body or ReviewBody()
    sb=get_supabase_admin(); data=_upsert_field_review(sb, queue_id, field_name, "rejected", admin, notes=body.notes)
    _audit(sb, admin, "scrape.field.reject", entity_type="scrape_field", entity_id=f"{queue_id}:{field_name}", new_value=data)
    return {"ok": True, **data}

@router.post("/admin/scrape/items/{queue_id}/fields/{field_name}/correct")
def correct_field(queue_id: str, field_name: str, body: ReviewBody | None = None, admin: dict = Depends(require_permission("scraper.manage"))):
    _validate_queue_id(queue_id)
    if isinstance(body, dict):
        body = ReviewBody(**body)
    body=body or ReviewBody()
    sb=get_supabase_admin(); data=_upsert_field_review(sb, queue_id, field_name, "corrected", admin, notes=body.notes, corrected_value=body.corrected_value)
    _audit(sb, admin, "scrape.field.correct", entity_type="scrape_field", entity_id=f"{queue_id}:{field_name}", new_value=data)
    return {"ok": True, **data}



def _shape_source(row: dict[str, Any]) -> dict[str, Any]:
    """Return a UI-friendly source row (matches Sources.jsx)."""
    return {
        "id": row.get("id"),
        "org": row.get("source_name") or row.get("name"),
        "official_url": row.get("official_url") or row.get("base_url"),
        "notification_url": row.get("notification_url"),
        "url": row.get("notification_url") or row.get("base_url"),
        "kind": row.get("source_type") or row.get("adapter_type"),
        "source_type": row.get("source_type"),
        "source_url": row.get("source_url"),
        "category": row.get("category"),
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
        "is_official_source": row.get("is_official_source"),
        "discovery_only": row.get("discovery_only"),
        "requires_official_confirmation": row.get("requires_official_confirmation"),
        "parser_config": row.get("parser_config") or {},
        "scrape_config": row.get("scrape_config") or {},
        "trust_config": row.get("trust_config") or {},
        "adapter_config": row.get("adapter_config") or {},
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
    return {"items": [_shape_source(r) for r in rows]}


# ════════════════════════════════════════════════════════════════════════════
#  Run-dry / run / runs / queue
# ════════════════════════════════════════════════════════════════════════════


@router.post("/admin/scrape/run-dry")
def scrape_run_dry(
    body: ScrapeRunBody | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Run a scrape pass in mock mode (no model call, deterministic output).

    Body (optional): ``{ "source_ids": ["uuid", ...] }``.
    """
    body = body or ScrapeRunBody()
    supabase = get_supabase_admin()
    summary = run_scraping_pass(
        supabase,
        triggered_by="admin",
        triggered_by_user=admin["id"],
        source_ids=body.source_ids,
        limit=body.limit,
        mock=True,
    )
    _audit(supabase, admin, "scrape.run_dry", entity_type="scrape_runs",
           entity_id=summary["run_id"], new_value=summary)
    return summary


@router.post("/admin/scrape/run")
def scrape_run(
    body: ScrapeRunBody | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Run a real scrape pass. It creates review queue items and never publishes."""
    body = body or ScrapeRunBody()
    supabase = get_supabase_admin()
    summary = run_scraping_pass(
        supabase,
        triggered_by="admin",
        triggered_by_user=admin["id"],
        source_ids=body.source_ids,
        limit=body.limit,
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
    limit: int = Query(default=50, ge=1, le=50),
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = (
        supabase.table("scrape_queue")
        .select("id, source_id, source_url, source_name, raw_html, raw_payload, extracted_data, confidence_score, data_quality_score, status, duplicate_of, reviewer_id, reviewer_notes, reviewed_at, field_evidence, official_source_resolved, official_source_host, extraction_status, evidence_required, scraped_at")
        .order("data_quality_score", desc=False, nullsfirst=True)
        .order("scraped_at", desc=True)
        .limit(limit)
    )
    if status and status != "all":
        q = q.eq("status", status)
    rows = q.execute().data or []
    supabase2 = get_supabase_admin()
    existing = (supabase2.table("recruitments").select("id,name,year,official_notification_url").limit(400).execute().data or [])
    queue_ids = [r["id"] for r in rows if r.get("id")]
    evidence_by_queue: dict[str, dict[str, str]] = {qid: {} for qid in queue_ids}
    if queue_ids:
        try:
            frows = (
                supabase.table("extracted_field_evidence")
                .select("scrape_queue_id, field_name, reviewer_status")
                .in_("scrape_queue_id", queue_ids)
                .execute()
                .data
                or []
            )
            for qid, group in group_by(frows, "scrape_queue_id").items():
                if qid in evidence_by_queue:
                    evidence_by_queue[qid] = {fr.get("field_name"): fr.get("reviewer_status") for fr in group}
        except Exception:
            evidence_by_queue = {qid: {} for qid in queue_ids}
    for r in rows:
        cls = classify_item(r)
        r["relevance_category"] = r.get("relevance_category") or cls["relevance_category"]
        r["lifecycle_event_type"] = cls["lifecycle_event_type"]
        r["classifier_confidence"] = cls["confidence"]
        r["classifier_reasons"] = cls["reasons"]
        ext = r.get("extracted_data") or {}
        meta = ext.get("_meta") if isinstance(ext, dict) else {}
        r["source_type"] = (meta or {}).get("source_type")
        dups = duplicate_candidates(ext if isinstance(ext, dict) else {}, existing)
        r["duplicate_candidates"] = dups
        r["multiple_posts_detected"] = bool((ext.get("posts") if isinstance(ext, dict) else None))
        r["high_risk_fields"] = sorted(list(_HIGH_RISK_FIELDS))
        reviewed = evidence_by_queue.get(r.get("id"), {})
        r["field_evidence_status"] = reviewed
        missing = [f for f in _HIGH_RISK_FIELDS if reviewed.get(f) not in {"verified", "corrected"}]
        r["unverified_fields"] = sorted(missing)
        r["promotable"] = len(missing) == 0
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
        .select("id, source_id, source_url, extracted_data, status, official_source_resolved, extraction_status")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    item = rows[0]
    if item["status"] not in {"approved", "pending", "needs_review"}:
        raise HTTPException(status_code=409, detail=f"Item is already {item['status']}")
    try:
        # High-risk fields should be reviewed before promotion where evidence table exists.
        warnings=[]
        try:
            frows=(supabase.table("extracted_field_evidence").select("field_name, reviewer_status").eq("scrape_queue_id", queue_id).execute().data or [])
            reviewed={r.get("field_name"):r.get("reviewer_status") for r in frows}
            missing=[f for f in _HIGH_RISK_FIELDS if reviewed.get(f) not in {"verified","corrected"}]
            if missing:
                raise HTTPException(status_code=409, detail={"message":"High-risk fields unverified","unverified_fields":missing})
        except HTTPException:
            raise
        except Exception:
            warnings.append("field_evidence_table_unavailable")
        extracted = ExtractedRecruitment(**(item["extracted_data"] or {}))
        rec_id = promote_to_recruitments(extracted, supabase, source_id=item.get("source_id"))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("scrape queue promotion failed queue_id=%s", queue_id)
        raise HTTPException(status_code=500, detail="Promote failed") from PromotionError("promotion write failed")
    updated_rows = (
        supabase.table("scrape_queue").update(
        {
            "status": "approved",
            "reviewer_id": admin["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "promoted_recruitment_id": rec_id,
        }
    ).eq("id", queue_id).execute().data
        or []
    )
    if not updated_rows:
        raise HTTPException(status_code=500, detail="Promote failed: queue status update failed")
    # Promotion only creates canonical draft/needs_review records; no publish fanout here.
    _audit(supabase, admin, "scrape.queue.promote", entity_type="scrape_queue",
           entity_id=queue_id, new_value={"recruitment_id": rec_id})
    return {"ok": True, "recruitment_id": rec_id, "publish_status": "needs_review"}


@router.post("/admin/scrape/promote/{run_id}")
def promote_run_endpoint(
    run_id: str,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    result = promote_run(run_id, supabase, reviewer_id=admin["id"])

    # Trust rule: promotion is not publication and must not fanout user alerts.
    result["alerts_sent"] = 0

    _audit(supabase, admin, "scrape.queue.promote", entity_type="scrape_runs",
           entity_id=run_id, new_value=result)
    return result




@router.post("/admin/scrape/items/{queue_id}/approve")
def approve_queue_item(
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
                "status": "approved",
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
    _audit(supabase, admin, "scrape.queue.approve", entity_type="scrape_queue",
           entity_id=queue_id, new_value=body)
    return {"ok": True, "id": queue_id, "status": "approved"}
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
    _audit(supabase, admin, "scrape.queue.reject", entity_type="scrape_queue",
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
        .select("id, source_name, source_url, extracted_data, extracted_fields, raw_payload, confidence_score, scraped_at, status, reviewed_at, reviewer_notes, promoted_recruitment_id")
        .eq("status", "pending")
        .order("scraped_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )

    def _shape(p: dict[str, Any]) -> dict[str, Any]:
        d = p.get("extracted_data") or {}
        normalized = p.get("extracted_fields") if isinstance(p.get("extracted_fields"), dict) else None
        return {
            "id": p["id"],
            "slug": p["id"],
            "recruitment": (d.get("title") if isinstance(d, dict) else None) or p.get("source_name"),
            "source": p.get("source_name"),
            "source_url": p.get("source_url"),
            "confidence": float(p.get("confidence_score") or 0),
            "added": p.get("scraped_at"),
            "status": p.get("status"),
            "reviewed_at": p.get("reviewed_at"),
            "reviewer_notes": p.get("reviewer_notes"),
            "promoted_recruitment_id": p.get("promoted_recruitment_id"),
            "raw_extracted_item": d if isinstance(d, dict) else {},
            "normalized_item": normalized if isinstance(normalized, dict) else (d if isinstance(d, dict) else {}),
            "previous_extraction": p.get("raw_payload") if isinstance(p.get("raw_payload"), dict) else None,
            "promoted_recruitment_snapshot": None,
            "confidence_history": None,
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
            .eq("status", "pending")
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
