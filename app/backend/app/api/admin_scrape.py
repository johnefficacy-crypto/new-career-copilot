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
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user, require_permission
from app.core.errors import PromotionError
from app.common.indexing import group_by
from app.db.supabase_client import get_supabase_admin
from app.scraping.runner import promote_run, run_scraping_pass
from app.scraping.intelligence import classify_item, duplicate_candidates, BLOCKED
from app.scraping.promotion_gate import HIGH_RISK_FIELDS as _HIGH_RISK_FIELDS_SHARED, evaluate_promotion_gate

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

_HIGH_RISK_FIELDS = _HIGH_RISK_FIELDS_SHARED


class ScrapeRunBody(BaseModel):
    source_ids: list[str] | None = Field(default=None, max_length=50)
    limit: int = Field(default=25, ge=1, le=100)
    force: bool = False


class ReviewBody(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)
    corrected_value: str | int | float | bool | None = None
    # Entity scoping for post-scoped high-risk fields (e.g. requires_domicile
    # per post). When omitted the row is recruitment-scoped (entity_type=other).
    # Reject reason is the only "required" semantic and is enforced at the
    # router level so verify/correct can stay terse.
    entity_type: str | None = Field(default=None, max_length=32)
    entity_key: str | None = Field(default=None, max_length=200)


def _validate_queue_id(queue_id: str) -> None:
    qid = str(queue_id or "").strip()
    if len(qid) < 2:
        raise HTTPException(status_code=422, detail="Invalid queue_id format")


_NESTED_PATH_KEY = __import__("re").compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _parse_field_path(field_name: str) -> list[str | int]:
    """Parse a dotted field path like ``posts.0.min_age`` into segments.

    Each segment is either a safe key (``[A-Za-z_][A-Za-z0-9_]*``) or a
    non-negative integer for list indexing. Anything else raises 422 so
    we never let arbitrary strings drive a deep mutation. Returns a list
    of segments; a single-segment path is the legacy flat-key behaviour.
    """
    if not field_name or len(field_name) > 200:
        raise HTTPException(status_code=422, detail="Invalid field name")
    parts = field_name.split(".")
    out: list[str | int] = []
    for part in parts:
        if part == "":
            raise HTTPException(status_code=422, detail="Invalid field path")
        if part.isdigit():
            out.append(int(part))
        elif _NESTED_PATH_KEY.match(part):
            out.append(part)
        else:
            raise HTTPException(status_code=422, detail="Invalid field path segment")
    return out


def _nested_get(data, path: list[str | int]):
    cur = data
    for seg in path:
        if isinstance(seg, int):
            if not isinstance(cur, list) or seg < 0 or seg >= len(cur):
                return None
            cur = cur[seg]
        else:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(seg)
    return cur


def _nested_set(data, path: list[str | int], value) -> None:
    """Set a value at a nested path, creating intermediate dicts as needed.

    Refuses to grow lists or create list indexes that don't already
    exist — the queue extractor controls list shape, the admin only
    edits values inside it.
    """
    if not path:
        return
    cur = data
    for seg in path[:-1]:
        if isinstance(seg, int):
            if not isinstance(cur, list) or seg < 0 or seg >= len(cur):
                raise HTTPException(status_code=422, detail="Field path index out of range")
            cur = cur[seg]
        else:
            if not isinstance(cur, dict):
                raise HTTPException(status_code=422, detail="Field path expected dict")
            nxt = cur.get(seg)
            if nxt is None:
                nxt = {}
                cur[seg] = nxt
            cur = nxt
    last = path[-1]
    if isinstance(last, int):
        if not isinstance(cur, list) or last < 0 or last >= len(cur):
            raise HTTPException(status_code=422, detail="Field path index out of range")
        cur[last] = value
    else:
        if not isinstance(cur, dict):
            raise HTTPException(status_code=422, detail="Field path expected dict")
        cur[last] = value

_VALID_ENTITY_TYPES = frozenset({
    "recruitment", "post", "age_criteria", "education_criteria",
    "fee", "date", "vacancy", "other",
})


def _normalize_entity(entity_type: str | None, entity_key: str | None) -> tuple[str, str | None]:
    """Sanitise (entity_type, entity_key); defaults to recruitment-scoped row."""
    et = (entity_type or "other").strip().lower()
    if et not in _VALID_ENTITY_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid entity_type: {entity_type!r}")
    ek = (entity_key or "").strip() or None
    return et, ek


def _resolve_entity_path(extracted_data: Any, field_name: str, entity_type: str, entity_key: str | None) -> str | None:
    """Map (entity_type, entity_key, field_name) into a dotted path inside
    ``extracted_data`` that ``_parse_field_path`` understands.

    Returns ``None`` when the scope cannot be resolved (e.g. post entity
    referencing a post_name not present in the payload) — callers must
    treat that as "no value to read, no value to patch".
    """
    if entity_type == "post" and entity_key:
        posts = (extracted_data or {}).get("posts") if isinstance(extracted_data, dict) else None
        if not isinstance(posts, list):
            return None
        needle = entity_key.strip().lower()
        for idx, post in enumerate(posts):
            if not isinstance(post, dict):
                continue
            name = (post.get("post_name") or "").strip().lower()
            if name == needle:
                return f"posts.{idx}.{field_name}"
        return None
    return field_name


