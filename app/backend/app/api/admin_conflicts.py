"""Consensus conflict resolution for scrape queue + recruitments.

Endpoints (admin):

    GET  /api/admin/scrape/items/{queue_id}/conflicts
    GET  /api/admin/recruitments/{recruitment_id}/conflicts
    POST /api/admin/conflicts/{conflict_id}/resolve
    POST /api/admin/conflicts/{conflict_id}/reject

A conflict row in ``recruitment_verification_conflicts`` represents two
or more official-source candidates that disagree on a canonical field
value (e.g. the apply_end_date in the notification PDF vs the
corrigendum). The promotion gate refuses to promote a queue item while
any row for that queue_id is still ``status='open'``; admin override
flips the row to ``resolved_by_admin`` with the chosen value, reason
and evidence URL, and patches the canonical value into the upstream
target (scrape_queue.extracted_data or the recruitment row).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.admin_conflicts")

router = APIRouter(tags=["admin-conflicts"])


# Allowlist of recruitment columns that field-scope resolutions may
# overwrite. Keep this tight — any field that participates in the
# canonical schema and is plausibly the subject of a corrigendum.
_RECRUITMENT_EDITABLE_FIELDS = frozenset({
    "apply_start_date",
    "apply_end_date",
    "total_vacancies",
})


class ResolveBody(BaseModel):
    value: Any
    scope: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1)
    evidence_url: str = Field(..., min_length=1, max_length=2048)


class RejectBody(BaseModel):
    reason: str = Field(..., min_length=1)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit(supabase, actor: dict, action: str, *,
           entity_type: str, entity_id: str | None,
           payload: dict[str, Any]) -> None:
    """Best-effort write of an admin_audit_logs row."""
    try:
        supabase.table("admin_audit_logs").insert({
            "actor_id": actor.get("id"),
            "actor_email": actor.get("email"),
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "new_value": payload,
            "notes": "admin_conflicts",
        }).execute()
    except Exception:  # noqa: BLE001
        logger.exception("audit log insert failed for %s", action)


def _is_valid_url(url: str) -> bool:
    if not url or len(url) > 2048:
        return False
    try:
        parsed = urlparse(url)
    except Exception:  # noqa: BLE001
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _load_conflict(supabase, conflict_id: str) -> dict[str, Any]:
    rows = (
        supabase.table("recruitment_verification_conflicts")
        .select("*")
        .eq("id", conflict_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Conflict not found")
    return rows[0]


def _shape_conflict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "queue_id": row.get("queue_id"),
        "recruitment_id": row.get("recruitment_id"),
        "field_key": row.get("field_key"),
        "candidates": row.get("candidates") or [],
        "status": row.get("status") or "open",
        "resolved_value": row.get("resolved_value"),
        "resolved_scope": row.get("resolved_scope"),
        "resolved_by": row.get("resolved_by"),
        "resolved_reason": row.get("resolved_reason"),
        "resolved_evidence_url": row.get("resolved_evidence_url"),
        "created_at": row.get("created_at"),
        "resolved_at": row.get("resolved_at"),
    }


def _list_open_conflicts(supabase, *, queue_id: str | None = None,
                         recruitment_id: str | None = None) -> list[dict[str, Any]]:
    base = (
        supabase.table("recruitment_verification_conflicts")
        .select("*")
        .eq("status", "open")
    )
    if queue_id is not None:
        base = base.eq("queue_id", queue_id)
    if recruitment_id is not None:
        base = base.eq("recruitment_id", recruitment_id)
    rows = base.execute().data or []
    return [_shape_conflict(r) for r in rows]


@router.get("/admin/scrape/items/{queue_id}/conflicts")
def list_queue_item_conflicts(
    queue_id: str,
    _admin: dict = Depends(require_permission("scraper.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    items = _list_open_conflicts(supabase, queue_id=queue_id)
    return {"items": items, "queue_id": queue_id, "total": len(items)}


@router.get("/admin/recruitments/{recruitment_id}/conflicts")
def list_recruitment_conflicts(
    recruitment_id: str,
    _admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    items = _list_open_conflicts(supabase, recruitment_id=recruitment_id)
    return {"items": items, "recruitment_id": recruitment_id, "total": len(items)}


def _patch_queue_extracted_data(supabase, queue_id: str, field_key: str, value: Any) -> None:
    """Patch ``scrape_queue.extracted_data[field_key]`` with the chosen value."""
    rows = (
        supabase.table("scrape_queue")
        .select("id, extracted_data")
        .eq("id", queue_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return
    extracted = dict(rows[0].get("extracted_data") or {})
    extracted[field_key] = value
    supabase.table("scrape_queue").update({"extracted_data": extracted}).eq("id", queue_id).execute()


def _patch_recruitment_field(supabase, recruitment_id: str, field_key: str, value: Any) -> None:
    """Patch a single canonical column on a recruitment row.

    Only columns in :data:`_RECRUITMENT_EDITABLE_FIELDS` may be touched
    here — anything outside the allowlist is rejected so a maliciously
    crafted conflict can't, say, flip publish_status.
    """
    if field_key not in _RECRUITMENT_EDITABLE_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Field '{field_key}' is not admin-editable via conflict resolution",
        )
    supabase.table("recruitments").update({field_key: value}).eq("id", recruitment_id).execute()


def _bulk_resolve_for_recruitment_scope(
    supabase,
    *,
    primary: dict[str, Any],
    chosen_source_url: str | None,
    admin: dict,
    reason: str,
    evidence_url: str,
) -> list[str]:
    """When scope='recruitment', resolve every other open conflict on the
    same queue/recruitment whose candidates include the same source_url.

    Each matched conflict gets the candidate value from that source_url
    written into ``resolved_value``; the canonical target (queue payload
    or recruitment column) is patched the same way the primary resolution
    patches it. Returns the list of conflict_ids that were bulk-resolved.
    """
    if not chosen_source_url:
        return []

    siblings = (
        supabase.table("recruitment_verification_conflicts")
        .select("*")
        .eq("status", "open")
    )
    if primary.get("queue_id"):
        siblings = siblings.eq("queue_id", primary["queue_id"])
    elif primary.get("recruitment_id"):
        siblings = siblings.eq("recruitment_id", primary["recruitment_id"])
    else:
        return []

    rows = siblings.execute().data or []
    bulk_ids: list[str] = []
    for row in rows:
        if row.get("id") == primary.get("id"):
            continue
        candidates = row.get("candidates") or []
        match = next(
            (c for c in candidates if (c or {}).get("source_url") == chosen_source_url),
            None,
        )
        if match is None:
            continue
        value = match.get("value")
        field_key = row.get("field_key")
        if row.get("queue_id"):
            _patch_queue_extracted_data(supabase, row["queue_id"], field_key, value)
        elif row.get("recruitment_id") and field_key in _RECRUITMENT_EDITABLE_FIELDS:
            _patch_recruitment_field(supabase, row["recruitment_id"], field_key, value)
        supabase.table("recruitment_verification_conflicts").update({
            "status": "resolved_by_admin",
            "resolved_value": value,
            "resolved_scope": "recruitment",
            "resolved_by": admin.get("id"),
            "resolved_reason": reason,
            "resolved_evidence_url": evidence_url,
            "resolved_at": _utc_now_iso(),
        }).eq("id", row["id"]).execute()
        bulk_ids.append(row["id"])
    return bulk_ids


@router.post("/admin/conflicts/{conflict_id}/resolve")
def resolve_conflict(
    conflict_id: str,
    body: ResolveBody,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    if body.scope not in {"field", "recruitment"}:
        raise HTTPException(status_code=400, detail="scope must be 'field' or 'recruitment'")
    if len((body.reason or "").strip()) < 10:
        raise HTTPException(status_code=400, detail="reason must be at least 10 characters")
    if not _is_valid_url(body.evidence_url):
        raise HTTPException(status_code=400, detail="evidence_url must be a valid http(s) URL")

    supabase = get_supabase_admin()
    conflict = _load_conflict(supabase, conflict_id)
    if conflict.get("status") != "open":
        raise HTTPException(status_code=409, detail=f"Conflict already {conflict.get('status')}")

    field_key = conflict.get("field_key")
    queue_id = conflict.get("queue_id")
    recruitment_id = conflict.get("recruitment_id")

    # Patch the canonical target with the admin-chosen value.
    if queue_id:
        _patch_queue_extracted_data(supabase, queue_id, field_key, body.value)
    if recruitment_id and field_key in _RECRUITMENT_EDITABLE_FIELDS:
        _patch_recruitment_field(supabase, recruitment_id, field_key, body.value)

    update_payload = {
        "status": "resolved_by_admin",
        "resolved_value": body.value,
        "resolved_scope": body.scope,
        "resolved_by": admin.get("id"),
        "resolved_reason": body.reason,
        "resolved_evidence_url": body.evidence_url,
        "resolved_at": _utc_now_iso(),
    }
    updated_rows = (
        supabase.table("recruitment_verification_conflicts")
        .update(update_payload)
        .eq("id", conflict_id)
        .execute()
        .data
        or []
    )
    updated = updated_rows[0] if updated_rows else {**conflict, **update_payload}

    bulk_ids: list[str] = []
    if body.scope == "recruitment":
        # Find the source_url of the chosen value on the primary conflict so
        # we can bulk-resolve sibling fields backed by the same source.
        chosen_source_url = None
        for cand in conflict.get("candidates") or []:
            if (cand or {}).get("value") == body.value:
                chosen_source_url = (cand or {}).get("source_url")
                break
        bulk_ids = _bulk_resolve_for_recruitment_scope(
            supabase,
            primary=conflict,
            chosen_source_url=chosen_source_url,
            admin=admin,
            reason=body.reason,
            evidence_url=body.evidence_url,
        )

    _audit(
        supabase,
        admin,
        "conflict.resolve",
        entity_type="recruitment_verification_conflicts",
        entity_id=conflict_id,
        payload={
            "conflict": {**conflict, **update_payload},
            "request": {
                "value": body.value,
                "scope": body.scope,
                "reason": body.reason,
                "evidence_url": body.evidence_url,
            },
            "bulk_resolved_ids": bulk_ids,
        },
    )
    return {"ok": True, "conflict": _shape_conflict(updated), "bulk_resolved_ids": bulk_ids}


@router.post("/admin/conflicts/{conflict_id}/reject")
def reject_conflict(
    conflict_id: str,
    body: RejectBody,
    admin: dict = Depends(require_permission("recruitments.manage")),
) -> dict[str, Any]:
    if len((body.reason or "").strip()) < 1:
        raise HTTPException(status_code=400, detail="reason is required")

    supabase = get_supabase_admin()
    conflict = _load_conflict(supabase, conflict_id)
    if conflict.get("status") != "open":
        raise HTTPException(status_code=409, detail=f"Conflict already {conflict.get('status')}")

    update_payload = {
        "status": "rejected",
        "resolved_by": admin.get("id"),
        "resolved_reason": body.reason,
        "resolved_at": _utc_now_iso(),
    }
    updated_rows = (
        supabase.table("recruitment_verification_conflicts")
        .update(update_payload)
        .eq("id", conflict_id)
        .execute()
        .data
        or []
    )
    updated = updated_rows[0] if updated_rows else {**conflict, **update_payload}

    _audit(
        supabase,
        admin,
        "conflict.reject",
        entity_type="recruitment_verification_conflicts",
        entity_id=conflict_id,
        payload={
            "conflict": {**conflict, **update_payload},
            "request": {"reason": body.reason},
        },
    )
    return {"ok": True, "conflict": _shape_conflict(updated)}
