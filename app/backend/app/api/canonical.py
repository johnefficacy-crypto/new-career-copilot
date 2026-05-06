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

import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import Client

from app.core.auth import get_current_user, get_optional_user
from app.db.supabase_client import get_supabase_admin

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
    "id, name, year, status, publish_status, "
    "notification_date, apply_start_date, apply_end_date, "
    "total_vacancies, official_notification_url, "
    "organizations ( id, name, type, state )"
)


def _shape_recruitment(row: dict[str, Any], saved_ids: set[str]) -> dict[str, Any]:
    """Coerce a Supabase recruitment row into the shape the UI expects."""
    org = row.get("organizations") or {}
    if isinstance(org, list):
        org = org[0] if org else {}
    slug = f"{_slug(row.get('name') or '')}-{(row.get('id') or '')[:8]}"
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
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    user: dict | None = Depends(get_optional_user),
):
    supabase = get_supabase_admin()
    query = supabase.table("recruitments").select(_REC_SELECT).in_(
        "publish_status", ["verified", "published"]
    )
    if status and status != "all":
        # Map UI status (eligible/urgent/conditional) to recruitment lifecycle.
        # The UI's "eligible/urgent/conditional" maps from eligibility_results,
        # not from recruitments.status. We filter client-side after eligibility merge.
        pass
    if q:
        query = query.ilike("name", f"%{q}%")
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
    """Accept a UUID or exact text slug from recruitments.slug (if present)."""
    if len(ref) == 36 and ref.count("-") == 4:
        rows = _safe(lambda: supabase.table("recruitments").select("id").eq("id", ref).limit(1).execute().data, default=[]) or []
        if rows:
            return rows[0]["id"]
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
        .select(_REC_SELECT + ", posts ( id, post_name, group_type, pay_level, job_type )")
        .eq("id", rec_id)
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


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
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
    career_stage: str | None = None
    career_goal: str | None = None
    target_type: str | None = None
    target_exam: str | None = None
    onboarding_step: int | None = Field(default=None, ge=0, le=10)
    onboarding_completed: bool | None = None
    avatar_url: str | None = None


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
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": profile.get("full_name") or user.get("name"),
        "role": user.get("role"),
        "onboarded": bool(profile.get("onboarding_completed")),
        "plan": profile.get("plan_id") or "free",
        "avatar": profile.get("avatar_url"),
        "profile": {k: v for k, v in profile.items() if k not in {"id"}},
    }


@router_profile.put("/me")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    _ensure_profile_row(supabase, user["id"], user.get("email"))
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if patch:
        supabase.table("profiles").update(patch).eq("id", user["id"]).execute()
    return await get_profile(user)


# ════════════════════════════════════════════════════════════════════════════
#  TRACKER (user_recruitment_applications)
# ════════════════════════════════════════════════════════════════════════════

router_tracker = APIRouter(prefix="/tracker", tags=["tracker"])


class TrackerCreate(BaseModel):
    recruitment_id: str | None = None
    recruitment_slug: str | None = None
    stage: str = "saved"  # → maps to application_status enum
    note: str | None = None


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

router_marketplace = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _shape_course(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": c.get("id"),
        "title": c.get("title"),
        "slug": c.get("slug"),
        "provider": (c.get("profiles") or {}).get("full_name") if isinstance(c.get("profiles"), dict) else None,
        "type": "course",
        "price": c.get("price_inr"),
        "original_price": c.get("original_price_inr"),
        "rating": float(c.get("avg_rating") or 0),
        "students": c.get("total_enrollments") or 0,
        "exams": c.get("exam_tags") or [],
        "level": c.get("level"),
        "language": c.get("language"),
        "thumbnail": c.get("thumbnail_url"),
        "short_description": c.get("short_description"),
        "duration_mins": c.get("total_duration_mins"),
        "total_lessons": c.get("total_lessons"),
    }


@router_marketplace.get("/resources")
async def list_resources(exam: str | None = Query(default=None), type: str | None = Query(default=None)):
    supabase = get_supabase_admin()
    q = (
        supabase.table("courses")
        .select(
            "id, title, slug, short_description, thumbnail_url, price_inr, original_price_inr, "
            "level, language, exam_tags, total_lessons, total_duration_mins, "
            "avg_rating, total_enrollments, profiles!instructor_id ( full_name )"
        )
        .eq("status", "published")
    )
    if exam:
        q = q.contains("exam_tags", [exam])
    rows = _safe(lambda: q.order("total_enrollments", desc=True).limit(60).execute().data, default=[]) or []
    return {"items": [_shape_course(r) for r in rows]}


