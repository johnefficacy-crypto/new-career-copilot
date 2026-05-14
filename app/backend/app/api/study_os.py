"""Study OS Mission Control API (PR3).

Adds GET /api/study/mission-control on top of the existing
``/api/study/*`` surface owned by ``app.api.canonical.router_study``.
Kept as a separate router so PR3 doesn't touch the canonical file.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.study_os.mission_control import (
    build_mission_control,
    build_task_reasoning_response,
)
from app.study_os.planner import generate_plan

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
