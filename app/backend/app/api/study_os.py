"""Study OS Mission Control API (PR3).

Adds GET /api/study/mission-control on top of the existing
``/api/study/*`` surface owned by ``app.api.canonical.router_study``.
Kept as a separate router so PR3 doesn't touch the canonical file.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.study_os.mission_control import build_mission_control

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
        return {
            "user_context": {"persona_version": "v1", "dimensions": {}, "scores": {}},
            "study_policy": {},
            "plan": None,
            "today_tasks": [],
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