@router_marketplace.get("/resources/{rid}")
async def resource_detail(rid: str):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("courses")
        .select(
            "*, profiles!instructor_id ( full_name, instructor_bio ), "
            "course_sections ( id, title, order_index, lessons ( id, title, type, duration_mins, is_free_preview ) )"
        )
        .eq("id", rid)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Resource not found")
    c = rows[0]
    out = _shape_course(c)
    out["description"] = c.get("description")
    sections = sorted(c.get("course_sections") or [], key=lambda s: s.get("order_index") or 0)
    out["curriculum"] = [
        {
            "module": s.get("title"),
            "lessons": len(s.get("lessons") or []),
            "duration": sum((lesson.get("duration_mins") or 0) for lesson in (s.get("lessons") or [])),
        }
        for s in sections
    ]
    review_rows = _safe(
        lambda: supabase.table("reviews")
        .select("rating, body, created_at, profiles!reviews_user_id_fkey ( full_name )")
        .eq("course_id", rid)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data,
        default=[],
    ) or []
    out["reviews"] = [
        {
            "name": (r.get("profiles") or {}).get("full_name") if isinstance(r.get("profiles"), dict) else "Anonymous",
            "rating": r.get("rating"),
            "text": r.get("body"),
        }
        for r in review_rows
    ]
    return out


@router_marketplace.get("/mentors")
async def list_mentors(exam: str | None = Query(default=None)):
    """Mentors are instructors with courses. We surface them via profiles + courses."""
    supabase = get_supabase_admin()
    q = (
        supabase.table("profiles")
        .select("id, full_name, instructor_bio, avatar_url, courses!instructor_id ( id, exam_tags )")
        .eq("is_instructor", True)
        .limit(60)
    )
    rows = _safe(lambda: q.execute().data, default=[]) or []
    items = []
    for p in rows:
        all_exams = sorted({tag for c in (p.get("courses") or []) for tag in (c.get("exam_tags") or [])})
        if exam and exam not in all_exams:
            continue
        items.append(
            {
                "id": p.get("id"),
                "name": p.get("full_name"),
                "headline": (p.get("instructor_bio") or "")[:80],
                "bio": p.get("instructor_bio"),
                "exams": all_exams,
                "avatar": p.get("avatar_url"),
                "sessions": len(p.get("courses") or []),
            }
        )
    return {"items": items}


@router_marketplace.get("/mentors/{mid}")
async def mentor_detail(mid: str):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("profiles")
        .select(
            "id, full_name, instructor_bio, avatar_url, "
            "courses!instructor_id ( id, title, slug, exam_tags, price_inr, avg_rating, total_enrollments )"
        )
        .eq("id", mid)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Mentor not found")
    p = rows[0]
    courses = p.get("courses") or []
    return {
        "id": p["id"],
        "name": p.get("full_name"),
        "headline": (p.get("instructor_bio") or "")[:120],
        "bio": p.get("instructor_bio"),
        "avatar": p.get("avatar_url"),
        "exams": sorted({t for c in courses for t in (c.get("exam_tags") or [])}),
        "courses": courses,
        "sessions": sum((c.get("total_enrollments") or 0) for c in courses),
    }


@router_marketplace.get("/providers")
async def providers():
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("profiles")
        .select("id, full_name, courses!instructor_id ( id, exam_tags, avg_rating )")
        .eq("is_instructor", True)
        .limit(40)
        .execute()
        .data,
        default=[],
    ) or []
    items = []
    for p in rows:
        courses = p.get("courses") or []
        if not courses:
            continue
        ratings = [c.get("avg_rating") for c in courses if c.get("avg_rating")]
        items.append(
            {
                "id": p["id"],
                "name": p.get("full_name"),
                "type": "Individual",
                "courses": len(courses),
                "rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
                "exams": sorted({t for c in courses for t in (c.get("exam_tags") or [])}),
            }
        )
    return {"items": items}


@router_marketplace.get("/affiliates")
async def affiliates():
    """No canonical affiliates table — returns empty list (placeholder UI handles)."""
    return {"items": []}


# ════════════════════════════════════════════════════════════════════════════
#  STUDY OS (study_plans + study_tasks + study_sessions + mock_tests)
# ════════════════════════════════════════════════════════════════════════════

router_study = APIRouter(prefix="/study", tags=["study"])


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
    out_tasks = [{"id": t.get("id"), "title": t.get("title") or t.get("topic") or t.get("subject"), "time": t.get("day_label") or "Today", "duration": t.get("duration_mins"), "done": t.get("status") == "completed"} for t in tasks]
    return {"date": today, "plan": {"id": plan_id, "theme": "Adaptive weekly plan", "target": "Complete planned blocks", "day": None}, "tasks": out_tasks}


