"""Exam Intelligence read API (PR5).

User-visible, authenticated, deterministic. Every response is built from
**verified-only** rows (``reviewer_status='verified'``). No AI. No
unreviewed claims. Returns empty payloads cleanly when nothing is
verified yet, so the frontend can render a neutral "not connected yet"
state.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.exam_intelligence.lookup import list_active_exams
from app.exam_intelligence.option_insights import option_insights
from app.exam_intelligence.status import exam_intelligence_summary
from app.exam_intelligence.trap_drill import (
    build_trap_drill,
    drill_streak,
    log_drill_attempts,
)

logger = logging.getLogger("career_copilot.api.exam_intelligence")

router = APIRouter(prefix="/exam-intelligence", tags=["exam-intelligence"])


@router.get("/exams")
def list_exams(
    limit: int = Query(100, ge=1, le=200),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    try:
        items = list_active_exams(sb, limit=limit)
    except Exception as exc:  # noqa: BLE001
        logger.warning("exam_intelligence list_exams failed: %s", exc)
        items = []
    return {"items": items, "count": len(items), "verified_only": True}


@router.get("/exams/{slug}")
def get_exam_summary(
    slug: str,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    try:
        return exam_intelligence_summary(sb, slug)
    except Exception as exc:  # noqa: BLE001
        logger.exception("exam_intelligence summary failed for %s", slug)
        return {
            "exam": None,
            "available": False,
            "topics": [],
            "verified_pyq_counts": {},
            "verified_syllabus_mentions": 0,
            "competition_series": [],
            "cutoff_series": {},
            "vacancy_series": {"total": [], "by_category": {}},
            "pyq_papers": [],
            "difficulty_heatmap": {"buckets": ["easy", "medium", "hard", "unknown"], "rows": [], "verified_question_count": 0},
            "verified_only": True,
            "error": str(exc)[:200],
        }


@router.get("/exams/{slug}/option-insights")
def get_option_insights(
    slug: str,
    topic_id: str | None = Query(None),
    limit: int = Query(8, ge=1, le=50),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Aspirant-facing trap-awareness + elimination-heuristic tips.

    Reads the materialised option-analytics rollups for the exam (the
    admin recompute populates them). Returns clean, UI-shaped tips with
    server-rendered human-readable lines, so the frontend stays dumb.
    Returns gracefully empty payloads when no rollup data exists yet.
    """
    sb = get_supabase_admin()
    exam_row = None
    try:
        rows = (
            sb.table("exams").select("id, slug").eq("slug", slug).limit(1).execute().data
            or []
        )
        exam_row = rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("option_insights exam lookup failed for %s: %s", slug, exc)
    if not exam_row or not exam_row.get("id"):
        return {
            "exam_id": None,
            "topic_id": topic_id,
            "verified_only": True,
            "has_data": False,
            "recurring_distractors": [],
            "elimination_tips": [],
        }
    try:
        return option_insights(sb, exam_row["id"], topic_id=topic_id, limit=limit)
    except Exception as exc:  # noqa: BLE001
        logger.exception("option_insights compute failed for %s", slug)
        return {
            "exam_id": exam_row["id"],
            "topic_id": topic_id,
            "verified_only": True,
            "has_data": False,
            "recurring_distractors": [],
            "elimination_tips": [],
            "error": str(exc)[:200],
        }


