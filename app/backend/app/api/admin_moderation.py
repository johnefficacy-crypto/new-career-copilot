"""Moderation Queue API.

Two surfaces:
  * /api/moderation/report     — any signed-in user files a report
  * /api/admin/moderation/...  — moderators triage, claim, resolve

Every state transition appends a moderation_events row so audits replay
the rubric version applied at the time of decision.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


# Public-ish (signed-in) reporter surface.
router = APIRouter(tags=["moderation"])
admin_router = APIRouter(prefix="/admin/moderation", tags=["admin-moderation"])


ENTITY_TYPES = {
    "forum_thread", "forum_post", "community_resource",
    "mentor_profile", "marketplace_listing", "ai_response", "user_profile",
}
SEVERITIES = {"p0", "p1", "p2", "p3"}
TERMINAL_STATUSES = {"resolved", "dismissed"}
RESOLUTIONS = {
    "no_action", "content_removed", "user_warned", "user_suspended",
    "user_banned", "edit_required", "escalated_legal", "duplicate",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _require_moderator(user: dict = Depends(get_current_user)) -> dict:
    role = (user.get("role") or "").lower()
    perms = set(user.get("permissions") or [])
    if role in {"admin", "super_admin", "moderator"} or "moderation.review" in perms:
        return user
    raise HTTPException(status_code=403, detail="Moderator role required")


def _shape(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "entity_type": row.get("entity_type"),
        "entity_id": row.get("entity_id"),
        "severity": row.get("severity"),
        "severity_rubric_version": row.get("severity_rubric_version"),
        "reason": row.get("reason"),
        "reason_code": row.get("reason_code"),
        "reporter_id": row.get("reporter_id"),
        "reporter_role": row.get("reporter_role"),
        "status": row.get("status"),
        "assigned_to": row.get("assigned_to"),
        "assigned_at": row.get("assigned_at"),
        "resolution": row.get("resolution"),
        "resolution_notes": row.get("resolution_notes"),
        "resolved_by": row.get("resolved_by"),
        "resolved_at": row.get("resolved_at"),
        "metadata": row.get("metadata") or {},
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _record_event(sb, item_id: str, actor: dict | None, event_type: str, from_value=None, to_value=None, note=None) -> None:
    sb.table("moderation_events").insert(
        {
            "item_id": item_id,
            "actor_id": actor.get("id") if actor else None,
            "event_type": event_type,
            "from_value": str(from_value) if from_value is not None else None,
            "to_value": str(to_value) if to_value is not None else None,
            "note": note,
        }
    ).execute()


def _active_rubric_version(sb) -> str:
    row = (
        sb.table("moderation_severity_rubric")
        .select("version")
        .eq("is_active", True)
        .limit(1)
        .execute()
        .data
    )
    return row[0]["version"] if row else "v1"


# ───────────────────────── Reporter side ─────────────────────────


class ReportBody(BaseModel):
    entity_type: str
    entity_id: str
    reason: str = Field(min_length=4, max_length=2000)
    reason_code: str | None = None
    severity: str = "p2"
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.post("/moderation/report")
def file_report(body: ReportBody, user: dict = Depends(get_current_user)) -> dict:
    if body.entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=400, detail=f"entity_type must be one of {sorted(ENTITY_TYPES)}")
    if body.severity not in SEVERITIES:
        raise HTTPException(status_code=400, detail="severity must be p0/p1/p2/p3")
    sb = get_supabase_admin()
    inserted = (
        sb.table("moderation_items")
        .insert(
            {
                "entity_type": body.entity_type,
                "entity_id": body.entity_id,
                "severity": body.severity,
                "severity_rubric_version": _active_rubric_version(sb),
                "reason": body.reason,
                "reason_code": body.reason_code,
                "reporter_id": user["id"],
                "reporter_role": (user.get("role") or "user"),
                "metadata": body.metadata or {},
            }
        )
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to file report")
    _record_event(sb, inserted[0]["id"], user, "created", to_value="open")
    return _shape(inserted[0])


@router.get("/moderation/my-reports")
def my_reports(user: dict = Depends(get_current_user), limit: int = Query(default=50, ge=1, le=200)) -> dict:
    sb = get_supabase_admin()
    rows = (
        sb.table("moderation_items")
        .select("*")
        .eq("reporter_id", user["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {"reports": [_shape(r) for r in rows]}


# ───────────────────────── Moderator side ─────────────────────────


class StatusUpdate(BaseModel):
    status: str
    note: str | None = None


class ResolveBody(BaseModel):
    resolution: str
    notes: str | None = None


class AssignBody(BaseModel):
    assignee_id: str


@router.get("/admin/moderation/rubric")
def get_rubric(user: dict = Depends(_require_moderator)) -> dict:
    sb = get_supabase_admin()
    rows = sb.table("moderation_severity_rubric").select("*").order("created_at", desc=True).execute().data or []
    return {"rubrics": rows}


@admin_router.get("/queue")
def queue(
    status: str | None = Query(default="open"),
    severity: str | None = None,
    entity_type: str | None = None,
    assigned_to_me: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(_require_moderator),
) -> dict:
    sb = get_supabase_admin()
    q = sb.table("moderation_items").select("*")
    if status:
        q = q.eq("status", status)
    if severity and severity in SEVERITIES:
        q = q.eq("severity", severity)
    if entity_type and entity_type in ENTITY_TYPES:
        q = q.eq("entity_type", entity_type)
    if assigned_to_me:
        q = q.eq("assigned_to", user["id"])
    rows = q.order("severity").order("created_at").limit(limit).execute().data or []
    return {"items": [_shape(r) for r in rows]}


@admin_router.get("/stats")
def stats(user: dict = Depends(_require_moderator)) -> dict:
    sb = get_supabase_admin()

    def _count(**filters):
        q = sb.table("moderation_items").select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        return getattr(res, "count", None) or 0

    return {
        "open": _count(status="open"),
        "in_review": _count(status="in_review"),
        "resolved_24h": _count(status="resolved"),  # rough; UI shows table view
        "by_severity": {sev: _count(status="open", severity=sev) for sev in SEVERITIES},
    }


@admin_router.get("/items/{item_id}")
def get_item(item_id: str, user: dict = Depends(_require_moderator)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    item = sb.table("moderation_items").select("*").eq("id", item_id).limit(1).execute().data
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    events = (
        sb.table("moderation_events")
        .select("*")
        .eq("item_id", item_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    return {"item": _shape(item[0]), "events": events}


@admin_router.post("/items/{item_id}/claim")
def claim(item_id: str, user: dict = Depends(_require_moderator)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    updated = (
        sb.table("moderation_items")
        .update(
            {
                "assigned_to": user["id"],
                "assigned_at": _now_iso(),
                "status": "in_review",
                "updated_at": _now_iso(),
            }
        )
        .eq("id", item_id)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    _record_event(sb, item_id, user, "claimed", to_value=user["id"])
    return _shape(updated[0])


@admin_router.post("/items/{item_id}/assign")
def assign(item_id: str, body: AssignBody, user: dict = Depends(_require_moderator)) -> dict:
    if not _is_uuid(item_id) or not _is_uuid(body.assignee_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    updated = (
        sb.table("moderation_items")
        .update(
            {
                "assigned_to": body.assignee_id,
                "assigned_at": _now_iso(),
                "status": "in_review",
                "updated_at": _now_iso(),
            }
        )
        .eq("id", item_id)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    _record_event(sb, item_id, user, "reassigned", to_value=body.assignee_id)
    return _shape(updated[0])


@admin_router.post("/items/{item_id}/status")
def change_status(item_id: str, body: StatusUpdate, user: dict = Depends(_require_moderator)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    if body.status not in {"open", "in_review", "resolved", "dismissed", "escalated"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    sb = get_supabase_admin()
    item = sb.table("moderation_items").select("status").eq("id", item_id).limit(1).execute().data
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    prev = item[0].get("status")
    update = {"status": body.status, "updated_at": _now_iso()}
    if body.status == "resolved":
        update["resolved_by"] = user["id"]
        update["resolved_at"] = _now_iso()
    updated = sb.table("moderation_items").update(update).eq("id", item_id).execute().data
    _record_event(sb, item_id, user, "status_changed", from_value=prev, to_value=body.status, note=body.note)
    return _shape(updated[0])


@admin_router.post("/items/{item_id}/resolve")
def resolve(item_id: str, body: ResolveBody, user: dict = Depends(_require_moderator)) -> dict:
    if not _is_uuid(item_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    if body.resolution not in RESOLUTIONS:
        raise HTTPException(status_code=400, detail=f"resolution must be one of {sorted(RESOLUTIONS)}")
    sb = get_supabase_admin()
    updated = (
        sb.table("moderation_items")
        .update(
            {
                "status": "resolved",
                "resolution": body.resolution,
                "resolution_notes": body.notes,
                "resolved_by": user["id"],
                "resolved_at": _now_iso(),
                "updated_at": _now_iso(),
            }
        )
        .eq("id", item_id)
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Item not found")
    _record_event(sb, item_id, user, "resolved", to_value=body.resolution, note=body.notes)
    return _shape(updated[0])
