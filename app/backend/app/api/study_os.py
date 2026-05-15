"""Study OS Mission Control API (PR3).

Adds GET /api/study/mission-control on top of the existing
``/api/study/*`` surface owned by ``app.api.canonical.router_study``.
Kept as a separate router so PR3 doesn't touch the canonical file.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.study_os.mission_control import (
    build_mission_control,
    build_task_reasoning_response,
)
from app.study_os.plan_preferences import get_plan_preferences, upsert_plan_preferences
from app.study_os.planner import apply_plan, compute_draft_plan, generate_plan

logger = logging.getLogger("career_copilot.api.study_os")

router = APIRouter(prefix="/study", tags=["study"])


@router.get("/mission-control")
async def mission_control(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        return build_mission_control(supabase, user_id)
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
            "engine_trace": [
                {"label": "User signals", "status": "missing", "details": "Persona snapshot not available"},
                {"label": "Study policy", "status": "missing", "details": "No study policy derived yet"},
                {"label": "Study plan", "status": "missing", "details": "No active study plan yet"},
                {"label": "Exam intelligence", "status": "not_connected", "details": "Admin-reviewed exam intelligence is not connected yet"},
            ],
            "meta": {
                "source": "mission_control_v1",
                "preview_flags": ["mission_control_degraded", "exam_intelligence_not_connected"],
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


@router.get("/plan/draft")
async def get_plan_draft(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Preview today's deterministic plan without touching the active plan.

    Returns the computed plan candidate alongside the user's current
    still-planned today tasks so the UI can diff before vs. after. Calling
    ``/plan/draft`` never inserts ``study_tasks``, ``study_plan_versions``
    or ``study_adaptation_events`` rows.
    """
    return compute_draft_plan(get_supabase_admin(), user.get("id"))


@router.post("/plan/draft")
async def post_plan_draft(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Same payload as ``GET /plan/draft`` — exists so the frontend can use
    a write-style verb when the user explicitly asks for a fresh preview."""
    return compute_draft_plan(get_supabase_admin(), user.get("id"))


@router.post("/plan/apply")
async def post_plan_apply(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Apply the deterministic plan candidate to the active plan.

    Idempotent: replays the planner deterministically, replaces today's
    still-planned tasks, persists exactly one new ``study_plan_versions``
    row and one ``study_adaptation_events`` row per call. Completed and
    in-progress tasks survive.
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        return apply_plan(supabase, user_id)
    except Exception:  # noqa: BLE001
        logger.exception("plan apply failed for %s", user_id)
        raise HTTPException(status_code=500, detail="Plan apply is temporarily unavailable.")


@router.get("/plan/changelog")
async def get_plan_changelog(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Recent ``study_adaptation_events`` for the user's active plan.

    Drives the PlanChangeLogCard. Each row carries a server-derived
    ``trigger_source`` and ``change_summary`` — the UI must not invent
    explanations.
    """
    user_id = user.get("id")
    supabase = get_supabase_admin()
    try:
        from datetime import datetime  # noqa: F401 — keep stdlib imports local

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


@router.get("/topics")
async def get_topics(
    exam_id: str | None = None,
    subject_id: str | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Locked-only topic intelligence for the topic tree.

    Reads ``exam_topic_coverage`` rows with ``reviewer_status='locked'`` and
    enriches them with topic / subject names, the user's mastery, error-
    pattern count, and verified PYQ counts. The ``is_high_yield`` flag is
    returned as the server-side value — never derived from anything else.

    Falls back to the user's target exam when ``exam_id`` is omitted.
    """
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

        # revision_due signal — derived from mastery only (server-side).
        def _next_action(mast: float | None, has_err: bool) -> str:
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
        return {"items": [], "exam_id": exam_id, "subject_id": subject_id, "trust_status": "locked"}


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
