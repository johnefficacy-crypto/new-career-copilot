"""Admin overview / users / audit — Supabase-backed.

Replaces the hardcoded stub at `router_admin` in placeholders.py. Every
metric is read from a real Supabase table; failures degrade gracefully to
zero so the admin console always renders.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/admin", tags=["admin-overview"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = (user.get("role") or "").lower()
    if role in {"admin", "super_admin"}:
        return user
    raise HTTPException(status_code=403, detail="Admin role required")


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _count(sb, table: str, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        return int(getattr(res, "count", None) or 0)
    except Exception:
        return 0


def _count_since(sb, table: str, ts_col: str, since: datetime, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact").gte(ts_col, since.isoformat())
        for k, v in filters.items():
            q = q.eq(k, v)
        res = q.execute()
        return int(getattr(res, "count", None) or 0)
    except Exception:
        return 0


@router.get("/overview")
def overview(user: dict = Depends(_require_admin)) -> dict:
    sb = get_supabase_admin()
    now = datetime.now(timezone.utc)
    today = now - timedelta(hours=24)

    # The legacy implementation fired ``moderation_items status=open`` three
    # times (open_flags, queue_depth, moderation_p0_open — although the
    # last carries an extra severity filter, the first two were identical)
    # and ``copyright_claims status=received`` twice (queue_depth,
    # copyright_open). Coalesce to one query per distinct (table, filters)
    # tuple — the totals are still composed in Python so the response
    # shape is byte-identical to before.
    open_flags = _count(sb, "moderation_items", status="open")
    copyright_received = _count(sb, "copyright_claims", status="received")
    copyright_triage = _count(sb, "copyright_claims", status="triage")

    kpis = {
        "users": _count(sb, "profiles"),
        "recruitments": _count(sb, "recruitments", status="active"),
        "threads": _count(sb, "forum_posts"),
        "open_flags": open_flags,
        "scrape_runs_today": _count_since(sb, "scrape_runs", "started_at", today),
        "queue_depth": open_flags + copyright_received,
        "moderation_p0_open": _count(sb, "moderation_items", status="open", severity="p0"),
        "copyright_open": copyright_received + copyright_triage,
    }

    try:
        audit_rows = (
            sb.table("admin_audit_logs")
            .select("actor_id,actor_email,action,entity_type,entity_id,created_at,notes")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
            or []
        )
    except Exception:
        audit_rows = []

    return {
        "kpis": kpis,
        "recent_audit": [
            {
                "actor": r.get("actor_email") or r.get("actor_id") or "system",
                "action": r.get("action"),
                "target": r.get("entity_type"),
                "entity_id": r.get("entity_id"),
                "at": r.get("created_at"),
                "notes": r.get("notes"),
            }
            for r in audit_rows
        ],
    }


@router.get("/users")
def list_users(
    q: str | None = Query(default=None, max_length=80),
    role: str | None = None,
    plan: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(_require_admin),
) -> dict:
    sb = get_supabase_admin()
    query = sb.table("profiles").select(
        "id,email,name,full_name,display_name,role,plan,is_active,onboarded,created_at,updated_at"
    )
    if role:
        query = query.eq("role", role)
    if plan:
        query = query.eq("plan", plan)
    if q:
        like = f"%{q}%"
        query = query.or_(f"email.ilike.{like},name.ilike.{like},full_name.ilike.{like}")
    rows = query.order("created_at", desc=True).limit(limit).execute().data or []
    items = [
        {
            "id": r.get("id"),
            "email": r.get("email"),
            "name": r.get("name") or r.get("full_name") or r.get("display_name"),
            "role": r.get("role") or "user",
            "plan": r.get("plan") or "free",
            "is_active": bool(r.get("is_active", True)),
            "onboarded": bool(r.get("onboarded")),
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


@router.get("/audit-feed")
def audit_feed(
    actor_id: str | None = None,
    action: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(_require_admin),
) -> dict:
    """Global audit feed for the admin overview dashboard.

    Renamed from ``GET /admin/audit`` in the Phase 5 follow-up cleanup —
    that path is owned by ``admin_eligibility.list_audit_entries`` which
    enforces an entity_type whitelist and is meant for entity-scoped
    drawers. This one is the unconstrained feed for the overview UI.
    """
    sb = get_supabase_admin()
    query = sb.table("admin_audit_logs").select("*")
    if actor_id and _is_uuid(actor_id):
        query = query.eq("actor_id", actor_id)
    if action:
        query = query.eq("action", action)
    rows = query.order("created_at", desc=True).limit(limit).execute().data or []
    return {"items": rows}


@router.get("/community/forum-flags")
def community_forum_flags(
    status: str = "open",
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(_require_admin),
) -> dict:
    """Forum-scoped slice of moderation_items.

    Renamed from ``/admin/community/flags`` in the Phase 5 follow-up
    cleanup — that path is owned by ``community_runtime`` which
    aggregates forum + community + resource reports. This narrower
    forum-only slice from ``moderation_items`` stays for the admin
    widgets that ask for just that view.
    """
    sb = get_supabase_admin()
    rows = (
        sb.table("moderation_items")
        .select("*")
        .in_("entity_type", ["forum_thread", "forum_post"])
        .eq("status", status)
        .order("severity")
        .order("created_at")
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {"items": rows}
