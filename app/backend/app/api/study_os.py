"""Study OS Mission Control API (PR3).

Adds GET /api/study/mission-control on top of the existing
``/api/study/*`` surface owned by ``app.api.canonical.router_study``.
Kept as a separate router so PR3 doesn't touch the canonical file.
"""
from __future__ import annotations

import logging
import os
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.study_os.mission_control import (
    build_mission_control,
    build_mission_control_async,
    build_task_reasoning_response,
)
from app.study_os.plan_preferences import get_plan_preferences, upsert_plan_preferences
from app.study_os.planner import apply_plan, compute_draft_plan, generate_plan
from app.study_os import mocks as mocks_service
from app.study_os import plan_by_subject as plan_by_subject_service
from app.study_os import plan_timeline as plan_timeline_service
from app.study_os import subjects as subjects_service
from app.study_os import weekly_review as weekly_review_service
from app.study_os import report_cards as report_cards_service

logger = logging.getLogger("career_copilot.api.study_os")

router = APIRouter(prefix="/study", tags=["study"])


def _require_canonical_exam_flag() -> bool:
    raw = os.getenv("STUDY_OS_REQUIRE_CANONICAL_EXAM")
    if raw is None:
        env = (os.getenv("ENV") or os.getenv("APP_ENV") or os.getenv("PYTHON_ENV") or "").lower()
        return env in {"dev", "development", "local", "test"}
    return str(raw).lower() in {"1", "true", "yes", "on"}


_TARGET_EXAM_REQUIRED_DETAIL = {
    "code": "TARGET_EXAM_REQUIRED",
    "message": "Choose the exam you are preparing for.",
}


