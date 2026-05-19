"""Exams catalogue (PR1).

Lists user-facing exams with per-caller eligibility overlay. The caller's
``user["id"]`` is the only source of identity — ``user_id`` from the
client is never accepted.
"""
from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.exam_eligibility.evaluator import summarize_user_eligibility

logger = logging.getLogger("career_copilot.api.exams")

router = APIRouter(prefix="/exams", tags=["exams"])

_DEFAULT_LIMIT = 50
_MAX_LIMIT = 100
_MAX_Q_LEN = 80

ExamLevel = Literal["central", "state", "psu", "banking", "defence", "other"]
ExamCategory = Literal[
    "recruitment", "entrance", "certification", "opportunity", "other"
]
ExamFrequency = Literal["yearly", "biannual", "quarterly", "monthly", "irregular"]
EligibilityState = Literal["eligible", "conditional", "not_yet", "all"]


def _encode_cursor(created_at: str | None, row_id: str | None) -> str | None:
    if not created_at or not row_id:
        return None
    payload = json.dumps({"created_at": created_at, "id": row_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str | None) -> dict[str, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        decoded = json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid cursor") from exc
    if not isinstance(decoded, dict) or "created_at" not in decoded or "id" not in decoded:
        raise HTTPException(status_code=422, detail="Invalid cursor")
    return {"created_at": str(decoded["created_at"]), "id": str(decoded["id"])}


def _shape_exam(row: dict[str, Any], overlay: dict[str, dict[str, Any]]) -> dict[str, Any]:
    slug = row.get("slug")
    elig = overlay.get(slug or "") or {"state": "not_yet", "missing": []}
    metadata = row.get("metadata") or {}
    return {
        "id": row.get("id"),
        "slug": slug,
        "name": row.get("name"),
        "level": metadata.get("level"),
        "category": row.get("exam_type"),
        "frequency": metadata.get("frequency"),
        "eligibility": {"state": elig["state"], "missing": elig.get("missing", [])},
        "saved": bool(row.get("_saved")),
    }


def _build_eligibility_overlay(supabase: Any, user_id: str) -> dict[str, dict[str, Any]]:
    """Map exam slug -> {state, missing}. ``state`` collapses the 4-bucket
    summary into the UI's three states: ``eligible | conditional | not_yet``.
    """
    summary = summarize_user_eligibility(supabase, user_id) or {}
    overlay: dict[str, dict[str, Any]] = {}
    for bucket, state in (
        ("eligible", "eligible"),
        ("conditional", "conditional"),
        ("not_eligible", "not_yet"),
        ("unknown", "not_yet"),
    ):
        for item in summary.get(bucket, []) or []:
            slug = item.get("slug")
            if not slug:
                continue
            overlay[slug] = {
                "state": state,
                "missing": item.get("missing_fields") or [],
            }
    return overlay


def _user_saved_exam_slugs(supabase: Any, user_id: str) -> set[str]:
    rows = (
        supabase.table("aspirant_preferences")
        .select("target_exams")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return set()
    raw = rows[0].get("target_exams") or []
    return {str(v) for v in raw if v}


@router.get("")
async def list_exams(
    q: str | None = Query(default=None),
    level: ExamLevel | None = Query(default=None),
    category: ExamCategory | None = Query(default=None),
    frequency: ExamFrequency | None = Query(default=None),
    savedOnly: bool = Query(default=False),
    eligibilityState: EligibilityState = Query(default="all"),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=_DEFAULT_LIMIT),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if limit < 1 or limit > _MAX_LIMIT:
        raise HTTPException(status_code=422, detail=f"limit must be between 1 and {_MAX_LIMIT}")
    if q is not None and len(q) > _MAX_Q_LEN:
        raise HTTPException(status_code=422, detail=f"q must be at most {_MAX_Q_LEN} characters")
    decoded_cursor = _decode_cursor(cursor)

    supabase = get_supabase_admin()
    saved_slugs = _user_saved_exam_slugs(supabase, user["id"])

    query = (
        supabase.table("exams")
        .select("id, slug, name, exam_type, metadata, is_active, created_at")
        .eq("is_active", True)
    )
    if category is not None:
        query = query.eq("exam_type", category)
    if q and q.strip():
        query = query.ilike("name", f"%{q.strip()}%")
    if decoded_cursor:
        query = query.lt("created_at", decoded_cursor["created_at"])

    fetched = query.order("created_at", desc=True).limit(limit + 1).execute().data or []

    overlay = _build_eligibility_overlay(supabase, user["id"])

    filtered: list[dict[str, Any]] = []
    for row in fetched:
        metadata = row.get("metadata") or {}
        if level is not None and metadata.get("level") != level:
            continue
        if frequency is not None and metadata.get("frequency") != frequency:
            continue
        slug = row.get("slug")
        if savedOnly and (not slug or slug not in saved_slugs):
            continue
        if eligibilityState != "all":
            state = (overlay.get(slug or "") or {"state": "not_yet"})["state"]
            if state != eligibilityState:
                continue
        row["_saved"] = bool(slug and slug in saved_slugs)
        filtered.append(row)

    next_cursor: str | None = None
    if len(filtered) > limit:
        page = filtered[:limit]
        last = page[-1]
        next_cursor = _encode_cursor(str(last.get("created_at")), str(last.get("id")))
    else:
        page = filtered

    items = [_shape_exam(r, overlay) for r in page]
    return {"items": items, "next_cursor": next_cursor}


@router.get("/eligibility/me")
async def eligibility_me(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    supabase = get_supabase_admin()
    overlay = _build_eligibility_overlay(supabase, user["id"])
    return {
        slug: {"state": v["state"], "missing": v.get("missing", [])}
        for slug, v in overlay.items()
    }


__all__ = ["router"]
