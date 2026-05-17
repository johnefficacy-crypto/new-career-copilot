"""Admin Study OS operations — Phase 1 (Inspector + Plan Ops).

Implements the surface specified in
``docs/engineering/admin-study-os-operations.md``:

  GET    /api/admin/study-os/users/search
  GET    /api/admin/study-os/users/{user_id}/snapshot
  GET    /api/admin/study-os/users/{user_id}/mission-control
  GET    /api/admin/study-os/users/{user_id}/adaptation-events
  POST   /api/admin/study-os/users/{user_id}/plan-ops/preview-draft
  POST   /api/admin/study-os/users/{user_id}/plan-ops/apply
  POST   /api/admin/study-os/users/{user_id}/plan-ops/skip-task
  POST   /api/admin/study-os/users/{user_id}/plan-ops/reset-carry-forward
  POST   /api/admin/study-os/users/{user_id}/focus/force-close

All endpoints are gated behind the ``ADMIN_STUDY_OS_ENABLED`` flag
(env var ``ADMIN_STUDY_OS_ENABLED``, default off) plus the existing
permission system. Two new permission keys are introduced:

  study_os.support  — read-only Inspector + adaptation events
  study_os.ops      — Plan Ops writes + force-close focus

super_admin bypasses both (matches every other admin router here).

Every write inserts an ``admin_audit_logs`` row and, when it changes
state the planner/engine consumes, an ``study_adaptation_events`` row
with ``trigger_source='admin'`` so Mission Control reasoning remains
explainable.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.core.config import get_settings
from app.db.supabase_client import get_supabase_admin
from app.study_os.mission_control import build_mission_control
from app.study_os.planner import apply_plan, compute_draft_plan

logger = logging.getLogger("career_copilot.api.admin_study_os")

router = APIRouter(prefix="/admin/study-os", tags=["admin-study-os"])

# Permission keys — super_admin bypasses both via require_permission.
PERM_SUPPORT = "study_os.support"
PERM_OPS = "study_os.ops"


# ─── Helpers ──────────────────────────────────────────────────────────────


def _flag_enabled() -> None:
    if not get_settings().ADMIN_STUDY_OS_ENABLED:
        raise HTTPException(
            status_code=404,
            detail="admin.study_os.enabled is off",
        )


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_study_os supabase call failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit(
    supabase,
    actor: dict,
    action: str,
    *,
    entity_type: str = "study_user",
    entity_id: str | None = None,
    new_value: Any = None,
    notes: str = "admin_study_os",
) -> str | None:
    """Insert an ``admin_audit_logs`` row. Returns the row id on success.

    Logs but does not re-raise on failure: an audit-write error must not
    take down the admin action, but it MUST be surfaced in logs so an
    on-call can spot a broken audit trail.
    """
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
        logger.exception("audit log insert failed (admin_study_os)")
        return None


def _emit_admin_adaptation_event(
    supabase,
    user_id: str,
    actor: dict,
    *,
    event_type: str,
    reason: str,
    payload: dict[str, Any] | None = None,
    plan_id: str | None = None,
) -> None:
    """Mirror admin-driven state changes into ``study_adaptation_events``.

    Mission Control consumes this table for reasoning traces; writing
    here with ``trigger_source='admin'`` keeps the trace honest about
    when an operator was the source of change rather than the engine.
    """
    try:
        supabase.table("study_adaptation_events").insert(
            {
                "user_id": user_id,
                "plan_id": plan_id,
                "event_type": event_type,
                "trigger_source": "admin",
                "trigger_payload": {
                    "reason": reason,
                    "actor_id": actor.get("id"),
                    "actor_email": actor.get("email"),
                    "extra": payload or {},
                },
                "change_summary": payload or {},
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("study_adaptation_events insert failed (admin_study_os)")


def _resolve_user(supabase, query: str) -> dict | None:
    """Resolve a user by id (UUID) or exact email. Returns the profile row
    with the minimal envelope the inspector needs."""
    q = (query or "").strip()
    if not q:
        return None
    cols = "id, email, full_name, timezone, onboarding_completed, created_at, last_seen_at"
    base = supabase.table("profiles").select(cols).limit(1)
    # Try by id first; if it looks like an email, try email.
    if "@" in q:
        rows = _safe(lambda: base.eq("email", q).execute().data, default=[]) or []
    else:
        rows = _safe(lambda: base.eq("id", q).execute().data, default=[]) or []
        if not rows:
            # Fallback: maybe they pasted an email-looking thing without @, or a username.
            rows = _safe(
                lambda: supabase.table("profiles")
                .select(cols)
                .eq("full_name", q)
                .limit(1)
                .execute()
                .data,
                default=[],
            ) or []
    return rows[0] if rows else None


class StudyOpsWriteBody(BaseModel):
    """Standard request shape for every write under this router.

    ``reason`` is mandatory and must be at least 8 characters — admins
    leaving a one-word reason is the most common source of audit-row
    rot in incident reviews.
    """

    reason: str = Field(..., min_length=8, max_length=500)
    payload: dict[str, Any] | None = None
    expected_version: str | None = None


# ─── User search ──────────────────────────────────────────────────────────


@router.get("/users/search")
def search_users(
    q: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(default=10, ge=1, le=50),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Resolve email/id/full_name → list of candidate profiles.

    Returns at most ``limit`` matches. Used by the User Study Inspector
    search box. Read-only.
    """
    supabase = get_supabase_admin()
    needle = q.strip()
    cols = "id, email, full_name, timezone, created_at, last_seen_at"

    items: list[dict] = []
    if "@" in needle:
        items = (
            _safe(
                lambda: supabase.table("profiles")
                .select(cols)
                .ilike("email", f"%{needle}%")
                .limit(limit)
                .execute()
                .data,
                default=[],
            )
            or []
        )
    else:
        # Try id-equals first (likely a UUID paste) then full_name ilike.
        items = (
            _safe(
                lambda: supabase.table("profiles")
                .select(cols)
                .eq("id", needle)
                .limit(1)
                .execute()
                .data,
                default=[],
            )
            or []
        )
        if not items:
            items = (
                _safe(
                    lambda: supabase.table("profiles")
                    .select(cols)
                    .ilike("full_name", f"%{needle}%")
                    .limit(limit)
                    .execute()
                    .data,
                    default=[],
                )
                or []
            )
    return {"items": items, "query": needle, "limit": limit}