@router.get("/exams/{slug}/trap-drill")
def get_trap_drill(
    slug: str,
    topic_id: str | None = Query(None),
    size: int = Query(5, ge=1, le=15),
    seed: int | None = Query(None, ge=1, le=2**31 - 1),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Build a short MCQ drill skewed toward verified questions with
    known trap patterns.

    Returns ``questions=[]`` and pool-size counts when the exam has no
    verified questions yet, so the UI can render a neutral empty
    state. When ``seed`` is supplied the same shuffle is reproduced,
    powering the deep-link contract. The user's attempt history is
    consulted for adaptive ranking — missed questions float to the
    top, recently-aced ones sink. ``drill_seed`` is echoed back on
    every payload so the client can pin it into a sharable URL.
    """
    sb = get_supabase_admin()
    exam_row = None
    try:
        rows = (
            sb.table("exams").select("id, slug").eq("slug", slug).limit(1).execute().data
            or []
        )
        exam_row = rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("trap_drill exam lookup failed for %s: %s", slug, exc)
    if not exam_row or not exam_row.get("id"):
        return {
            "exam_id": None,
            "topic_id": topic_id,
            "verified_only": True,
            "questions": [],
            "total_pool_size": 0,
            "trap_annotated_pool_size": 0,
            "drill_seed": seed,
            "adaptive": False,
            "personalised_for_user": False,
        }
    try:
        return build_trap_drill(
            sb,
            exam_row["id"],
            topic_id=topic_id,
            size=size,
            seed=seed,
            user_id=(user or {}).get("id"),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("trap_drill build failed for %s", slug)
        return {
            "exam_id": exam_row["id"],
            "topic_id": topic_id,
            "verified_only": True,
            "questions": [],
            "total_pool_size": 0,
            "trap_annotated_pool_size": 0,
            "drill_seed": seed,
            "adaptive": False,
            "personalised_for_user": False,
            "error": str(exc)[:200],
        }


class DrillAttempt(BaseModel):
    question_id: str
    is_correct: bool
    option_id: str | None = None
    topic_id: str | None = None


class DrillAttemptsBody(BaseModel):
    drill_seed: int | str | None = None
    attempts: list[DrillAttempt] = Field(default_factory=list)


@router.post("/exams/{slug}/trap-drill/attempts")
def post_trap_drill_attempts(
    slug: str,
    body: DrillAttemptsBody,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Persist one drill run as a batch of per-question attempts.

    Called from the modal when the drill reaches the summary screen.
    No-ops cleanly when the body has zero attempts (e.g. the user
    closed the modal mid-drill without answering anything) so the
    client can fire-and-forget. Returns the number of rows actually
    written plus how many were skipped because of bad shape.
    """
    sb = get_supabase_admin()
    exam_row = None
    try:
        rows = (
            sb.table("exams").select("id, slug").eq("slug", slug).limit(1).execute().data
            or []
        )
        exam_row = rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("trap_drill attempts exam lookup failed for %s: %s", slug, exc)
    if not exam_row or not exam_row.get("id"):
        raise HTTPException(status_code=404, detail="Unknown exam slug")
    if not body.attempts:
        return {"exam_id": exam_row["id"], "inserted": 0, "skipped": 0}
    user_id = (user or {}).get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = log_drill_attempts(
        sb,
        user_id=user_id,
        exam_id=exam_row["id"],
        attempts=[a.model_dump() for a in body.attempts],
        drill_seed=body.drill_seed,
    )
    return {"exam_id": exam_row["id"], **result}


@router.get("/exams/{slug}/trap-drill/streak")
def get_trap_drill_streak(
    slug: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the user's drill streak for this exam.

    Always returns a payload (zeros when there's nothing logged yet)
    so the UI can render a neutral empty state without an extra
    request-shape branch.
    """
    sb = get_supabase_admin()
    exam_row = None
    try:
        rows = (
            sb.table("exams").select("id, slug").eq("slug", slug).limit(1).execute().data
            or []
        )
        exam_row = rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("trap_drill streak exam lookup failed for %s: %s", slug, exc)
    user_id = (user or {}).get("id")
    if not user_id or not exam_row or not exam_row.get("id"):
        return {
            "exam_id": exam_row["id"] if exam_row else None,
            "current_streak_days": 0,
            "longest_streak_days": 0,
            "drills_this_week": 0,
            "total_attempts": 0,
            "last_attempt_at": None,
        }
    streak = drill_streak(sb, user_id=user_id, exam_id=exam_row["id"])
    return {"exam_id": exam_row["id"], **streak}
