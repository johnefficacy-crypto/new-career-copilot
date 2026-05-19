"""Exam-level eligibility summary (PR-D1).

Single user-facing endpoint:

  ``GET /api/exams/eligibility-summary``
      Returns the four-bucket summary of exam-level eligibility for the
      current user. Safe to call at onboarding-close (partial profile)
      and on the dashboard.

Recruitment-level eligibility lives elsewhere (``/api/eligibility/...``)
and is unaffected.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.exam_eligibility.evaluator import summarize_user_eligibility

logger = logging.getLogger("career_copilot.api.exam_eligibility")

router = APIRouter(prefix="/exams", tags=["exam-eligibility"])


@router.get("/eligibility-summary")
async def eligibility_summary(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Four-bucket exam eligibility summary for the current user.

    See ``app.exam_eligibility.evaluator.summarize_user_eligibility`` for
    the bucket shape. The endpoint is intentionally permissive — a brand
    new user with no profile data yet gets an all-``conditional`` (or
    ``unknown``) response, never an error.
    """
    supabase = get_supabase_admin()
    try:
        return summarize_user_eligibility(supabase, user["id"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("eligibility_summary failed for %s", user.get("id"))
        return {
            "eligible": [],
            "conditional": [],
            "not_eligible": [],
            "unknown": [],
            "rule_count": 0,
            "error": "summary_unavailable",
            "error_detail": str(exc),
        }
