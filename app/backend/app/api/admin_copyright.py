"""Copyright / DMCA takedown workflow API.

The submission endpoint is intentionally open (no auth) — DMCA notices
must be receivable from non-users. The route validates the statutory
statements before persistence. Triage/resolution endpoints require an
admin or trust-ops role.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, HttpUrl

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


public_router = APIRouter(prefix="/copyright", tags=["copyright"])
admin_router = APIRouter(prefix="/admin/copyright", tags=["admin-copyright"])


CLAIM_TYPES = {"dmca", "trademark", "patent", "privacy", "other"}
TARGET_TYPES = {
    "community_resource", "marketplace_resource", "forum_post",
    "forum_thread", "mentor_profile", "other",
}
STATUSES = {
    "received", "triage", "valid", "content_removed", "rejected",
    "counter_notice_received", "reinstated", "withdrawn",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _require_trust_ops(user: dict = Depends(get_current_user)) -> dict:
    role = (user.get("role") or "").lower()
    perms = set(user.get("permissions") or [])
    if role in {"admin", "super_admin", "trust_ops"} or "copyright.review" in perms:
        return user
    raise HTTPException(status_code=403, detail="Trust-ops or admin role required")


def _shape(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "claim_type": row.get("claim_type"),
        "claimant_name": row.get("claimant_name"),
        "claimant_email": row.get("claimant_email"),
        "claimant_org": row.get("claimant_org"),
        "work_title": row.get("work_title"),
        "work_description": row.get("work_description"),
        "ownership_evidence_url": row.get("ownership_evidence_url"),
        "target_entity_type": row.get("target_entity_type"),
        "target_entity_id": row.get("target_entity_id"),
        "infringing_url": row.get("infringing_url"),
        "status": row.get("status"),
        "severity": row.get("severity"),
        "assigned_to": row.get("assigned_to"),
        "resolution_notes": row.get("resolution_notes"),
        "removal_action_at": row.get("removal_action_at"),
        "counter_notice_at": row.get("counter_notice_at"),
        "received_at": row.get("received_at"),
        "resolved_at": row.get("resolved_at"),
        "metadata": row.get("metadata") or {},
    }


def _event(sb, claim_id: str, actor: dict | None, event_type: str, from_value=None, to_value=None, note=None) -> None:
    sb.table("copyright_events").insert(
        {
            "claim_id": claim_id,
            "actor_id": actor.get("id") if actor else None,
            "event_type": event_type,
            "from_value": str(from_value) if from_value is not None else None,
            "to_value": str(to_value) if to_value is not None else None,
            "note": note,
        }
    ).execute()


def _apply_removal(sb, target_type: str, target_id: str | None) -> bool:
    """Best-effort: flip the linked entity to a removed state. Returns True if a row was updated."""
    if not target_id:
        return False
    try:
        if target_type == "community_resource" and _is_uuid(target_id):
            res = sb.table("community_resources").update({"status": "dmca_removed", "updated_at": _now_iso()}).eq("id", target_id).execute()
            return bool(res.data)
        if target_type == "forum_post" and _is_uuid(target_id):
            res = sb.table("forum_posts").update({"is_deleted": True, "updated_at": _now_iso()}).eq("id", target_id).execute()
            return bool(res.data)
        if target_type == "forum_thread" and _is_uuid(target_id):
            res = sb.table("forum_threads").update({"is_locked": True, "is_hidden": True}).eq("id", target_id).execute()
            return bool(res.data)
    except Exception:
        return False
    return False


# ───────────────────────── Public submission ─────────────────────────


class ClaimSubmission(BaseModel):
    claim_type: str = "dmca"
    claimant_name: str = Field(min_length=2, max_length=200)
    claimant_email: EmailStr
    claimant_org: str | None = None
    claimant_role: str | None = None
    work_title: str = Field(min_length=2, max_length=400)
    work_description: str = Field(min_length=10, max_length=4000)
    ownership_evidence_url: HttpUrl | None = None
    target_entity_type: str = "other"
    target_entity_id: str | None = None
    infringing_url: HttpUrl
    good_faith_statement: bool = False
    accuracy_statement: bool = False
    signature: str = Field(min_length=2, max_length=200)


@public_router.post("/submit")
def submit_claim(body: ClaimSubmission) -> dict:
    if body.claim_type not in CLAIM_TYPES:
        raise HTTPException(status_code=400, detail=f"claim_type must be one of {sorted(CLAIM_TYPES)}")
    if body.target_entity_type not in TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"target_entity_type must be one of {sorted(TARGET_TYPES)}")
    if body.claim_type == "dmca" and not (body.good_faith_statement and body.accuracy_statement):
        raise HTTPException(
            status_code=400,
            detail="DMCA submissions require good_faith_statement and accuracy_statement to be true",
        )
    sb = get_supabase_admin()
    inserted = (
        sb.table("copyright_claims")
        .insert(
            {
                "claim_type": body.claim_type,
                "claimant_name": body.claimant_name,
                "claimant_email": body.claimant_email,
                "claimant_org": body.claimant_org,
                "claimant_role": body.claimant_role,
                "work_title": body.work_title,
                "work_description": body.work_description,
                "ownership_evidence_url": str(body.ownership_evidence_url) if body.ownership_evidence_url else None,
                "target_entity_type": body.target_entity_type,
                "target_entity_id": body.target_entity_id,
                "infringing_url": str(body.infringing_url),
                "good_faith_statement": body.good_faith_statement,
                "accuracy_statement": body.accuracy_statement,
                "signature": body.signature,
            }
        )
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to record claim")
    _event(sb, inserted[0]["id"], None, "submitted", to_value="received")
    return {
        "id": inserted[0]["id"],
        "status": "received",
        "message": "Your claim has been received. Trust ops will respond within 5 business days.",
        "received_at": inserted[0].get("received_at"),
    }


# ───────────────────────── Admin triage ─────────────────────────


class TriageBody(BaseModel):
    severity: str = "p2"
    note: str | None = None


class ResolveBody(BaseModel):
    resolution: str  # 'content_removed' | 'rejected' | 'withdrawn'
    notes: str | None = None


class CounterNoticeBody(BaseModel):
    text: str = Field(min_length=10, max_length=4000)


@admin_router.get("")
def list_claims(
    status: str | None = None,
    severity: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(_require_trust_ops),
) -> dict:
    sb = get_supabase_admin()
    q = sb.table("copyright_claims").select("*")
    if status and status in STATUSES:
        q = q.eq("status", status)
    if severity and severity in {"p0", "p1", "p2", "p3"}:
        q = q.eq("severity", severity)
    rows = q.order("received_at", desc=True).limit(limit).execute().data or []
    return {"claims": [_shape(r) for r in rows]}


@admin_router.get("/stats")
def claim_stats(user: dict = Depends(_require_trust_ops)) -> dict:
    sb = get_supabase_admin()

    def _count(**filters):
        q = sb.table("copyright_claims").select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        return getattr(res, "count", None) or 0

    return {
        "received": _count(status="received"),
        "triage": _count(status="triage"),
        "valid": _count(status="valid"),
        "content_removed": _count(status="content_removed"),
        "rejected": _count(status="rejected"),
        "counter_notice_received": _count(status="counter_notice_received"),
    }


@admin_router.get("/{claim_id}")
def get_claim(claim_id: str, user: dict = Depends(_require_trust_ops)) -> dict:
    if not _is_uuid(claim_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    row = sb.table("copyright_claims").select("*").eq("id", claim_id).limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    events = (
        sb.table("copyright_events")
        .select("*")
        .eq("claim_id", claim_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    return {"claim": _shape(row[0]), "events": events}


@admin_router.post("/{claim_id}/triage")
def triage_claim(claim_id: str, body: TriageBody, user: dict = Depends(_require_trust_ops)) -> dict:
    if not _is_uuid(claim_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    if body.severity not in {"p0", "p1", "p2", "p3"}:
        raise HTTPException(status_code=400, detail="Invalid severity")
    sb = get_supabase_admin()
    updated = (
        sb.table("copyright_claims")
        .update(
            {
                "status": "triage",
                "severity": body.severity,
                "assigned_to": user["id"],
                "updated_at": _now_iso(),
            }
        )
        .eq("id", claim_id)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Claim not found")
    _event(sb, claim_id, user, "triaged", to_value=body.severity, note=body.note)
    return _shape(updated[0])


@admin_router.post("/{claim_id}/resolve")
def resolve_claim(claim_id: str, body: ResolveBody, user: dict = Depends(_require_trust_ops)) -> dict:
    if not _is_uuid(claim_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    if body.resolution not in {"content_removed", "rejected", "withdrawn"}:
        raise HTTPException(status_code=400, detail="resolution must be content_removed | rejected | withdrawn")
    sb = get_supabase_admin()
    claim = sb.table("copyright_claims").select("*").eq("id", claim_id).limit(1).execute().data
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    c = claim[0]
    update = {
        "status": body.resolution,
        "resolution_notes": body.notes,
        "resolved_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if body.resolution == "content_removed":
        update["removal_action_at"] = _now_iso()
        _apply_removal(sb, c.get("target_entity_type"), c.get("target_entity_id"))
    updated = sb.table("copyright_claims").update(update).eq("id", claim_id).execute().data
    _event(sb, claim_id, user, body.resolution, to_value=body.resolution, note=body.notes)
    return _shape(updated[0])


@admin_router.post("/{claim_id}/counter-notice")
def counter_notice(claim_id: str, body: CounterNoticeBody, user: dict = Depends(_require_trust_ops)) -> dict:
    if not _is_uuid(claim_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    updated = (
        sb.table("copyright_claims")
        .update(
            {
                "status": "counter_notice_received",
                "counter_notice_at": _now_iso(),
                "counter_notice_text": body.text,
                "updated_at": _now_iso(),
            }
        )
        .eq("id", claim_id)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Claim not found")
    _event(sb, claim_id, user, "counter_notice", note=body.text[:200])
    return _shape(updated[0])
