"""Canonical Supabase-backed routers (Phase 2 · Session ii).

Replaces the in-memory placeholders for: recruitments, profile, tracker,
community/forum, marketplace (courses), study OS. Each router queries
canonical tables only — no Mongo, no in-memory state.

Surfaces still served by ``app/api/placeholders.py``:
    - accountability (no canonical partner/group tables exist yet)
    - ai (scripted; Phase 2 session for real AI)
    - admin (uses canonical KPIs but still partly static)

All endpoints expose the same paths and response shapes the React app
already consumes, so no frontend page rewrites are required.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from supabase import Client

from app.api.community_seed import (
    COMMUNITY_CHANNEL_RULES as _COMMUNITY_CHANNEL_RULES_SNAPSHOT,
    COMMUNITY_FLAIRS as _COMMUNITY_FLAIRS_SNAPSHOT,
    COMMUNITY_SPACES as _COMMUNITY_SPACES_SNAPSHOT,
    COMMUNITY_THREADS as _COMMUNITY_THREADS_SNAPSHOT,
    COMMUNITY_USERS as _COMMUNITY_USERS_SNAPSHOT,
)
from app.core.auth import get_current_user, get_optional_user
from app.db.supabase_client import get_supabase_admin
from app.eligibility.recompute_queue import enqueue_eligibility_recompute
from app.profile.eligibility_mapper import build_user_eligibility_profile

logger = logging.getLogger("career_copilot.canonical")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(s: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60]
    return base or "post"


def _safe(call, default=None):
    """Wrap a Supabase call; on error return default and log."""
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase call failed: %s", exc)
        return default


# ════════════════════════════════════════════════════════════════════════════
#  RECRUITMENTS
# ════════════════════════════════════════════════════════════════════════════

router_recruitments = APIRouter(prefix="/recruitments", tags=["recruitments"])


_REC_SELECT = (
    "id, slug, name, year, status, publish_status, "
    "notification_date, apply_start_date, apply_end_date, "
    "total_vacancies, official_notification_url, exam_id, "
    "organizations ( id, name, type, state )"
)


def _shape_recruitment(row: dict[str, Any], saved_ids: set[str]) -> dict[str, Any]:
    """Coerce a Supabase recruitment row into the shape the UI expects."""
    org = row.get("organizations") or {}
    if isinstance(org, list):
        org = org[0] if org else {}
    slug = row.get("slug") or f"{_slug(row.get('name') or '')}-{(row.get('id') or '')[:8]}"
    return {
        "id": row.get("id"),
        "slug": slug,
        "name": row.get("name"),
        "year": row.get("year"),
        "organization": org.get("name"),
        "organization_code": (org.get("name") or "").split()[0][:6].upper() if org.get("name") else None,
        "type": org.get("type"),
        "state": org.get("state"),
        "stage": row.get("status") or "notification",
        "status": row.get("status") or "notification",
        "publish_status": row.get("publish_status"),
        "apply_window": {
            "open": str(row.get("apply_start_date")) if row.get("apply_start_date") else None,
            "close": str(row.get("apply_end_date")) if row.get("apply_end_date") else None,
        },
        "vacancies": row.get("total_vacancies"),
        "notification_url": row.get("official_notification_url"),
        "saved": row.get("id") in saved_ids,
    }


def _eligibility_summary(supabase: Client, user_id: str) -> dict[str, dict[str, Any]]:
    """Map recruitment_id → {eligible: bool, conditional: bool, fail_reasons: [...]}."""
    rows = _safe(
        lambda: supabase.table("eligibility_results")
        .select("recruitment_id, is_eligible, is_conditional, fail_reasons, computed_at")
        .eq("user_id", user_id)
        .execute()
        .data,
        default=[],
    )
    by_rec: dict[str, dict[str, Any]] = {}
    for r in rows or []:
        rid = r["recruitment_id"]
        cur = by_rec.get(rid, {"eligible": False, "conditional": False, "fail_reasons": []})
        if r["is_eligible"]:
            cur["eligible"] = True
        elif r["is_conditional"]:
            cur["conditional"] = True
        if r.get("fail_reasons"):
            cur["fail_reasons"] = r["fail_reasons"]
        cur["computed_at"] = r.get("computed_at")
        by_rec[rid] = cur
    return by_rec


@router_recruitments.get("")
async def list_recruitments(
    status: str | None = None,
    q: str | None = None,
    user: dict | None = Depends(get_optional_user),
):
    supabase = get_supabase_admin()
    query = supabase.table("recruitments").select(_REC_SELECT).in_(
        "publish_status", ["published"]
    )
    if status and status != "all":
        # Map UI status (eligible/urgent/conditional) to recruitment lifecycle.
        # The UI's "eligible/urgent/conditional" maps from eligibility_results,
        # not from recruitments.status. We filter client-side after eligibility merge.
        pass
    if isinstance(q, str) and q.strip():
        query = query.ilike("name", f"%{q.strip()}%")
    rows = _safe(lambda: query.order("apply_end_date", desc=False).execute().data, default=[]) or []

    saved_ids: set[str] = set()
    elig: dict[str, dict[str, Any]] = {}
    if user is not None:
        saved_rows = _safe(
            lambda: supabase.table("tracked_recruitments")
            .select("recruitment_id")
            .eq("user_id", user["id"])
            .execute()
            .data,
            default=[],
        )
        saved_ids = {r["recruitment_id"] for r in saved_rows or []}
        elig = _eligibility_summary(supabase, user["id"])

    items: list[dict[str, Any]] = []
    for r in rows:
        item = _shape_recruitment(r, saved_ids)
        e = elig.get(item["id"], {})
        # Derive UI status pill from eligibility verdict + apply-window urgency.
        from datetime import date

        close = r.get("apply_end_date")
        is_urgent = False
        if close:
            try:
                days_left = (date.fromisoformat(str(close)) - date.today()).days
                is_urgent = 0 <= days_left <= 7
            except Exception:
                pass
        if e.get("eligible"):
            item["status"] = "urgent" if is_urgent else "eligible"
        elif e.get("conditional"):
            item["status"] = "conditional"
        else:
            item["status"] = "urgent" if is_urgent else (r.get("status") or "notification")
        item["eligibility"] = {
            "eligible": e.get("eligible", False),
            "conditional": e.get("conditional", False),
            "fail_reasons": e.get("fail_reasons", []),
        }
        items.append(item)

    if status and status != "all":
        items = [it for it in items if it["status"] == status]

    counts = {
        "all": len(items),
        "eligible": sum(1 for x in items if x["status"] == "eligible"),
        "urgent": sum(1 for x in items if x["status"] == "urgent"),
        "conditional": sum(1 for x in items if x["status"] == "conditional"),
    }
    return {"items": items, "counts": counts}


@router_recruitments.get("/saved")
async def saved_recruitments(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    saved_rows = _safe(
        lambda: supabase.table("tracked_recruitments")
        .select("recruitment_id, tracked_at")
        .eq("user_id", user["id"])
        .order("tracked_at", desc=True)
        .execute()
        .data,
        default=[],
    ) or []
    if not saved_rows:
        return {"items": []}
    rec_ids = [r["recruitment_id"] for r in saved_rows]
    rows = _safe(
        lambda: supabase.table("recruitments")
        .select(_REC_SELECT)
        .in_("id", rec_ids)
        .execute()
        .data,
        default=[],
    ) or []
    saved_ids = set(rec_ids)
    elig = _eligibility_summary(supabase, user["id"])
    items = []
    for r in rows:
        it = _shape_recruitment(r, saved_ids)
        it["eligibility"] = elig.get(it["id"], {"eligible": False, "conditional": False, "fail_reasons": []})
        items.append(it)
    return {"items": items}


@router_recruitments.post("/{rec_ref}/save")
async def toggle_save(rec_ref: str, user: dict = Depends(get_current_user)):
    """Toggle save by recruitment id OR slug ending in -<8-char-id>."""
    supabase = get_supabase_admin()
    rec_id = _resolve_rec_id(supabase, rec_ref)
    existing = _safe(
        lambda: supabase.table("tracked_recruitments")
        .select("id")
        .eq("user_id", user["id"])
        .eq("recruitment_id", rec_id)
        .execute()
        .data,
        default=[],
    ) or []
    if existing:
        supabase.table("tracked_recruitments").delete().eq("user_id", user["id"]).eq(
            "recruitment_id", rec_id
        ).execute()
        return {"saved": False}
    supabase.table("tracked_recruitments").insert(
        {"user_id": user["id"], "recruitment_id": rec_id, "tracked_at": _now_iso()}
    ).execute()
    return {"saved": True}


def _resolve_rec_id(supabase: Client, ref: str) -> str:
    """Resolve recruitment deterministically: UUID->id, otherwise exact slug."""
    is_uuid = False
    try:
        UUID(str(ref))
        is_uuid = True
    except Exception:
        is_uuid = False

    if is_uuid:
        rows = _safe(lambda: supabase.table("recruitments").select("id").eq("id", ref).limit(1).execute().data, default=[]) or []
        if rows:
            return rows[0]["id"]
        raise HTTPException(status_code=404, detail="Recruitment not found")

    rows = _safe(lambda: supabase.table("recruitments").select("id").eq("slug", ref).limit(1).execute().data, default=[]) or []
    if rows:
        return rows[0]["id"]
    raise HTTPException(status_code=404, detail="Recruitment not found")


@router_recruitments.get("/{rec_ref}")
async def get_recruitment(rec_ref: str, user: dict | None = Depends(get_optional_user)):
    supabase = get_supabase_admin()
    rec_id = _resolve_rec_id(supabase, rec_ref)
    rows = _safe(
        lambda: supabase.table("recruitments")
        .select(
            _REC_SELECT
            + ", recruitment_units ( id, organization_id, unit_code, unit_name, location_state, location_city, preference_order, organizations ( id, name, type, state ) )"
            + ", posts ( id, post_name, post_code, group_type, pay_level, job_type, recruitment_unit_id, language_requirements, exam_patterns ( id, stage_name, section_name, question_count, marks, duration_minutes, negative_marking, sort_order ), skill_tests ( id, test_type, speed_requirement, duration_minutes, evaluation_formula ) )"
        )
         .eq("id", rec_id)
        .in_("publish_status", ["published"])
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Recruitment not found")
    row = rows[0]
    saved_ids: set[str] = set()
    elig: dict[str, Any] = {}
    if user:
        saved_rows = _safe(
            lambda: supabase.table("tracked_recruitments")
            .select("recruitment_id")
            .eq("user_id", user["id"])
            .eq("recruitment_id", rec_id)
            .execute()
            .data,
            default=[],
        ) or []
        if saved_rows:
            saved_ids.add(rec_id)
        elig = _eligibility_summary(supabase, user["id"]).get(rec_id, {})

    out = _shape_recruitment(row, saved_ids)
    out["posts"] = row.get("posts") or []
    out["units"] = row.get("recruitment_units") or []
    exam_id = row.get("exam_id")
    exam_slug = None
    if exam_id:
        exam_rows = _safe(
            lambda: supabase.table("exams")
            .select("id, slug, name")
            .eq("id", exam_id)
            .limit(1)
            .execute()
            .data,
            default=[],
        ) or []
        if exam_rows:
            exam_slug = exam_rows[0].get("slug")
            out["exam"] = {
                "id": exam_rows[0].get("id"),
                "slug": exam_slug,
                "name": exam_rows[0].get("name"),
            }
    out["exam_id"] = exam_id
    out["exam_slug"] = exam_slug
    out["eligibility_preview"] = {
        "verdict": (
            "eligible"
            if elig.get("eligible")
            else "conditional"
            if elig.get("conditional")
            else "pending"
        ),
        "matched_posts": sum(1 for _ in (row.get("posts") or [])),
        "total_posts": len(row.get("posts") or []),
        "fail_reasons": elig.get("fail_reasons", []),
        "computed_at": elig.get("computed_at"),
        "source": "deterministic-engine",
    }
    return out


# ════════════════════════════════════════════════════════════════════════════
#  PROFILE
# ════════════════════════════════════════════════════════════════════════════

router_profile = APIRouter(prefix="/profile", tags=["profile"])


_PROFILE_COLS = (
    "id, full_name, phone, gender, category, pwbd_status, domicile_state, "
    "nationality, ex_serviceman, govt_employee, dob, date_of_birth, "
    "service_years, graduation_year, target_type, target_exam, "
    "career_stage, career_goal, onboarding_step, onboarding_completed, "
    "is_admin, plan_id, avatar_url"
)

_PROFILE_IDENTITY_FIELDS = {
    "full_name",
    "phone",
    "gender",
    "category",
    "pwbd_status",
    "domicile_state",
    "nationality",
    "ex_serviceman",
    "service_years",
    "govt_employee",
    "date_of_birth",
    "dob",
    "career_stage",
    "career_goal",
    "target_type",
    "target_exam",
    "onboarding_step",
    "onboarding_completed",
    "avatar_url",
}


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    full_name: str | None = Field(default=None, max_length=120)
    state: str | None = None
    phone: str | None = Field(default=None, max_length=20)
    gender: str | None = None
    category: str | None = None
    pwbd_status: str | None = None
    domicile_state: str | None = None
    nationality: str | None = None
    ex_serviceman: bool | None = None
    service_years: int | None = Field(default=None, ge=0, le=40)
    govt_employee: bool | None = None
    date_of_birth: str | None = None
    dob: str | None = None
    graduation_year: int | None = Field(default=None, ge=1990, le=2035)
    qualification_year: int | None = Field(default=None, ge=1990, le=2035)
    qualification: str | None = None
    education_level: str | None = None
    stream: str | None = None
    percentage: float | None = Field(default=None, ge=0, le=100)
    cgpa: float | None = Field(default=None, ge=0, le=10)
    weekly_hours_goal: int | None = Field(default=None, ge=0, le=120)
    target_exam_year: int | None = Field(default=None, ge=2024, le=2040)
    goal_exams: list[str] | None = None
    career_stage: str | None = None
    career_goal: str | None = None
    target_type: str | None = None
    target_exam: str | None = None
    onboarding_step: int | None = Field(default=None, ge=0, le=10)
    onboarding_completed: bool | None = None
    onboarded: bool | None = None
    avatar_url: str | None = None
    preferred_states: list[str] | None = None
    preferred_sectors: list[str] | None = None
    willing_to_relocate: bool | None = None
    study_mode: str | None = None
    study_hours_per_day: float | None = Field(default=None, ge=0, le=24)


class CertificationIn(BaseModel):
    certification_name: str = Field(min_length=1, max_length=120)
    issuing_body: str | None = Field(default=None, max_length=120)
    year_completed: int | None = Field(default=None, ge=1950, le=2100)
    is_active: bool = True


class ExperienceIn(BaseModel):
    sector: str | None = None
    role: str | None = None
    organization: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    years_experience: float | None = Field(default=None, ge=0, le=80)


class ExamAttemptIn(BaseModel):
    exam_id: str
    attempts_used: int = Field(default=0, ge=0)


def _get_primary_education(supabase: Client, user_id: str) -> dict[str, Any]:
    rows = _safe(
        lambda: supabase.table("aspirant_education")
        .select("id, level, degree, stream, graduation_year, percentage, cgpa, is_completed")
        .eq("user_id", user_id)
        .order("is_completed", desc=True)
        .order("graduation_year", desc=True)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    return rows[0] if rows else {}


def _get_preferences(supabase: Client, user_id: str) -> dict[str, Any]:
    rows = _safe(
        lambda: supabase.table("aspirant_preferences")
        .select("target_exams, preferred_states, preferred_sectors, willing_to_relocate, study_mode, study_hours_per_day, languages_known, preferred_language")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    return rows[0] if rows else {}


def _get_location(supabase: Client, user_id: str) -> dict[str, Any]:
    rows = _safe(
        lambda: supabase.table("aspirant_location")
        .select("state, district, is_rural, domicile_certificate")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    return rows[0] if rows else {}


def _get_reservations(supabase: Client, user_id: str) -> dict[str, Any]:
    rows = _safe(
        lambda: supabase.table("aspirant_reservations")
        .select(
            "category, sub_category, is_pwd, pwd_type, disability_code, is_ex_serviceman, "
            "family_income_annual, ews_assets, ews_certificate_available"
        )
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    return rows[0] if rows else {}


def _count_certifications(supabase: Client, user_id: str) -> list[dict[str, Any]]:
    return _safe(
        lambda: supabase.table("aspirant_certifications")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
        .data,
        default=[],
    ) or []


def _count_experience(supabase: Client, user_id: str) -> list[dict[str, Any]]:
    return _safe(
        lambda: supabase.table("aspirant_experience")
        .select("id")
        .eq("user_id", user_id)
        .execute()
        .data,
        default=[],
    ) or []


def _count_exam_attempts(supabase: Client, user_id: str) -> list[dict[str, Any]]:
    return _safe(
        lambda: supabase.table("aspirant_exam_attempts")
        .select("id")
        .eq("user_id", user_id)
        .execute()
        .data,
        default=[],
    ) or []


def _upsert_user_scoped_row(supabase: Client, table: str, user_id: str, payload: dict[str, Any]) -> None:
    existing = _safe(
        lambda: supabase.table(table).select("user_id").eq("user_id", user_id).limit(1).execute().data,
        default=[],
    ) or []
    row = {"user_id": user_id, **payload}
    if existing:
        supabase.table(table).update(row).eq("user_id", user_id).execute()
    else:
        supabase.table(table).insert(row).execute()


def _assemble_profile_payload(
    profile: dict[str, Any],
    edu: dict[str, Any],
    prefs: dict[str, Any],
    location: dict[str, Any] | None = None,
    reservations: dict[str, Any] | None = None,
) -> dict[str, Any]:
    location = location or {}
    reservations = reservations or {}
    assembled = {k: v for k, v in profile.items() if k not in {"id"}}
    assembled["date_of_birth"] = assembled.get("date_of_birth") or assembled.get("dob")
    assembled["domicile_state"] = location.get("state") or assembled.get("domicile_state")
    assembled["state"] = assembled.get("domicile_state")
    assembled["category"] = reservations.get("category") or assembled.get("category")
    assembled["pwbd_status"] = (
        reservations.get("pwd_type")
        or reservations.get("disability_code")
        or assembled.get("pwbd_status")
    )
    if reservations.get("disability_code"):
        assembled["disability_code"] = reservations.get("disability_code")
    if reservations.get("is_ex_serviceman") is not None:
        assembled["ex_serviceman"] = reservations.get("is_ex_serviceman")
    if reservations.get("family_income_annual") is not None:
        assembled["family_income_annual"] = reservations.get("family_income_annual")
    if reservations.get("ews_assets") is not None:
        assembled["ews_assets"] = reservations.get("ews_assets")
    if reservations.get("ews_certificate_available") is not None:
        assembled["ews_certificate_available"] = reservations.get("ews_certificate_available")
    if not assembled.get("graduation_year"):
        assembled["graduation_year"] = edu.get("graduation_year")
    assembled["qualification"] = edu.get("degree") or edu.get("level") or assembled.get("qualification")
    # Progressive profile compatibility: expose normalized education row fields.
    assembled["education_level"] = edu.get("level") or assembled.get("education_level")
    assembled["stream"] = edu.get("stream") or assembled.get("stream")
    assembled["qualification_year"] = edu.get("graduation_year") or assembled.get("qualification_year")
    assembled["percentage"] = edu.get("percentage") if edu.get("percentage") is not None else assembled.get("percentage")
    assembled["cgpa"] = edu.get("cgpa") if edu.get("cgpa") is not None else assembled.get("cgpa")
    assembled["goal_exams"] = prefs.get("target_exams") or assembled.get("goal_exams") or []
    if prefs.get("study_hours_per_day") is not None:
        assembled["weekly_hours_goal"] = int(round(float(prefs.get("study_hours_per_day")) * 7))
    assembled["preferred_states"] = prefs.get("preferred_states") or []
    assembled["preferred_sectors"] = prefs.get("preferred_sectors") or []
    if prefs.get("willing_to_relocate") is not None:
        assembled["willing_to_relocate"] = prefs.get("willing_to_relocate")
    if prefs.get("study_mode"):
        assembled["study_mode"] = prefs.get("study_mode")
    assembled["languages_known"] = prefs.get("languages_known") or []
    if prefs.get("preferred_language"):
        assembled["preferred_language"] = prefs.get("preferred_language")
    return assembled


def _ensure_profile_row(supabase: Client, user_id: str, email: str | None) -> dict[str, Any]:
    rows = _safe(
        lambda: supabase.table("profiles").select(_PROFILE_COLS).eq("id", user_id).limit(1).execute().data,
        default=[],
    ) or []
    if rows:
        return rows[0]
    # First-time profile bootstrap.
    supabase.table("profiles").insert(
        {"id": user_id, "full_name": (email or "").split("@")[0] or "Aspirant"}
    ).execute()
    rows = _safe(
        lambda: supabase.table("profiles").select(_PROFILE_COLS).eq("id", user_id).limit(1).execute().data,
        default=[],
    ) or []
    return rows[0] if rows else {"id": user_id}


@router_profile.get("/me")
async def get_profile(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    profile = _ensure_profile_row(supabase, user["id"], user.get("email"))
    education = _get_primary_education(supabase, user["id"])
    prefs = _get_preferences(supabase, user["id"])
    location = _get_location(supabase, user["id"])
    reservations = _get_reservations(supabase, user["id"])
    assembled = _assemble_profile_payload(profile, education, prefs, location, reservations)
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": profile.get("full_name") or user.get("name"),
        "role": user.get("role"),
        "onboarded": bool(profile.get("onboarding_completed")),
        "plan": profile.get("plan_id") or "free",
        "avatar": profile.get("avatar_url"),
        "profile": assembled,
    }


@router_profile.put("/me")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    _ensure_profile_row(supabase, user["id"], user.get("email"))
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "name" in patch and "full_name" not in patch:
        patch["full_name"] = patch.pop("name")
    if "state" in patch and "domicile_state" not in patch:
        patch["domicile_state"] = patch.pop("state")
    if "onboarded" in patch and "onboarding_completed" not in patch:
        patch["onboarding_completed"] = patch.pop("onboarded")
    if "dob" in patch and "date_of_birth" not in patch:
        patch["date_of_birth"] = patch.pop("dob")
    else:
        patch.pop("dob", None)

    identity_patch = {k: v for k, v in patch.items() if k in _PROFILE_IDENTITY_FIELDS}
    if identity_patch:
        identity_patch.pop("dob", None)
        supabase.table("profiles").update(identity_patch).eq("id", user["id"]).execute()

    location_payload = {}
    if patch.get("domicile_state") is not None:
        location_payload["state"] = patch.get("domicile_state")
    if location_payload:
        _upsert_user_scoped_row(supabase, "aspirant_location", user["id"], location_payload)

    reservations_payload = {}
    if patch.get("category") is not None:
        reservations_payload["category"] = patch.get("category")
    if patch.get("pwbd_status") is not None:
        pwbd_status = patch.get("pwbd_status")
        reservations_payload["pwd_type"] = pwbd_status
        reservations_payload["is_pwd"] = bool(pwbd_status and pwbd_status != "none")
    if patch.get("ex_serviceman") is not None:
        reservations_payload["is_ex_serviceman"] = patch.get("ex_serviceman")
    if reservations_payload:
        _upsert_user_scoped_row(supabase, "aspirant_reservations", user["id"], reservations_payload)

    education_payload = {}
    if patch.get("qualification"):
        education_payload["degree"] = patch.get("qualification")
    if patch.get("education_level") is not None:
        education_payload["level"] = str(patch.get("education_level"))
    elif patch.get("qualification") and "level" not in education_payload:
        education_payload["level"] = str(patch.get("qualification"))
    if patch.get("stream") is not None:
        education_payload["stream"] = patch.get("stream")
    if patch.get("qualification_year") is not None:
        education_payload["graduation_year"] = patch.get("qualification_year")
    if patch.get("percentage") is not None:
        education_payload["percentage"] = patch.get("percentage")
    if patch.get("cgpa") is not None:
        education_payload["cgpa"] = patch.get("cgpa")
    if education_payload:
        education_payload["user_id"] = user["id"]
        education_payload.setdefault("is_completed", True)
        existing = _safe(
            lambda: supabase.table("aspirant_education")
            .select("id")
            .eq("user_id", user["id"])
            .order("graduation_year", desc=True)
            .limit(1)
            .execute()
            .data,
            default=[],
        ) or []
        if existing:
            supabase.table("aspirant_education").update(education_payload).eq("id", existing[0]["id"]).execute()
        else:
            supabase.table("aspirant_education").insert(education_payload).execute()

    preferences_payload = {}
    if patch.get("goal_exams") is not None:
        preferences_payload["target_exams"] = patch.get("goal_exams")
    if patch.get("preferred_states") is not None:
        preferences_payload["preferred_states"] = patch.get("preferred_states")
    if patch.get("preferred_sectors") is not None:
        preferences_payload["preferred_sectors"] = patch.get("preferred_sectors")
    if patch.get("willing_to_relocate") is not None:
        preferences_payload["willing_to_relocate"] = patch.get("willing_to_relocate")
    if patch.get("study_mode") is not None:
        preferences_payload["study_mode"] = patch.get("study_mode")
    if patch.get("study_hours_per_day") is not None:
        preferences_payload["study_hours_per_day"] = patch.get("study_hours_per_day")
    elif patch.get("weekly_hours_goal") is not None:
        preferences_payload["study_hours_per_day"] = round(float(patch.get("weekly_hours_goal")) / 7.0, 2)
    if preferences_payload:
        preferences_payload["user_id"] = user["id"]
        supabase.table("aspirant_preferences").upsert(preferences_payload, on_conflict="user_id").execute()
    changed_reasons: list[str] = []
    if any(k in patch for k in {"date_of_birth", "category", "pwbd_status", "domicile_state", "nationality", "ex_serviceman", "service_years", "govt_employee"}):
        changed_reasons.append("profile.identity_updated")
    if education_payload:
        changed_reasons.append("profile.education_updated")
    if preferences_payload:
        changed_reasons.append("profile.preferences_updated")
    if changed_reasons:
        enqueue_eligibility_recompute(supabase, user["id"], changed_reasons[-1], metadata={"reasons": changed_reasons})
    return await get_profile(user)


@router_profile.get("/completion")
async def profile_completion(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    # The eight reads below are independent; serialised they cost ~150 ms
    # × 8 ≈ 1.2 s of dashboard boot. Fan them out via to_thread + gather
    # so the supabase-py sync client overlaps on a worker pool and total
    # wall time drops to about one round-trip.
    uid = user["id"]
    email = user.get("email")
    (
        profile,
        education,
        prefs,
        location,
        reservations,
        certs,
        exp,
        attempts,
    ) = await asyncio.gather(
        asyncio.to_thread(_ensure_profile_row, supabase, uid, email),
        asyncio.to_thread(_get_primary_education, supabase, uid),
        asyncio.to_thread(_get_preferences, supabase, uid),
        asyncio.to_thread(_get_location, supabase, uid),
        asyncio.to_thread(_get_reservations, supabase, uid),
        asyncio.to_thread(_count_certifications, supabase, uid),
        asyncio.to_thread(_count_experience, supabase, uid),
        asyncio.to_thread(_count_exam_attempts, supabase, uid),
    )
    checks = {
        "identity_profile": {
            "fields": ["full_name", "phone", "date_of_birth", "category", "domicile_state"],
            "why_it_matters": "Identity and reservation context drives deterministic eligibility checks.",
            "next_action": "Add your personal and reservation basics.",
        },
        "education_profile": {
            "fields": ["qualification", "qualification_year"],
            "why_it_matters": "Education criteria is required for most post-level matching.",
            "next_action": "Add your highest completed qualification details.",
        },
        "preferences_profile": {
            "fields": ["goal_exams", "preferred_states"],
            "why_it_matters": "Preferences improve ranking and relevance of recommendations.",
            "next_action": "Select target exams and preferred states.",
        },
        "study_profile": {
            "fields": ["weekly_hours_goal"],
            "why_it_matters": "Study rhythm powers planning and backlog risk signals.",
            "next_action": "Set study rhythm and target outcome.",
        },
        "application_profile": {
            "fields": ["nationality", "govt_employee"],
            "why_it_matters": "Application-readiness fields reduce submission friction.",
            "next_action": "Complete application-readiness metadata.",
        },
    }
    assembled = _assemble_profile_payload(profile, education, prefs, location, reservations)
    out = {}
    for k, meta in checks.items():
        fields = meta["fields"]
        missing = [f for f in fields if not assembled.get(f)]
        out[k] = {
            "missing_fields": missing,
            "completion_pct": int(round(((len(fields) - len(missing)) / len(fields)) * 100)),
            "why_it_matters": meta["why_it_matters"],
            "next_action": meta["next_action"],
        }
    if (assembled.get("category") or "").lower() == "ews":
        missing_ews = []
        if reservations.get("family_income_annual") is None:
            missing_ews.append("family_income_annual")
        if reservations.get("ews_certificate_available") is None:
            missing_ews.append("ews_certificate_available")
        out["ews_profile"] = {
            "missing_fields": missing_ews,
            "completion_pct": 100 if not missing_ews else 0,
            "why_it_matters": "EWS details help distinguish declared category from verifiable EWS eligibility.",
            "next_action": "Complete EWS details." if missing_ews else "EWS details complete.",
            "warning": "EWS details incomplete" if missing_ews else None,
        }
    # Backward compatibility for next-actions engine.
    out["eligibility_profile"] = out["identity_profile"]
    out["certification_profile"] = {
        "completion_pct": 100 if certs else 0,
        "missing_fields": [] if certs else ["certification_name"],
        "why_it_matters": "Some recruitments require or prioritize certifications.",
        "next_action": "Add at least one active certification if applicable.",
    }
    out["experience_profile"] = {
        "completion_pct": 100 if exp else 0,
        "missing_fields": [] if exp else ["organization", "role"],
        "why_it_matters": "Experience can unlock role-specific eligibility filters.",
        "next_action": "Add a work experience row if you have relevant experience.",
    }
    out["attempts_profile"] = {
        "completion_pct": 100 if attempts else 0,
        "missing_fields": [] if attempts else ["exam_id", "attempts_used"],
        "why_it_matters": "Attempts help the engine enforce attempt-limit criteria.",
        "next_action": "Add exam attempts where limits are applicable.",
    }
    return out


@router_profile.get("/certifications")
async def list_certifications(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    rows = _safe(lambda: sb.table("aspirant_certifications").select("*").eq("user_id", user["id"]).order("year_completed", desc=True).execute().data, default=[]) or []
    return {"items": rows}


@router_profile.post("/certifications")
async def create_certification(body: CertificationIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    payload = {**body.model_dump(), "user_id": user["id"]}
    row = sb.table("aspirant_certifications").insert(payload).execute().data
    enqueue_eligibility_recompute(sb, user["id"], "profile.certification_created")
    return {"item": (row or [payload])[0]}


@router_profile.put("/certifications/{cid}")
async def update_certification(cid: str, body: CertificationIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    existing = _safe(lambda: sb.table("aspirant_certifications").select("id").eq("id", cid).eq("user_id", user["id"]).limit(1).execute().data, default=[]) or []
    if not existing:
        raise HTTPException(status_code=404, detail="Certification not found")
    row = sb.table("aspirant_certifications").update(body.model_dump()).eq("id", cid).eq("user_id", user["id"]).execute().data
    enqueue_eligibility_recompute(sb, user["id"], "profile.certification_updated")
    return {"item": (row or [{}])[0]}


@router_profile.delete("/certifications/{cid}")
async def delete_certification(cid: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    existing = _safe(lambda: sb.table("aspirant_certifications").select("id").eq("id", cid).eq("user_id", user["id"]).limit(1).execute().data, default=[]) or []
    if not existing:
        raise HTTPException(status_code=404, detail="Certification not found")
    sb.table("aspirant_certifications").update({"is_active": False}).eq("id", cid).eq("user_id", user["id"]).execute()
    enqueue_eligibility_recompute(sb, user["id"], "profile.certification_removed")
    return {"ok": True}


def _validate_date_order(start_date: str | None, end_date: str | None):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="end_date must be on/after start_date")


@router_profile.get("/experience")
async def list_experience(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    rows = _safe(lambda: sb.table("aspirant_experience").select("*").eq("user_id", user["id"]).order("start_date", desc=True).execute().data, default=[]) or []
    return {"items": rows}


@router_profile.post("/experience")
async def create_experience(body: ExperienceIn, user: dict = Depends(get_current_user)):
    _validate_date_order(body.start_date, body.end_date)
    sb = get_supabase_admin()
    payload = {**body.model_dump(), "user_id": user["id"]}
    row = sb.table("aspirant_experience").insert(payload).execute().data
    enqueue_eligibility_recompute(sb, user["id"], "profile.experience_created")
    return {"item": (row or [payload])[0]}


@router_profile.put("/experience/{eid}")
async def update_experience(eid: str, body: ExperienceIn, user: dict = Depends(get_current_user)):
    _validate_date_order(body.start_date, body.end_date)
    sb = get_supabase_admin()
    existing = _safe(lambda: sb.table("aspirant_experience").select("id").eq("id", eid).eq("user_id", user["id"]).limit(1).execute().data, default=[]) or []
    if not existing:
        raise HTTPException(status_code=404, detail="Experience not found")
    row = sb.table("aspirant_experience").update(body.model_dump()).eq("id", eid).eq("user_id", user["id"]).execute().data
    enqueue_eligibility_recompute(sb, user["id"], "profile.experience_updated")
    return {"item": (row or [{}])[0]}


@router_profile.delete("/experience/{eid}")
async def delete_experience(eid: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    existing = _safe(lambda: sb.table("aspirant_experience").select("id").eq("id", eid).eq("user_id", user["id"]).limit(1).execute().data, default=[]) or []
    if not existing:
        raise HTTPException(status_code=404, detail="Experience not found")
    sb.table("aspirant_experience").delete().eq("id", eid).eq("user_id", user["id"]).execute()
    enqueue_eligibility_recompute(sb, user["id"], "profile.experience_removed")
    return {"ok": True}


@router_profile.get("/exam-attempts")
async def list_exam_attempts(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    rows = _safe(lambda: sb.table("aspirant_exam_attempts").select("*").eq("user_id", user["id"]).order("attempts_used", desc=True).execute().data, default=[]) or []
    return {"items": rows}


def _resolve_exam_ref_id(supabase: Client, raw: Any) -> str | None:
    """Resolve an inbound exam identifier (slug or uuid) to ``exams.id``.

    The Profile UI used to write whatever free-form text the user typed
    into the legacy ``aspirant_exam_attempts.exam_id`` column. The
    eligibility engine matches on ``exam_ref_id`` (uuid FK to
    ``exams.id``), so unresolved text never participated and DB inserts
    that looked like UUIDs but weren't crashed with 500s. Resolve up
    front: accept either a UUID we can confirm in ``exams`` or a slug
    we can look up, otherwise return ``None`` so the caller can 422.
    """
    if not isinstance(raw, str):
        return None
    candidate = raw.strip()
    if not candidate:
        return None
    try:
        UUID(candidate)
    except (ValueError, AttributeError, TypeError):
        rows = _safe(
            lambda: supabase.table("exams").select("id").eq("slug", candidate).limit(1).execute().data,
            default=[],
        ) or []
        return rows[0]["id"] if rows else None
    rows = _safe(
        lambda: supabase.table("exams").select("id").eq("id", candidate).limit(1).execute().data,
        default=[],
    ) or []
    return rows[0]["id"] if rows else None


@router_profile.post("/exam-attempts")
async def create_exam_attempt(body: ExamAttemptIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    exam_ref_id = _resolve_exam_ref_id(sb, body.exam_id)
    if not exam_ref_id:
        raise HTTPException(status_code=422, detail=f"Unknown exam: {body.exam_id!r}")
    payload = {
        "user_id": user["id"],
        "exam_ref_id": exam_ref_id,
        "attempts_used": body.attempts_used,
    }
    row = sb.table("aspirant_exam_attempts").insert(payload).execute().data
    enqueue_eligibility_recompute(sb, user["id"], "profile.attempt_created")
    return {"item": (row or [payload])[0]}


@router_profile.put("/exam-attempts/{aid}")
async def update_exam_attempt(aid: str, body: ExamAttemptIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    existing = _safe(lambda: sb.table("aspirant_exam_attempts").select("id").eq("id", aid).eq("user_id", user["id"]).limit(1).execute().data, default=[]) or []
    if not existing:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    exam_ref_id = _resolve_exam_ref_id(sb, body.exam_id)
    if not exam_ref_id:
        raise HTTPException(status_code=422, detail=f"Unknown exam: {body.exam_id!r}")
    update_payload = {"exam_ref_id": exam_ref_id, "attempts_used": body.attempts_used}
    row = sb.table("aspirant_exam_attempts").update(update_payload).eq("id", aid).eq("user_id", user["id"]).execute().data
    enqueue_eligibility_recompute(sb, user["id"], "profile.attempt_updated")
    return {"item": (row or [{}])[0]}


@router_profile.delete("/exam-attempts/{aid}")
async def delete_exam_attempt(aid: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    existing = _safe(lambda: sb.table("aspirant_exam_attempts").select("id").eq("id", aid).eq("user_id", user["id"]).limit(1).execute().data, default=[]) or []
    if not existing:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    sb.table("aspirant_exam_attempts").delete().eq("id", aid).eq("user_id", user["id"]).execute()
    enqueue_eligibility_recompute(sb, user["id"], "profile.attempt_removed")
    return {"ok": True}


@router_profile.post("/recompute-eligibility")
async def enqueue_recompute(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    row = enqueue_eligibility_recompute(sb, user["id"], "manual.profile_recompute")
    return {"item": row, "status": row.get("status", "pending")}


@router_profile.get("/eligibility-input/me")
async def eligibility_input_me(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    return build_user_eligibility_profile(sb, user["id"]).model_dump()


# ════════════════════════════════════════════════════════════════════════════
#  TRACKER (user_recruitment_applications)
# ════════════════════════════════════════════════════════════════════════════

router_tracker = APIRouter(prefix="/tracker", tags=["tracker"])


class TrackerCreate(BaseModel):
    recruitment_id: str | None = None
    recruitment_slug: str | None = None
    stage: str = "saved"  # → maps to application_status enum
    note: str | None = None


class ApplicationUpsert(BaseModel):
    status: str | None = None
    application_number: str | None = None
    fee_paid: bool | None = None
    fee_amount: float | None = Field(default=None, ge=0)
    documents_pending: list[str] | None = None
    notes: str | None = None
    submitted_at: str | None = None
    clicked_apply_at: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        allowed = {"not_started", "opened", "in_progress", "submitted", "skipped", "not_applicable"}
        if v not in allowed:
            raise ValueError("Invalid status")
        return v


_STAGE_TO_STATUS: dict[str, str] = {
    # UI stage label  →  application_status enum (migration 031).
    "saved": "not_started",
    "interested": "not_started",
    "opened": "opened",
    "started": "in_progress",
    "in_progress": "in_progress",
    "applied": "submitted",
    "submitted": "submitted",
    "skipped": "skipped",
    "not_applicable": "not_applicable",
}


_STATUS_TO_STAGE = {
    "not_started": "saved",
    "opened": "opened",
    "in_progress": "started",
    "submitted": "applied",
    "skipped": "skipped",
    "not_applicable": "not_applicable",
}


def _shape_tracker(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "recruitment_id": row.get("recruitment_id"),
        "stage": _STATUS_TO_STAGE.get(row.get("status") or "", row.get("status") or "saved"),
        "fee_paid": row.get("fee_paid"),
        "application_number": row.get("application_number"),
        "note": row.get("notes"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "submitted_at": row.get("submitted_at"),
    }


@router_tracker.get("")
async def list_tracker(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("user_recruitment_applications")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
        .data,
        default=[],
    ) or []
    return {"items": [_shape_tracker(r) for r in rows]}


@router_tracker.post("")
async def add_tracker(body: TrackerCreate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    rec_id = body.recruitment_id or (
        _resolve_rec_id(supabase, body.recruitment_slug) if body.recruitment_slug else None
    )
    if not rec_id:
        raise HTTPException(status_code=400, detail="recruitment_id or recruitment_slug required")
    payload = {
        "user_id": user["id"],
        "recruitment_id": rec_id,
        "status": _STAGE_TO_STATUS.get(body.stage, "not_started"),
        "notes": body.note,
    }
    inserted = (
        supabase.table("user_recruitment_applications").insert(payload).execute().data or []
    )
    return _shape_tracker(inserted[0]) if inserted else payload


@router_tracker.put("/{item_id}")
async def update_tracker(
    item_id: str, body: TrackerCreate, user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    patch: dict[str, Any] = {"updated_at": _now_iso()}
    if body.stage:
        patch["status"] = _STAGE_TO_STATUS.get(body.stage, "not_started")
    if body.note is not None:
        patch["notes"] = body.note
    res = (
        supabase.table("user_recruitment_applications")
        .update(patch)
        .eq("id", item_id)
        .eq("user_id", user["id"])
        .execute()
        .data
        or []
    )
    if not res:
        raise HTTPException(status_code=404, detail="Tracker item not found")
    return _shape_tracker(res[0])


@router_tracker.delete("/{item_id}")
async def delete_tracker(item_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    supabase.table("user_recruitment_applications").delete().eq("id", item_id).eq(
        "user_id", user["id"]
    ).execute()
    return {"ok": True}


router_applications = APIRouter(prefix="/applications", tags=["applications"])


@router_applications.get("/me")
async def my_applications(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("user_recruitment_applications")
        .select("id,recruitment_id,status,application_number,fee_paid,fee_amount,documents_pending,notes,submitted_at,clicked_apply_at,updated_at,recruitment:recruitments(id,slug,name,apply_end_date,official_notification_url,organizations(id,name,type,state))")
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .execute()
        .data,
        default=[],
    ) or []
    items = []
    for row in rows:
        rec = row.get("recruitment") or {}
        org = rec.get("organizations") or {}
        if isinstance(org, list):
            org = org[0] if org else {}
        rec["organization"] = org.get("name")
        rec["organization_code"] = (org.get("name") or "").split()[0][:6].upper() if org.get("name") else None
        rec["notification_url"] = rec.get("official_notification_url")
        row["recruitment"] = rec
        items.append(row)
    return {"items": items}


@router_applications.put("/{recruitment_id}")
async def upsert_application(recruitment_id: str, body: ApplicationUpsert, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    payload = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if body.status:
        payload["status"] = body.status
    payload["updated_at"] = _now_iso()
    existing = _safe(lambda: supabase.table("user_recruitment_applications").select("id").eq("user_id", user["id"]).eq("recruitment_id", recruitment_id).limit(1).execute().data, default=[]) or []
    if existing:
        rows = supabase.table("user_recruitment_applications").update(payload).eq("id", existing[0]["id"]).eq("user_id", user["id"]).execute().data or []
    else:
        rows = supabase.table("user_recruitment_applications").insert({"user_id": user["id"], "recruitment_id": recruitment_id, "status": body.status or "not_started", **payload}).execute().data or []
    return rows[0] if rows else {"ok": True}


@router_applications.post("/{recruitment_id}/clicked-apply")
async def clicked_apply(recruitment_id: str, user: dict = Depends(get_current_user)):
    return await upsert_application(
        recruitment_id,
        ApplicationUpsert(clicked_apply_at=_now_iso()),
        user,
    )


router_recommendations = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _days_until(d: str | None) -> int | None:
    if not d:
        return None
    try:
        return (date.fromisoformat(str(d)) - date.today()).days
    except Exception:
        return None


def _profile_gaps(profile: dict[str, Any]) -> list[str]:
    return [k for k in ("date_of_birth", "category", "graduation_year") if not profile.get(k)]


def _rank_recruitment(
    recruitment: dict[str, Any],
    profile: dict[str, Any],
    eligibility: dict[str, Any],
    application: dict[str, Any] | None,
    backlog_high: bool,
) -> dict[str, Any]:
    # TODO(P1.5-B): add PwBD readiness scoring once normalized backend fields are available.
    # TODO(P1.5-B): add education readiness scoring parity with full eligibility profile readiness.
    # TODO(P1.5-B): add weekly_hours_goal capacity parity (currently backlog risk only).
    # TODO(P1.5-B): tighten preferred sector/state normalization parity with frontend fallback heuristics.
    score = 0
    reasons: list[str] = []
    risks: list[str] = []
    missing = _profile_gaps(profile)
    deadline_days = _days_until(recruitment.get("apply_end_date"))
    start_days = _days_until(recruitment.get("apply_start_date"))
    window_closed = deadline_days is not None and deadline_days < 0
    window_not_started = start_days is not None and start_days > 0
    deadline_near = deadline_days is not None and 0 <= deadline_days <= 3
    submitted = bool(application and application.get("submitted_at"))
    clicked = bool(application and application.get("clicked_apply_at"))
    app_status = (application or {}).get("status") or "not_started"
    has_eligibility = bool(eligibility.get("eligible"))
    conditional = bool(eligibility.get("conditional"))

    if has_eligibility:
        score += 30
        reasons.append("Deterministic eligibility confirmed")
    elif conditional:
        score += 10
        reasons.append("Eligibility has conditional checks")
        risks.append("Eligibility is conditional")
    else:
        risks.append("Eligibility not confirmed yet")
    if missing:
        score -= 20
        risks.append(f"Missing profile fields: {', '.join(missing[:2])}")
    if recruitment.get("saved") or application:
        score += 6
        reasons.append("Already saved/tracked")
    if not submitted and deadline_near:
        score += 10
        reasons.append("Deadline approaching")
        risks.append("Deadline is near")
    if window_closed and not submitted:
        score -= 40
        risks.append("Application window closed")
    if clicked and not submitted:
        score += 8
        reasons.append("Application started")
    if submitted:
        score += 12
        reasons.append("Application submitted")
    if backlog_high:
        score -= 8
        risks.append("High study backlog risk")

    stage = "check_eligibility"
    next_action = "Verify deterministic eligibility status before applying."
    if window_closed and not submitted:
        stage = "closed"
        next_action = "Application window closed. Track future cycles."
    elif missing:
        stage = "complete_profile"
        next_action = f"Complete profile fields: {', '.join(missing)}."
    elif not has_eligibility:
        stage = "check_eligibility"
    elif submitted:
        if window_closed:
            stage = "monitor_result"
            next_action = "Recover backlog while monitoring result notifications." if backlog_high else "Monitor result updates and keep revision steady."
        else:
            stage = "prepare_after_submission"
            next_action = "Recover backlog first, then continue exam preparation." if backlog_high else "Shift from application to preparation strategy."
    elif clicked:
        stage = "continue_application"
        next_action = "Complete or update your application status."
    elif app_status == "in_progress":
        stage = "submit_form"
        next_action = "Submit form now — deadline is near." if deadline_near else "Complete and submit your form early."
    elif window_not_started:
        stage = "low_priority"
        next_action = "Application window not open yet. Set a reminder for start date."
    else:
        stage = "apply_now"
        next_action = "Apply now — deadline is near." if deadline_near else "Proceed to application and submit early."

    return {
        "recruitment_id": recruitment.get("id"),
        "slug": recruitment.get("slug"),
        "name": recruitment.get("name"),
        "organization": recruitment.get("organization"),
        "apply_start_date": recruitment.get("apply_window", {}).get("open"),
        "apply_end_date": recruitment.get("apply_window", {}).get("close"),
        "match_score": max(0, min(100, score)),
        "match_reasons": reasons,
        "risk_flags": risks,
        "next_action": next_action,
        "recommendation_stage": stage,
    }


@router_recommendations.get("/me")
async def my_recommendations(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    # All five top-level reads are independent — fire them concurrently.
    # The two async helpers (`list_recruitments`, `get_profile`,
    # `weekly_review`) compose multiple supabase reads each, and the two
    # sync helpers are pushed onto worker threads so they overlap with
    # the async helpers' own I/O. Result shape unchanged.
    rec_data, profile, eligibility, app_rows, review = await asyncio.gather(
        list_recruitments(user=user),
        get_profile(user),
        asyncio.to_thread(_eligibility_summary, supabase, user["id"]),
        asyncio.to_thread(
            lambda: _safe(
                lambda: supabase.table("user_recruitment_applications")
                .select("recruitment_id,status,submitted_at,clicked_apply_at")
                .eq("user_id", user["id"])
                .execute()
                .data,
                default=[],
            )
            or []
        ),
        weekly_review(user),
    )
    rec_items = rec_data.get("items", [])
    app_by_rec = {a["recruitment_id"]: a for a in app_rows}
    backlog_high = (review.get("backlog_count", 0) or 0) > 3 or (review.get("missed_tasks", 0) or 0) > 3

    ranked = [
        _rank_recruitment(
            recruitment=r,
            profile=profile,
            eligibility=eligibility.get(r.get("id"), {"eligible": False, "conditional": False}),
            application=app_by_rec.get(r.get("id")),
            backlog_high=backlog_high,
        )
        for r in rec_items
    ]
    ranked.sort(key=lambda x: x["match_score"], reverse=True)
    stage_counts = {
        "apply_now": 0,
        "continue_application": 0,
        "prepare_after_submission": 0,
        "complete_profile": 0,
        "check_eligibility": 0,
        "closed": 0,
        "low_priority": 0,
    }
    for r in ranked:
        if r["recommendation_stage"] in stage_counts:
            stage_counts[r["recommendation_stage"]] += 1
    return {"items": ranked, "counts": stage_counts}


# ════════════════════════════════════════════════════════════════════════════
#  COMMUNITY / FORUM (forum_categories + forum_posts + forum_comments)
# ════════════════════════════════════════════════════════════════════════════

router_community = APIRouter(prefix="/community", tags=["community"])


@router_community.get("/categories")
async def categories():
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("forum_categories")
        .select("id, slug, name, description, exam_tag, post_count, icon, color")
        .eq("is_active", True)
        .order("order_index")
        .execute()
        .data,
        default=[],
    ) or []
    return {
        "items": [
            {
                "id": r.get("slug") or r.get("id"),
                "label": r.get("name"),
                "description": r.get("description"),
                "exam_tag": r.get("exam_tag"),
                "count": r.get("post_count") or 0,
                "icon": r.get("icon"),
                "color": r.get("color"),
            }
            for r in rows
        ]
    }


# NOTE: GET /community/spaces previously lived here as a reference-snapshot
# fallback. The real DB-backed handler in ``app/api/community_runtime.py``
# wins at runtime via router precedence; this duplicate has been removed
# in the Phase 5 follow-up cleanup. The snapshot data still lives in
# ``frontend/src/features/community/data.js`` so the UI degrades
# gracefully if the runtime endpoint is unavailable.


def _shape_thread(row: dict[str, Any], with_body: bool = False) -> dict[str, Any]:
    body = row.get("body") or ""
    out = {
        "id": row.get("id"),
        "slug": row.get("id"),  # forum_posts uses uuid as routing key
        "category": (row.get("forum_categories") or {}).get("slug")
        if isinstance(row.get("forum_categories"), dict)
        else None,
        "title": row.get("title"),
        "author": (row.get("profiles") or {}).get("full_name")
        if isinstance(row.get("profiles"), dict)
        else None,
        "pinned": bool(row.get("is_pinned")),
        "votes": row.get("upvote_count") or 0,
        "replies_count": row.get("reply_count") or 0,
        "tag": (row.get("exam_tags") or [None])[0],
        "created_at": row.get("created_at"),
    }
    if with_body:
        out["body"] = body
    else:
        out["excerpt"] = body if len(body) < 200 else body[:200] + "…"
    return out


@router_community.get("/threads")
async def list_threads(
    category: str | None = Query(default=None),
    sort: str = Query(default="hot"),
):
    supabase = get_supabase_admin()
    cat_id: str | None = None
    if category:
        cat_rows = _safe(
            lambda: supabase.table("forum_categories")
            .select("id")
            .eq("slug", category)
            .limit(1)
            .execute()
            .data,
            default=[],
        ) or []
        if cat_rows:
            cat_id = cat_rows[0]["id"]

    q = supabase.table("forum_posts").select(
        "id, title, body, exam_tags, is_pinned, upvote_count, reply_count, created_at, "
        "forum_categories ( slug, name ), profiles!forum_posts_user_id_fkey ( full_name )"
    )
    if cat_id:
        q = q.eq("category_id", cat_id)
    if sort == "unanswered":
        q = q.eq("reply_count", 0)
    if sort == "new":
        q = q.order("is_pinned", desc=True).order("created_at", desc=True)
    else:  # hot / default
        q = q.order("is_pinned", desc=True).order("upvote_count", desc=True)

    rows = _safe(lambda: q.limit(50).execute().data, default=[]) or []
    return {"items": [_shape_thread(r) for r in rows]}


@router_community.get("/threads/{post_id}")
async def thread_detail(post_id: str):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("forum_posts")
        .select(
            "id, title, body, exam_tags, is_pinned, upvote_count, reply_count, created_at, "
            "forum_categories ( slug, name ), profiles!forum_posts_user_id_fkey ( full_name )"
        )
        .eq("id", post_id)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread = _shape_thread(rows[0], with_body=True)

    posts = _safe(
        lambda: supabase.table("forum_comments")
        .select("id, body, upvote_count, is_accepted, created_at, profiles!forum_comments_user_id_fkey ( full_name )")
        .eq("post_id", post_id)
        .order("created_at")
        .execute()
        .data,
        default=[],
    ) or []
    return {
        "thread": thread,
        "posts": [
            {
                "id": p["id"],
                "author": (p.get("profiles") or {}).get("full_name") if isinstance(p.get("profiles"), dict) else None,
                "body": p.get("body"),
                "votes": p.get("upvote_count") or 0,
                "accepted": bool(p.get("is_accepted")),
                "created_at": p.get("created_at"),
            }
            for p in posts
        ],
    }


class ThreadCreate(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    category: str
    body: str = Field(min_length=10, max_length=4000)
    tag: str | None = Field(default=None, max_length=24)


@router_community.post("/threads")
async def create_thread(body: ThreadCreate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    cat_rows = _safe(
        lambda: supabase.table("forum_categories")
        .select("id")
        .eq("slug", body.category)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not cat_rows:
        raise HTTPException(status_code=400, detail="Invalid category")
    inserted = (
        supabase.table("forum_posts")
        .insert(
            {
                "user_id": user["id"],
                "category_id": cat_rows[0]["id"],
                "title": body.title.strip(),
                "body": body.body,
                "exam_tags": [body.tag] if body.tag else [],
            }
        )
        .execute()
        .data
        or []
    )
    return _shape_thread(inserted[0], with_body=True) if inserted else {}


class PostCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router_community.post("/threads/{post_id}/posts")
async def add_comment(post_id: str, body: PostCreate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    inserted = (
        supabase.table("forum_comments")
        .insert({"post_id": post_id, "user_id": user["id"], "body": body.body})
        .execute()
        .data
        or []
    )
    if inserted:
        # Best-effort reply_count increment.
        _safe(
            lambda: supabase.rpc(
                "increment_forum_post_reply_count", {"post_id": post_id}
            ).execute(),
            default=None,
        )
    p = inserted[0] if inserted else {}
    return {
        "id": p.get("id"),
        "author": user.get("name") or user.get("email"),
        "body": p.get("body"),
        "votes": 0,
        "created_at": p.get("created_at"),
    }


@router_community.post("/threads/{post_id}/vote")
async def vote_thread(post_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    existing = _safe(
        lambda: supabase.table("forum_post_upvotes")
        .select("post_id")
        .eq("post_id", post_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if existing:
        supabase.table("forum_post_upvotes").delete().eq("post_id", post_id).eq(
            "user_id", user["id"]
        ).execute()
        return {"voted": False}
    _safe(
        lambda: supabase.table("forum_post_upvotes")
        .insert({"post_id": post_id, "user_id": user["id"]})
        .execute(),
        default=None,
    )
    return {"voted": True}


# ════════════════════════════════════════════════════════════════════════════
#  MARKETPLACE (courses)
# ════════════════════════════════════════════════════════════════════════════

# Marketplace routes moved to app/api/marketplace.py (PR1).
# Keep the helper around if other modules ever imported it; nothing here mounts.



# ════════════════════════════════════════════════════════════════════════════
#  STUDY OS (study_plans + study_tasks + study_sessions + mock_tests)
# ════════════════════════════════════════════════════════════════════════════

router_study = APIRouter(prefix="/study", tags=["study"])
router_metadata = APIRouter(prefix="/metadata", tags=["metadata"])


def _ensure_active_plan(supabase: Client, user_id: str) -> str | None:
    rows = _safe(
        lambda: supabase.table("study_plans")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if rows:
        return rows[0]["id"]
    return None


@router_study.get("/plan")
async def get_plan(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    today = datetime.now(timezone.utc).date().isoformat()
    plan_id = _ensure_active_plan(supabase, user["id"])
    if not plan_id:
        return {"date": today, "plan": None, "tasks": []}
    tasks = _safe(
        lambda: supabase.table("study_tasks")
        .select("id, day_label, subject, topic, microtopic, task_type, title, duration_mins, status, completed_at")
        .eq("plan_id", plan_id)
        .order("day_label")
        .execute()
        .data,
        default=[],
    ) or []
    out_tasks = [{"id": t.get("id"), "title": t.get("title") or t.get("topic") or t.get("subject"), "time": t.get("day_label") or "Today", "duration": t.get("duration_mins"), "done": t.get("status") == "completed", "status": t.get("status") or "planned"} for t in tasks]
    return {"date": today, "plan": {"id": plan_id, "theme": "Adaptive weekly plan", "target": "Complete planned blocks", "day": None}, "tasks": out_tasks}


class PlanToggle(BaseModel):
    task_id: str
    status: str | None = None


TASK_STATES = {"planned", "in_progress", "completed", "skipped", "missed", "rescheduled", "carried_forward"}


@router_study.post("/plan/toggle")
async def toggle_task(body: PlanToggle, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("study_tasks").select("status").eq("id", body.task_id).limit(1).execute().data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    new_status = "completed" if rows[0].get("status") != "completed" else "pending"
    patch = {"status": new_status, "completed_at": _now_iso() if new_status == "completed" else None}
    supabase.table("study_tasks").update(patch).eq("id", body.task_id).execute()
    return {"id": body.task_id, "done": new_status == "completed"}


class TaskPatch(BaseModel):
    status: str | None = None
    scheduled_date: str | None = None
    day_label: str | None = None


@router_study.put("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskPatch, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if patch.get("status") and patch["status"] not in TASK_STATES:
        raise HTTPException(status_code=400, detail="Invalid task status")
    if patch.get("status") == "completed":
        patch["completed_at"] = _now_iso()
    patch["updated_at"] = _now_iso()
    rows = supabase.table("study_tasks").update(patch).eq("id", task_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    return rows[0]


@router_study.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str, user: dict = Depends(get_current_user)):
    return await update_task(task_id, TaskPatch(status="completed"), user)


@router_study.post("/tasks/{task_id}/skip")
async def skip_task(task_id: str, user: dict = Depends(get_current_user)):
    return await update_task(task_id, TaskPatch(status="skipped"), user)


class RescheduleBody(BaseModel):
    scheduled_date: str | None = None
    day_label: str | None = None


@router_study.post("/tasks/{task_id}/reschedule")
async def reschedule_task(task_id: str, body: RescheduleBody, user: dict = Depends(get_current_user)):
    return await update_task(task_id, TaskPatch(status="rescheduled", scheduled_date=body.scheduled_date, day_label=body.day_label), user)


@router_study.post("/tasks/carry-forward")
async def carry_forward_tasks(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    today = datetime.now(timezone.utc).date().isoformat()
    plan_id = _ensure_active_plan(supabase, user["id"])
    if not plan_id:
        return {"updated": 0}
    rows = supabase.table("study_tasks").select("id").eq("plan_id", plan_id).lt("scheduled_date", today).in_("status", ["planned", "in_progress", "missed"]).execute().data or []
    updated = 0
    for r in rows:
        supabase.table("study_tasks").update({"status": "carried_forward", "scheduled_date": today, "day_label": "Today", "updated_at": _now_iso()}).eq("id", r["id"]).execute()
        updated += 1
    return {"updated": updated}


class FocusStart(BaseModel):
    duration_minutes: int = Field(default=25, ge=5, le=180)
    subject: str | None = None
    topic: str | None = None


@router_study.post("/focus/start")
async def focus_start(body: FocusStart, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    inserted = (
        supabase.table("study_sessions")
        .insert(
            {
                "user_id": user["id"],
                "session_type": "focus",
                "subject": body.subject,
                "topic": body.topic,
                "duration_mins": body.duration_minutes,
                "started_at": _now_iso(),
            }
        )
        .execute()
        .data
        or []
    )
    return inserted[0] if inserted else {}


class FocusStop(BaseModel):
    session_id: str | None = None
    notes: str | None = None


@router_study.post("/focus/stop")
async def focus_stop(body: FocusStop = FocusStop(), user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    if body.session_id:
        sid = body.session_id
    else:
        rows = _safe(
            lambda: supabase.table("study_sessions")
            .select("id")
            .eq("user_id", user["id"])
            .is_("ended_at", "null")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
            .data,
            default=[],
        ) or []
        if not rows:
            raise HTTPException(status_code=400, detail="No active focus session")
        sid = rows[0]["id"]
    res = (
        supabase.table("study_sessions")
        .update({"ended_at": _now_iso(), "notes": body.notes})
        .eq("id", sid)
        .execute()
        .data
        or []
    )
    return res[0] if res else {"id": sid, "ended_at": _now_iso()}


@router_study.get("/focus/summary")
async def focus_summary(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    sessions = _safe(
        lambda: supabase.table("study_sessions")
        .select("id, subject, topic, duration_mins, started_at, ended_at")
        .eq("user_id", user["id"])
        .order("started_at", desc=True)
        .limit(50)
        .execute()
        .data,
        default=[],
    ) or []
    completed = [s for s in sessions if s.get("ended_at")]
    active = next((s for s in sessions if not s.get("ended_at")), None)
    total_minutes = sum((s.get("duration_mins") or 0) for s in completed)
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    week = []
    for i in range(6,-1,-1):
        d = today - timedelta(days=i)
        mins = sum((s.get("duration_mins") or 0) for s in completed if str(s.get("started_at", "")).startswith(d.isoformat()))
        week.append({"date": d.isoformat(), "minutes": mins})
    return {
        "active": active,
        "completed": completed[:10],
        "total_minutes": total_minutes,
        "streak_days": min(7, len({s.get("started_at", "")[:10] for s in completed})),
        "total_hours_7d": round(sum(x["minutes"] for x in week)/60, 2),
        "week": week,
    }


class MockTopicBreakdown(BaseModel):
    topic_id: str
    subject_id: str | None = None
    total_questions: int | None = None
    correct_answers: int | None = None
    wrong_answers: int | None = None
    skipped_questions: int | None = None
    marks: float | None = None
    avg_time_sec: float | None = None
    # {error_type: count}, e.g. {"careless": 2, "concept_gap": 1}
    error_types: dict[str, int] | None = None


# NOTE: GET/POST /mocks and the MockEntry body model previously lived here
# but were duplicated by app/api/study_os.py with different semantics.
# study_os.py won at runtime via router precedence in server.py. Phase 5
# of the admin Study OS ops layer removes the duplicates from canonical.py
# so the single owner is study_os.py. ``_mock_breakdown_row`` is kept —
# review_mock below still uses it.


def _mock_breakdown_row(mock_test_id: str, b: "MockTopicBreakdown") -> dict[str, Any]:
    correct = b.correct_answers
    wrong = b.wrong_answers
    accuracy = None
    if correct is not None and wrong is not None and (correct + wrong) > 0:
        accuracy = round(correct / (correct + wrong) * 100, 2)
    row: dict[str, Any] = {
        "mock_test_id": mock_test_id,
        "topic_id": b.topic_id,
        "subject_id": b.subject_id,
        "total_questions": b.total_questions,
        "correct_answers": correct,
        "wrong_answers": wrong,
        "skipped_questions": b.skipped_questions,
        "marks": b.marks,
        "accuracy": accuracy,
        "avg_time_sec": b.avg_time_sec,
        "error_types": b.error_types or {},
    }
    return {k: v for k, v in row.items() if v is not None}


# NOTE: POST /mocks previously lived here but was a duplicate of
# app/api/study_os.py. study_os.py won at runtime via router precedence
# in server.py. Phase 5 removes the canonical.py duplicate; study_os.py
# is the single owner.


class MockReviewBody(BaseModel):
    """Server-backed mock-review state with optional per-topic results.

    The fields mirror the prototype mock-review surface — a reviewer can
    log overall totals, per-topic accuracy, error-type tags and free-form
    notes in one call. ``review_status`` moves a mock through
    ``unreviewed → reviewed → correction``.
    """

    review_status: str = Field(default="reviewed", pattern="^(unreviewed|reviewed|correction)$")
    total_questions: int | None = None
    correct_answers: int | None = None
    wrong_answers: int | None = None
    skipped_questions: int | None = None
    avg_time_sec: float | None = None
    error_types: dict[str, int] | None = None
    notes: str | None = None
    topic_breakdowns: list[MockTopicBreakdown] | None = None


def _aggregate_error_types(breakdowns: list[MockTopicBreakdown] | None) -> dict[str, int]:
    out: dict[str, int] = {}
    for b in breakdowns or []:
        for k, v in (b.error_types or {}).items():
            try:
                out[k] = out.get(k, 0) + int(v)
            except (TypeError, ValueError):
                continue
    return out


@router_study.post("/mocks/{mock_id}/review")
async def review_mock(
    mock_id: str,
    body: MockReviewBody,
    user: dict = Depends(get_current_user),
):
    """Persist a server-backed mock review.

    Writes the review state and aggregated error-type tags onto the mock
    row, replaces any prior per-topic breakdowns for this mock with the
    submitted set, recomputes the user's topic mastery, and fires a
    best-effort plan regeneration so the next study day reflects the
    review. Idempotent — calling it twice with the same body produces the
    same final state.
    """
    supabase = get_supabase_admin()
    # ownership check — mock ids must not be probable across users
    existing = _safe(
        lambda: supabase.table("mock_tests").select("id, user_id").eq("id", mock_id).limit(1).execute().data,
        default=[],
    ) or []
    if not existing or existing[0].get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Mock not found")

    aggregated_error_types = (
        body.error_types or _aggregate_error_types(body.topic_breakdowns) or None
    )
    patch: dict[str, Any] = {
        "review_status": body.review_status,
        "reviewed_at": _now_iso() if body.review_status != "unreviewed" else None,
        "total_questions": body.total_questions,
        "correct_answers": body.correct_answers,
        "wrong_answers": body.wrong_answers,
        "skipped_questions": body.skipped_questions,
        "avg_time_sec": body.avg_time_sec,
        "error_types": aggregated_error_types,
        "notes": body.notes,
        "updated_at": _now_iso(),
    }
    patch = {k: v for k, v in patch.items() if v is not None}

    _safe(lambda: supabase.table("mock_tests").update(patch).eq("id", mock_id).execute())

    if body.topic_breakdowns:
        # idempotency: clear any previous breakdowns for this mock first
        _safe(
            lambda: supabase.table("mock_topic_breakdowns").delete().eq("mock_test_id", mock_id).execute()
        )
        rows = [_mock_breakdown_row(mock_id, b) for b in body.topic_breakdowns]
        if rows:
            _safe(lambda: supabase.table("mock_topic_breakdowns").insert(rows).execute())
        from app.study_os.mastery import recompute_topic_mastery

        _safe(lambda: recompute_topic_mastery(supabase, user["id"]))

        from app.study_os.regen import regenerate_on_signal

        _safe(
            lambda: regenerate_on_signal(
                supabase, user["id"], event_type="mock_reviewed", reason="mock_reviewed"
            )
        )

    refreshed = _safe(
        lambda: supabase.table("mock_tests").select("*").eq("id", mock_id).limit(1).execute().data,
        default=[mock_id and {"id": mock_id}],
    ) or [{"id": mock_id}]
    return refreshed[0]


# NOTE: MockCorrectionTasksBody + POST /mocks/{mock_id}/correction-tasks
# previously lived here but were duplicates of app/api/study_os.py with
# diverging behavior (different weak-topic heuristics). study_os.py won
# at runtime via router precedence in server.py. Phase 5 of the admin
# Study OS ops layer removes this duplicate so the single owner is
# study_os.py.


# NOTE: GET /subjects and GET /weekly-review previously lived here but
# were duplicates of app/api/study_os.py with diverging response shapes.
# study_os.py won at runtime via router precedence in server.py. Phase 5
# of the admin Study OS ops layer removes these duplicates so the single
# owner is study_os.py.

# Backwards-compat alias for in-process callers that imported
# ``canonical.weekly_review`` directly (notifications.next_actions,
# my_recommendations below, and tests that monkeypatch this attribute).
# This is a thin re-export — not a duplicate route registration.
from app.api.study_os import weekly_review_read as weekly_review  # noqa: E402


@router_metadata.get("/certifications")
async def metadata_certifications():
    sb = get_supabase_admin()
    rows = _safe(lambda: sb.table("certifications").select("id,name,issuing_body,aliases,exam_families,sectors,qualification_levels,certification_type,is_active").eq("is_active", True).execute().data, default=[]) or []
    shaped = []
    for r in rows:
        row = dict(r)
        row["issuer"] = row.get("issuing_body")
        shaped.append(row)
    return {"items": shaped}


# ─── Aggregate router ───────────────────────────────────────────────────────

router = APIRouter()
router.include_router(router_recruitments)
router.include_router(router_profile)
router.include_router(router_tracker)
router.include_router(router_applications)
router.include_router(router_recommendations)
router.include_router(router_community)
router.include_router(router_study)
router.include_router(router_metadata)