def _require_canonical_target(supabase: Any, user_id: str) -> str | None:
    """Enforce the canonical-exam flag uniformly across plan endpoints.

    Returns the stored ``profiles.target_exam`` value when the flag is on,
    or ``None`` when the flag is off (callers should not branch on the
    return value beyond passing it through). Raises a 400 with a stable
    structured detail when the flag is on but no target is set.
    """
    if not _require_canonical_exam_flag():
        return None
    target = (
        supabase.table("profiles")
        .select("target_exam")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    value = target[0].get("target_exam") if target else None
    if not value:
        raise HTTPException(status_code=400, detail=_TARGET_EXAM_REQUIRED_DETAIL)
    return value


class SetTargetExamBody(BaseModel):
    exam_id: UUID


@router.get("/exams")
async def list_study_exams(
    planner_ready: bool | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    del user
    supabase = get_supabase_admin()
    rows = (
        supabase.table("exams")
        .select("id,slug,name,exam_type,exam_family_id,default_difficulty_level,is_active")
        .eq("is_active", True)
        .order("name")
        .limit(500)
        .execute()
        .data
        or []
    )
    if not rows:
        logger.warning("study/exams: public.exams has zero active rows")
    out = []
    for r in rows:
        cov = (
            supabase.table("exam_topic_coverage")
            .select("id", count="exact")
            .eq("exam_id", r["id"])
            .eq("reviewer_status", "locked")
            .limit(1)
            .execute()
        )
        locked_count = int(getattr(cov, "count", 0) or 0)
        cycle = (
            supabase.table("exam_cycles")
            .select("id,year,cycle_name,exam_start")
            .eq("exam_id", r["id"])
            .gte("exam_start", __import__("datetime").datetime.utcnow().date().isoformat())
            .order("exam_start")
            .limit(1)
            .execute()
            .data
            or []
        )
        ready = bool(r.get("is_active")) and locked_count > 0
        row = {
            **r,
            "locked_coverage_count": locked_count,
            "next_cycle": cycle[0] if cycle else None,
            "planner_ready": ready,
        }
        if planner_ready is None or row["planner_ready"] == planner_ready:
            out.append(row)
    return {"items": out}


@router.get("/target-exam")
async def get_target_exam(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Return the user's current target exam, or ``{"selected_exam": None}``.

    Lets the frontend hydrate the picker on mount without re-running plan
    compute. Looks the exam up by id (UUID) so the response shape matches
    ``PUT /target-exam`` and ``GET /plan/draft.selected_exam``.
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()
    profile = (
        supabase.table("profiles")
        .select("target_exam")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    target_value = profile[0].get("target_exam") if profile else None
    if not target_value:
        return {"selected_exam": None}
    exam_rows = (
        supabase.table("exams")
        .select("id,slug,name,is_active")
        .eq("id", target_value)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exam_rows:
        return {"selected_exam": None}
    ex = exam_rows[0]
    return {
        "selected_exam": {
            "id": ex.get("id"),
            "slug": ex.get("slug"),
            "name": ex.get("name"),
            "is_active": bool(ex.get("is_active")),
        }
    }


@router.put("/target-exam")
async def set_target_exam(
    body: SetTargetExamBody,
    confirm_archive: bool = False,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user.get("id")
    exam_id = str(body.exam_id)
    supabase = get_supabase_admin()
    exam_rows = (
        supabase.table("exams").select("id,slug,name,is_active").eq("id", exam_id).eq("is_active", True).limit(1).execute().data
        or []
    )
    if not exam_rows:
        raise HTTPException(status_code=400, detail="Invalid active exam_id")
    exam = exam_rows[0]
    active = (
        supabase.table("study_plans")
        .select("id,exam_id,target_exam,end_date,status")
        .eq("user_id", user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    if active:
        p = active[0]
        prev = p.get("exam_id") or p.get("target_exam")
        if prev and str(prev) != str(exam_id):
            if not confirm_archive:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "ACTIVE_PLAN_EXISTS", "requires_confirmation": True},
                )
            from datetime import datetime, timezone
            today = datetime.now(timezone.utc).date().isoformat()
            supabase.table("study_plans").update({"status": "archived", "end_date": today}).eq("id", p["id"]).execute()
    supabase.table("profiles").update({"target_exam": exam_id}).eq("id", user_id).execute()
    pref = (
        supabase.table("aspirant_preferences").select("id,target_exams").eq("user_id", user_id).limit(1).execute().data
        or []
    )
    cur = list((pref[0].get("target_exams") if pref else []) or [])
    next_exams = [exam.get("slug")] + [x for x in cur if x != exam.get("slug")]
    supabase.table("aspirant_preferences").upsert({"user_id": user_id, "target_exams": next_exams}, on_conflict="user_id").execute()
    return {"ok": True, "selected_exam": {"id": exam["id"], "slug": exam.get("slug"), "name": exam.get("name")}}


@router.get("/tracked-exams")
async def list_tracked_exams(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Return the user's tracked exams with the current primary flagged.

    The tracked list is the slug list stored in
    ``aspirant_preferences.target_exams`` (most-recent-first). The primary
    is ``profiles.target_exam`` (UUID). Each item also reports
    ``planner_ready`` so the frontend can disable switch-to-primary when
    the exam has no locked topic coverage yet.
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()

    pref_rows = (
        supabase.table("aspirant_preferences")
        .select("target_exams")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    tracked_slugs: list[str] = list((pref_rows[0].get("target_exams") if pref_rows else []) or [])

    profile_rows = (
        supabase.table("profiles")
        .select("target_exam")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    primary_exam_id = profile_rows[0].get("target_exam") if profile_rows else None

    # Always include the primary in the response, even if it is somehow
    # missing from the slug list (covers data drift from older flows).
    exam_lookup: dict[str, dict[str, Any]] = {}
    if tracked_slugs:
        rows = (
            supabase.table("exams")
            .select("id,slug,name,is_active")
            .in_("slug", tracked_slugs)
            .execute()
            .data
            or []
        )
        for r in rows:
            slug = r.get("slug")
            if slug:
                exam_lookup[slug] = r

    primary_exam: dict[str, Any] | None = None
    if primary_exam_id:
        row = (
            supabase.table("exams")
            .select("id,slug,name,is_active")
            .eq("id", primary_exam_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if row:
            primary_exam = row[0]
            if primary_exam.get("slug") and primary_exam["slug"] not in exam_lookup:
                exam_lookup[primary_exam["slug"]] = primary_exam

    ordered_slugs: list[str] = []
    if primary_exam and primary_exam.get("slug"):
        ordered_slugs.append(primary_exam["slug"])
    for slug in tracked_slugs:
        if slug not in ordered_slugs and slug in exam_lookup:
            ordered_slugs.append(slug)

    items: list[dict[str, Any]] = []
    for slug in ordered_slugs:
        exam = exam_lookup.get(slug)
        if not exam:
            continue
        cov = (
            supabase.table("exam_topic_coverage")
            .select("id", count="exact")
            .eq("exam_id", exam["id"])
            .eq("reviewer_status", "locked")
            .limit(1)
            .execute()
        )
        locked_count = int(getattr(cov, "count", 0) or 0)
        items.append(
            {
                "id": exam.get("id"),
                "slug": exam.get("slug"),
                "name": exam.get("name"),
                "is_active": bool(exam.get("is_active")),
                "planner_ready": bool(exam.get("is_active")) and locked_count > 0,
                "is_primary": primary_exam_id is not None
                and str(exam.get("id")) == str(primary_exam_id),
            }
        )

    return {"items": items, "primary_exam_id": primary_exam_id}


@router.delete("/tracked-exams/{exam_id}")
async def remove_tracked_exam(
    exam_id: UUID,
    confirm: bool = False,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Drop one exam from the user's tracked list.

    The primary exam can only be removed when ``confirm=true`` is passed,
    because dropping it also clears ``profiles.target_exam`` and the
    StudyPlan page will fall back to the "pick an exam" empty state. The
    associated study plan is left in place (use ``PUT /target-exam`` to
    switch the primary, which already archives the old plan).
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()

    exam_rows = (
        supabase.table("exams")
        .select("id,slug")
        .eq("id", str(exam_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exam_rows:
        raise HTTPException(status_code=404, detail="exam_not_found")
    exam_slug = exam_rows[0].get("slug")

    profile_rows = (
        supabase.table("profiles")
        .select("target_exam")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    primary_exam_id = profile_rows[0].get("target_exam") if profile_rows else None
    removing_primary = primary_exam_id is not None and str(primary_exam_id) == str(exam_id)

    if removing_primary and not confirm:
        raise HTTPException(
            status_code=409,
            detail={"code": "PRIMARY_EXAM_REMOVAL_REQUIRES_CONFIRM", "requires_confirmation": True},
        )

    pref_rows = (
        supabase.table("aspirant_preferences")
        .select("target_exams")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    cur = list((pref_rows[0].get("target_exams") if pref_rows else []) or [])
    next_exams = [s for s in cur if s != exam_slug]
    supabase.table("aspirant_preferences").upsert(
        {"user_id": user_id, "target_exams": next_exams}, on_conflict="user_id"
    ).execute()

    if removing_primary:
        supabase.table("profiles").update({"target_exam": None}).eq("id", user_id).execute()

    return {"ok": True, "removed_exam_id": str(exam_id), "primary_cleared": removing_primary}


@router.get("/mission-control")
async def mission_control(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        # Async path: independent sub-loaders run via asyncio.gather +
        # to_thread so the sync supabase client's blocking calls overlap.
        return await build_mission_control_async(supabase, user_id)
    except Exception as exc:  # noqa: BLE001
        # Mission control composes many optional sources. Any unhandled
        # error must not break the Today page — return a minimal shape
        # the UI can still render.
        logger.exception("mission_control build failed for %s", user_id)
        from datetime import datetime, timezone

        return {
            "date": datetime.now(timezone.utc).date().isoformat(),
            "user_context": {
                "persona_snapshot_id": None,
                "persona_version": "v1",
                "dimensions": {},
                "scores": {},
                "safe_user_explanation": [],
            },
            "study_policy": {},
            "plan": None,
            "exam_context": {
                "exam_id": None,
                "exam_family": None,
                "exam": None,
                "cycle": None,
                "phase": None,
                "days_remaining": None,
                "verified_intelligence_status": "none",
                "high_yield_topics": [],
            },
            "competition_context": {
                "available": False,
                "exam_id": None,
                "exam_cycle_id": None,
                "exam_phase_id": None,
                "vacancy_total": None,
                "vacancy_by_category": {},
                "applicant_count": None,
                "selection_ratio": None,
                "cutoff_trend": {},
                "difficulty_trend": {},
                "competition_pressure_score": None,
                "cycle_pressure": {
                    "days_remaining": None,
                    "pressure_level": "unknown",
                    "reason": None,
                },
                "trust": {
                    "source_basis": None,
                    "reviewer_status": None,
                    "confidence_score": None,
                    "evidence_count": 0,
                },
            },
            "policy_update_context": {
                "official_updates": [],
                "needs_verification": [],
                "affects_plan": False,
                "affects_deadline": False,
                "affects_eligibility": False,
                "affects_documents": False,
                "affects_syllabus": False,
                "affects_vacancy": False,
            },
            "update_context": {
                "official_updates": [],
                "needs_verification": [],
                "affects_plan": False,
                "affects_deadline": False,
                "affects_eligibility": False,
                "affects_documents": False,
                "affects_syllabus": False,
                "affects_vacancy": False,
            },
            "today_tasks": [],
            "plan_reasoning": [],
            "metrics": {
                "tasks_total": 0,
                "tasks_completed": 0,
                "task_completion_rate": 0.0,
                "hours_studied_7d": 0.0,
                "hours_planned_week": 0.0,
                "adherence": None,
                "backlog_count": 0,
                "mocks_taken": 0,
                "revision_coverage": None,
            },
            "next_best_action": {
                "title": "Open your study plan",
                "description": "Check what's scheduled and adjust if needed.",
                "action_type": "study_plan",
                "task_id": None,
                "reason": "Mission control is temporarily unavailable.",
            },
            "truth_panel": {
                "summary": "Mission control is temporarily unavailable.",
                "corrections": [],
                "warnings": [],
            },
            "progressive_question": None,
            "eligibility_summary": {
                "eligible": [],
                "conditional": [],
                "not_eligible": [],
                "unknown": [],
                "rule_count": 0,
            },
            "engine_trace": [
                {"label": "User signals", "status": "missing", "details": "Persona snapshot not available"},
                {"label": "Study policy", "status": "missing", "details": "No study policy derived yet"},
                {"label": "Study plan", "status": "missing", "details": "No active study plan yet"},
                {"label": "Exam intelligence", "status": "not_connected", "details": "Admin-reviewed exam intelligence is not connected yet"},
            ],
            "meta": {
                "source": "mission_control_v1",
                "preview_flags": ["mission_control_degraded", "exam_intelligence_not_connected"],
                "degraded": True,
                "diagnostics": {
                    "error_class": type(exc).__name__,
                    "error_message": str(exc)[:200],
                },
                "error": str(exc)[:200],
            },
        }


class PlanPreferencesBody(BaseModel):
    focus: str | None = Field(
        default=None, pattern="^(balanced|weak_areas|exam_priority|high_yield)$"
    )
    max_tasks_per_day: int | None = Field(default=None, ge=1, le=8)
    preferred_task_size: str | None = Field(
        default=None, pattern="^(small|medium|large)$"
    )
    pinned_topic_ids: list[str] | None = None
    muted_topic_ids: list[str] | None = None
    auto_regenerate: bool | None = None


@router.get("/plan/preferences")
async def get_plan_prefs(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Return the user's Study OS plan preferences (defaults if none saved)."""
    return get_plan_preferences(get_supabase_admin(), user.get("id"))


@router.put("/plan/preferences")
async def put_plan_prefs(
    body: PlanPreferencesBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """Update the user's plan preferences — the weighting focus, plan-shape
    overrides and pinned / muted topics that steer the deterministic planner.

    Only the fields present in the request body are changed. Saving does not
    itself regenerate the plan — call ``POST /plan/generate`` for that.
    """
    fields = body.model_dump(exclude_unset=True)
    return upsert_plan_preferences(get_supabase_admin(), user.get("id"), **fields)


@router.post("/plan/generate")
async def generate_study_plan(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Phase 7 — deterministic plan generation.

    Composes today's ``study_tasks`` from locked exam intelligence, verified
    PYQ frequency, the user's topic mastery, competition pressure and the
    persona study policy. Persists the plan, an audit version row and an
    adaptation event. Returns ``generated=False`` with a ``reason`` when the
    plan cannot be built (no target exam, or no locked coverage yet).
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        return generate_plan(supabase, user_id)
    except Exception:  # noqa: BLE001
        logger.exception("plan generation failed for %s", user_id)
        raise HTTPException(
            status_code=500, detail="Plan generation is temporarily unavailable."
        )


# ───────────────────────── Plan draft / apply / changelog ──────────────────
@router.get("/plan/draft")
async def get_plan_draft(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Preview today's deterministic plan without touching the active plan."""
    supabase = get_supabase_admin()
    user_id = user.get("id")
    _require_canonical_target(supabase, user_id)
    out = compute_draft_plan(supabase, user_id)
    try:
        from app.study_os.planner import _resolve_target_exam
        ex = _resolve_target_exam(supabase, user_id)
        if ex:
            cov = supabase.table("exam_topic_coverage").select("id", count="exact").eq("exam_id", ex["id"]).eq("reviewer_status", "locked").limit(1).execute()
            out["selected_exam"] = {"id": ex.get("id"), "slug": ex.get("slug"), "name": ex.get("name"), "planner_ready": int(getattr(cov, "count", 0) or 0) > 0}
    except Exception:
        pass
    return out


@router.post("/plan/draft")
async def post_plan_draft(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Same payload as GET /plan/draft — write-style verb for explicit refresh."""
    supabase = get_supabase_admin()
    user_id = user.get("id")
    _require_canonical_target(supabase, user_id)
    return compute_draft_plan(supabase, user_id)


@router.post("/plan/apply")
async def post_plan_apply(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Apply the deterministic plan candidate to the active plan."""
    user_id = user.get("id")
    supabase = get_supabase_admin()
    _require_canonical_target(supabase, user_id)
    try:
        return apply_plan(supabase, user_id)
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        logger.exception("plan apply failed for %s", user_id)
        raise HTTPException(status_code=500, detail="Plan apply is temporarily unavailable.")


@router.get("/plan/timeline")
async def plan_timeline(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Exam-cycle timeline payload for the Study Plan page.

    Composes exam_context + plan_context + cycle_progress + milestones +
    phase_bands + weekly planned-vs-actual series + per-subject progress
    + deterministic risk flags. Safe fallback (status='not_connected') is
    returned whenever required data is missing — the UI must not assume
    every field is populated.
    """
    try:
        return plan_timeline_service.get_plan_timeline(
            get_supabase_admin(), user.get("id")
        )
    except Exception:  # noqa: BLE001
        logger.exception("plan_timeline build failed for %s", user.get("id"))
        return plan_timeline_service._empty_payload()  # type: ignore[attr-defined]


@router.get("/plan/by-subject")
async def plan_by_subject(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Per-subject allocation for the user's planning week.

    Aggregates study_tasks scheduled this Monday → Sunday, groups them by
    subject, and tags each bucket with a trust_status reflecting whether
    the subject has locked coverage in the target exam.
    """
    try:
        return plan_by_subject_service.list_plan_by_subject(
            get_supabase_admin(), user.get("id")
        )
    except Exception:  # noqa: BLE001
        logger.exception("plan_by_subject read failed for %s", user.get("id"))
        return {
            "week_start": None,
            "week_end": None,
            "items": [],
            "total_minutes": 0,
            "total_hours": 0,
            "trust_status": "preview",
        }


@router.get("/plan/changelog")
async def get_plan_changelog(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Recent study_adaptation_events for the user's active plan."""
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        rows = (
            supabase.table("study_adaptation_events")
            .select(
                "id, plan_id, plan_version_id, event_type, trigger_source, "
                "trigger_payload, change_summary, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
            .data
            or []
        )
        return {"items": rows, "count": len(rows)}
    except Exception:  # noqa: BLE001
        logger.exception("plan changelog read failed for %s", user_id)
        return {"items": [], "count": 0}


# ───────────────────────────── Subjects ─────────────────────────────────────
@router.get("/subjects")
async def list_subjects(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Per-subject progress for the user's target exam (verified topics only)."""
    try:
        items = subjects_service.list_subjects(get_supabase_admin(), user.get("id"))
        return {"items": items, "count": len(items)}
    except Exception:  # noqa: BLE001
        logger.exception("subjects read failed for %s", user.get("id"))
        return {"items": [], "count": 0}


# ───────────────────────────── Topics tree ──────────────────────────────────
@router.get("/topics")
async def get_topics(
    exam_id: str | None = None,
    subject_id: str | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Locked-only topic intelligence — drives the Subjects topic tree."""
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        from app.exam_intelligence.coverage import verified_pyq_topic_counts
        from app.exam_intelligence.lookup import resolve_exam_by_id, resolve_exam_by_slug
        from app.study_os.planner import (
            _load_locked_coverage,
            _load_user_signals,
            _resolve_target_exam,
        )

        if not exam_id:
            target = _resolve_target_exam(supabase, user_id)
            exam_id = target.get("id") if target else None
        else:
            target = resolve_exam_by_id(supabase, exam_id) or resolve_exam_by_slug(
                supabase, exam_id
            )
            if target:
                exam_id = target.get("id")

        if not exam_id:
            return {
                "items": [],
                "exam_id": None,
                "subject_id": subject_id,
                "trust_status": "locked",
            }

        coverage = _load_locked_coverage(supabase, exam_id)
        if subject_id:
            coverage = [c for c in coverage if c.get("subject_id") == subject_id]

        pyq_counts = verified_pyq_topic_counts(supabase, exam_id) or {}
        mastery, error_topics = _load_user_signals(supabase, user_id, exam_id)

        def _next_action(mast, has_err):
            if mast is None:
                return "concept_learning"
            if mast < 45:
                return "concept_learning"
            if mast < 75 or has_err:
                return "retrieval_practice"
            return "revision"

        items: list[dict[str, Any]] = []
        for c in coverage:
            tid = c["topic_id"]
            mast = mastery.get(tid)
            has_err = tid in error_topics
            items.append(
                {
                    "subject_id": c.get("subject_id"),
                    "subject": c.get("subject_name"),
                    "topic_id": tid,
                    "topic": c.get("topic_name"),
                    "parent_topic_id": None,
                    "mastery_score": mast,
                    "exam_priority_score": c.get("coverage_priority"),
                    "is_high_yield": bool(c.get("is_high_yield")),
                    "verified_pyq_count": int(pyq_counts.get(tid, 0)),
                    "revision_due": mast is not None and mast >= 75,
                    "error_pattern_count": 1 if has_err else 0,
                    "next_action": _next_action(mast, has_err),
                    "evidence_count": int(pyq_counts.get(tid, 0)),
                    "trust_status": "locked",
                }
            )
        return {
            "items": items,
            "exam_id": exam_id,
            "subject_id": subject_id,
            "trust_status": "locked",
        }
    except Exception:  # noqa: BLE001
        logger.exception("topics read failed for %s", user_id)
        return {
            "items": [],
            "exam_id": exam_id,
            "subject_id": subject_id,
            "trust_status": "locked",
        }


# ─────────────────────────── Weekly review ──────────────────────────────────
@router.get("/weekly-review")
async def weekly_review_read(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the persisted weekly-review snapshot, computing one if absent."""
    try:
        return weekly_review_service.get_weekly_review(
            get_supabase_admin(), user.get("id")
        )
    except Exception:  # noqa: BLE001
        logger.exception("weekly_review read failed for %s", user.get("id"))
        raise HTTPException(
            status_code=500, detail="Weekly review is temporarily unavailable."
        )


@router.post("/weekly-review/compute")
async def weekly_review_compute(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Force-recompute and persist this week's review snapshot."""
    try:
        return weekly_review_service.compute_weekly_review(
            get_supabase_admin(), user.get("id")
        )
    except Exception:  # noqa: BLE001
        logger.exception("weekly_review compute failed for %s", user.get("id"))
        raise HTTPException(
            status_code=500, detail="Could not recompute weekly review."
        )



@router.get("/report-card")
async def report_card_read(
    period: str = "weekly",
    date: str | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    from datetime import datetime, timezone

    anchor = datetime.now(timezone.utc).date() if not date else datetime.fromisoformat(date).date()
    try:
        return report_cards_service.get_report_card(get_supabase_admin(), user.get("id"), period, anchor)
    except Exception:
        logger.exception("report_card read failed for %s", user.get("id"))
        raise HTTPException(status_code=500, detail="Report card is temporarily unavailable.")


@router.post("/report-card/compute")
async def report_card_compute(
    period: str = "weekly",
    date: str | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    from datetime import datetime, timezone

    anchor = datetime.now(timezone.utc).date() if not date else datetime.fromisoformat(date).date()
    try:
        return report_cards_service.compute_report_card(get_supabase_admin(), user.get("id"), period, anchor)
    except Exception:
        logger.exception("report_card compute failed for %s", user.get("id"))
        raise HTTPException(status_code=500, detail="Could not recompute report card.")


@router.get("/report-card/history")
async def report_card_history(
    period: str = "weekly",
    limit: int = 12,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return {"items": report_cards_service.history(get_supabase_admin(), user.get("id"), period, limit)}
    except Exception:
        logger.exception("report_card history failed for %s", user.get("id"))
        raise HTTPException(status_code=500, detail="Report card history is temporarily unavailable.")


# ─────────────────────────────── Mocks ──────────────────────────────────────
class MockSubjectBreakdownBody(BaseModel):
    subject: str
    total_questions: int | None = None
    correct_answers: int | None = None
    wrong_answers: int | None = None
    marks: float | None = None
    accuracy: float | None = None


class MockCreateBody(BaseModel):
    name: str
    exam_slug: str | None = None
    score: float | None = None
    max_score: float | None = None
    duration_min: int | None = None
    attempted: int | None = None
    correct: int | None = None
    weak_topics: list[str] = Field(default_factory=list)
    error_patterns: dict[str, int] = Field(default_factory=dict)
    subject_breakdown: list[MockSubjectBreakdownBody] = Field(default_factory=list)
    notes: str | None = None
    attempted_at: str | None = None


class MockReviewStateBody(BaseModel):
    state: str = Field(pattern="^(scheduled|unreviewed|reviewed|correction_drafted)$")


@router.get("/mocks")
async def list_mocks(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    items = mocks_service.list_mocks(get_supabase_admin(), user.get("id"))
    return {"items": items, "trend": mocks_service.mock_trend(items)}


@router.post("/mocks")
async def create_mock(
    body: MockCreateBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    payload = body.model_dump()
    # Nested Pydantic models → plain dicts for the service layer.
    payload["subject_breakdown"] = [
        b.model_dump() if hasattr(b, "model_dump") else dict(b)
        for b in (body.subject_breakdown or [])
    ]
    try:
        return mocks_service.create_mock(get_supabase_admin(), user.get("id"), payload)
    except RuntimeError:
        logger.exception("mock insert failed for %s", user.get("id"))
        raise HTTPException(status_code=500, detail="Could not log mock.")


@router.get("/mocks/{mock_id}")
async def get_mock(
    mock_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    row = mocks_service.get_mock(get_supabase_admin(), user.get("id"), mock_id)
    if not row:
        raise HTTPException(status_code=404, detail="Mock not found.")
    return row


@router.get("/mocks/{mock_id}/analysis")
async def get_mock_analysis(
    mock_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    bundle = mocks_service.get_mock_analysis(get_supabase_admin(), user.get("id"), mock_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Mock not found.")
    return bundle


@router.patch("/mocks/{mock_id}/review-state")
async def set_review_state(
    mock_id: str,
    body: MockReviewStateBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        return mocks_service.set_review_state(
            get_supabase_admin(), user.get("id"), mock_id, body.state
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Mock not found.")


@router.post("/mocks/{mock_id}/correction-tasks")
async def draft_correction_tasks(
    mock_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        items = mocks_service.draft_correction_tasks(
            get_supabase_admin(), user.get("id"), mock_id
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Mock not found.")
    return {"items": items}


@router.post("/mocks/correction-tasks/{correction_id}/apply")
async def apply_correction_task(
    correction_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return mocks_service.apply_correction_task(
            get_supabase_admin(), user.get("id"), correction_id
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Correction task not found.")
    except RuntimeError:
        logger.exception("apply correction failed for %s", correction_id)
        raise HTTPException(status_code=500, detail="Could not apply correction task.")


@router.post("/mocks/correction-tasks/{correction_id}/dismiss")
async def dismiss_correction_task(
    correction_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return mocks_service.dismiss_correction_task(
            get_supabase_admin(), user.get("id"), correction_id
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Correction task not found.")


@router.get("/task-reasoning/{task_id}")
async def task_reasoning(
    task_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """Why was this task scheduled? Splits reasoning into persona / exam /
    progress / update channels plus one aspirant-safe summary line.

    404 when the task does not exist or is not owned by the caller — task
    ids cannot be probed across users.
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        result = build_task_reasoning_response(supabase, user_id, task_id)
    except Exception:  # noqa: BLE001
        logger.exception("task_reasoning build failed for %s / %s", user_id, task_id)
        raise HTTPException(status_code=500, detail="Task reasoning is temporarily unavailable.")
    if result is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return result