# ─── Read-only snapshot ───────────────────────────────────────────────────


def _count(supabase, table: str, *, user_col: str, user_id: str, filters: dict | None = None) -> int:
    try:
        q = supabase.table(table).select("id", count="exact").eq(user_col, user_id)
        for k, v in (filters or {}).items():
            q = q.eq(k, v)
        return int(q.execute().count or 0)
    except Exception:  # noqa: BLE001
        return 0


@router.get("/users/{user_id}/snapshot")
def user_snapshot(
    user_id: str,
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Read-only inspector payload.

    Aggregates metadata and counts across every aspirant-facing Study OS
    surface. Returns metadata only — never artifact content. Per the
    spec, opening artifact content is a separate audited action (Phase 2).
    """
    supabase = get_supabase_admin()

    profile = _safe(
        lambda: supabase.table("profiles")
        .select("id, email, full_name, timezone, persona, plan, onboarding_completed, created_at, last_seen_at")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    profile = profile[0]

    # Active plan — metadata only, no task contents.
    plan_rows = _safe(
        lambda: supabase.table("study_plans")
        .select("id, status, theme, target, start_date, end_date, current_plan_version_id, active_phase_id, updated_at, created_at")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    active_plan = plan_rows[0] if plan_rows else None
    plan_id = active_plan.get("id") if active_plan else None

    # Most recent plan version (changelog tail entry).
    latest_version = None
    if plan_id:
        v = _safe(
            lambda: supabase.table("study_plan_versions")
            .select("id, version_number, change_summary, created_at")
            .eq("plan_id", plan_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data,
            default=[],
        ) or []
        latest_version = v[0] if v else None

    # Today's task posture (counts only).
    today = datetime.now(timezone.utc).date().isoformat()
    today_tasks = _safe(
        lambda: supabase.table("study_tasks")
        .select("id, status, task_type, planned_minutes, duration_mins, scheduled_date")
        .eq("user_id", user_id)
        .eq("scheduled_date", today)
        .execute()
        .data,
        default=[],
    ) or []
    task_counts: dict[str, int] = {}
    for t in today_tasks:
        s = (t.get("status") or "planned").lower()
        task_counts[s] = task_counts.get(s, 0) + 1

    # Focus posture.
    sessions = _safe(
        lambda: supabase.table("study_sessions")
        .select("id, session_type, duration_mins, started_at, ended_at, notes")
        .eq("user_id", user_id)
        .order("started_at", desc=True)
        .limit(10)
        .execute()
        .data,
        default=[],
    ) or []
    active_session = next((s for s in sessions if not s.get("ended_at")), None)
    stuck = False
    if active_session and active_session.get("started_at"):
        try:
            started = datetime.fromisoformat(
                str(active_session["started_at"]).replace("Z", "+00:00")
            )
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            stuck = (datetime.now(timezone.utc) - started).total_seconds() > 6 * 3600
        except Exception:  # noqa: BLE001
            stuck = False

    # Last-N adaptation events (engine + admin + policy).
    events = _safe(
        lambda: supabase.table("study_adaptation_events")
        .select("id, event_type, trigger_source, change_summary, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data,
        default=[],
    ) or []

    # Artifact + social counts. Best-effort; missing tables surface as 0
    # rather than 500 because not every environment has every Phase-2
    # table migrated.
    artifacts = {
        "notes": _count(supabase, "user_notes", user_col="user_id", user_id=user_id),
        "flashcard_decks": _count(supabase, "flashcard_decks", user_col="user_id", user_id=user_id),
        "flashcards": _count(supabase, "flashcards", user_col="user_id", user_id=user_id),
        "mistakes": _count(supabase, "mistake_entries", user_col="user_id", user_id=user_id),
        "revision_items": _count(supabase, "revision_schedule", user_col="user_id", user_id=user_id),
        "saved_recruitments": _count(supabase, "saved_recruitments", user_col="user_id", user_id=user_id),
        "tracker_applications": _count(supabase, "user_recruitment_applications", user_col="user_id", user_id=user_id),
        "mocks": _count(supabase, "mock_results", user_col="user_id", user_id=user_id),
    }

    # Most recent report card + weekly review pointers (read-only).
    last_review = _safe(
        lambda: supabase.table("weekly_reviews")
        .select("id, week_start, computed_at")
        .eq("user_id", user_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    last_report_card = _safe(
        lambda: supabase.table("study_report_cards")
        .select("id, period, generated_at")
        .eq("user_id", user_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []

    return {
        "fetched_at": _now_iso(),
        "profile": profile,
        "plan": {
            "active": active_plan,
            "latest_version": latest_version,
            "today_task_counts": task_counts,
            "today_total": len(today_tasks),
        },
        "focus": {
            "active_session": active_session,
            "active_session_stuck": stuck,
            "recent_sessions": sessions,
        },
        "adaptation_events_tail": events,
        "artifacts": artifacts,
        "weekly_review": last_review[0] if last_review else None,
        "report_card": last_report_card[0] if last_report_card else None,
    }


@router.get("/users/{user_id}/mission-control")
def user_mission_control(
    user_id: str,
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Build the user's Today / Mission Control payload as-of now.

    Pass-through to the engine the aspirant uses. Stamped with the
    admin-fetch timestamp so the operator can correlate with what the
    user is seeing.
    """
    supabase = get_supabase_admin()
    try:
        mc = build_mission_control(supabase, user_id)
    except Exception:  # noqa: BLE001
        logger.exception("admin mission_control build failed for %s", user_id)
        raise HTTPException(status_code=500, detail="Failed to build Mission Control")
    return {"fetched_at": _now_iso(), "user_id": user_id, "mission_control": mc}


@router.get("/users/{user_id}/adaptation-events")
def user_adaptation_events(
    user_id: str,
    source: str | None = Query(default=None, description="Filter: engine|policy|admin"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Raw ``study_adaptation_events`` for the user, newest first.

    Used by the Plan Ops "reasoning trace" panel. Read-only; nothing
    here is admin-writable except via the Plan Ops write endpoints.
    """
    supabase = get_supabase_admin()
    q = (
        supabase.table("study_adaptation_events")
        .select("id, plan_id, plan_version_id, event_type, trigger_source, trigger_payload, change_summary, created_at", count="exact")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if source:
        # Accept "planner_v1" / "policy" / "admin"; if caller sent "engine",
        # match any source that isn't admin or policy by excluding those.
        if source == "engine":
            q = q.not_.in_("trigger_source", ["admin", "policy"])
        else:
            q = q.eq("trigger_source", source)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    rows = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": rows, "total": total, "limit": limit, "offset": offset, "filters": {"source": source}}


# ─── Plan Ops (writes) ────────────────────────────────────────────────────


@router.post("/users/{user_id}/plan-ops/preview-draft")
def plan_ops_preview_draft(
    user_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Compute a draft plan for ``user_id`` without persisting anything.

    Wraps ``compute_draft_plan``. The Plan Ops UI uses this to show the
    operator a diff before they commit to ``apply``.

    Even though no plan rows mutate, this is logged: the operator
    pulled a fresh draft for diff inspection, which is meaningful for
    audit (and rate-limit accounting).
    """
    supabase = get_supabase_admin()
    if not _resolve_user(supabase, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    draft = compute_draft_plan(supabase, user_id)
    audit_id = _audit(
        supabase,
        admin,
        "study_os.plan_ops.preview_draft",
        entity_id=user_id,
        new_value={"reason": body.reason, "generated": bool(draft.get("generated"))},
    )
    return {"ok": True, "audit_id": audit_id, "draft": draft}


@router.post("/users/{user_id}/plan-ops/apply")
def plan_ops_apply(
    user_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Force-apply a fresh plan for ``user_id``.

    Spec §12 default: regen overwrites the applied plan only — there is
    no separately-persisted "pending draft" to protect, so this is
    equivalent to "regenerate Mission Control" for this user.

    Persists exactly what ``apply_plan`` persists (one ``study_plans``
    update, one ``study_plan_versions`` row, today's tasks for that
    plan, one engine-driven ``study_adaptation_events`` row), plus an
    additional admin-attributed adaptation event recording the operator
    and reason.
    """
    supabase = get_supabase_admin()
    if not _resolve_user(supabase, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    result = apply_plan(
        supabase,
        user_id,
        reason="admin_apply",
        event_type="admin_apply",
    )
    audit_id = _audit(
        supabase,
        admin,
        "study_os.plan_ops.apply",
        entity_id=user_id,
        new_value={
            "reason": body.reason,
            "applied": bool(result.get("applied")),
            "task_count": result.get("task_count"),
            "version_number": result.get("version_number"),
        },
    )
    _emit_admin_adaptation_event(
        supabase,
        user_id,
        admin,
        event_type="admin_apply",
        reason=body.reason,
        plan_id=result.get("plan_id"),
        payload={
            "version_id": result.get("plan_version_id"),
            "task_count": result.get("task_count"),
            "risk_level": result.get("risk_level"),
        },
    )
    return {"ok": True, "audit_id": audit_id, "result": result}


class SkipTaskPayload(BaseModel):
    task_id: str = Field(..., min_length=1, max_length=200)


@router.post("/users/{user_id}/plan-ops/skip-task")
def plan_ops_skip_task(
    user_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Mark a stuck task as ``skipped`` on behalf of the user.

    ``body.payload`` must contain ``task_id``. We refuse to act on tasks
    already in a terminal state (completed / skipped) so an operator
    can't quietly rewrite history.
    """
    payload = SkipTaskPayload.model_validate(body.payload or {})
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("study_tasks")
            .select("id, user_id, status, plan_id")
            .eq("id", payload.task_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    task = rows[0]
    if task.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Task does not belong to this user")
    cur = (task.get("status") or "").lower()
    if cur in {"completed", "skipped"}:
        raise HTTPException(
            status_code=409,
            detail={"message": f"Task already {cur!r}", "current_status": cur},
        )
    supabase.table("study_tasks").update(
        {"status": "skipped", "updated_at": _now_iso()}
    ).eq("id", payload.task_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.plan_ops.skip_task",
        entity_type="study_task",
        entity_id=payload.task_id,
        new_value={"reason": body.reason, "previous_status": task.get("status"), "user_id": user_id},
    )
    _emit_admin_adaptation_event(
        supabase,
        user_id,
        admin,
        event_type="admin_skip_task",
        reason=body.reason,
        plan_id=task.get("plan_id"),
        payload={"task_id": payload.task_id, "previous_status": task.get("status")},
    )
    return {"ok": True, "audit_id": audit_id, "task_id": payload.task_id, "status": "skipped"}


@router.post("/users/{user_id}/plan-ops/reset-carry-forward")
def plan_ops_reset_carry_forward(
    user_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Clear the user's carried-forward backlog by skipping every task
    currently in ``status='carried_forward'``.

    Use case: a user has accumulated a wall of carry-forward tasks that
    the planner keeps re-promoting; the operator wants a clean slate
    before the next ``apply``. Capped at 200 per call to keep the
    request bounded.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("study_tasks")
            .select("id, plan_id")
            .eq("user_id", user_id)
            .eq("status", "carried_forward")
            .limit(200)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        audit_id = _audit(
            supabase,
            admin,
            "study_os.plan_ops.reset_carry_forward",
            entity_id=user_id,
            new_value={"reason": body.reason, "cleared": 0},
        )
        return {"ok": True, "audit_id": audit_id, "cleared": 0}
    ids = [r["id"] for r in rows if r.get("id")]
    supabase.table("study_tasks").update(
        {"status": "skipped", "updated_at": _now_iso()}
    ).in_("id", ids).execute()
    plan_id = rows[0].get("plan_id") if rows else None
    audit_id = _audit(
        supabase,
        admin,
        "study_os.plan_ops.reset_carry_forward",
        entity_id=user_id,
        new_value={"reason": body.reason, "cleared": len(ids)},
    )
    _emit_admin_adaptation_event(
        supabase,
        user_id,
        admin,
        event_type="admin_reset_carry_forward",
        reason=body.reason,
        plan_id=plan_id,
        payload={"cleared": len(ids), "task_ids": ids[:20]},
    )
    return {"ok": True, "audit_id": audit_id, "cleared": len(ids)}


class FocusForceClosePayload(BaseModel):
    session_id: str | None = None


@router.post("/users/{user_id}/focus/force-close")
def focus_force_close(
    user_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Close a stuck focus session for ``user_id``.

    If ``payload.session_id`` is omitted we pick the most recent open
    session. The original ``notes`` field is preserved and prefixed with
    an ``[admin:<email>] <reason>`` marker so the user (and auditors)
    can see why the session was closed without them.
    """
    payload = FocusForceClosePayload.model_validate(body.payload or {})
    supabase = get_supabase_admin()
    if payload.session_id:
        rows = (
            _safe(
                lambda: supabase.table("study_sessions")
                .select("id, user_id, started_at, ended_at, notes")
                .eq("id", payload.session_id)
                .limit(1)
                .execute()
                .data,
                default=[],
            )
            or []
        )
    else:
        rows = (
            _safe(
                lambda: supabase.table("study_sessions")
                .select("id, user_id, started_at, ended_at, notes")
                .eq("user_id", user_id)
                .is_("ended_at", "null")
                .order("started_at", desc=True)
                .limit(1)
                .execute()
                .data,
                default=[],
            )
            or []
        )
    if not rows:
        raise HTTPException(status_code=404, detail="No matching focus session")
    s = rows[0]
    if s.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Session does not belong to this user")
    if s.get("ended_at"):
        raise HTTPException(
            status_code=409,
            detail={"message": "Session already ended", "ended_at": s.get("ended_at")},
        )
    actor_email = admin.get("email") or admin.get("id") or "admin"
    new_notes = f"[admin:{actor_email}] {body.reason}"
    if s.get("notes"):
        new_notes = f"{new_notes} | prev: {s['notes']}"
    supabase.table("study_sessions").update(
        {"ended_at": _now_iso(), "notes": new_notes}
    ).eq("id", s["id"]).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.focus.force_close",
        entity_type="study_session",
        entity_id=s["id"],
        new_value={"reason": body.reason, "user_id": user_id, "started_at": s.get("started_at")},
    )
    return {"ok": True, "audit_id": audit_id, "session_id": s["id"], "ended_at": _now_iso()}
