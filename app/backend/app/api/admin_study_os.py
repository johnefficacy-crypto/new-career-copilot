"""Admin Study OS operations — Phases 1 + 2 + 3 + open-content.

Phase 1: Inspector + Plan Ops
  GET    /api/admin/study-os/users/search
  GET    /api/admin/study-os/users/{user_id}/snapshot
  GET    /api/admin/study-os/users/{user_id}/mission-control
  GET    /api/admin/study-os/users/{user_id}/adaptation-events
  POST   /api/admin/study-os/users/{user_id}/plan-ops/preview-draft
  POST   /api/admin/study-os/users/{user_id}/plan-ops/apply
  POST   /api/admin/study-os/users/{user_id}/plan-ops/skip-task
  POST   /api/admin/study-os/users/{user_id}/plan-ops/reset-carry-forward
  POST   /api/admin/study-os/users/{user_id}/focus/force-close

Phase 2: Learning Artifact Admin + Mock Trust Console + Report Job Admin
  GET    /api/admin/study-os/users/{user_id}/artifacts/notes
  GET    /api/admin/study-os/users/{user_id}/artifacts/flashcard-decks
  GET    /api/admin/study-os/users/{user_id}/artifacts/flashcards
  GET    /api/admin/study-os/users/{user_id}/artifacts/flashcards/{card_id}/srs
  GET    /api/admin/study-os/users/{user_id}/artifacts/mistakes
  GET    /api/admin/study-os/users/{user_id}/artifacts/revision
  POST   /api/admin/study-os/users/{user_id}/artifacts/revision/{item_id}/reschedule
  POST   /api/admin/study-os/users/{user_id}/artifacts/revision/{item_id}/cancel
  GET    /api/admin/study-os/mocks/queue
  GET    /api/admin/study-os/mocks/{mock_id}
  POST   /api/admin/study-os/mocks/{mock_id}/set-verification-tier
  GET    /api/admin/study-os/reports/queue
  GET    /api/admin/study-os/reports/{report_id}
  POST   /api/admin/study-os/reports/{report_id}/retry
  POST   /api/admin/study-os/reports/{report_id}/cancel

Phase 2 follow-up — single-operator open-content (this PR):
  POST   /api/admin/study-os/users/{user_id}/artifacts/notes/{note_id}/open
  POST   /api/admin/study-os/users/{user_id}/artifacts/flashcards/{card_id}/open
  POST   /api/admin/study-os/users/{user_id}/artifacts/mistakes/{mistake_id}/open

  Each open returns the full content fields for one artifact (note body,
  flashcard front/back/hint, mistake question_text/correct_answer/
  my_answer/reason) and writes one row to ``support_content_access`` so
  privacy reviews can see who read what for which user. Gated by
  ``study_os.ops`` per spec §12 default — no 4-eyes for this role.

Phase 3: Social admin (groups + partner pairs + sessions + trust +
leaderboard + mentor feedback)
  GET    /api/admin/study-os/social/groups
  GET    /api/admin/study-os/social/groups/{group_id}/members
  POST   /api/admin/study-os/social/groups/{group_id}/archive
  POST   /api/admin/study-os/social/groups/{group_id}/transfer-ownership
  GET    /api/admin/study-os/social/partner-pairs
  POST   /api/admin/study-os/social/partner-pairs/{pair_id}/dissolve
  GET    /api/admin/study-os/social/sessions
  POST   /api/admin/study-os/social/sessions/{session_id}/force-end
  GET    /api/admin/study-os/social/trust/{user_id}/breakdown
  POST   /api/admin/study-os/social/trust/{user_id}/recompute
  GET    /api/admin/study-os/social/leaderboard
  POST   /api/admin/study-os/social/leaderboard/{entry_id}/hide
  POST   /api/admin/study-os/social/leaderboard/{entry_id}/restore
  GET    /api/admin/study-os/social/mentor-feedback
  POST   /api/admin/study-os/social/mentor-feedback/{feedback_id}/hide
  POST   /api/admin/study-os/social/mentor-feedback/{feedback_id}/restore

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
# 4-eyes: viewer can REQUEST content opens; only PERM_OPS can APPROVE.
# Both roles can read non-content metadata.
PERM_VIEWER = "study_os.viewer"


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
        "notes": _count(supabase, "personal_notes", user_col="user_id", user_id=user_id),
        "flashcard_decks": _count(supabase, "flashcard_decks", user_col="user_id", user_id=user_id),
        "flashcards": _count(supabase, "flashcards", user_col="user_id", user_id=user_id),
        "mistakes": _count(supabase, "mistake_entries", user_col="user_id", user_id=user_id),
        "revision_items": _count(supabase, "revision_items", user_col="user_id", user_id=user_id),
        "saved_recruitments": _count(supabase, "saved_recruitments", user_col="user_id", user_id=user_id),
        "tracker_applications": _count(supabase, "user_recruitment_applications", user_col="user_id", user_id=user_id),
        "mocks": _count(supabase, "mock_tests", user_col="user_id", user_id=user_id),
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


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 — Learning Artifact Admin
# ════════════════════════════════════════════════════════════════════════
#
# Read endpoints return metadata only (ids, counts, status, timestamps,
# SRS state). They DO NOT return note bodies, flashcard front/back, or
# mistake question text. Per the answered open question for this PR,
# content reads are deferred — they require an audited "open content"
# flow that will land in a Phase 2 follow-up alongside the
# ``support_content_access`` log table.

# ─── Notes ────────────────────────────────────────────────────────────────


@router.get("/users/{user_id}/artifacts/notes")
def artifacts_notes_list(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    is_archived: bool | None = Query(default=None),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Metadata-only listing of a user's notes (``personal_notes`` table).

    Title and tags are surfaced because they're navigation metadata, not
    the substantive content; ``body`` and ``source_url`` are not.
    """
    supabase = get_supabase_admin()
    q = (
        supabase.table("personal_notes")
        .select(
            "id, title, tags, exam_slug, subject_id, topic_id, is_pinned, is_archived, created_at, updated_at",
            count="exact",
        )
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
    )
    if is_archived is not None:
        q = q.eq("is_archived", is_archived)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset, "user_id": user_id}


# ─── Flashcards ───────────────────────────────────────────────────────────


@router.get("/users/{user_id}/artifacts/flashcard-decks")
def artifacts_flashcard_decks(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Deck-level metadata. Names and exam/subject/topic pointers are
    metadata; card front/back content is not exposed by this endpoint."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("flashcard_decks")
        .select(
            "id, name, description, exam_slug, subject_id, topic_id, is_shared, card_count, due_count, created_at, updated_at",
            count="exact",
        )
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
    )
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/users/{user_id}/artifacts/flashcards")
def artifacts_flashcards_list(
    user_id: str,
    deck_id: str | None = Query(default=None),
    is_suspended: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Card-level metadata + SRS state. Excludes ``front``, ``back``,
    and ``hint`` — those are user content. SRS columns are surfaced
    so an operator can tell the difference between "the SRS engine is
    starving this card" and "the user is genuinely behind on review"."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("flashcards")
        .select(
            "id, deck_id, ease, interval_days, repetitions, lapses, due_at, last_reviewed_at, is_suspended, created_at, updated_at",
            count="exact",
        )
        .eq("user_id", user_id)
        .order("due_at", desc=False)
    )
    if deck_id:
        q = q.eq("deck_id", deck_id)
    if is_suspended is not None:
        q = q.eq("is_suspended", is_suspended)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/users/{user_id}/artifacts/flashcards/{card_id}/srs")
