"""Study OS comparison + social API (PRs 1-11).

Mounted under /api/study/* alongside `app.api.study_os`. Implements:

  /api/study/compare/me               (PR 1)
  /api/study/compare/settings (GET/PUT)  (PR 1)
  /api/study/compare/cohort           (PR 3)
  /api/study/compare/titles           (PR 1 + helpers)
  /api/study/leaderboard              (PR 4 + PR 11)

  /api/study/social/groups            (PR 6 — replaces placeholders.router_acc)
  /api/study/social/groups/:id/join   (PR 6)
  /api/study/social/sessions/start    (PR 6)
  /api/study/social/sessions/:id/checkin
  /api/study/social/sessions/:id/end
  /api/study/social/partner/me        (PR 8)
  /api/study/social/partner/request   (PR 8)
  /api/study/social/trust-breakdown   (PR 7)

  /api/study/mocks/:id/attest         (PR 5 / PR 9)
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.study_os.behavior_scores import read_compare_me, upsert_behavior_snapshot
from app.study_os.exam_snapshots import upsert_exam_snapshots
from app.study_os.leaderboards import read_leaderboard
from app.study_os.mock_verification import attest_mock
from app.study_os.peer_benchmark import (
    aggregate_user_weekly,
    get_cohort_comparison,
)
from app.study_os.social_sessions import (
    checkin_session,
    create_group,
    end_session,
    join_group,
    list_groups,
    list_pairs,
    list_partner_suggestions,
    request_partner,
    start_session,
    write_mentor_feedback,
)
from app.study_os.titles import evaluate_titles
from app.study_os.trust_weights import (
    aggregate_breakdown_from_sessions,
    read_breakdown,
    upsert_source_breakdown,
)

logger = logging.getLogger("career_copilot.api.study_compare")

router = APIRouter(prefix="/study", tags=["study-compare"])


def _supabase():
    return get_supabase_admin()


# ──────────────────────────────── Compare ──────────────────────────────────

@router.get("/compare/me")
async def compare_me(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    # PR 1 scope-lock: self-view only.
    return read_compare_me(_supabase(), user["id"])


class ComparisonSettings(BaseModel):
    comparison_enabled: bool | None = None
    public_leaderboard_enabled: bool | None = None
    friends_leaderboard_enabled: bool | None = None
    visibility: str | None = Field(default=None, pattern=r"^(private|anonymous|group|public)$")
    anonymous_display_name: str | None = None
    solo_mode: bool | None = None


@router.get("/compare/settings")
async def get_settings(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    sb = _supabase()
    rows = sb.table("study_comparison_settings").select("*").eq("user_id", user["id"]).limit(1).execute()
    items = getattr(rows, "data", None) or []
    if items:
        return items[0]
    # Default settings on first read — do not write until the user PUTs.
    return {
        "user_id": user["id"],
        "comparison_enabled": True,
        "public_leaderboard_enabled": False,
        "friends_leaderboard_enabled": True,
        "visibility": "private",
        "solo_mode": False,
    }


@router.put("/compare/settings")
async def put_settings(
    body: ComparisonSettings, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    sb = _supabase()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="no settings provided")
    patch["user_id"] = user["id"]
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = sb.table("study_comparison_settings").upsert(patch, on_conflict="user_id").execute()
    data = getattr(res, "data", None) or []
    return data[0] if data else patch


@router.get("/compare/cohort")
async def compare_cohort(
    user: dict = Depends(get_current_user),
    weeks_back: int = Query(default=0, ge=0, le=12),
) -> dict[str, Any]:
    sb = _supabase()
    today = date.today()
    days_offset = today.weekday() + 7 * weeks_back
    week_start = today.fromordinal(today.toordinal() - days_offset)
    values = aggregate_user_weekly(sb, user["id"], week_start)
    cmp = get_cohort_comparison(sb, user["id"], values)
    return {
        "week_start": week_start.isoformat(),
        "values": values,
        "cohort": cmp.get("cohort"),
        "fallback_exhausted": cmp.get("fallback_exhausted", False),
        "metrics": cmp.get("metrics", {}),
    }


@router.get("/compare/titles")
async def compare_titles(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return evaluate_titles(_supabase(), user["id"])


# ──────────────────────────── Leaderboards ────────────────────────────────

@router.get("/leaderboard")
async def leaderboard(
    user: dict = Depends(get_current_user),
    board: str = Query(default="behavior"),
    metric: str = Query(default="behavior_index"),
    cohort: str | None = Query(default=None),
) -> dict[str, Any]:
    return read_leaderboard(_supabase(), user["id"], board, metric, cohort)


# ────────────────────────────── Social: groups ─────────────────────────────

@router.get("/social/groups")
async def social_groups(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return {"items": list_groups(_supabase(), user["id"])}


class CreateGroupBody(BaseModel):
    name: str
    group_type: str = "behavior"
    exam_id: str | None = None
    max_members: int = 8
    visibility: str = "private"


@router.post("/social/groups")
async def social_create_group(
    body: CreateGroupBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return create_group(
            _supabase(),
            user["id"],
            body.name,
            body.group_type,
            body.exam_id,
            body.max_members,
            body.visibility,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/social/groups/{group_id}/join")
async def social_join_group(
    group_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return join_group(_supabase(), user["id"], group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ────────────────────────── Social: sessions ───────────────────────────────

class StartSessionBody(BaseModel):
    session_type: str
    group_id: str | None = None
    partner_pair_id: str | None = None
    planned_minutes: int | None = None


@router.post("/social/sessions/start")
async def session_start(
    body: StartSessionBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return start_session(
            _supabase(),
            user["id"],
            body.session_type,
            body.group_id,
            body.partner_pair_id,
            body.planned_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


class CheckinBody(BaseModel):
    focus_check_passed: bool
    declared_task_completed: bool | None = None


@router.post("/social/sessions/{session_id}/checkin")
async def session_checkin(
    session_id: str, body: CheckinBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return checkin_session(
            _supabase(),
            user["id"],
            session_id,
            body.focus_check_passed,
            body.declared_task_completed,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


class EndSessionBody(BaseModel):
    declared_task_completed: bool | None = None


@router.post("/social/sessions/{session_id}/end")
async def session_end(
    session_id: str,
    body: EndSessionBody | None = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    completed = body.declared_task_completed if body else None
    try:
        return end_session(_supabase(), user["id"], session_id, completed)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ─────────────────────────── Social: partner ───────────────────────────────

@router.get("/social/partner/me")
async def partner_me(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    sb = _supabase()
    return {
        "pairs": list_pairs(sb, user["id"]),
        "suggested": list_partner_suggestions(sb, user["id"]),
    }


class PartnerReq(BaseModel):
    partner_id: str
    pairing_goal: str = "discipline"
    exam_id: str | None = None


@router.post("/social/partner/request")
async def partner_request(
    body: PartnerReq, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return request_partner(
            _supabase(),
            user["id"],
            body.partner_id,
            body.pairing_goal,
            body.exam_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ────────────────────────── Social: trust breakdown ────────────────────────

@router.get("/social/trust-breakdown")
async def trust_breakdown(
    user: dict = Depends(get_current_user),
    target_date: str | None = Query(default=None, alias="date"),
) -> dict[str, Any]:
    sb = _supabase()
    try:
        day = date.fromisoformat(target_date) if target_date else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date")
    # Recompute breakdown from raw sessions on read so the UI never sees stale rows.
    sources = aggregate_breakdown_from_sessions(sb, user["id"], day)
    upsert_behavior_snapshot(sb, user["id"], day)
    upsert_source_breakdown(sb, user["id"], day, sources)
    return read_breakdown(sb, user["id"], day)


# ──────────────────────────── Mock attestation ─────────────────────────────

class AttestBody(BaseModel):
    attester_role: str
    attested_by: str | None = None
    evidence_url: str | None = None
    provider_name: str | None = None
    provider_attempt_id: str | None = None
    verified_score: float | None = None
    verified_max_score: float | None = None


@router.post("/mocks/{mock_id}/attest")
async def mock_attest(
    mock_id: str, body: AttestBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        return attest_mock(
            _supabase(),
            user["id"],
            mock_id,
            body.attester_role,
            body.attested_by,
            body.evidence_url,
            body.provider_name,
            body.provider_attempt_id,
            body.verified_score,
            body.verified_max_score,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ───────────────── Mentor feedback (PR 10, mentor-only) ────────────────────

class MentorFeedbackBody(BaseModel):
    session_id: str
    mentee_id: str
    discipline_rating: int | None = Field(default=None, ge=1, le=5)
    preparation_rating: int | None = Field(default=None, ge=1, le=5)
    follow_through_rating: int | None = Field(default=None, ge=1, le=5)
    feedback_private: dict[str, Any] | None = None


@router.post("/social/mentor-feedback")
async def post_mentor_feedback(
    body: MentorFeedbackBody, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    if (user.get("role") or "") not in ("mentor", "admin"):
        raise HTTPException(status_code=403, detail="mentor role required")
    return write_mentor_feedback(
        _supabase(),
        user["id"],
        body.mentee_id,
        body.session_id,
        body.discipline_rating,
        body.preparation_rating,
        body.follow_through_rating,
        body.feedback_private,
    )


# ──────────────── Admin trigger: recompute behavior snapshot ───────────────

@router.post("/compare/recompute")
async def recompute_self(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    sb = _supabase()
    payload = upsert_behavior_snapshot(sb, user["id"])
    upsert_exam_snapshots(sb, user["id"], date.fromisoformat(payload["snapshot_date"]))
    return {
        "snapshot_date": payload["snapshot_date"],
        "behavior_index": payload["_behavior_index"],
    }
