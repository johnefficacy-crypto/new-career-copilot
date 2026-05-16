"""Admin operations endpoints — marketplace KPIs, AI policy view, invite intake.

Supersedes the hardcoded placeholder endpoints in router_admin
(/marketplace, /ai-policy, /users/create). Reads real Supabase tables;
falls back to zero on failure so the admin console always renders.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/admin", tags=["admin-ops"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = (user.get("role") or "").lower()
    if role in {"admin", "super_admin"}:
        return user
    raise HTTPException(status_code=403, detail="Admin role required")


def _count(sb, table: str, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return int(getattr(q.execute(), "count", None) or 0)
    except Exception:
        return 0


def _count_since(sb, table: str, ts_col: str, since: datetime, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact").gte(ts_col, since.isoformat())
        for k, v in filters.items():
            q = q.eq(k, v)
        return int(getattr(q.execute(), "count", None) or 0)
    except Exception:
        return 0


# ───────────────────────────── Marketplace ─────────────────────────────


@router.get("/marketplace")
def marketplace_kpis(user: dict = Depends(_require_admin)) -> dict:
    sb = get_supabase_admin()
    kpis = {
        "courses": _count(sb, "courses"),
        "community_resources": _count(sb, "community_resources", status="approved"),
        "mentors": _count(sb, "profiles", role="mentor"),
        "active_bookings": _count(sb, "mentor_bookings", status="confirmed")
            + _count(sb, "mentor_bookings", status="awaiting_mentor"),
        "completed_bookings": _count(sb, "mentor_bookings", status="completed"),
        "open_resource_reports": _count(sb, "community_resource_reports", status="open"),
    }
    try:
        flags = (
            sb.table("community_resource_reports")
            .select("id,resource_id,reason,status,created_at")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
            or []
        )
    except Exception:
        flags = []
    return {"kpis": kpis, "flags": flags}


# ───────────────────────────── AI policy ─────────────────────────────


AI_POLICY_RULES = [
    {
        "id": "deterministic_eligibility_authority",
        "rule": "AI must never override deterministic eligibility verdicts.",
        "enabled": True,
    },
    {
        "id": "source_registry_required",
        "rule": "AI must cite source registry for any recruitment claim.",
        "enabled": True,
    },
    {
        "id": "admin_review_for_promotion",
        "rule": "AI may extract structure from documents; canonical promotion still requires admin review.",
        "enabled": True,
    },
    {
        "id": "ai_response_flag_routes_to_moderation",
        "rule": "User-flagged AI responses must create a moderation_items entry within the same request.",
        "enabled": True,
    },
    {
        "id": "low_confidence_label",
        "rule": "AI responses with confidence < 0.7 must be visibly labelled as low-confidence in the UI.",
        "enabled": True,
    },
]


@router.get("/ai-policy")
def ai_policy(user: dict = Depends(_require_admin)) -> dict:
    """AI guardrail policy view.

    Rules are code-side constants (versioned in source) so audits replay
    the policy active when a decision was made. The telemetry block
    reads real moderation_items + ai_messages so ops can see how the
    guardrails are firing.
    """
    sb = get_supabase_admin()
    flagged_24h = 0
    flagged_total = 0
    recent_flags: list[dict] = []
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        flagged_24h = _count_since(sb, "ai_messages", "created_at", since, is_flagged=True)
        flagged_total = _count(sb, "ai_messages", is_flagged=True)
        recent_flags = (
            sb.table("moderation_items")
            .select("id,entity_id,reason,status,severity,created_at")
            .eq("entity_type", "ai_response")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
            or []
        )
    except Exception:
        pass
    return {
        "rules": AI_POLICY_RULES,
        "guardrails": [r["rule"] for r in AI_POLICY_RULES],
        "model": "scripted-v1",
        "swap_target": "anthropic:claude-opus-4-7",
        "active": True,
        "telemetry": {
            "flagged_messages_24h": flagged_24h,
            "flagged_messages_total": flagged_total,
            "recent_flags": recent_flags,
        },
    }


# ───────────────────────────── Invite ─────────────────────────────


class AdminInviteBody(BaseModel):
    email: str
    name: str
    role: str = "admin"
    scope: list[str] = []


@router.post("/users/create")
def admin_invite(body: AdminInviteBody, user: dict = Depends(_require_admin)) -> dict:
    """Record an admin/staff invite.

    Real Supabase Auth invite delivery is wired in a follow-up; for now
    we persist the intent to admin_audit_logs so RBAC.jsx has a durable
    receipt and downstream automation can fan it out.
    """
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only super_admin can invite admins")
    if "@" not in body.email or "." not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email")
    sb = get_supabase_admin()
    inserted = (
        sb.table("admin_audit_logs")
        .insert(
            {
                "actor_id": user["id"],
                "actor_email": user.get("email"),
                "action": "admin.invite",
                "entity_type": "profile",
                "entity_id": body.email,
                "new_value": {"role": body.role, "scope": body.scope, "name": body.name},
                "notes": "admin invite via /api/admin/users/create",
            }
        )
        .execute()
        .data
    )
    invite_id = inserted[0]["id"] if inserted else None
    return {
        "ok": True,
        "invite": {"id": invite_id, "email": body.email, "role": body.role, "scope": body.scope},
    }
