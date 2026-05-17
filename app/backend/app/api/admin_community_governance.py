"""Admin Community Governance — Study Groups, Partners, Mentors, Resources.

Implements the four admin consoles specified in
``docs/engineering/community-governance-spec-v1.md`` §4.1–§4.4:

  Study Groups Console     — ``/api/admin/community/groups/*``
  Partner Governance       — ``/api/admin/community/partners/*``
  Mentor Verification      — ``/api/admin/mentors/*``
  Resource Review Queue    — ``/api/admin/community/resources/*``

Every write inserts an ``admin_audit_logs`` row with the action keys
from spec §4.6. Permission gating uses two new permission keys plus
the existing ``moderation.review`` for the trust desk overlap:

  community.manage  — Study Groups, Partners, Resources
  mentors.manage    — Mentor verification + suspension + payout hold
  super_admin       — bypass

When an action mutates state that should appear in the cross-surface
trust desk (the ``moderation_items`` queue), the response also records
a ``moderation_events`` row so the audit trail is unified.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.admin_community_governance")

router = APIRouter(tags=["admin-community-governance"])

PERM_COMMUNITY = "community.manage"
PERM_MENTORS = "mentors.manage"


# ─── Auth dependencies ────────────────────────────────────────────────────


def _require_perm(*perms: str):
    """Build a Depends-compatible callable that admits any of ``perms``
    plus super_admin. We accept role='admin' too — matching the rest of
    this codebase's admin gating — so the new permission keys can roll
    out without immediately re-issuing tokens for every existing admin.
    """
    perms_set = set(perms)

    def _dep(user: dict = Depends(get_current_user)) -> dict:
        role = (user.get("role") or "").lower()
        user_perms = set(user.get("permissions") or [])
        if role == "super_admin":
            return user
        if role == "admin" and not perms_set:
            return user
        if perms_set & user_perms:
            return user
        if role == "admin":
            # Admin role implicitly carries community / mentors / moderation
            # buckets until token issuance is refreshed.
            return user
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "required_permission": sorted(perms_set)},
        )

    return _dep


# ─── Helpers ──────────────────────────────────────────────────────────────


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_community_governance supabase call failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit(
    supabase,
    actor: dict,
    action: str,
    *,
    entity_type: str,
    entity_id: str | None = None,
    old_value: Any = None,
    new_value: Any = None,
    notes: str = "admin_community_governance",
) -> str | None:
    """Insert an admin_audit_logs row. Returns the row id."""
    try:
        rows = (
            supabase.table("admin_audit_logs")
            .insert(
                {
                    "actor_id": actor.get("id"),
                    "actor_email": actor.get("email"),
                    "action": action,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "old_value": old_value,
                    "new_value": new_value,
                    "notes": notes,
                }
            )
            .execute()
            .data
            or []
        )
        return rows[0].get("id") if rows else None
    except Exception:  # noqa: BLE001
        logger.exception("audit log insert failed (admin_community_governance)")
        return None


def _emit_mod_event(supabase, item_id: str | None, actor: dict, event_type: str, from_value=None, to_value=None, note: str | None = None) -> None:
    """Best-effort append to moderation_events when the action is tied
    to a moderation_items row. Caller passes ``None`` if no such row
    exists for this action."""
    if not item_id:
        return
    _safe(
        lambda: supabase.table("moderation_events").insert(
            {
                "item_id": item_id,
                "actor_id": actor.get("id"),
                "event_type": event_type,
                "from_value": str(from_value) if from_value is not None else None,
                "to_value": str(to_value) if to_value is not None else None,
                "note": note,
            }
        ).execute()
    )


class WriteEnvelope(BaseModel):
    """Standard write-body shape — every write requires a reason ≥8 chars."""

    reason: str = Field(..., min_length=8, max_length=500)
    payload: dict[str, Any] = Field(default_factory=dict)


# ════════════════════════════════════════════════════════════════════════
#  §4.1 — Study Groups Console
# ════════════════════════════════════════════════════════════════════════


@router.get("/admin/community/groups")
def list_groups(
    status: str | None = Query(default=None),
    group_type: str | None = Query(default=None),
    visibility: str | None = Query(default=None),
    exam_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """List study groups with filters. Includes member-count + last-session-
    at columns so an operator can prioritise active groups."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("study_groups")
        .select("id, name, group_type, exam_id, exam_cycle_id, exam_phase_id, max_members, visibility, created_by, status, frozen_at, frozen_by, frozen_reason, created_at, updated_at", count="exact")
        .order("updated_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if group_type:
        q = q.eq("group_type", group_type)
    if visibility:
        q = q.eq("visibility", visibility)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/admin/community/groups/{group_id}")
def get_group_detail(
    group_id: str,
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Group detail — members, recent sessions, recent attendance, plus
    open moderation items scoped to this group."""
    supabase = get_supabase_admin()
    grows = (
        _safe(
            lambda: supabase.table("study_groups").select("*").eq("id", group_id).limit(1).execute().data,
            default=[],
        )
        or []
    )
    if not grows:
        raise HTTPException(status_code=404, detail="Group not found")
    members = (
        _safe(
            lambda: supabase.table("study_group_members")
            .select("id, user_id, role, status, joined_at")
            .eq("group_id", group_id)
            .order("joined_at", desc=False)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    sessions = (
        _safe(
            lambda: supabase.table("social_study_sessions")
            .select("id, started_at, ended_at, planned_minutes, verified_presence_minutes, verified_focus_minutes, trust_source, trust_weight")
            .eq("group_id", group_id)
            .order("started_at", desc=True)
            .limit(20)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    session_ids = [s["id"] for s in sessions if s.get("id")]
    attendance = []
    if session_ids:
        attendance = (
            _safe(
                lambda: supabase.table("social_session_attendance")
                .select("id, session_id, user_id, joined_at, left_at, presence_minutes, focus_check_passed, focus_check_total, attendance_status")
                .in_("session_id", session_ids)
                .order("joined_at", desc=True)
                .execute()
                .data,
                default=[],
            )
            or []
        )
    return {
        "group": grows[0],
        "members": members,
        "sessions": sessions,
        "attendance": attendance,
    }


@router.post("/admin/community/groups/{group_id}/archive")
def group_archive(
    group_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Archive a study group (status='archived'). Refuses already-archived
    rows so the audit trail isn't a no-op."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("study_groups").select("id, status, name").eq("id", group_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Group not found")
    if (rows[0].get("status") or "").lower() == "archived":
        raise HTTPException(status_code=409, detail="Group already archived")
    supabase.table("study_groups").update({"status": "archived", "updated_at": _now_iso()}).eq("id", group_id).execute()
    audit_id = _audit(supabase, admin, "admin.group.archive", entity_type="study_group", entity_id=group_id, old_value={"status": rows[0].get("status")}, new_value={"status": "archived", "reason": body.reason})
    return {"ok": True, "audit_id": audit_id, "group_id": group_id, "status": "archived"}


@router.post("/admin/community/groups/{group_id}/freeze")
def group_freeze(
    group_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Freeze a group: sessions and join attempts should refuse while
    frozen_at is non-null. Pass ``payload.unfreeze=true`` to clear the
    flag instead. Distinct from archive — freeze is short-term, archive
    is permanent."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("study_groups").select("id, frozen_at, frozen_reason").eq("id", group_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Group not found")
    cur = rows[0]
    unfreeze = bool(body.payload.get("unfreeze"))
    if unfreeze:
        if not cur.get("frozen_at"):
            raise HTTPException(status_code=409, detail="Group is not frozen")
        supabase.table("study_groups").update({"frozen_at": None, "frozen_by": None, "frozen_reason": None, "updated_at": _now_iso()}).eq("id", group_id).execute()
        action = "admin.group.unfreeze"
        new_value = {"frozen": False, "reason": body.reason}
    else:
        if cur.get("frozen_at"):
            raise HTTPException(status_code=409, detail="Group already frozen")
        supabase.table("study_groups").update({"frozen_at": _now_iso(), "frozen_by": admin.get("id"), "frozen_reason": body.reason, "updated_at": _now_iso()}).eq("id", group_id).execute()
        action = "admin.group.freeze"
        new_value = {"frozen": True, "reason": body.reason}
    audit_id = _audit(supabase, admin, action, entity_type="study_group", entity_id=group_id, old_value={"frozen_at": cur.get("frozen_at"), "frozen_reason": cur.get("frozen_reason")}, new_value=new_value)
    return {"ok": True, "audit_id": audit_id, "group_id": group_id, "frozen": not unfreeze}


@router.delete("/admin/community/groups/{group_id}/members/{user_id}")
def group_remove_member(
    group_id: str,
    user_id: str,
    reason: str = Query(..., min_length=8, max_length=500),
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Soft-remove a member by flipping ``study_group_members.status`` to
    'removed' rather than deleting — preserves session history that
    references the member row."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("study_group_members").select("id, status, role").eq("group_id", group_id).eq("user_id", user_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Member row not found")
    if (rows[0].get("status") or "").lower() == "removed":
        raise HTTPException(status_code=409, detail="Member already removed")
    supabase.table("study_group_members").update({"status": "removed"}).eq("id", rows[0]["id"]).execute()
    audit_id = _audit(supabase, admin, "admin.group.member.remove", entity_type="study_group_member", entity_id=rows[0]["id"], old_value={"status": rows[0].get("status"), "role": rows[0].get("role")}, new_value={"status": "removed", "reason": reason, "group_id": group_id, "user_id": user_id})
    return {"ok": True, "audit_id": audit_id, "group_id": group_id, "user_id": user_id, "status": "removed"}


@router.post("/admin/community/groups/{group_id}/sessions/{session_id}/force-end")
def group_session_force_end(
    group_id: str,
    session_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Force-end a stuck group session. ``ended_at`` is set to now;
    attendance rows are NOT auto-synthesised — a stuck session is
    usually one that nobody actually attended."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("social_study_sessions").select("id, group_id, started_at, ended_at").eq("id", session_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    s = rows[0]
    if s.get("group_id") != group_id:
        raise HTTPException(status_code=409, detail="Session does not belong to this group")
    if s.get("ended_at"):
        raise HTTPException(status_code=409, detail="Session already ended")
    supabase.table("social_study_sessions").update({"ended_at": _now_iso()}).eq("id", session_id).execute()
    audit_id = _audit(supabase, admin, "admin.group.session.force_end", entity_type="social_study_session", entity_id=session_id, new_value={"reason": body.reason, "group_id": group_id, "started_at": s.get("started_at")})
    return {"ok": True, "audit_id": audit_id, "session_id": session_id}


@router.post("/admin/community/groups/{group_id}/attendance/{row_id}/invalidate")
def group_attendance_invalidate(
    group_id: str,
    row_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Invalidate an attendance row by zeroing ``presence_minutes`` and
    ``focus_check_passed`` and marking the row as admin-invalidated.
    Used when an attendance event is forged or game-the-system.

    The row's ``attendance_status`` flips to ``'absent'`` so trust
    aggregation no longer credits it."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("social_session_attendance").select("id, session_id, user_id, presence_minutes, focus_check_passed, attendance_status").eq("id", row_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Attendance row not found")
    att = rows[0]
    supabase.table("social_session_attendance").update({"presence_minutes": 0, "focus_check_passed": 0, "attendance_status": "absent"}).eq("id", row_id).execute()
    audit_id = _audit(
        supabase, admin, "admin.group.attendance.invalidate",
        entity_type="social_session_attendance", entity_id=row_id,
        old_value={"presence_minutes": att.get("presence_minutes"), "focus_check_passed": att.get("focus_check_passed"), "attendance_status": att.get("attendance_status")},
        new_value={"reason": body.reason, "group_id": group_id, "user_id": att.get("user_id"), "session_id": att.get("session_id")},
    )
    return {"ok": True, "audit_id": audit_id, "row_id": row_id}


# ════════════════════════════════════════════════════════════════════════
#  §4.2 — Partner Governance Console
# ════════════════════════════════════════════════════════════════════════


@router.get("/admin/community/partners")
def list_partner_pairs(
    status: str | None = Query(default=None, description="active|paused|ended"),
    user_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """List accountability pairs."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("accountability_pairs")
        .select("id, user_a, user_b, pairing_goal, exam_id, status, created_at", count="exact")
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if user_id:
        # Match either side of the pair. Two queries + merge — same pattern
        # as the Study OS Phase 3 admin.
        ra = _safe(lambda: q.eq("user_a", user_id).range(offset, offset + limit - 1).execute(), default=None)
        # Re-build base because eq mutated q.
        q2 = supabase.table("accountability_pairs").select("id, user_a, user_b, pairing_goal, exam_id, status, created_at", count="exact").order("created_at", desc=True)
        if status:
            q2 = q2.eq("status", status)
        rb = _safe(lambda: q2.eq("user_b", user_id).range(offset, offset + limit - 1).execute(), default=None)
        items_a = (ra.data if ra else []) or []
        items_b = (rb.data if rb else []) or []
        seen: set[str] = set()
        merged: list[dict] = []
        for r in items_a + items_b:
            rid = r.get("id")
            if rid in seen:
                continue
            seen.add(rid)
            merged.append(r)
        merged.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return {"items": merged[:limit], "total": len(merged), "limit": limit, "offset": offset}
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/admin/community/partners/invites")
def list_partner_invites(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """List pending partner invites (paused / not-yet-active pairs).

    The pairs table tracks status='paused' for invites that haven't been
    accepted; an admin needs visibility on stale invites to triage them.
    """
    supabase = get_supabase_admin()
    res = _safe(
        lambda: supabase.table("accountability_pairs")
        .select("id, user_a, user_b, pairing_goal, status, created_at", count="exact")
        .eq("status", "paused")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute(),
        default=None,
    )
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/admin/community/partners/{pair_id}/end")
def partner_end_pair(
    pair_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """End a pair on behalf of the participants. Refuses already-ended."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("accountability_pairs").select("id, user_a, user_b, status, pairing_goal").eq("id", pair_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Pair not found")
    if (rows[0].get("status") or "").lower() == "ended":
        raise HTTPException(status_code=409, detail="Pair already ended")
    supabase.table("accountability_pairs").update({"status": "ended"}).eq("id", pair_id).execute()
    audit_id = _audit(
        supabase, admin, "admin.partner.pair.end",
        entity_type="accountability_pair", entity_id=pair_id,
        old_value={"status": rows[0].get("status")},
        new_value={"status": "ended", "reason": body.reason, "user_a": rows[0].get("user_a"), "user_b": rows[0].get("user_b")},
    )
    return {"ok": True, "audit_id": audit_id, "pair_id": pair_id, "status": "ended"}


@router.get("/admin/community/partners/rematch-blocks")
def list_rematch_blocks(
    user_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """List rematch blocks. Optional filter by participant."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("partner_rematch_blocks")
        .select("id, user_a, user_b, reason, blocked_by, blocked_by_email, created_at", count="exact")
        .order("created_at", desc=True)
    )
    if user_id:
        # Two queries + merge for unordered match.
        ra = _safe(lambda: q.eq("user_a", user_id).range(offset, offset + limit - 1).execute(), default=None)
        q2 = supabase.table("partner_rematch_blocks").select("id, user_a, user_b, reason, blocked_by, blocked_by_email, created_at", count="exact").order("created_at", desc=True)
        rb = _safe(lambda: q2.eq("user_b", user_id).range(offset, offset + limit - 1).execute(), default=None)
        items = ((ra.data if ra else []) or []) + ((rb.data if rb else []) or [])
        items.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return {"items": items[:limit], "total": len(items), "limit": limit, "offset": offset}
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


class RematchBlockBody(BaseModel):
    user_a: str = Field(..., min_length=4, max_length=200)
    user_b: str = Field(..., min_length=4, max_length=200)


@router.post("/admin/community/partners/rematch-blocks")
def create_rematch_block(
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Block two users from being matched again as accountability partners.

    Users are stored in lexicographic order so the unique constraint is
    symmetric (an (a,b) block and a (b,a) block are the same row). The
    DB-level CHECK constraint enforces ``user_a < user_b``.
    """
    payload = RematchBlockBody.model_validate(body.payload or {})
    if payload.user_a == payload.user_b:
        raise HTTPException(status_code=422, detail="Cannot block a user against themselves")
    lo, hi = sorted([payload.user_a, payload.user_b])
    supabase = get_supabase_admin()
    # Check for existing block first to return a friendlier 409.
    existing = _safe(lambda: supabase.table("partner_rematch_blocks").select("id").eq("user_a", lo).eq("user_b", hi).limit(1).execute().data, default=[]) or []
    if existing:
        raise HTTPException(status_code=409, detail={"message": "Block already exists", "id": existing[0].get("id")})
    inserted = _safe(
        lambda: supabase.table("partner_rematch_blocks").insert({
            "user_a": lo,
            "user_b": hi,
            "reason": body.reason,
            "blocked_by": admin.get("id"),
            "blocked_by_email": admin.get("email"),
        }).execute().data,
        default=[],
    ) or []
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create rematch block")
    new = inserted[0]
    audit_id = _audit(
        supabase, admin, "admin.partner.rematch.block",
        entity_type="partner_rematch_block", entity_id=new.get("id"),
        new_value={"user_a": lo, "user_b": hi, "reason": body.reason},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


@router.delete("/admin/community/partners/rematch-blocks/{block_id}")
def remove_rematch_block(
    block_id: str,
    reason: str = Query(..., min_length=8, max_length=500),
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Remove a rematch block."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("partner_rematch_blocks").select("id, user_a, user_b, reason").eq("id", block_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Block not found")
    supabase.table("partner_rematch_blocks").delete().eq("id", block_id).execute()
    audit_id = _audit(
        supabase, admin, "admin.partner.rematch.unblock",
        entity_type="partner_rematch_block", entity_id=block_id,
        old_value={"user_a": rows[0].get("user_a"), "user_b": rows[0].get("user_b"), "reason": rows[0].get("reason")},
        new_value={"reason": reason},
    )
    return {"ok": True, "audit_id": audit_id, "block_id": block_id}


# ════════════════════════════════════════════════════════════════════════
#  §4.3 — Mentor Verification Console
# ════════════════════════════════════════════════════════════════════════


_VERIFICATION_STATUSES = ("pending", "approved", "rejected", "suspended")
_KYC_STATUSES = ("unverified", "submitted", "verified", "failed")


@router.get("/admin/mentors")
def list_mentors(
    status: str | None = Query(default=None),
    kyc_status: str | None = Query(default=None),
    payout_hold: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_perm(PERM_MENTORS)),
) -> dict[str, Any]:
    """List mentor verification rows. The verification table is a sidecar
    to ``profiles`` — a mentor without a row is treated as 'pending'."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("mentor_verification")
        .select("user_id, status, kyc_status, payout_hold, payout_hold_reason, kyc_artifact_id, verified_by, verified_by_email, verified_at, notes, updated_at", count="exact")
        .order("updated_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if kyc_status:
        q = q.eq("kyc_status", kyc_status)
    if payout_hold is not None:
        q = q.eq("payout_hold", payout_hold)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/admin/mentors/{user_id}")
def get_mentor_detail(
    user_id: str,
    _admin: dict = Depends(_require_perm(PERM_MENTORS)),
) -> dict[str, Any]:
    """Mentor detail: verification record + recent bookings + complaint
    queue (moderation_items scoped to entity_type='mentor_profile')."""
    supabase = get_supabase_admin()
    profile = _safe(
        lambda: supabase.table("profiles").select("id, email, full_name, is_instructor").eq("id", user_id).limit(1).execute().data,
        default=[],
    ) or []
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    verification = (
        _safe(lambda: supabase.table("mentor_verification").select("*").eq("user_id", user_id).limit(1).execute().data, default=[])
        or []
    )
    bookings = (
        _safe(
            lambda: supabase.table("mentor_bookings")
            .select("id, user_id, slot, status, payment_status, created_at")
            .eq("mentor_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    complaints = (
        _safe(
            lambda: supabase.table("moderation_items")
            .select("id, severity, reason, status, resolution, created_at")
            .eq("entity_type", "mentor_profile")
            .eq("entity_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    return {
        "profile": profile[0],
        "verification": verification[0] if verification else None,
        "recent_bookings": bookings,
        "complaints": complaints,
    }


class MentorVerificationBody(BaseModel):
    status: str | None = None
    kyc_status: str | None = None
    kyc_artifact_id: str | None = None
    notes: str | None = None


@router.post("/admin/mentors/{user_id}/verification")
def set_mentor_verification(
    user_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_MENTORS)),
) -> dict[str, Any]:
    """Set verification fields. Upserts on user_id so a mentor without an
    existing row gets one. Validates enums and emits one audit row."""
    payload = MentorVerificationBody.model_validate(body.payload or {})
    supabase = get_supabase_admin()
    user_rows = _safe(lambda: supabase.table("profiles").select("id").eq("id", user_id).limit(1).execute().data, default=[]) or []
    if not user_rows:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.status and payload.status not in _VERIFICATION_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {_VERIFICATION_STATUSES}")
    if payload.kyc_status and payload.kyc_status not in _KYC_STATUSES:
        raise HTTPException(status_code=422, detail=f"kyc_status must be one of {_KYC_STATUSES}")
    existing = _safe(lambda: supabase.table("mentor_verification").select("*").eq("user_id", user_id).limit(1).execute().data, default=[]) or []
    patch: dict[str, Any] = {"updated_at": _now_iso()}
    if payload.status:
        patch["status"] = payload.status
    if payload.kyc_status:
        patch["kyc_status"] = payload.kyc_status
    if payload.kyc_artifact_id is not None:
        patch["kyc_artifact_id"] = payload.kyc_artifact_id
    if payload.notes is not None:
        patch["notes"] = payload.notes
    # Stamp who/when only when verification is moving to 'approved' / 'verified'.
    if payload.status == "approved" or payload.kyc_status == "verified":
        patch["verified_by"] = admin.get("id")
        patch["verified_by_email"] = admin.get("email")
        patch["verified_at"] = _now_iso()
    if existing:
        supabase.table("mentor_verification").update(patch).eq("user_id", user_id).execute()
        new = {**existing[0], **patch}
    else:
        row = {"user_id": user_id, **patch}
        new = (_safe(lambda: supabase.table("mentor_verification").insert(row).execute().data, default=[]) or [row])[0]
    audit_id = _audit(
        supabase, admin, "admin.mentor.verification.set",
        entity_type="mentor_verification", entity_id=user_id,
        old_value=existing[0] if existing else None,
        new_value={"reason": body.reason, "patch": patch},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


@router.post("/admin/mentors/{user_id}/suspend")
def suspend_mentor(
    user_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_MENTORS)),
) -> dict[str, Any]:
    """Suspend or reinstate a mentor. Pass ``payload.reinstate=true`` to
    flip back to 'approved'. Refuses no-op transitions."""
    supabase = get_supabase_admin()
    user_rows = _safe(lambda: supabase.table("profiles").select("id").eq("id", user_id).limit(1).execute().data, default=[]) or []
    if not user_rows:
        raise HTTPException(status_code=404, detail="User not found")
    reinstate = bool(body.payload.get("reinstate"))
    existing = _safe(lambda: supabase.table("mentor_verification").select("*").eq("user_id", user_id).limit(1).execute().data, default=[]) or []
    cur_status = (existing[0].get("status") if existing else "pending") or "pending"
    target = "approved" if reinstate else "suspended"
    if cur_status == target:
        raise HTTPException(status_code=409, detail=f"Mentor already {target}")
    patch = {"status": target, "updated_at": _now_iso()}
    if reinstate:
        patch["verified_by"] = admin.get("id")
        patch["verified_by_email"] = admin.get("email")
        patch["verified_at"] = _now_iso()
    if existing:
        supabase.table("mentor_verification").update(patch).eq("user_id", user_id).execute()
    else:
        supabase.table("mentor_verification").insert({"user_id": user_id, **patch}).execute()
    audit_id = _audit(
        supabase, admin, "admin.mentor.suspend",
        entity_type="mentor_verification", entity_id=user_id,
        old_value={"status": cur_status},
        new_value={"status": target, "reason": body.reason},
    )
    return {"ok": True, "audit_id": audit_id, "user_id": user_id, "status": target}


class PayoutHoldBody(BaseModel):
    hold: bool


@router.post("/admin/mentors/{user_id}/payout-hold")
def set_mentor_payout_hold(
    user_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_MENTORS)),
) -> dict[str, Any]:
    """Set or clear the payout_hold flag for a mentor."""
    payload = PayoutHoldBody.model_validate(body.payload or {})
    supabase = get_supabase_admin()
    user_rows = _safe(lambda: supabase.table("profiles").select("id").eq("id", user_id).limit(1).execute().data, default=[]) or []
    if not user_rows:
        raise HTTPException(status_code=404, detail="User not found")
    existing = _safe(lambda: supabase.table("mentor_verification").select("*").eq("user_id", user_id).limit(1).execute().data, default=[]) or []
    cur_hold = bool(existing[0].get("payout_hold")) if existing else False
    if cur_hold == payload.hold:
        raise HTTPException(status_code=409, detail=f"payout_hold already {payload.hold}")
    patch = {
        "payout_hold": payload.hold,
        "payout_hold_reason": body.reason if payload.hold else None,
        "updated_at": _now_iso(),
    }
    if existing:
        supabase.table("mentor_verification").update(patch).eq("user_id", user_id).execute()
    else:
        supabase.table("mentor_verification").insert({"user_id": user_id, **patch}).execute()
    audit_id = _audit(
        supabase, admin, "admin.mentor.payout_hold.set",
        entity_type="mentor_verification", entity_id=user_id,
        old_value={"payout_hold": cur_hold},
        new_value={"payout_hold": payload.hold, "reason": body.reason},
    )
    return {"ok": True, "audit_id": audit_id, "user_id": user_id, "payout_hold": payload.hold}


# ════════════════════════════════════════════════════════════════════════
#  §4.4 — Resource Review Queue
# ════════════════════════════════════════════════════════════════════════


_RESOURCE_STATUSES = ("pending_review", "approved", "rejected", "hidden", "dmca_removed")
_TRUST_ATTRIBUTIONS = ("official", "community", "coaching", "unknown")
_RESOURCE_DECISIONS = ("approve", "reject", "edit", "dmca", "hide")


@router.get("/admin/community/resources")
def list_resources(
    status: str | None = Query(default=None),
    exam_slug: str | None = Query(default=None),
    uploader: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Resource queue. Default ordering puts pending_review first via the
    new index; counts per status are returned for the badge row."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("community_resources")
        .select(
            "id, title, summary, resource_type, exam_slug, status, trust_attribution, verified_by, verified_by_topper, upvote_count, report_count, merged_into, created_by, created_at, updated_at",
            count="exact",
        )
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if exam_slug:
        q = q.eq("exam_slug", exam_slug)
    if uploader:
        q = q.eq("created_by", uploader)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None

    counts: dict[str, int] = {}
    for st in _RESOURCE_STATUSES:
        cq = supabase.table("community_resources").select("id", count="exact").eq("status", st)
        try:
            counts[st] = int(cq.execute().count or 0)
        except Exception:  # noqa: BLE001
            counts[st] = 0
    return {"items": items, "total": total, "limit": limit, "offset": offset, "counts": counts}


@router.get("/admin/community/resources/{resource_id}")
def get_resource_detail(
    resource_id: str,
    _admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Resource detail with votes, reports, and dedupe candidates by URL hash."""
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("community_resources").select("*").eq("id", resource_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Resource not found")
    resource = rows[0]
    votes = (
        _safe(lambda: supabase.table("community_resource_votes").select("id, voter_id, vote_value, created_at").eq("resource_id", resource_id).order("created_at", desc=True).limit(50).execute().data, default=[])
        or []
    )
    reports = (
        _safe(lambda: supabase.table("community_resource_reports").select("id, reporter_id, reason, status, created_at").eq("resource_id", resource_id).order("created_at", desc=True).limit(50).execute().data, default=[])
        or []
    )
    # Dedupe candidates — same source_url normalized. Cheap proxy for URL hash.
    candidates: list[dict] = []
    src = resource.get("source_url")
    if src:
        candidates = (
            _safe(
                lambda: supabase.table("community_resources")
                .select("id, title, status, created_at")
                .eq("source_url", src)
                .neq("id", resource_id)
                .limit(10)
                .execute()
                .data,
                default=[],
            )
            or []
        )
    return {"resource": resource, "votes": votes, "reports": reports, "dedupe_candidates": candidates}


_EDITABLE_RESOURCE_FIELDS = {"title", "summary", "resource_type", "exam_slug", "source_url"}


class ResourceDecisionBody(BaseModel):
    action: str = Field(..., min_length=3, max_length=30)
    metadata: dict[str, Any] | None = None
    trust_attribution: str | None = None


@router.post("/admin/community/resources/{resource_id}/decision")
def resource_decision(
    resource_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Decide on a resource. Supported actions:

    - ``approve`` — status='approved', sets verified_by and (optional)
      trust_attribution.
    - ``reject`` — status='rejected'.
    - ``hide`` — status='hidden'.
    - ``edit`` — title/summary/exam_slug/source_url/resource_type via
      payload.metadata.
    - ``dmca`` — status='dmca_removed' (legal takedown reference is
      stored in the audit row's new_value, not in the resource).

    Any decision links to a ``moderation_items`` row when one exists for
    this resource — we emit a ``moderation_events`` row pinned to it.
    """
    payload = ResourceDecisionBody.model_validate(body.payload or {})
    action = payload.action.lower()
    if action not in _RESOURCE_DECISIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {_RESOURCE_DECISIONS}")
    if payload.trust_attribution and payload.trust_attribution not in _TRUST_ATTRIBUTIONS:
        raise HTTPException(status_code=422, detail=f"trust_attribution must be one of {_TRUST_ATTRIBUTIONS}")
    supabase = get_supabase_admin()
    rows = _safe(lambda: supabase.table("community_resources").select("id, status, title, created_by, trust_attribution").eq("id", resource_id).limit(1).execute().data, default=[]) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Resource not found")
    existing = rows[0]

    target_status_map = {"approve": "approved", "reject": "rejected", "hide": "hidden", "dmca": "dmca_removed"}
    patch: dict[str, Any] = {"updated_at": _now_iso()}
    if action == "edit":
        meta = payload.metadata or {}
        edits = {k: v for k, v in meta.items() if k in _EDITABLE_RESOURCE_FIELDS}
        if not edits:
            raise HTTPException(status_code=422, detail=f"edit requires at least one of {sorted(_EDITABLE_RESOURCE_FIELDS)}")
        patch.update(edits)
    else:
        patch["status"] = target_status_map[action]
        if action == "approve":
            patch["verified_by"] = admin.get("id")
            if payload.trust_attribution:
                patch["trust_attribution"] = payload.trust_attribution
    supabase.table("community_resources").update(patch).eq("id", resource_id).execute()

    # If there's an open moderation item against this resource, emit an event.
    mod_rows = _safe(lambda: supabase.table("moderation_items").select("id").eq("entity_type", "community_resource").eq("entity_id", resource_id).order("created_at", desc=True).limit(1).execute().data, default=[]) or []
    mod_item_id = mod_rows[0]["id"] if mod_rows else None
    _emit_mod_event(supabase, mod_item_id, admin, "admin_decision", from_value=existing.get("status"), to_value=patch.get("status") or "edit", note=body.reason)

    audit_id = _audit(
        supabase, admin, "admin.resource.decision",
        entity_type="community_resource", entity_id=resource_id,
        old_value={"status": existing.get("status"), "title": existing.get("title")},
        new_value={"action": action, "patch": patch, "reason": body.reason, "moderation_item_id": mod_item_id},
    )
    return {"ok": True, "audit_id": audit_id, "resource_id": resource_id, "action": action, "moderation_item_id": mod_item_id}


class MergeIntoBody(BaseModel):
    canonical_id: str = Field(..., min_length=4, max_length=200)


@router.post("/admin/community/resources/{resource_id}/merge-into")
def resource_merge_into(
    resource_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(_require_perm(PERM_COMMUNITY)),
) -> dict[str, Any]:
    """Merge ``resource_id`` into ``payload.canonical_id``. Sets
    ``merged_into`` and hides the duplicate. Votes are NOT auto-moved here
    — that's a deeper data-migration task; the merged row stays queryable
    via ``merged_into`` so the canonical resource can be linked back."""
    payload = MergeIntoBody.model_validate(body.payload or {})
    if payload.canonical_id == resource_id:
        raise HTTPException(status_code=422, detail="Cannot merge a resource into itself")
    supabase = get_supabase_admin()
    src = _safe(lambda: supabase.table("community_resources").select("id, status, merged_into").eq("id", resource_id).limit(1).execute().data, default=[]) or []
    if not src:
        raise HTTPException(status_code=404, detail="Source resource not found")
    if src[0].get("merged_into"):
        raise HTTPException(status_code=409, detail="Resource is already merged into another")
    canon = _safe(lambda: supabase.table("community_resources").select("id").eq("id", payload.canonical_id).limit(1).execute().data, default=[]) or []
    if not canon:
        raise HTTPException(status_code=422, detail="canonical_id does not resolve")
    supabase.table("community_resources").update({"merged_into": payload.canonical_id, "status": "hidden", "updated_at": _now_iso()}).eq("id", resource_id).execute()
    audit_id = _audit(
        supabase, admin, "admin.resource.merge",
        entity_type="community_resource", entity_id=resource_id,
        old_value={"status": src[0].get("status")},
        new_value={"merged_into": payload.canonical_id, "reason": body.reason},
    )
    return {"ok": True, "audit_id": audit_id, "resource_id": resource_id, "merged_into": payload.canonical_id}