def artifacts_flashcard_srs(
    user_id: str,
    card_id: str,
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Per-card SRS state inspector plus the last 10 review rows.

    Review rows surface rating + duration + the interval transition so
    a debugger can see whether the SRS schedule is reasonable. Card
    content is still not returned.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("flashcards")
            .select(
                "id, deck_id, ease, interval_days, repetitions, lapses, due_at, last_reviewed_at, is_suspended, created_at, updated_at"
            )
            .eq("id", card_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Card not found for this user")
    history = (
        _safe(
            lambda: supabase.table("flashcard_reviews")
            .select("rating, duration_ms, prev_interval_days, new_interval_days, reviewed_at")
            .eq("card_id", card_id)
            .eq("user_id", user_id)
            .order("reviewed_at", desc=True)
            .limit(10)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    return {"card": rows[0], "recent_reviews": history}


# ─── Mistakes ─────────────────────────────────────────────────────────────


@router.get("/users/{user_id}/artifacts/mistakes")
def artifacts_mistakes_list(
    user_id: str,
    status: str | None = Query(default=None, description="open|reviewing|mastered"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Mistake-book metadata. Question text + answers stay private; the
    operator gets root-cause + status + due-at + counts."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("mistake_entries")
        .select(
            "id, root_cause, difficulty, exam_slug, subject_id, topic_id, tags, status, review_count, next_review_at, mastered_at, promoted_card_id, created_at, updated_at",
            count="exact",
        )
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


# ─── Revision calendar ───────────────────────────────────────────────────


@router.get("/users/{user_id}/artifacts/revision")
def artifacts_revision_list(
    user_id: str,
    status: str | None = Query(default=None, description="scheduled|completed|skipped"),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Revision queue inspector.

    Title is shown because it's the user-visible label for the revision
    item (typically a deck/note/topic name) and is needed to identify
    which item the operator is about to reschedule or cancel.
    """
    supabase = get_supabase_admin()
    q = (
        supabase.table("revision_items")
        .select(
            "id, source_kind, source_id, title, exam_slug, subject_id, topic_id, scheduled_for, interval_days, ease, repetitions, status, completed_at, created_at, updated_at",
            count="exact",
        )
        .eq("user_id", user_id)
        .order("scheduled_for", desc=False)
    )
    if status:
        q = q.eq("status", status)
    if from_date:
        q = q.gte("scheduled_for", from_date)
    if to_date:
        q = q.lte("scheduled_for", to_date)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


class ReschedulePayload(BaseModel):
    scheduled_for: str = Field(..., min_length=4, max_length=40)


@router.post("/users/{user_id}/artifacts/revision/{item_id}/reschedule")
def artifacts_revision_reschedule(
    user_id: str,
    item_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Move one revision item to a new ``scheduled_for`` date.

    Refuses to act on a row already in a terminal state — completed or
    skipped items should not be silently re-armed. Use the existing
    aspirant ``POST /revision/{id}/complete`` workflow to re-trigger
    the SRS scheduler instead.
    """
    payload = ReschedulePayload.model_validate(body.payload or {})
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("revision_items")
            .select("id, user_id, status, scheduled_for")
            .eq("id", item_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Revision item not found")
    item = rows[0]
    if item.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Item does not belong to this user")
    cur = (item.get("status") or "").lower()
    if cur in {"completed", "skipped"}:
        raise HTTPException(
            status_code=409,
            detail={"message": f"Item is {cur!r}; cannot reschedule.", "current_status": cur},
        )
    supabase.table("revision_items").update(
        {"scheduled_for": payload.scheduled_for, "updated_at": _now_iso()}
    ).eq("id", item_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.artifacts.revision.reschedule",
        entity_type="revision_item",
        entity_id=item_id,
        new_value={
            "reason": body.reason,
            "user_id": user_id,
            "previous_scheduled_for": item.get("scheduled_for"),
            "new_scheduled_for": payload.scheduled_for,
        },
    )
    return {"ok": True, "audit_id": audit_id, "item_id": item_id, "scheduled_for": payload.scheduled_for}


@router.post("/users/{user_id}/artifacts/revision/{item_id}/cancel")
def artifacts_revision_cancel(
    user_id: str,
    item_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Cancel one revision item by flipping its status to ``skipped``.

    We flip status instead of deleting so the SRS history and any
    cross-table references (e.g. completed source) remain intact.
    Already-completed items are refused; already-skipped is idempotent.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("revision_items")
            .select("id, user_id, status")
            .eq("id", item_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Revision item not found")
    item = rows[0]
    if item.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Item does not belong to this user")
    cur = (item.get("status") or "").lower()
    if cur == "completed":
        raise HTTPException(
            status_code=409,
            detail={"message": "Item already completed; cannot cancel.", "current_status": cur},
        )
    supabase.table("revision_items").update(
        {"status": "skipped", "updated_at": _now_iso()}
    ).eq("id", item_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.artifacts.revision.cancel",
        entity_type="revision_item",
        entity_id=item_id,
        new_value={"reason": body.reason, "user_id": user_id, "previous_status": item.get("status")},
    )
    return {"ok": True, "audit_id": audit_id, "item_id": item_id, "status": "skipped"}


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 — Mock & Score Trust Console
# ════════════════════════════════════════════════════════════════════════
#
# Queue is a per-user-or-global listing of recent mocks with their
# current verification tier. Trust-weight changes are explicit: the
# admin picks a tier with a reason. Per the spec §12 answered default,
# the change does NOT trigger live leaderboard rewrites; it sits in
# ``mock_score_verification`` and the next scheduled recompute picks
# it up.


VALID_MOCK_REVIEW_STATES = ("scheduled", "unreviewed", "reviewed", "correction_drafted")
VALID_VERIFICATION_TIERS = ("tier_1", "tier_1_5", "tier_2", "tier_3")


@router.get("/mocks/queue")
def mocks_queue(
    user_id: str | None = Query(default=None),
    review_state: str | None = Query(default=None),
    verification_status: str | None = Query(default=None, description="verified|pending|unverified"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List recent mocks (optionally filtered to one user / one review
    state). Returns mock metadata + score envelope; the verification
    tier is joined from ``mock_score_verification`` per row."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("mock_tests")
        .select(
            "id, user_id, exam_name, test_name, scored_marks, total_marks, correct_answers, wrong_answers, questions_attempted, duration_mins, review_state, attempted_at, created_at",
            count="exact",
        )
        .order("attempted_at", desc=True)
    )
    if user_id:
        q = q.eq("user_id", user_id)
    if review_state:
        q = q.eq("review_state", review_state)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None

    # Best-effort join of verification rows. One round-trip per mock is
    # acceptable for a 50-row admin page; if this grows we'll move it
    # to a bulk select with .in_(...).
    verif_index: dict[str, dict[str, Any]] = {}
    if items:
        ids = [m["id"] for m in items if m.get("id")]
        vrows = (
            _safe(
                lambda: supabase.table("mock_score_verification")
                .select("mock_test_id, verification_tier, verification_status, attester_role, evidence_url, verified_score, verified_max_score")
                .in_("mock_test_id", ids)
                .execute()
                .data,
                default=[],
            )
            or []
        )
        for v in vrows:
            verif_index[v["mock_test_id"]] = v
    if verification_status:
        items = [
            m for m in items
            if (verif_index.get(m["id"], {}).get("verification_status") or "unverified") == verification_status
        ]
    for m in items:
        m["verification"] = verif_index.get(m["id"])
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/mocks/{mock_id}")
def mocks_detail(
    mock_id: str,
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """One mock with its subject breakdowns, correction tasks, and
    current verification row."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("mock_tests")
            .select("*")
            .eq("id", mock_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Mock not found")
    mock = rows[0]
    breakdowns = (
        _safe(
            lambda: supabase.table("mock_subject_breakdowns")
            .select("*")
            .eq("mock_test_id", mock_id)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    corrections = (
        _safe(
            lambda: supabase.table("mock_correction_tasks")
            .select("id, category, status, created_at")
            .eq("mock_test_id", mock_id)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    verif = (
        _safe(
            lambda: supabase.table("mock_score_verification")
            .select("*")
            .eq("mock_test_id", mock_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    return {
        "mock": mock,
        "subject_breakdowns": breakdowns,
        "correction_tasks": corrections,
        "verification": verif[0] if verif else None,
    }


class SetVerificationTierPayload(BaseModel):
    tier: str = Field(..., min_length=4, max_length=20)
    evidence_url: str | None = None


@router.post("/mocks/{mock_id}/set-verification-tier")
def mocks_set_tier(
    mock_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Set the verification tier on one mock, attributed to admin.

    Spec §12 answered default: this does NOT trigger a live leaderboard
    rewrite. The change lands in ``mock_score_verification`` and the
    next scheduled recompute picks it up. We refuse invalid tiers
    explicitly so an operator can't accidentally insert a string the
    leaderboard joiner doesn't understand.
    """
    payload = SetVerificationTierPayload.model_validate(body.payload or {})
    if payload.tier not in VALID_VERIFICATION_TIERS:
        raise HTTPException(status_code=422, detail=f"Invalid tier {payload.tier!r}; must be one of {VALID_VERIFICATION_TIERS}")
    supabase = get_supabase_admin()
    mock_rows = (
        _safe(
            lambda: supabase.table("mock_tests")
            .select("id, user_id")
            .eq("id", mock_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not mock_rows:
        raise HTTPException(status_code=404, detail="Mock not found")
    user_id = mock_rows[0].get("user_id")
    existing = (
        _safe(
            lambda: supabase.table("mock_score_verification")
            .select("verification_tier, verification_status")
            .eq("mock_test_id", mock_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    previous_tier = existing[0].get("verification_tier") if existing else None
    status = "verified" if payload.tier in ("tier_1", "tier_1_5") else "pending" if payload.evidence_url else "unverified"
    upsert_row = {
        "mock_test_id": mock_id,
        "user_id": user_id,
        "verification_tier": payload.tier,
        "verification_status": status,
        "attester_role": "admin",
        "attested_by": admin.get("id"),
        "evidence_url": payload.evidence_url,
    }
    _safe(
        lambda: supabase.table("mock_score_verification")
        .upsert(upsert_row, on_conflict="mock_test_id,user_id")
        .execute()
    )
    audit_id = _audit(
        supabase,
        admin,
        "study_os.mocks.set_verification_tier",
        entity_type="mock_test",
        entity_id=mock_id,
        new_value={
            "reason": body.reason,
            "user_id": user_id,
            "previous_tier": previous_tier,
            "new_tier": payload.tier,
            "verification_status": status,
        },
    )
    return {
        "ok": True,
        "audit_id": audit_id,
        "mock_id": mock_id,
        "verification_tier": payload.tier,
        "verification_status": status,
        "note": "Leaderboard reflects this on the next scheduled recompute.",
    }


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 — Report Job Admin
# ════════════════════════════════════════════════════════════════════════
#
# ``report_exports`` statuses used in this codebase: pending,
# generating, ready, failed. The reports.py router queues PDFs as
# pending (a worker generates them) and runs CSV/JSON inline. Retry
# flips failed → pending so the worker (or the next inline request)
# picks it up; cancel flips an in-flight job to failed with a
# cancelled marker.


VALID_REPORT_STATUSES = ("pending", "generating", "ready", "failed")
_RETRY_FROM_STATUSES = frozenset({"failed"})
_CANCEL_FROM_STATUSES = frozenset({"pending", "generating"})


@router.get("/reports/queue")
def reports_queue(
    status: str | None = Query(default=None, description="pending|generating|ready|failed"),
    user_id: str | None = Query(default=None),
    expired: bool | None = Query(default=None, description="true to filter to expired rows"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List report-export rows newest-first.

    Mirrors what the aspirant ``GET /reports`` returns but unscoped:
    admin sees every user's rows so the queue/failure dashboard is
    useful. Counts per status are returned so the UI can badge the
    failed pile without paginating.
    """
    supabase = get_supabase_admin()
    q = (
        supabase.table("report_exports")
        .select(
            "id, user_id, report_type, format, status, file_url, file_size_bytes, error_message, requested_at, started_at, completed_at, expires_at, created_at, updated_at",
            count="exact",
        )
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if user_id:
        q = q.eq("user_id", user_id)
    if expired is True:
        q = q.lte("expires_at", _now_iso())
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None

    counts: dict[str, int] = {}
    for st in VALID_REPORT_STATUSES:
        cq = supabase.table("report_exports").select("id", count="exact").eq("status", st)
        if user_id:
            cq = cq.eq("user_id", user_id)
        try:
            counts[st] = int(cq.execute().count or 0)
        except Exception:  # noqa: BLE001
            counts[st] = 0
    return {"items": items, "total": total, "limit": limit, "offset": offset, "counts": counts}


@router.get("/reports/{report_id}")
def reports_detail(
    report_id: str,
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """One report export row, including ``error_message`` and ``params``.

    The download URL / inline content is NOT returned here — pulling
    report content is an aspirant action, not a support read.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("report_exports")
            .select(
                "id, user_id, report_type, format, status, params, error_message, file_size_bytes, requested_at, started_at, completed_at, expires_at, created_at, updated_at"
            )
            .eq("id", report_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found")
    return rows[0]


@router.post("/reports/{report_id}/retry")
def reports_retry(
    report_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Reset one failed report row back to ``pending`` so the worker
    (PDF) or the next request (CSV/JSON) re-picks it up.

    Refuses non-failed rows: retrying a pending or in-flight job would
    double-generate and double-charge the worker. The admin must wait
    or cancel before re-queueing.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("report_exports")
            .select("id, status, error_message, user_id")
            .eq("id", report_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found")
    row = rows[0]
    if (row.get("status") or "").lower() not in _RETRY_FROM_STATUSES:
        raise HTTPException(
            status_code=409,
            detail={"message": f"Report status is {row.get('status')!r}; only failed rows can be retried.", "current_status": row.get("status")},
        )
    supabase.table("report_exports").update(
        {
            "status": "pending",
            "error_message": None,
            "started_at": None,
            "completed_at": None,
            "updated_at": _now_iso(),
        }
    ).eq("id", report_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.reports.retry",
        entity_type="report_export",
        entity_id=report_id,
        new_value={
            "reason": body.reason,
            "user_id": row.get("user_id"),
            "previous_error": row.get("error_message"),
        },
    )
    return {"ok": True, "audit_id": audit_id, "report_id": report_id, "status": "pending"}


@router.post("/reports/{report_id}/cancel")
def reports_cancel(
    report_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Cancel a stuck pending/generating report.

    Lands the row in ``failed`` with an ``error_message`` prefixed
    ``[admin:<email>] cancelled: <reason>`` so retries are still
    possible if the operator changes their mind.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("report_exports")
            .select("id, status, user_id")
            .eq("id", report_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Report not found")
    row = rows[0]
    cur = (row.get("status") or "").lower()
    if cur not in _CANCEL_FROM_STATUSES:
        raise HTTPException(
            status_code=409,
            detail={"message": f"Report status is {row.get('status')!r}; only pending/generating rows can be cancelled.", "current_status": row.get("status")},
        )
    actor = admin.get("email") or admin.get("id") or "admin"
    error_message = f"[admin:{actor}] cancelled: {body.reason}"
    supabase.table("report_exports").update(
        {
            "status": "failed",
            "error_message": error_message,
            "completed_at": _now_iso(),
            "updated_at": _now_iso(),
        }
    ).eq("id", report_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.reports.cancel",
        entity_type="report_export",
        entity_id=report_id,
        new_value={
            "reason": body.reason,
            "user_id": row.get("user_id"),
            "previous_status": row.get("status"),
        },
    )
    return {"ok": True, "audit_id": audit_id, "report_id": report_id, "status": "failed"}


# ════════════════════════════════════════════════════════════════════════
#  Phase 2 follow-up — single-operator audited open-content
# ════════════════════════════════════════════════════════════════════════
#
# Each open returns the full content for one artifact and writes a row to
# ``support_content_access`` so privacy reviews can see who read what.
# These are gated to ``study_os.ops`` per the spec's answered default;
# any role below ``study_ops`` would need the deferred 4-eyes flow.
# Returning content is the WHOLE point of these endpoints, so the
# response intentionally includes the substantive columns — but every
# call leaves a permanent log row.


def _log_content_access(
    supabase,
    actor: dict,
    user_id: str,
    artifact_kind: str,
    artifact_id: str,
    fields_returned: list[str],
    reason: str,
) -> str | None:
    """Write one ``support_content_access`` row.

    Returns the inserted row id so the response can echo it. Failures
    are logged but not raised — same posture as ``_audit`` above.
    """
    try:
        rows = (
            supabase.table("support_content_access")
            .insert(
                {
                    "actor_id": actor.get("id"),
                    "actor_email": actor.get("email"),
                    "user_id": user_id,
                    "artifact_kind": artifact_kind,
                    "artifact_id": artifact_id,
                    "fields_returned": fields_returned,
                    "reason": reason,
                }
            )
            .execute()
            .data
            or []
        )
        return rows[0].get("id") if rows else None
    except Exception:  # noqa: BLE001
        logger.exception("support_content_access insert failed")
        return None


@router.post("/users/{user_id}/artifacts/notes/{note_id}/open")
def artifacts_notes_open(
    user_id: str,
    note_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Return one note's substantive content fields. Logged to
    ``support_content_access`` with the actor, target user, fields
    returned, and reason."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("personal_notes")
            .select("id, user_id, title, body, tags, exam_slug, source_url, is_pinned, is_archived, created_at, updated_at")
            .eq("id", note_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Note not found")
    note = rows[0]
    if note.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Note does not belong to this user")
    fields = ["body", "source_url"]
    access_id = _log_content_access(supabase, admin, user_id, "note", note_id, fields, body.reason)
    audit_id = _audit(
        supabase,
        admin,
        "study_os.artifacts.notes.open",
        entity_type="personal_note",
        entity_id=note_id,
        new_value={"reason": body.reason, "user_id": user_id, "access_log_id": access_id},
    )
    return {
        "ok": True,
        "audit_id": audit_id,
        "access_log_id": access_id,
        "note": note,
        "fields_returned": fields,
    }


@router.post("/users/{user_id}/artifacts/flashcards/{card_id}/open")
def artifacts_flashcards_open(
    user_id: str,
    card_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Return one flashcard's front/back/hint content."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("flashcards")
            .select("id, user_id, deck_id, front, back, hint, ease, interval_days, repetitions, lapses, due_at, is_suspended, created_at, updated_at")
            .eq("id", card_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Card not found")
    card = rows[0]
    if card.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Card does not belong to this user")
    fields = ["front", "back", "hint"]
    access_id = _log_content_access(supabase, admin, user_id, "flashcard", card_id, fields, body.reason)
    audit_id = _audit(
        supabase,
        admin,
        "study_os.artifacts.flashcards.open",
        entity_type="flashcard",
        entity_id=card_id,
        new_value={"reason": body.reason, "user_id": user_id, "access_log_id": access_id},
    )
    return {
        "ok": True,
        "audit_id": audit_id,
        "access_log_id": access_id,
        "card": card,
        "fields_returned": fields,
    }


@router.post("/users/{user_id}/artifacts/mistakes/{mistake_id}/open")
def artifacts_mistakes_open(
    user_id: str,
    mistake_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Return one mistake-book entry's substantive content fields."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("mistake_entries")
            .select("id, user_id, question_text, correct_answer, my_answer, reason, root_cause, difficulty, exam_slug, subject_id, topic_id, tags, status, review_count, next_review_at, created_at, updated_at")
            .eq("id", mistake_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Mistake not found")
    mistake = rows[0]
    if mistake.get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="Mistake does not belong to this user")
    fields = ["question_text", "correct_answer", "my_answer", "reason"]
    access_id = _log_content_access(supabase, admin, user_id, "mistake", mistake_id, fields, body.reason)
    audit_id = _audit(
        supabase,
        admin,
        "study_os.artifacts.mistakes.open",
        entity_type="mistake_entry",
        entity_id=mistake_id,
        new_value={"reason": body.reason, "user_id": user_id, "access_log_id": access_id},
    )
    return {
        "ok": True,
        "audit_id": audit_id,
        "access_log_id": access_id,
        "mistake": mistake,
        "fields_returned": fields,
    }


# ════════════════════════════════════════════════════════════════════════
#  Phase 3 — Social admin (groups, partners, sessions, trust,
#  leaderboard, mentor feedback)
# ════════════════════════════════════════════════════════════════════════


# ─── Groups ───────────────────────────────────────────────────────────────


@router.get("/social/groups")
def social_groups_list(
    status: str | None = Query(default=None, description="active|archived"),
    group_type: str | None = Query(default=None),
    created_by: str | None = Query(default=None, description="owner user id"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List groups with optional filters. Default order is most-recently
    updated first so an operator looking for a "just broke" group lands
    on it without paginating."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("study_groups")
        .select(
            "id, name, group_type, exam_id, exam_cycle_id, exam_phase_id, max_members, visibility, created_by, status, created_at, updated_at",
            count="exact",
        )
        .order("updated_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if group_type:
        q = q.eq("group_type", group_type)
    if created_by:
        q = q.eq("created_by", created_by)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/social/groups/{group_id}/members")
def social_group_members(
    group_id: str,
    status: str | None = Query(default=None, description="active|left|removed"),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List members of one group with role + status."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("study_group_members")
        .select("id, group_id, user_id, role, status, joined_at")
        .eq("group_id", group_id)
        .order("joined_at", desc=False)
    )
    if status:
        q = q.eq("status", status)
    items = _safe(lambda: q.execute().data, default=[]) or []
    return {"group_id": group_id, "items": items, "total": len(items)}


@router.post("/social/groups/{group_id}/archive")
def social_group_archive(
    group_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Archive a group (sets status='archived'). Refuses already-archived
    groups so the audit row isn't a no-op."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("study_groups")
            .select("id, status, created_by, name")
            .eq("id", group_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Group not found")
    g = rows[0]
    if (g.get("status") or "").lower() == "archived":
        raise HTTPException(status_code=409, detail="Group already archived")
    supabase.table("study_groups").update(
        {"status": "archived", "updated_at": _now_iso()}
    ).eq("id", group_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.groups.archive",
        entity_type="study_group",
        entity_id=group_id,
        new_value={"reason": body.reason, "previous_status": g.get("status"), "name": g.get("name")},
    )
    return {"ok": True, "audit_id": audit_id, "group_id": group_id, "status": "archived"}


class TransferOwnershipPayload(BaseModel):
    new_owner_id: str = Field(..., min_length=4, max_length=200)


@router.post("/social/groups/{group_id}/transfer-ownership")
def social_group_transfer_ownership(
    group_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Transfer ``created_by`` and flip the new owner's role to 'owner'.

    Requires the new owner to already be an active member of the group;
    we refuse to silently add a non-member as owner. The previous
    owner's row (if any) keeps its role — admins can demote it
    separately if desired.
    """
    payload = TransferOwnershipPayload.model_validate(body.payload or {})
    supabase = get_supabase_admin()
    grows = (
        _safe(
            lambda: supabase.table("study_groups")
            .select("id, created_by, status")
            .eq("id", group_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not grows:
        raise HTTPException(status_code=404, detail="Group not found")
    group = grows[0]
    if (group.get("status") or "").lower() == "archived":
        raise HTTPException(status_code=409, detail="Cannot transfer archived group")
    members = (
        _safe(
            lambda: supabase.table("study_group_members")
            .select("id, status, role")
            .eq("group_id", group_id)
            .eq("user_id", payload.new_owner_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not members or (members[0].get("status") or "").lower() != "active":
        raise HTTPException(
            status_code=409,
            detail="New owner must be an active member of the group",
        )
    supabase.table("study_groups").update(
        {"created_by": payload.new_owner_id, "updated_at": _now_iso()}
    ).eq("id", group_id).execute()
    supabase.table("study_group_members").update({"role": "owner"}).eq("id", members[0]["id"]).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.groups.transfer_ownership",
        entity_type="study_group",
        entity_id=group_id,
        new_value={
            "reason": body.reason,
            "previous_owner": group.get("created_by"),
            "new_owner": payload.new_owner_id,
        },
    )
    return {"ok": True, "audit_id": audit_id, "group_id": group_id, "new_owner": payload.new_owner_id}


# ─── Partner pairs ───────────────────────────────────────────────────────


@router.get("/social/partner-pairs")
def social_partner_pairs_list(
    status: str | None = Query(default=None, description="active|paused|ended"),
    user_id: str | None = Query(default=None, description="any participant"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List accountability pairs with optional participant filter.

    If ``user_id`` is provided we run two filtered queries (user_a /
    user_b) and merge: there's no OR helper in the supabase client we
    use here, and a server-side function call is heavier than two
    round-trips for a 50-row admin page.
    """
    supabase = get_supabase_admin()

    def _select():
        return supabase.table("accountability_pairs").select(
            "id, user_a, user_b, pairing_goal, exam_id, status, created_at",
            count="exact",
        )

    if user_id:
        qa = _select().eq("user_a", user_id).order("created_at", desc=True)
        qb = _select().eq("user_b", user_id).order("created_at", desc=True)
        if status:
            qa = qa.eq("status", status)
            qb = qb.eq("status", status)
        rows_a = _safe(lambda: qa.range(offset, offset + limit - 1).execute(), default=None)
        rows_b = _safe(lambda: qb.range(offset, offset + limit - 1).execute(), default=None)
        items_a = (rows_a.data if rows_a else []) or []
        items_b = (rows_b.data if rows_b else []) or []
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

    q = _select().order("created_at", desc=True)
    if status:
        q = q.eq("status", status)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/social/partner-pairs/{pair_id}/dissolve")
def social_partner_pairs_dissolve(
    pair_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """End an active accountability pair (status='ended').

    Refuses already-ended pairs. Both participants are captured in the
    audit row so a downstream report ("which users had pair X
    dissolved by an admin") doesn't need to re-fetch the pair row
    after deletion."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("accountability_pairs")
            .select("id, user_a, user_b, status, pairing_goal")
            .eq("id", pair_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Pair not found")
    p = rows[0]
    if (p.get("status") or "").lower() == "ended":
        raise HTTPException(status_code=409, detail="Pair already ended")
    supabase.table("accountability_pairs").update({"status": "ended"}).eq("id", pair_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.partner_pairs.dissolve",
        entity_type="accountability_pair",
        entity_id=pair_id,
        new_value={
            "reason": body.reason,
            "user_a": p.get("user_a"),
            "user_b": p.get("user_b"),
            "previous_status": p.get("status"),
            "pairing_goal": p.get("pairing_goal"),
        },
    )
    return {"ok": True, "audit_id": audit_id, "pair_id": pair_id, "status": "ended"}


# ─── Social sessions ─────────────────────────────────────────────────────


@router.get("/social/sessions")
def social_sessions_list(
    active_only: bool = Query(default=False),
    session_type: str | None = Query(default=None, description="group|partner|mentor"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List social sessions. Active = ``ended_at IS NULL``."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("social_study_sessions")
        .select(
            "id, session_type, group_id, partner_pair_id, mentor_session_id, started_at, ended_at, planned_minutes, verified_presence_minutes, verified_focus_minutes, trust_source, trust_weight, created_at",
            count="exact",
        )
        .order("started_at", desc=True)
    )
    if active_only:
        q = q.is_("ended_at", "null")
    if session_type:
        q = q.eq("session_type", session_type)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/social/sessions/{session_id}/force-end")
def social_sessions_force_end(
    session_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Force-end a stuck social session (sets ``ended_at = now``).

    Refuses already-ended sessions. Unlike per-user focus force-close,
    we don't synthesise an attendance summary — a stuck session is
    almost always one nobody attended."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("social_study_sessions")
            .select("id, session_type, started_at, ended_at")
            .eq("id", session_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    s = rows[0]
    if s.get("ended_at"):
        raise HTTPException(status_code=409, detail="Session already ended")
    supabase.table("social_study_sessions").update({"ended_at": _now_iso()}).eq("id", session_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.sessions.force_end",
        entity_type="social_study_session",
        entity_id=session_id,
        new_value={
            "reason": body.reason,
            "session_type": s.get("session_type"),
            "started_at": s.get("started_at"),
        },
    )
    return {"ok": True, "audit_id": audit_id, "session_id": session_id, "ended_at": _now_iso()}


# ─── Trust breakdown ─────────────────────────────────────────────────────


@router.get("/social/trust/{user_id}/breakdown")
def social_trust_breakdown(
    user_id: str,
    days: int = Query(default=7, ge=1, le=90),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Return per-day source breakdown for one user.

    Reads ``study_behavior_source_breakdown`` directly — the source +
    trust_weight + adjusted_minutes shape is exactly what the
    Phase 3 UI renders, and avoids a round-trip through the per-day
    snapshot service for a read."""
    supabase = get_supabase_admin()
    from datetime import date, timedelta
    since = (date.today() - timedelta(days=days)).isoformat()
    rows = (
        _safe(
            lambda: supabase.table("study_behavior_source_breakdown")
            .select("snapshot_date, source, raw_minutes, trust_weight, trust_adjusted_minutes")
            .eq("user_id", user_id)
            .gte("snapshot_date", since)
            .order("snapshot_date", desc=True)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    summary: dict[str, dict[str, Any]] = {}
    for r in rows:
        s = r.get("source") or "unknown"
        agg = summary.setdefault(s, {"raw_minutes": 0.0, "trust_adjusted_minutes": 0.0, "days": 0})
        agg["raw_minutes"] += float(r.get("raw_minutes") or 0)
        agg["trust_adjusted_minutes"] += float(r.get("trust_adjusted_minutes") or 0)
        agg["days"] += 1
    return {
        "user_id": user_id,
        "since": since,
        "days_window": days,
        "rows": rows,
        "by_source": summary,
    }


@router.post("/social/trust/{user_id}/recompute")
def social_trust_recompute(
    user_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Rebuild the user's source breakdown for today from raw sessions.

    Uses ``aggregate_breakdown_from_sessions`` to derive the
    per-source minutes dict, then upserts it via
    ``upsert_source_breakdown``. The parent daily snapshot row's
    totals are updated as a side effect of that upsert.
    """
    from app.study_os.trust_weights import (
        aggregate_breakdown_from_sessions,
        upsert_source_breakdown,
    )
    from datetime import date

    supabase = get_supabase_admin()
    today = date.today()
    sources = aggregate_breakdown_from_sessions(supabase, user_id, today)
    upsert_source_breakdown(supabase, user_id, today, sources)
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.trust.recompute",
        entity_type="study_behavior_source_breakdown",
        entity_id=user_id,
        new_value={"reason": body.reason, "snapshot_date": today.isoformat(), "sources": sources},
    )
    return {
        "ok": True,
        "audit_id": audit_id,
        "user_id": user_id,
        "snapshot_date": today.isoformat(),
        "sources": sources,
    }


# ─── Leaderboard ─────────────────────────────────────────────────────────


@router.get("/social/leaderboard")
def social_leaderboard_list(
    board_type: str | None = Query(default=None),
    hidden_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List leaderboard entries newest-first. Admin sees hidden entries
    by default (the public read path filters them out); ``hidden_only``
    restricts to admin-hidden rows for an abuse-audit view."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("study_leaderboard_entries")
        .select(
            "id, board_type, subject_type, cohort_key, metric_key, user_id, group_id, pair_id, score, percentile, rank, rank_band, trust_tier, period_start, period_end, is_hidden, hidden_reason, hidden_by, hidden_at, created_at",
            count="exact",
        )
        .order("created_at", desc=True)
    )
    if board_type:
        q = q.eq("board_type", board_type)
    if hidden_only:
        q = q.eq("is_hidden", True)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/social/leaderboard/{entry_id}/hide")
def social_leaderboard_hide(
    entry_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Flip ``is_hidden=true`` on one leaderboard entry."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("study_leaderboard_entries")
            .select("id, is_hidden, board_type, user_id")
            .eq("id", entry_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Leaderboard entry not found")
    if rows[0].get("is_hidden"):
        raise HTTPException(status_code=409, detail="Entry already hidden")
    supabase.table("study_leaderboard_entries").update(
        {
            "is_hidden": True,
            "hidden_reason": body.reason,
            "hidden_by": admin.get("id"),
            "hidden_at": _now_iso(),
        }
    ).eq("id", entry_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.leaderboard.hide",
        entity_type="study_leaderboard_entry",
        entity_id=entry_id,
        new_value={"reason": body.reason, "board_type": rows[0].get("board_type"), "user_id": rows[0].get("user_id")},
    )
    return {"ok": True, "audit_id": audit_id, "entry_id": entry_id, "is_hidden": True}


@router.post("/social/leaderboard/{entry_id}/restore")
def social_leaderboard_restore(
    entry_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Flip ``is_hidden=false`` on one previously hidden entry."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("study_leaderboard_entries")
            .select("id, is_hidden, hidden_reason")
            .eq("id", entry_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Leaderboard entry not found")
    if not rows[0].get("is_hidden"):
        raise HTTPException(status_code=409, detail="Entry is not hidden")
    supabase.table("study_leaderboard_entries").update(
        {"is_hidden": False, "hidden_reason": None, "hidden_by": None, "hidden_at": None}
    ).eq("id", entry_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.leaderboard.restore",
        entity_type="study_leaderboard_entry",
        entity_id=entry_id,
        new_value={"reason": body.reason, "previous_hidden_reason": rows[0].get("hidden_reason")},
    )
    return {"ok": True, "audit_id": audit_id, "entry_id": entry_id, "is_hidden": False}


# ─── Mentor feedback ─────────────────────────────────────────────────────


@router.get("/social/mentor-feedback")
def social_mentor_feedback_list(
    mentor_id: str | None = Query(default=None),
    mentee_id: str | None = Query(default=None),
    hidden_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_SUPPORT)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List mentor feedback rows newest-first. Admin sees hidden rows
    by default; ``hidden_only`` filters to the abuse-audit view."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("mentor_session_feedback")
        .select(
            "id, session_id, mentor_id, mentee_id, discipline_rating, preparation_rating, follow_through_rating, is_hidden, hidden_reason, hidden_by, hidden_at, created_at",
            count="exact",
        )
        .order("created_at", desc=True)
    )
    if mentor_id:
        q = q.eq("mentor_id", mentor_id)
    if mentee_id:
        q = q.eq("mentee_id", mentee_id)
    if hidden_only:
        q = q.eq("is_hidden", True)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/social/mentor-feedback/{feedback_id}/hide")
def social_mentor_feedback_hide(
    feedback_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Flip ``is_hidden=true`` on one mentor-feedback row."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("mentor_session_feedback")
            .select("id, is_hidden, mentor_id, mentee_id")
            .eq("id", feedback_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Feedback row not found")
    if rows[0].get("is_hidden"):
        raise HTTPException(status_code=409, detail="Feedback already hidden")
    supabase.table("mentor_session_feedback").update(
        {
            "is_hidden": True,
            "hidden_reason": body.reason,
            "hidden_by": admin.get("id"),
            "hidden_at": _now_iso(),
        }
    ).eq("id", feedback_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.mentor_feedback.hide",
        entity_type="mentor_session_feedback",
        entity_id=feedback_id,
        new_value={"reason": body.reason, "mentor_id": rows[0].get("mentor_id"), "mentee_id": rows[0].get("mentee_id")},
    )
    return {"ok": True, "audit_id": audit_id, "feedback_id": feedback_id, "is_hidden": True}


@router.post("/social/mentor-feedback/{feedback_id}/restore")
def social_mentor_feedback_restore(
    feedback_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Flip ``is_hidden=false`` on one previously hidden row."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("mentor_session_feedback")
            .select("id, is_hidden, hidden_reason")
            .eq("id", feedback_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Feedback row not found")
    if not rows[0].get("is_hidden"):
        raise HTTPException(status_code=409, detail="Feedback is not hidden")
    supabase.table("mentor_session_feedback").update(
        {"is_hidden": False, "hidden_reason": None, "hidden_by": None, "hidden_at": None}
    ).eq("id", feedback_id).execute()
    audit_id = _audit(
        supabase,
        admin,
        "study_os.social.mentor_feedback.restore",
        entity_type="mentor_session_feedback",
        entity_id=feedback_id,
        new_value={"reason": body.reason, "previous_hidden_reason": rows[0].get("hidden_reason")},
    )
    return {"ok": True, "audit_id": audit_id, "feedback_id": feedback_id, "is_hidden": False}


# ════════════════════════════════════════════════════════════════════════
#  Follow-up: 4-eyes open-content for ``study_os.viewer`` role
# ════════════════════════════════════════════════════════════════════════
#
# The original Phase 2 open-content endpoints accept a single operator
# with ``study_os.ops`` and immediately return content. Privacy policy
# at any role below that requires a second operator to approve before
# content is released. We implement that as a request/approve/redeem
# flow backed by ``content_access_requests``:
#
#   1. ``study_os.viewer`` POSTs /content-access/requests with a reason.
#   2. ``study_os.ops`` POSTs /content-access/requests/{id}/approve OR
#      /deny. The DB trigger refuses approval by the same operator.
#   3. The original requester POSTs /content-access/requests/{id}/open
#      to redeem the approved token. Content is returned exactly once;
#      the row flips to ``consumed``.
#
# Expired pending or approved rows are denied at redeem time. The
# 24-hour expiry is set by the migration so a stale approval can't be
# redeemed weeks later.


_VALID_ARTIFACT_KINDS = ("note", "flashcard", "mistake")
_ARTIFACT_TABLE_MAP = {
    "note": ("personal_notes", ["body", "source_url"]),
    "flashcard": ("flashcards", ["front", "back", "hint"]),
    "mistake": ("mistake_entries", ["question_text", "correct_answer", "my_answer", "reason"]),
}


class ContentAccessRequestBody(BaseModel):
    """Body for ``POST /content-access/requests``.

    The viewer specifies the target user, artifact, and the reason they
    need content access. The reason is captured at request time so the
    approver can decide based on the stated justification.
    """

    user_id: str = Field(..., min_length=4, max_length=200)
    artifact_kind: str = Field(..., min_length=4, max_length=20)
    artifact_id: str = Field(..., min_length=4, max_length=200)
    reason: str = Field(..., min_length=8, max_length=500)


@router.post("/content-access/requests")
def content_access_request_create(
    body: ContentAccessRequestBody,
    requester: dict = Depends(require_permission(PERM_VIEWER)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Create a pending content-access request. Caller must hold
    ``study_os.viewer``; an operator with ``study_os.ops`` will approve."""
    if body.artifact_kind not in _VALID_ARTIFACT_KINDS:
        raise HTTPException(status_code=422, detail=f"artifact_kind must be one of {_VALID_ARTIFACT_KINDS}")
    supabase = get_supabase_admin()
    # Validate the artifact exists and belongs to the named user.
    table, _ = _ARTIFACT_TABLE_MAP[body.artifact_kind]
    rows = (
        _safe(
            lambda: supabase.table(table).select("id, user_id").eq("id", body.artifact_id).limit(1).execute().data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"{body.artifact_kind} not found")
    if rows[0].get("user_id") != body.user_id:
        raise HTTPException(status_code=409, detail=f"{body.artifact_kind} does not belong to this user")
    inserted = (
        _safe(
            lambda: supabase.table("content_access_requests").insert({
                "requested_by": requester.get("id"),
                "requested_by_email": requester.get("email"),
                "user_id": body.user_id,
                "artifact_kind": body.artifact_kind,
                "artifact_id": body.artifact_id,
                "request_reason": body.reason,
                "status": "pending",  # the DB default would set this too; explicit so response shape is stable
            }).execute().data,
            default=[],
        )
        or []
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to create access request")
    row = inserted[0]
    audit_id = _audit(
        supabase, requester, "study_os.content_access.request",
        entity_type="content_access_request", entity_id=row.get("id"),
        new_value={"reason": body.reason, "user_id": body.user_id, "artifact_kind": body.artifact_kind},
    )
    return {"ok": True, "audit_id": audit_id, "request": row}


@router.get("/content-access/requests")
def content_access_request_list(
    status: str | None = Query(default=None, description="pending|approved|consumed|denied|expired"),
    user_id: str | None = Query(default=None),
    requested_by: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_VIEWER)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """List content-access requests. Anyone with viewer or higher can
    read the queue — but only approvers see who else is approving."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("content_access_requests")
        .select(
            "id, requested_by, requested_by_email, user_id, artifact_kind, artifact_id, request_reason, status, approved_by, approved_by_email, approve_reason, approved_at, consumed_at, expires_at, created_at",
            count="exact",
        )
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)
    if user_id:
        q = q.eq("user_id", user_id)
    if requested_by:
        q = q.eq("requested_by", requested_by)
    res = _safe(lambda: q.range(offset, offset + limit - 1).execute(), default=None)
    items = (res.data if res else []) or []
    total = getattr(res, "count", None) if res else None
    return {"items": items, "total": total, "limit": limit, "offset": offset}


class ApproveBody(BaseModel):
    reason: str = Field(..., min_length=8, max_length=500)


@router.post("/content-access/requests/{request_id}/approve")
def content_access_request_approve(
    request_id: str,
    body: ApproveBody,
    approver: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Approve a pending request. The 4-eyes invariant — approver must
    differ from requester — is enforced by both this handler and a DB
    trigger. The trigger is the source of truth; the handler returns a
    friendlier 409 if the approver is the same operator.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("content_access_requests")
            .select("id, requested_by, status, expires_at")
            .eq("id", request_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    req = rows[0]
    if (req.get("status") or "").lower() != "pending":
        raise HTTPException(status_code=409, detail=f"Request is {req.get('status')!r}; only pending requests can be approved")
    if req.get("requested_by") == approver.get("id"):
        raise HTTPException(status_code=409, detail="4-eyes: approver must differ from requester")
    if _is_expired(req.get("expires_at")):
        # Mark expired so the queue stays clean.
        _safe(lambda: supabase.table("content_access_requests").update({"status": "expired"}).eq("id", request_id).execute())
        raise HTTPException(status_code=409, detail="Request expired")
    supabase.table("content_access_requests").update({
        "status": "approved",
        "approved_by": approver.get("id"),
        "approved_by_email": approver.get("email"),
        "approve_reason": body.reason,
        "approved_at": _now_iso(),
    }).eq("id", request_id).execute()
    audit_id = _audit(
        supabase, approver, "study_os.content_access.approve",
        entity_type="content_access_request", entity_id=request_id,
        new_value={"reason": body.reason, "requested_by": req.get("requested_by")},
    )
    return {"ok": True, "audit_id": audit_id, "request_id": request_id, "status": "approved"}


@router.post("/content-access/requests/{request_id}/deny")
def content_access_request_deny(
    request_id: str,
    body: ApproveBody,
    approver: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Deny a pending request. Same 4-eyes constraint applies."""
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("content_access_requests")
            .select("id, requested_by, status")
            .eq("id", request_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    req = rows[0]
    if (req.get("status") or "").lower() != "pending":
        raise HTTPException(status_code=409, detail=f"Request is {req.get('status')!r}; only pending requests can be denied")
    if req.get("requested_by") == approver.get("id"):
        raise HTTPException(status_code=409, detail="4-eyes: denier must differ from requester")
    supabase.table("content_access_requests").update({
        "status": "denied",
        "approved_by": approver.get("id"),
        "approved_by_email": approver.get("email"),
        "approve_reason": body.reason,
        "approved_at": _now_iso(),
    }).eq("id", request_id).execute()
    audit_id = _audit(
        supabase, approver, "study_os.content_access.deny",
        entity_type="content_access_request", entity_id=request_id,
        new_value={"reason": body.reason, "requested_by": req.get("requested_by")},
    )
    return {"ok": True, "audit_id": audit_id, "request_id": request_id, "status": "denied"}


def _is_expired(iso: str | None) -> bool:
    if not iso:
        return False
    try:
        ts = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > ts
    except Exception:  # noqa: BLE001
        return False


@router.post("/content-access/requests/{request_id}/open")
def content_access_request_open(
    request_id: str,
    requester: dict = Depends(require_permission(PERM_VIEWER)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Redeem an approved request and return the artifact content.

    Only the original requester can redeem. Token is one-shot: status
    flips to ``consumed`` so a re-open requires a new request.
    """
    supabase = get_supabase_admin()
    rows = (
        _safe(
            lambda: supabase.table("content_access_requests")
            .select("id, requested_by, user_id, artifact_kind, artifact_id, status, expires_at, request_reason, approved_by_email")
            .eq("id", request_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        )
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    req = rows[0]
    if req.get("requested_by") != requester.get("id"):
        raise HTTPException(status_code=403, detail="Only the original requester can redeem")
    if (req.get("status") or "").lower() != "approved":
        raise HTTPException(status_code=409, detail=f"Request is {req.get('status')!r}; only approved requests can be opened")
    if _is_expired(req.get("expires_at")):
        _safe(lambda: supabase.table("content_access_requests").update({"status": "expired"}).eq("id", request_id).execute())
        raise HTTPException(status_code=409, detail="Approval expired")

    kind = req["artifact_kind"]
    table, fields = _ARTIFACT_TABLE_MAP[kind]
    # Fetch full row including content columns.
    art_rows = (
        _safe(
            lambda: supabase.table(table).select("*").eq("id", req["artifact_id"]).limit(1).execute().data,
            default=[],
        )
        or []
    )
    if not art_rows:
        raise HTTPException(status_code=404, detail=f"{kind} no longer exists")
    artifact = art_rows[0]
    if artifact.get("user_id") != req["user_id"]:
        # Ownership changed since the request was created.
        raise HTTPException(status_code=409, detail=f"{kind} no longer belongs to the requested user")

    # Mark consumed BEFORE returning so a race can't double-redeem.
    supabase.table("content_access_requests").update({
        "status": "consumed",
        "consumed_at": _now_iso(),
    }).eq("id", request_id).execute()

    # Mirror to support_content_access for the privacy-review trail.
    access_id = _log_content_access(
        supabase, requester, req["user_id"], kind, req["artifact_id"], fields,
        f"4-eyes redeem: {req.get('request_reason')!r} (approved by {req.get('approved_by_email')})",
    )
    audit_id = _audit(
        supabase, requester, "study_os.content_access.consume",
        entity_type="content_access_request", entity_id=request_id,
        new_value={"access_log_id": access_id, "artifact_kind": kind},
    )
    return {
        "ok": True,
        "audit_id": audit_id,
        "access_log_id": access_id,
        "request_id": request_id,
        "artifact_kind": kind,
        "artifact": artifact,
        "fields_returned": fields,
    }


# ════════════════════════════════════════════════════════════════════════
#  Follow-up: Mock subject-breakdown recompute admin endpoint
# ════════════════════════════════════════════════════════════════════════


@router.post("/mocks/{mock_id}/recompute-breakdowns")
def mocks_recompute_breakdowns(
    mock_id: str,
    body: StudyOpsWriteBody,
    admin: dict = Depends(require_permission(PERM_OPS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Recompute ``mock_subject_breakdowns`` for one mock by aggregating
    ``mock_topic_breakdowns`` data. Records the run in
    ``mock_breakdown_recompute_runs`` so an audit shows who triggered
    each rebuild and what changed."""
    from app.study_os.mocks import recompute_subject_breakdowns

    supabase = get_supabase_admin()
    mock_rows = (
        _safe(
            lambda: supabase.table("mock_tests").select("id, user_id").eq("id", mock_id).limit(1).execute().data,
            default=[],
        )
        or []
    )
    if not mock_rows:
        raise HTTPException(status_code=404, detail="Mock not found")

    result = recompute_subject_breakdowns(supabase, mock_id)
    outcome = result.get("outcome", "error")
    run_row = {
        "mock_test_id": mock_id,
        "actor_id": admin.get("id"),
        "actor_email": admin.get("email"),
        "trigger": "admin",
        "reason": body.reason,
        "breakdowns_before": result.get("breakdowns_before"),
        "breakdowns_after": result.get("breakdowns_after"),
        "outcome": outcome,
        "error_message": result.get("error") if outcome == "error" else None,
    }
    _safe(lambda: supabase.table("mock_breakdown_recompute_runs").insert(run_row).execute())
    audit_id = _audit(
        supabase, admin, "study_os.mocks.recompute_breakdowns",
        entity_type="mock_test", entity_id=mock_id,
        new_value={
            "reason": body.reason,
            "outcome": outcome,
            "before": result.get("breakdowns_before"),
            "after": result.get("breakdowns_after"),
        },
    )
    return {"ok": outcome != "error", "audit_id": audit_id, "mock_id": mock_id, "result": result}
