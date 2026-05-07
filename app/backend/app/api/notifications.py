"""Notifications API.

User endpoints:
    GET  /api/notifications/me                 — feed (recent first)
    GET  /api/notifications/me/unread-count
    POST /api/notifications/me/read            — mark all (or list) as read
    GET  /api/notifications/preferences/me
    PUT  /api/notifications/preferences/me

Admin endpoints:
    GET  /api/admin/notifications              — overview + kill switch state
    POST /api/admin/notifications/kill-switch  — toggle paused on/off
    GET  /api/admin/jobs                       — list APScheduler jobs
    POST /api/admin/jobs/run/{job_id}          — manual-trigger
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user, require_permission
from app.db.supabase_client import get_supabase_admin
from app.notifications.dispatcher import (
    kill_switch_enabled,
    set_kill_switch,
)
from app.notifications.next_actions import generate_next_actions_for_user
from app.notifications.scheduler import JOBS, list_jobs, run_job_now
from app.scraping.alerts import (
    get_unread_alert_count,
    get_user_alerts,
    mark_alerts_read,
)

logger = logging.getLogger("career_copilot.api.notifications")

router = APIRouter(tags=["notifications"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


# ─── User feed ──────────────────────────────────────────────────────────────


@router.get("/notifications/me")
def my_alerts(
    unread_only: bool = False,
    limit: int = 20,
    priority: int | None = None,
    alert_type: str | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    items = get_user_alerts(user["id"], get_supabase_admin(), unread_only=unread_only, limit=limit)
    shaped = []
    for it in items:
        if priority is not None and int(it.get("priority") or 0) < priority:
            continue
        if alert_type and it.get("alert_type") != alert_type:
            continue
        rec = it.get("recruitment") or {}
        title = it.get("title") or f"Next action: {(it.get('alert_type') or 'update').replace('_', ' ')}"
        body = it.get("body") or "Review your latest recommendation update."
        slug_or_id = rec.get("slug") if isinstance(rec, dict) else None
        shaped.append({
            **it,
            "type": it.get("alert_type"),
            "title": title,
            "body": body,
            "priority": it.get("priority"),
            "recruitment_link": f"/app/exams/{slug_or_id or it.get('recruitment_id')}" if it.get("recruitment_id") else None,
            "created_at": it.get("sent_at"),
            "read": bool(it.get("is_read")),
            "organization": (rec.get("organization") or {}).get("name") if isinstance(rec, dict) else None,
        })
    return {"items": shaped, "count": len(shaped)}


@router.get("/notifications/me/unread-count")
def my_unread_count(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return {"count": get_unread_alert_count(user["id"], get_supabase_admin())}


class MarkReadBody(BaseModel):
    alert_ids: list[str] | None = None


@router.post("/notifications/me/read")
def my_mark_read(
    body: MarkReadBody = MarkReadBody(),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    n = mark_alerts_read(user["id"], get_supabase_admin(), alert_ids=body.alert_ids)
    return {"updated": n}


# ─── Preferences ────────────────────────────────────────────────────────────


class Prefs(BaseModel):
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    in_app_types_disabled: list[str] | None = None
    email_types_disabled: list[str] | None = None
    digest_preference: str | None = Field(default=None, pattern="^(off|daily|weekly)$")
    quiet_hours_start: int | None = Field(default=None, ge=0, le=23)
    quiet_hours_end: int | None = Field(default=None, ge=0, le=23)
    min_priority_in_app: str | None = Field(default=None, pattern="^(low|normal|medium|high|critical)$")
    deadline_reminder_windows: list[str] | None = None


@router.get("/notifications/preferences/me")
def get_prefs(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    sb = get_supabase_admin()
    rows = (
        sb.table("notification_preferences")
        .select("*")
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return {"preferences": rows[0]}
    # Default preferences shape (mirrors migration defaults).
    return {
        "preferences": {
            "user_id": user["id"],
            "in_app_enabled": True,
            "email_enabled": True,
            "digest_preference": "off",
            "in_app_types_disabled": [],
            "email_types_disabled": [],
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "min_priority_in_app": "low",
            "deadline_reminder_windows": ["48h", "24h", "6h"],
        }
    }


@router.put("/notifications/preferences/me")
def update_prefs(body: Prefs, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    payload = {"user_id": user["id"], **patch, "updated_at": datetime.now(timezone.utc).isoformat()}
    sb = get_supabase_admin()
    sb.table("notification_preferences").upsert(payload, on_conflict="user_id").execute()
    return get_prefs(user)


# ─── Admin: kill switch + job control ───────────────────────────────────────


@router.get("/admin/notifications")
def admin_notifications(_admin: dict = Depends(_require_admin)) -> dict[str, Any]:
    sb = get_supabase_admin()
    paused = kill_switch_enabled(sb)
    pending = (
        sb.table("notification_alerts")
        .select("id", count="exact")
        .eq("email_sent", False)
        .execute()
        .count
        or 0
    )
    sent_24h = 0
    try:
        from datetime import timedelta as _td

        yesterday = (datetime.now(timezone.utc) - _td(hours=24)).isoformat()
        sent_24h = (
            sb.table("notification_alerts")
            .select("id", count="exact")
            .eq("email_sent", True)
            .gte("sent_at", yesterday)
            .execute()
            .count
            or 0
        )
    except Exception:
        pass
    recent_rows = sb.table("notification_alerts").select("alert_type,source,sent_at").eq("source", "next_action_engine").limit(200).execute().data or []
    summary = {"created": len(recent_rows), "skipped": 0, "by_type": {}}
    for r in recent_rows:
        t = r.get("alert_type") or "unknown"
        summary["by_type"][t] = summary["by_type"].get(t, 0) + 1

    return {
        "kill_switch": paused,
        "pending_dispatch": pending,
        "sent_24h": sent_24h,
        "recent_generation": summary,
        "channels": [
            {"id": "in_app", "label": "In-app", "active": True},
            {"id": "email", "label": "Email (Resend)", "active": True},
            {"id": "whatsapp", "label": "WhatsApp", "active": False},
        ],
    }


class KillSwitchBody(BaseModel):
    paused: bool


@router.post("/admin/notifications/kill-switch")
def toggle_kill(body: KillSwitchBody, admin: dict = Depends(require_permission("notifications.manage"))) -> dict[str, Any]:
    sb = get_supabase_admin()
    set_kill_switch(sb, paused=body.paused, actor_id=admin["id"])
    try:
        sb.table("admin_audit_logs").insert(
            {
                "actor_id": admin["id"],
                "actor_email": admin.get("email"),
                "action": "notifications.kill_switch",
                "entity_type": "admin_settings",
                "entity_id": "notifications_paused",
                "new_value": {"paused": body.paused},
            }
        ).execute()
    except Exception:
        pass
    return {"ok": True, "paused": body.paused}


@router.get("/admin/jobs")
def admin_jobs(_admin: dict = Depends(_require_admin)) -> dict[str, Any]:
    return {"jobs": list_jobs(), "registered": list(JOBS.keys())}


@router.post("/admin/jobs/run/{job_id}")
def admin_run_job(job_id: str, admin: dict = Depends(require_permission("notifications.manage"))) -> dict[str, Any]:
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail=f"Unknown job: {job_id}")
    result = run_job_now(job_id)
    sb = get_supabase_admin()
    try:
        sb.table("admin_audit_logs").insert(
            {
                "actor_id": admin["id"],
                "actor_email": admin.get("email"),
                "action": f"jobs.run.{job_id}",
                "entity_type": "job",
                "entity_id": job_id,
                "new_value": result,
            }
        ).execute()
    except Exception:
        pass
    return result


class GenerateNextActionsBody(BaseModel):
    scope: str = Field(default="me", pattern="^(me|all_users)$")
    user_id: str | None = None
    limit: int = Field(default=100, ge=1, le=500)
    dry_run: bool = False


@router.post("/notifications/generate-next-actions")
async def generate_next_actions(
    body: GenerateNextActionsBody,
    actor: dict = Depends(require_permission("notifications.manage")),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    users: list[dict[str, Any]]
    if body.scope == "all_users":
        rows = sb.table("profiles").select("id").limit(body.limit).execute().data or []
        users = [{"id": r["id"]} for r in rows if r.get("id")]
    elif body.user_id:
        users = [{"id": body.user_id}]
    else:
        users = [{"id": actor["id"]}]
    created = skipped = candidates = 0
    by_type: dict[str, int] = {}
    for u in users:
        res = await generate_next_actions_for_user(supabase=sb, user=u, dry_run=body.dry_run)
        created += res["created"]
        skipped += res["skipped"]
        candidates += res["candidates"]
        for k, v in (res.get("by_type") or {}).items():
            by_type[k] = by_type.get(k, 0) + v
    return {"scope": body.scope, "users": len(users), "created": created, "skipped": skipped, "candidates": candidates, "by_type": by_type, "dry_run": body.dry_run}