class PlanToggle(BaseModel):
    task_id: str


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


class MockEntry(BaseModel):
    exam_name: str | None = None
    exam: str | None = None  # legacy alias
    test_name: str | None = None
    score: float | None = None
    accuracy: float | None = Field(default=None, ge=0, le=100)
    total_marks: int | None = None
    scored_marks: float | None = None
    total_questions: int | None = None
    correct_answers: int | None = None
    wrong_answers: int | None = None
    duration_mins: int | None = None
    notes: str | None = None


@router_study.get("/mocks")
async def list_mocks(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    rows = _safe(
        lambda: supabase.table("mock_tests")
        .select("*")
        .eq("user_id", user["id"])
        .order("attempted_at", desc=True)
        .limit(50)
        .execute()
        .data,
        default=[],
    ) or []
    return {"items": rows}


@router_study.post("/mocks")
async def add_mock(body: MockEntry, user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    payload: dict[str, Any] = {
        "user_id": user["id"],
        "exam_name": body.exam_name or body.exam,
        "test_name": body.test_name,
        "scored_marks": body.scored_marks if body.scored_marks is not None else body.score,
        "total_marks": body.total_marks,
        "total_questions": body.total_questions,
        "correct_answers": body.correct_answers,
        "wrong_answers": body.wrong_answers,
        "duration_mins": body.duration_mins,
        "notes": body.notes,
        "attempted_at": _now_iso(),
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    inserted = supabase.table("mock_tests").insert(payload).execute().data or []
    return inserted[0] if inserted else payload


@router_study.get("/subjects")
async def subjects(user: dict = Depends(get_current_user)):
    """Subject progress derived from completed study_tasks per subject."""
    supabase = get_supabase_admin()
    plan_id = _ensure_active_plan(supabase, user["id"])
    if not plan_id:
        return {"items": []}
    rows = _safe(
        lambda: supabase.table("study_tasks")
        .select("subject, status")
        .eq("plan_id", plan_id)
        .execute()
        .data,
        default=[],
    ) or []
    by_subject: dict[str, dict[str, int]] = {}
    for r in rows:
        s = r.get("subject") or "General"
        d = by_subject.setdefault(s, {"total": 0, "done": 0})
        d["total"] += 1
        if r.get("status") == "completed":
            d["done"] += 1
    items = [
        {
            "subject": s,
            "progress": int(round((v["done"] / v["total"]) * 100)) if v["total"] else 0,
            "trend": "up" if v["done"] >= v["total"] / 2 else "flat",
        }
        for s, v in by_subject.items()
    ]
    return {"items": items}


@router_study.get("/weekly-review")
async def weekly_review(user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    from datetime import timedelta

    week_start = (datetime.now(timezone.utc) - timedelta(days=datetime.now(timezone.utc).weekday())).date().isoformat()
    sessions = _safe(
        lambda: supabase.table("study_sessions")
        .select("duration_mins, started_at")
        .eq("user_id", user["id"])
        .gte("started_at", week_start)
        .execute()
        .data,
        default=[],
    ) or []
    mocks = _safe(
        lambda: supabase.table("mock_tests")
        .select("id")
        .eq("user_id", user["id"])
        .gte("attempted_at", week_start)
        .execute()
        .data,
        default=[],
    ) or []
    plan_id = _ensure_active_plan(supabase, user["id"])
    closed = 0
    if plan_id:
        closed_rows = _safe(
            lambda: supabase.table("study_tasks")
            .select("id")
            .eq("plan_id", plan_id)
            .eq("status", "completed")
            .gte("completed_at", week_start)
            .execute()
            .data,
            default=[],
        ) or []
        closed = len(closed_rows)
    hours = round(sum((s.get("duration_mins") or 0) for s in sessions) / 60.0, 1)
    hours_planned = 35
    adherence = (hours / hours_planned) if hours_planned else 0
    return {
        "week_of": week_start or "This week",
        "hours_studied": hours,
        "hours_planned": hours_planned,
        "adherence": round(adherence, 3),
        "mocks_taken": len(mocks),
        "mock_trend": [],
        "highlights": [],
        "corrections": [],
    }


# ─── Aggregate router ───────────────────────────────────────────────────────

router = APIRouter()
router.include_router(router_recruitments)
router.include_router(router_profile)
router.include_router(router_tracker)
router.include_router(router_community)
router.include_router(router_marketplace)
router.include_router(router_study)