def _upsert_field_review(supabase, queue_id: str, field_name: str, status: str, admin: dict, notes: str | None=None, corrected_value=None, entity_type: str | None = None, entity_key: str | None = None):
    et, ek = _normalize_entity(entity_type, entity_key)
    # Pull a small page of recent evidence rows for this (queue, field) and
    # filter on (entity_type, entity_key) in Python. Doing the entity-scope
    # match server-side would need ``is_("entity_key", "null")`` for the
    # default recruitment-scoped case, which our test mocks don't all
    # implement. The unique index ``uq_evidence_entity_scoped`` keeps
    # production from holding >1 matching row anyway.
    candidates = (
        supabase.table("extracted_field_evidence")
        .select("id, document_id, entity_type, entity_key")
        .eq("scrape_queue_id", queue_id)
        .eq("field_name", field_name)
        .order("reviewed_at", desc=True, nullsfirst=False)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    def _ekey(row: dict) -> str | None:
        v = row.get("entity_key")
        return v.strip() if isinstance(v, str) and v.strip() else None
    existing = [
        r for r in candidates
        if (r.get("entity_type") or "other") == et and _ekey(r) == ek
    ][:1]
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
        path_str = _resolve_entity_path(extracted_data, field_name, et, ek)
        extracted_value = corrected_value if corrected_value is not None else (
            _nested_get(extracted_data, _parse_field_path(path_str)) if path_str else None
        )
    else:
        qrows = (supabase.table("scrape_queue").select("id, extracted_data, notification_document_id").eq("id", queue_id).limit(1).execute().data or [])
        qrow = (qrows[0] or {}) if qrows else {}
        extracted_data = qrow.get("extracted_data") if qrow else {}
        path_str = _resolve_entity_path(extracted_data, field_name, et, ek)
        extracted_value = corrected_value if corrected_value is not None else (
            _nested_get(extracted_data, _parse_field_path(path_str)) if path_str else None
        )
    payload={"scrape_queue_id": queue_id, "field_name": field_name, "document_id": doc_id, "reviewer_status": status, "reviewer_notes": notes, "reviewed_by": admin.get("id"), "reviewed_at": datetime.now(timezone.utc).isoformat(), "entity_type": et, "entity_key": ek, "extraction_method":"manual","extracted_value":extracted_value}
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


def build_effective_extracted_data(supabase, queue_id: str) -> dict:
    rows = (
        supabase.table("scrape_queue")
        .select("extracted_data")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    data = dict(rows[0].get("extracted_data") or {})
    evidence = (
        supabase.table("extracted_field_evidence")
        .select("field_name, reviewer_status, corrected_value, entity_type, entity_key")
        .eq("scrape_queue_id", queue_id)
        .execute()
        .data
        or []
    )
    for row in evidence:
        if row.get("reviewer_status") != "corrected" or row.get("corrected_value") is None:
            continue
        field_name = row.get("field_name") or ""
        path_str = _resolve_entity_path(data, field_name, (row.get("entity_type") or "other"), row.get("entity_key"))
        if not path_str:
            # Post entity referenced a post_name not present in current
            # extracted_data — old correction is stale, skip it.
            continue
        try:
            path = _parse_field_path(path_str)
        except HTTPException:
            # Skip rows with malformed field names — never crash the
            # promote/merge flow because of bad history.
            continue
        if len(path) == 1:
            data[path[0]] = row.get("corrected_value")
        else:
            try:
                _nested_set(data, path, row.get("corrected_value"))
            except HTTPException:
                continue
    return data


def patch_scrape_queue_extracted_field(supabase, queue_id: str, field_name: str, value, entity_type: str | None = None, entity_key: str | None = None):
    rows = (
        supabase.table("scrape_queue")
        .select("extracted_data")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    data = dict(rows[0].get("extracted_data") or {})
    et, ek = _normalize_entity(entity_type, entity_key)
    path_str = _resolve_entity_path(data, field_name, et, ek)
    if not path_str:
        # Post entity referenced an unknown post_name — surface as 422 so
        # the UI can prompt the admin to refresh; silently skipping would
        # let a "Correct" click look successful but write nothing.
        raise HTTPException(status_code=422, detail="Entity not found in extracted data")
    path = _parse_field_path(path_str)
    if len(path) == 1:
        data[path[0]] = value
    else:
        _nested_set(data, path, value)
    supabase.table("scrape_queue").update({"extracted_data": data}).eq("id", queue_id).execute()
    return data

@router.post("/admin/scrape/items/{queue_id}/fields/{field_name}/verify")
def verify_field(queue_id: str, field_name: str, body: ReviewBody | None = None, admin: dict = Depends(require_permission("scraper.manage"))):
    _validate_queue_id(queue_id)
    if isinstance(body, dict):
        body = ReviewBody(**body)
    body=body or ReviewBody()
    sb=get_supabase_admin(); data=_upsert_field_review(sb, queue_id, field_name, "verified", admin, notes=body.notes, corrected_value=body.corrected_value, entity_type=body.entity_type, entity_key=body.entity_key)
    if body.corrected_value is not None:
        patch_scrape_queue_extracted_field(sb, queue_id, field_name, body.corrected_value, entity_type=body.entity_type, entity_key=body.entity_key)
    _audit(sb, admin, "scrape.field.verify", entity_type="scrape_field", entity_id=f"{queue_id}:{field_name}", new_value=data)
    return {"ok": True, "field_name": field_name, "reviewer_status": "verified", **data, "effective_extracted_data": build_effective_extracted_data(sb, queue_id)}

@router.post("/admin/scrape/items/{queue_id}/fields/{field_name}/reject")
def reject_field(queue_id: str, field_name: str, body: ReviewBody | None = None, admin: dict = Depends(require_permission("scraper.manage"))):
    _validate_queue_id(queue_id)
    if isinstance(body, dict):
        body = ReviewBody(**body)
    body=body or ReviewBody()
    # Field-level rejects must carry an explanation. Without one the audit
    # trail can't answer "why was this evidence dismissed?" and a misclick
    # silently undoes verification work.
    if not (body.notes or "").strip():
        raise HTTPException(status_code=422, detail="Rejection reason is required.")
    sb=get_supabase_admin(); data=_upsert_field_review(sb, queue_id, field_name, "rejected", admin, notes=body.notes, entity_type=body.entity_type, entity_key=body.entity_key)
    _audit(sb, admin, "scrape.field.reject", entity_type="scrape_field", entity_id=f"{queue_id}:{field_name}", new_value=data)
    return {"ok": True, **data}

@router.post("/admin/scrape/items/{queue_id}/fields/{field_name}/correct")
def correct_field(queue_id: str, field_name: str, body: ReviewBody | None = None, admin: dict = Depends(require_permission("scraper.manage"))):
    _validate_queue_id(queue_id)
    if isinstance(body, dict):
        body = ReviewBody(**body)
    body=body or ReviewBody()
    sb=get_supabase_admin(); data=_upsert_field_review(sb, queue_id, field_name, "corrected", admin, notes=body.notes, corrected_value=body.corrected_value, entity_type=body.entity_type, entity_key=body.entity_key)
    if body.corrected_value is not None:
        patch_scrape_queue_extracted_field(sb, queue_id, field_name, body.corrected_value, entity_type=body.entity_type, entity_key=body.entity_key)
    _audit(sb, admin, "scrape.field.correct", entity_type="scrape_field", entity_id=f"{queue_id}:{field_name}", new_value=data)
    return {"ok": True, "field_name": field_name, "reviewer_status": "corrected", "corrected_value": body.corrected_value, **data, "effective_extracted_data": build_effective_extracted_data(sb, queue_id)}



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
        # Typed failure detail (migration 037) — surfaced so the admin can
        # filter "401 vs 5xx vs parser_error" instead of grepping `last_error`.
        "last_error_class": row.get("last_error_class"),
        "last_error_detail": row.get("last_error_detail"),
        "last_run": row.get("last_scraped_at"),
        "status": "ok" if (row.get("consecutive_fails") or 0) == 0 else "degraded",
        "is_active": row.get("is_active"),
        "is_official_source": row.get("is_official_source"),
        "discovery_only": row.get("discovery_only"),
        "requires_official_confirmation": row.get("requires_official_confirmation"),
        # Adapter routing (migration 022): expose every typed URL column so
        # the UI can show which URL the runner will actually hit.
        "adapter_type": row.get("adapter_type"),
        "crawl_url": row.get("crawl_url"),
        "rss_url": row.get("rss_url"),
        "api_url": row.get("api_url"),
        "pdf_bulletin_url": row.get("pdf_bulletin_url"),
        # Conditional-fetch state (migration 044): "has cached headers" is
        # what operators actually want to know — exact ETag is too noisy.
        "has_listing_cache": bool(row.get("last_listing_etag") or row.get("last_listing_modified")),
        "last_listing_modified": row.get("last_listing_modified"),
        # Concurrency lock (migration 052): non-null means a worker is
        # currently scraping this source (or the lock is stale).
        "currently_scraping_at": row.get("currently_scraping_at"),
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


@router.get("/admin/scrape/runs/{run_id}")
def get_scrape_run_detail(
    run_id: str,
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """Return one scrape_runs row plus a per-source breakdown.

    The frontend "Recent runs" list shows aggregate counts only. Admins
    need the per-source view (sources processed, items queued, errors)
    to debug a partial or failed pass without dropping to SQL.

    Per-source data is derived from ``scrape_queue`` rows linked back to
    this run via ``scrape_run_id``. Errors are taken from
    ``scrape_runs.error_log`` (the runner's structured per-source list).
    """
    if not run_id or len(run_id) < 2:
        raise HTTPException(status_code=422, detail="Invalid run_id")
    supabase = get_supabase_admin()
    rows = (
        supabase.table("scrape_runs")
        .select("*")
        .eq("id", run_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Scrape run not found")
    run = rows[0]

    # Per-source breakdown from scrape_queue rows produced by this run.
    queue_rows = (
        supabase.table("scrape_queue")
        .select("source_id, source_name, status, promoted_recruitment_id, official_source_resolved, data_quality_score")
        .eq("scrape_run_id", run_id)
        .limit(1000)
        .execute()
        .data
        or []
    )

    by_source: dict[str, dict[str, Any]] = {}
    for row in queue_rows:
        sid = row.get("source_id") or "__unknown__"
        if sid not in by_source:
            by_source[sid] = {
                "source_id": row.get("source_id"),
                "source_name": row.get("source_name") or "Unknown source",
                "items_total": 0,
                "items_pending": 0,
                "items_approved": 0,
                "items_rejected": 0,
                "items_duplicate": 0,
                "items_merged": 0,
                "items_promoted": 0,
                "items_official_unresolved": 0,
                "quality_min": None,
                "quality_max": None,
            }
        bucket = by_source[sid]
        bucket["items_total"] += 1
        st = (row.get("status") or "").lower()
        if st == "pending":
            bucket["items_pending"] += 1
        elif st == "approved":
            bucket["items_approved"] += 1
        elif st == "rejected":
            bucket["items_rejected"] += 1
        elif st == "duplicate":
            bucket["items_duplicate"] += 1
        elif st == "merged":
            bucket["items_merged"] += 1
        if row.get("promoted_recruitment_id"):
            bucket["items_promoted"] += 1
        if row.get("official_source_resolved") is False:
            bucket["items_official_unresolved"] += 1
        q = row.get("data_quality_score")
        if q is not None:
            bucket["quality_min"] = q if bucket["quality_min"] is None else min(bucket["quality_min"], q)
            bucket["quality_max"] = q if bucket["quality_max"] is None else max(bucket["quality_max"], q)

    # Index errors by source so the UI can show them next to the
    # per-source rows. error_log entries shape: {source, error, at}.
    errors = run.get("error_log") or []
    errors_by_source: dict[str, list[dict[str, Any]]] = {}
    for err in errors:
        if not isinstance(err, dict):
            continue
        key = (err.get("source") or "").strip()
        errors_by_source.setdefault(key, []).append(err)

    # Pull source_registry names so unknown / unscraped sources (errored
    # before producing any queue rows) still show up by name.
    src_ids = [s for s in by_source.keys() if s != "__unknown__"]
    name_by_id: dict[str, str] = {}
    if src_ids:
        srows = (
            supabase.table("source_registry")
            .select("id, source_name")
            .in_("id", src_ids)
            .execute()
            .data
            or []
        )
        name_by_id = {s["id"]: s.get("source_name") or "" for s in srows}

    per_source = []
    for sid, bucket in sorted(by_source.items(), key=lambda kv: kv[1]["source_name"].lower()):
        name = bucket["source_name"] or name_by_id.get(sid, "Unknown source")
        bucket["source_name"] = name
        bucket["errors"] = errors_by_source.get(name, [])
        per_source.append(bucket)

    return {
        "id": run["id"],
        "status": run.get("status"),
        "triggered_by": run.get("triggered_by"),
        "triggered_by_user": run.get("triggered_by_user"),
        "started_at": run.get("started_at"),
        "finished_at": run.get("finished_at"),
        "sources_checked": run.get("sources_checked") or 0,
        "items_found": run.get("items_found") or 0,
        "items_new": run.get("items_new") or 0,
        "items_duplicate": run.get("items_duplicate") or 0,
        "error_log": errors,
        "per_source": per_source,
    }


@router.get("/admin/scrape/queue")
def list_scrape_queue(
    status: str | None = Query(default="pending"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    source_type: str | None = Query(default=None, max_length=64),
    risk: str | None = Query(
        default=None,
        description="Risk filter: official_unresolved | low_quality | needs_review",
    ),
    sort: str = Query(
        default="risky_first",
        description="risky_first | quality_asc | newest | oldest",
    ),
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    """List scrape queue items with server-side filter/search/sort.

    The previous behaviour (status + limit) is preserved for callers that
    only pass those. New params let the admin UI stop loading 50 rows and
    filtering them in the browser, which was breaking past row 50.

    ``q`` matches against ``source_name`` and ``source_url`` (ILIKE).
    ``risk=official_unresolved`` enforces ``official_source_resolved=false``.
    ``risk=low_quality`` selects rows with ``data_quality_score < 50`` or null.
    """
    supabase = get_supabase_admin()
    selection = "id, source_id, source_url, source_name, raw_html, raw_payload, extracted_data, confidence_score, data_quality_score, status, duplicate_of, promoted_recruitment_id, reviewer_id, reviewer_notes, reviewed_at, field_evidence, official_source_resolved, official_source_host, extraction_status, evidence_required, scraped_at"
    base = supabase.table("scrape_queue").select(selection, count="exact")
    if status and status != "all":
        base = base.eq("status", status)
    if q:
        # PostgREST .or_ expects comma-separated filter expressions; ILIKE
        # gives case-insensitive search. The wildcard wrapping happens here
        # so callers don't need to know the SQL form.
        needle = f"%{q.strip()}%"
        base = base.or_(f"source_name.ilike.{needle},source_url.ilike.{needle}")
    if risk == "official_unresolved":
        base = base.eq("official_source_resolved", False)
    elif risk == "low_quality":
        base = base.lt("data_quality_score", 50)
    elif risk == "needs_review":
        base = base.in_("status", ["pending", "needs_review"])
    # Sort. ``risky_first`` puts unresolved-official rows ahead of the rest
    # by sorting on ``official_source_resolved`` nulls/false first, then
    # falling back to quality and recency.
    if sort == "quality_asc":
        base = base.order("data_quality_score", desc=False, nullsfirst=True).order("scraped_at", desc=True)
    elif sort == "newest":
        base = base.order("scraped_at", desc=True)
    elif sort == "oldest":
        base = base.order("scraped_at", desc=False)
    else:  # risky_first (default)
        base = base.order("official_source_resolved", desc=False, nullsfirst=True).order("data_quality_score", desc=False, nullsfirst=True).order("scraped_at", desc=True)
    # PostgREST uses (offset, limit-1) ranges; .range() handles that math.
    res = base.range(offset, offset + limit - 1).execute()
    rows = res.data or []
    total = getattr(res, "count", None)

    # source_type lives in source_registry, not on scrape_queue. Filter in
    # Python after the fetch — fine because the page size cap is 200.
    if source_type:
        wanted = source_type.strip().lower()
        if wanted:
            src_rows = (
                supabase.table("source_registry")
                .select("id, source_type")
                .execute()
                .data
                or []
            )
            type_by_id = {s.get("id"): (s.get("source_type") or "").lower() for s in src_rows}
            rows = [r for r in rows if type_by_id.get(r.get("source_id")) == wanted]

    supabase2 = get_supabase_admin()
    existing = (supabase2.table("recruitments").select("id,name,year,official_notification_url").limit(400).execute().data or [])
    queue_ids = [r["id"] for r in rows if r.get("id")]
    # ``evidence_by_queue`` is the legacy flat status map kept for callers
    # that only need "is the field reviewed?". ``evidence_details_by_queue``
    # carries the per-evidence-row payload (text snippet, page ref,
    # entity scope, corrected value, reviewer notes) so the UI can render
    # evidence inline without a follow-up request.
    evidence_by_queue: dict[str, dict[str, str]] = {qid: {} for qid in queue_ids}
    evidence_details_by_queue: dict[str, list[dict[str, Any]]] = {qid: [] for qid in queue_ids}
    if queue_ids:
        try:
            frows = (
                supabase.table("extracted_field_evidence")
                .select("scrape_queue_id, field_name, reviewer_status, entity_type, entity_key, evidence_text, page_number, char_start, char_end, confidence, corrected_value, reviewer_notes, reviewed_at, reviewed_by, source_page, alignment_status, document_id")
                .in_("scrape_queue_id", queue_ids)
                .execute()
                .data
                or []
            )
            for qid, group in group_by(frows, "scrape_queue_id").items():
                if qid not in evidence_by_queue:
                    continue
                # Flat status map keeps the legacy contract; post-scoped
                # rows collapse into the last-seen status, which is fine
                # because promotability comes from the gate (not this map).
                evidence_by_queue[qid] = {fr.get("field_name"): fr.get("reviewer_status") for fr in group}
                evidence_details_by_queue[qid] = [
                    {
                        "field_name": fr.get("field_name"),
                        "reviewer_status": fr.get("reviewer_status"),
                        "entity_type": fr.get("entity_type") or "other",
                        "entity_key": fr.get("entity_key"),
                        "evidence_text": fr.get("evidence_text"),
                        "page_number": fr.get("page_number"),
                        "char_start": fr.get("char_start"),
                        "char_end": fr.get("char_end"),
                        "confidence": fr.get("confidence"),
                        "corrected_value": fr.get("corrected_value"),
                        "reviewer_notes": fr.get("reviewer_notes"),
                        "reviewed_at": fr.get("reviewed_at"),
                        "reviewed_by": fr.get("reviewed_by"),
                        "source_page": fr.get("source_page"),
                        "alignment_status": fr.get("alignment_status"),
                        "document_id": fr.get("document_id"),
                    }
                    for fr in group
                ]
        except Exception:
            evidence_by_queue = {qid: {} for qid in queue_ids}
            evidence_details_by_queue = {qid: [] for qid in queue_ids}
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
        # Flat per-field map is kept for the review UI to show evidence
        # status at a glance, but it must NOT decide promotability — it
        # collapses post-scoped fields (a per-post field verified for one
        # post would look globally verified).
        reviewed = evidence_by_queue.get(r.get("id"), {})
        r["field_evidence_status"] = reviewed
        missing = [f for f in _HIGH_RISK_FIELDS if reviewed.get(f) not in {"verified", "corrected"}]
        r["unverified_fields"] = sorted(missing)
        r["promotable"] = len(missing) == 0
    return {
        "items": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
        "filters": {
            "status": status,
            "q": q,
            "source_type": source_type,
            "risk": risk,
            "sort": sort,
        },
    }


# ════════════════════════════════════════════════════════════════════════════
#  Promote / reject
# ════════════════════════════════════════════════════════════════════════════


@router.get("/admin/scrape/items/{queue_id}/promotion-preview")
def promotion_preview(
    queue_id: str,
    _admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    """Return a dry-run preview of what promoting this queue item would create.

    Reads the same effective extracted data + gate evidence the actual
    promote endpoint reads, but writes nothing. Used by the Operations
    Console "Promotion preview" panel so admins can confirm the
    recruitment / organization / posts / blockers shape before clicking
    Promote — which today gives them only a generic gate error toast.
    """
    from pydantic import ValidationError as _PydValidationError

    from app.scraping.runner import compute_promotion_slug
    from app.scraping.schemas import ExtractedRecruitment

    _validate_queue_id(queue_id)
    supabase = get_supabase_admin()
    rows = (
        supabase.table("scrape_queue")
        .select("id, source_id, source_url, source_name, extracted_data, status, official_source_resolved, official_source_host, extraction_status")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    item = rows[0]

    blocking: list[dict[str, Any]] = []
    warnings: list[str] = []

    if item.get("status") not in {"approved", "pending", "needs_review"}:
        blocking.append({
            "code": "wrong_status",
            "message": f"Queue item is {item.get('status')!r}; only pending/needs_review/approved items are promotable.",
        })
    if item.get("official_source_resolved") is False:
        blocking.append({
            "code": "unverified_official_source",
            "message": "Resolve an official source before promotion.",
        })

    # Field-evidence gate (mirrors promote_queue_item).
    reviewed: dict[str, str | None] = {}
    try:
        frows = (
            supabase.table("extracted_field_evidence")
            .select("field_name, reviewer_status")
            .eq("scrape_queue_id", queue_id)
            .execute()
            .data
            or []
        )
        reviewed = {r.get("field_name"): r.get("reviewer_status") for r in frows}
        missing = [f for f in _HIGH_RISK_FIELDS if reviewed.get(f) not in {"verified", "corrected"}]
        if missing:
            blocking.append({
                "code": "high_risk_fields_unverified",
                "message": "Verify or correct required fields before promotion.",
                "unverified_fields": sorted(missing),
            })
    except Exception:
        warnings.append("field_evidence_table_unavailable")

    # Effective data — re-run corrections so the preview mirrors what
    # promote_to_recruitments would actually write.
    try:
        effective = build_effective_extracted_data(supabase, queue_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("promotion preview effective-data build failed queue_id=%s", queue_id)
        effective = item.get("extracted_data") or {}
        warnings.append("effective_data_unavailable")

    extracted: ExtractedRecruitment | None = None
    try:
        extracted = ExtractedRecruitment(**effective)
    except _PydValidationError as exc:
        # Shape errors are blockers — promotion will hit the same wall.
        # Surface them as a clickable checklist instead of a 500.
        for err in exc.errors():
            loc = ".".join(str(part) for part in err.get("loc", []))
            blocking.append({
                "code": "schema_violation",
                "field": loc,
                "message": err.get("msg") or "Invalid value",
            })

    # Organization preview: does the recruiting organization already exist?
    org_name = (effective.get("organization_name") or "").strip()
    org_state = "unknown"
    org_existing_id = None
    if org_name:
        org_rows = (
            supabase.table("organizations")
            .select("id, name")
            .ilike("name", org_name)
            .limit(1)
            .execute()
            .data
            or []
        )
        if org_rows:
            org_existing_id = org_rows[0].get("id")
            org_state = "link_existing"
        else:
            org_state = "create_new"

    # Slug-duplicate preview: would the recruitment collide?
    duplicate_recruitment_id = None
    duplicate_slug = None
    if extracted is not None:
        try:
            slug = compute_promotion_slug(extracted)
            duplicate_slug = slug
            dup_rows = (
                supabase.table("recruitments")
                .select("id, slug, name")
                .eq("slug", slug)
                .limit(1)
                .execute()
                .data
                or []
            )
            if dup_rows:
                duplicate_recruitment_id = dup_rows[0].get("id")
                blocking.append({
                    "code": "duplicate_slug",
                    "message": "A recruitment with this slug already exists. Use merge-into instead of promote.",
                    "existing_recruitment_id": duplicate_recruitment_id,
                    "slug": slug,
                })
        except Exception:
            warnings.append("slug_compute_failed")

    posts_preview = []
    for idx, post in enumerate((effective.get("posts") or [])):
        if not isinstance(post, dict):
            continue
        posts_preview.append({
            "index": idx,
            "post_name": post.get("post_name"),
            "vacancies": post.get("vacancies"),
            "min_age": post.get("min_age"),
            "max_age": post.get("max_age"),
            "education_required": post.get("education_required"),
            "unit_name": post.get("unit_name"),
            "unit_location_state": post.get("unit_location_state"),
        })

    return {
        "queue_id": queue_id,
        "ok": len(blocking) == 0,
        "blocking_issues": blocking,
        "warnings": warnings,
        "recruitment_preview": {
            "title": effective.get("title"),
            "year": effective.get("year"),
            "organization_name": org_name or None,
            "notification_date": effective.get("notification_date"),
            "apply_start_date": effective.get("apply_start_date"),
            "apply_end_date": effective.get("apply_end_date"),
            "total_vacancies": effective.get("total_vacancies"),
            "official_notification_url": effective.get("official_notification_url"),
            "official_apply_url": effective.get("official_apply_url"),
            "source_pdf_url": effective.get("source_pdf_url"),
            "slug": duplicate_slug,
            "publish_status_after": "needs_review",
        },
        "organization_preview": {
            "state": org_state,
            "existing_id": org_existing_id,
            "name": org_name or None,
        },
        "posts_preview": posts_preview,
        "duplicate_recruitment_id": duplicate_recruitment_id,
        "official_source": {
            "resolved": bool(item.get("official_source_resolved")),
            "host": item.get("official_source_host"),
        },
        "evidence_summary": {
            "required_fields": sorted(list(_HIGH_RISK_FIELDS)),
            "reviewed": reviewed,
        },
    }


@router.post("/admin/scrape/items/{queue_id}/promote")
def promote_queue_item(
    queue_id: str,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    from pydantic import ValidationError

    from app.scraping.runner import DuplicatePromotionError, promote_to_recruitments
    from app.scraping.schemas import VerifiedRecruitmentForPromotion

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
        gate = evaluate_promotion_gate(supabase, item)
        if not gate.ok:
            if gate.reason == "unverified_official_source":
                raise HTTPException(
                    status_code=409,
                    detail={"message": "Official source not resolved", "reason": gate.reason},
                )
            if gate.reason == "data_contradictions":
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "Data contradictions must be corrected before promotion",
                        "reason": gate.reason,
                        "contradictions": gate.unverified_fields,
                    },
                )
            raise HTTPException(
                status_code=409,
                detail={"message": "High-risk fields unverified", "unverified_fields": gate.unverified_fields},
            )
        warnings = list(gate.warnings)
        effective_data = build_effective_extracted_data(supabase, queue_id)
        # Strict shape: the gate verifies the high-risk *values*, but core
        # structural fields (title / org_type / year / at least one post)
        # are enforced here so a structurally-incomplete row fails with a
        # clear 422 instead of a half-written recruitment or a 500.
        try:
            extracted = VerifiedRecruitmentForPromotion(**effective_data)
        except ValidationError as exc:
            missing = sorted({str(e.get("loc", ["?"])[0]) for e in exc.errors()})
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Extracted data is missing fields required for promotion",
                    "reason": "incomplete_for_promotion",
                    "invalid_fields": missing,
                },
            ) from exc
        rec_id = promote_to_recruitments(extracted, supabase, source_id=item.get("source_id"))
    except HTTPException:
        raise
    except DuplicatePromotionError as exc:
        raise HTTPException(status_code=409, detail={
            "message": "Recruitment already exists",
            "reason": "duplicate_slug",
            "existing_recruitment_id": exc.existing_recruitment_id,
            "slug": exc.slug,
            "next_actions": ["open_existing_recruitment", "merge_reviewed_fields", "mark_duplicate"],
        }) from exc
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




class ResolveOfficialSourceBody(BaseModel):
    source_id: str = Field(..., min_length=1, max_length=64)
    official_notification_url: str | None = Field(default=None, max_length=2048)
    official_apply_url: str | None = Field(default=None, max_length=2048)
    source_pdf_url: str | None = Field(default=None, max_length=2048)
    notes: str | None = Field(default=None, max_length=2000)


@router.post("/admin/scrape/items/{queue_id}/resolve-official-source")
def resolve_official_source_for_queue_item(
    queue_id: str,
    body: ResolveOfficialSourceBody,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    """Mark a queue item as backed by a verified official source.

    Promotion is gated by ``official_source_resolved``; aggregator
    candidates fail the gate by default. This endpoint lets an admin
    attach a verified, non-aggregator source to the queue row, patch the
    aggregator-paraphrased official URLs with the values the admin has
    confirmed, and flip the gate flag on. Promotion is *not* triggered;
    the admin still has to click Promote after the gate passes.
    """
    _validate_queue_id(queue_id)
    supabase = get_supabase_admin()

    qrows = (
        supabase.table("scrape_queue")
        .select("id, source_id, extracted_data, status")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not qrows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    queue_row = qrows[0]

    src_rows = (
        supabase.table("source_registry")
        .select("id, source_name, source_type, is_verified, discovery_only, is_active, official_url")
        .eq("id", body.source_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not src_rows:
        raise HTTPException(status_code=404, detail="Source not found")
    source = src_rows[0]

    if not source.get("is_verified"):
        raise HTTPException(status_code=409, detail={"message": "Selected source is not verified", "reason": "source_unverified"})
    if source.get("source_type") == "aggregator" or source.get("discovery_only"):
        raise HTTPException(status_code=409, detail={"message": "Aggregator/discovery-only sources cannot be used as official proof", "reason": "source_discovery_only"})
    if source.get("is_active") is False:
        raise HTTPException(status_code=409, detail={"message": "Selected source is inactive", "reason": "source_inactive"})

    # Patch official URLs into extracted_data so promote_to_recruitments
    # writes the admin-confirmed values into the canonical recruitment row.
    extracted = dict(queue_row.get("extracted_data") or {})
    if body.official_notification_url:
        extracted["official_notification_url"] = body.official_notification_url
    if body.official_apply_url:
        extracted["official_apply_url"] = body.official_apply_url
    if body.source_pdf_url:
        extracted["source_pdf_url"] = body.source_pdf_url

    primary_url = body.official_notification_url or body.official_apply_url or source.get("official_url") or ""
    official_host = (urlparse(primary_url).hostname or "").lower() if primary_url else None

    update: dict[str, Any] = {
        "source_id": body.source_id,
        "official_source_resolved": True,
        "official_source_host": official_host,
        "evidence_required": False,
        "extracted_data": extracted,
    }
    supabase.table("scrape_queue").update(update).eq("id", queue_id).execute()

    _audit(
        supabase,
        admin,
        "scrape.queue.resolve_official_source",
        entity_type="scrape_queue",
        entity_id=queue_id,
        new_value={
            "source_id": body.source_id,
            "official_source_host": official_host,
            "official_notification_url": body.official_notification_url,
            "official_apply_url": body.official_apply_url,
            "source_pdf_url": body.source_pdf_url,
            "notes": body.notes,
        },
    )
    return {
        "ok": True,
        "queue_id": queue_id,
        "source_id": body.source_id,
        "official_source_resolved": True,
        "official_source_host": official_host,
    }


_MERGE_PREVIEW_FIELDS = [
    "official_notification_url",
    "official_apply_url",
    "apply_start_date",
    "apply_end_date",
    "notification_date",
    "total_vacancies",
    "source_pdf_url",
]


@router.get("/admin/scrape/items/{queue_id}/merge-preview/{recruitment_id}")
def merge_preview(
    queue_id: str,
    recruitment_id: str,
    _admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    """Show what merging this queue item into the recruitment would do.

    Returns one row per safe field with current/queue/corrected values
    and the decision the merge endpoint would take. ``force_available``
    means the field has a non-empty existing value, so the merge skips
    it unless the admin forces it. ``update`` means the queue value
    wins (existing is empty, or the queue value is admin-corrected).
    """
    _validate_queue_id(queue_id)
    supabase = get_supabase_admin()
    qrows = (
        supabase.table("scrape_queue")
        .select("id, source_id, extracted_data")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not qrows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    rec_rows = (
        supabase.table("recruitments")
        .select("*")
        .eq("id", recruitment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rec_rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    existing = rec_rows[0]
    queue_extracted = qrows[0].get("extracted_data") or {}
    effective = build_effective_extracted_data(supabase, queue_id)
    evidence = (
        supabase.table("extracted_field_evidence")
        .select("field_name, reviewer_status, corrected_value")
        .eq("scrape_queue_id", queue_id)
        .execute()
        .data
        or []
    )
    corrected_lookup = {
        r.get("field_name"): r.get("corrected_value")
        for r in evidence
        if r.get("reviewer_status") == "corrected"
    }

    fields: list[dict[str, Any]] = []
    for field in _MERGE_PREVIEW_FIELDS:
        queue_value = queue_extracted.get(field) if isinstance(queue_extracted, dict) else None
        corrected = corrected_lookup.get(field)
        effective_value = effective.get(field) if isinstance(effective, dict) else None
        current = existing.get(field)
        row = {
            "field": field,
            "current_value": current,
            "queue_value": queue_value,
            "corrected_value": corrected,
            "effective_value": effective_value,
        }
        if effective_value in (None, ""):
            row["decision"] = "skip"
            row["reason"] = "no_queue_value"
        elif corrected is not None or current in (None, ""):
            row["decision"] = "update"
            row["reason"] = "corrected" if corrected is not None else "existing_empty"
        else:
            row["decision"] = "force_available"
            row["reason"] = "existing_value_present"
        fields.append(row)

    # source_id row gives admins a separate signal for provenance reassignment.
    queue_source = qrows[0].get("source_id")
    fields.append({
        "field": "source_id",
        "current_value": existing.get("source_id"),
        "queue_value": queue_source,
        "corrected_value": None,
        "effective_value": queue_source,
        "decision": "skip" if queue_source in (None, "") else (
            "update" if existing.get("source_id") in (None, "") else "force_available"
        ),
        "reason": "existing_value_present" if existing.get("source_id") and queue_source else None,
    })

    return {
        "ok": True,
        "queue_id": queue_id,
        "recruitment_id": recruitment_id,
        "fields": fields,
    }


@router.post("/admin/scrape/items/{queue_id}/merge-into/{recruitment_id}")
def merge_queue_item_into_recruitment(
    queue_id: str,
    recruitment_id: str,
    body: dict | None = None,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    body = body or {}
    force_fields = set(body.get("force_fields") or [])
    supabase = get_supabase_admin()
    qrows = supabase.table("scrape_queue").select("id, source_id, extracted_data, status").eq("id", queue_id).limit(1).execute().data or []
    if not qrows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    rec_rows = supabase.table("recruitments").select("*").eq("id", recruitment_id).limit(1).execute().data or []
    if not rec_rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    existing = rec_rows[0]
    effective = build_effective_extracted_data(supabase, queue_id)
    evidence = supabase.table("extracted_field_evidence").select("field_name, reviewer_status").eq("scrape_queue_id", queue_id).execute().data or []
    corrected_fields = {r.get("field_name") for r in evidence if r.get("reviewer_status") == "corrected"}
    safe_fields = ["official_notification_url", "official_apply_url", "apply_start_date", "apply_end_date", "notification_date", "total_vacancies", "source_pdf_url"]
    patch: dict[str, Any] = {}
    skipped: dict[str, str] = {}
    for field in safe_fields:
        value = effective.get(field)
        if value in (None, ""):
            continue
        if field in corrected_fields or field in force_fields or existing.get(field) in (None, ""):
            patch[field] = value
        else:
            skipped[field] = "existing_value_present"
    if qrows[0].get("source_id") and (not existing.get("source_id") or "source_id" in force_fields):
        patch["source_id"] = qrows[0].get("source_id")
    if body.get("review_notes"):
        patch["review_notes"] = body.get("review_notes")
    before = {k: existing.get(k) for k in patch}
    if patch:
        supabase.table("recruitments").update(patch).eq("id", recruitment_id).execute()
    supabase.table("scrape_queue").update({
        "status": "merged",
        "promoted_recruitment_id": recruitment_id,
        "reviewer_id": admin["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewer_notes": body.get("notes"),
    }).eq("id", queue_id).execute()
    _audit(supabase, admin, "scrape.queue.merge", entity_type="scrape_queue", entity_id=queue_id, new_value={"recruitment_id": recruitment_id, "before": before, "after": patch, "skipped_fields": skipped})
    return {"ok": True, "status": "merged", "recruitment_id": recruitment_id, "updated_fields": sorted(patch.keys()), "skipped_fields": skipped}


@router.post("/admin/scrape/items/{queue_id}/mark-duplicate")
def mark_queue_item_duplicate(
    queue_id: str,
    body: dict | None = None,
    admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    body = body or {}
    supabase = get_supabase_admin()
    rows = supabase.table("scrape_queue").update({
        "status": "duplicate",
        "reviewer_id": admin["id"],
        "reviewer_notes": body.get("notes"),
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", queue_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Queue item not found")
    _audit(supabase, admin, "scrape.queue.mark_duplicate", entity_type="scrape_queue", entity_id=queue_id, new_value=body)
    return {"ok": True, "id": queue_id, "status": "duplicate"}


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
    queue_ids = [p["id"] for p in pending_rows if p.get("id")]
    evidence_by_queue: dict[str, dict[str, str]] = {qid: {} for qid in queue_ids}
    evidence_details_by_queue: dict[str, list[dict[str, Any]]] = {qid: [] for qid in queue_ids}
    if queue_ids:
        try:
            frows = (
                supabase.table("extracted_field_evidence")
                .select("scrape_queue_id, field_name, reviewer_status, entity_type, entity_key, evidence_text, page_number, char_start, char_end, confidence, corrected_value, reviewer_notes, reviewed_at, reviewed_by, source_page, alignment_status, document_id")
                .in_("scrape_queue_id", queue_ids)
                .execute()
                .data
                or []
            )
            for qid, group in group_by(frows, "scrape_queue_id").items():
                evidence_by_queue[qid] = {fr.get("field_name"): fr.get("reviewer_status") for fr in group}
                evidence_details_by_queue[qid] = [
                    {
                        "field_name": fr.get("field_name"),
                        "reviewer_status": fr.get("reviewer_status"),
                        "entity_type": fr.get("entity_type") or "other",
                        "entity_key": fr.get("entity_key"),
                        "evidence_text": fr.get("evidence_text"),
                        "page_number": fr.get("page_number"),
                        "char_start": fr.get("char_start"),
                        "char_end": fr.get("char_end"),
                        "confidence": fr.get("confidence"),
                        "corrected_value": fr.get("corrected_value"),
                        "reviewer_notes": fr.get("reviewer_notes"),
                        "reviewed_at": fr.get("reviewed_at"),
                        "reviewed_by": fr.get("reviewed_by"),
                        "source_page": fr.get("source_page"),
                        "alignment_status": fr.get("alignment_status"),
                        "document_id": fr.get("document_id"),
                    }
                    for fr in group
                ]
        except Exception:
            evidence_by_queue = {qid: {} for qid in queue_ids}
            evidence_details_by_queue = {qid: [] for qid in queue_ids}

    def _shape(p: dict[str, Any]) -> dict[str, Any]:
        d = p.get("extracted_data") or {}
        normalized = p.get("extracted_fields") if isinstance(p.get("extracted_fields"), dict) else None
        reviewed = evidence_by_queue.get(p["id"], {})
        missing = [f for f in _HIGH_RISK_FIELDS if reviewed.get(f) not in {"verified", "corrected"}]
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
            "field_evidence_status": reviewed,
            "field_evidence_details": evidence_details_by_queue.get(p["id"], []),
            "high_risk_fields": sorted(list(_HIGH_RISK_FIELDS)),
            "unverified_fields": sorted(missing),
            "promotable": len(missing) == 0,
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
