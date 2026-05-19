"""Admin CRUD for ``exam_eligibility_rules`` (PR-D2).

Endpoint group (all require ``exam_eligibility.manage`` permission):

  GET    /api/admin/exam-eligibility/exams
         List active exams with verified/draft/archived rule counts.

  GET    /api/admin/exam-eligibility/exams/{exam_id}/rules
         All rules (every status) for one exam.

  POST   /api/admin/exam-eligibility/exams/{exam_id}/rules
         Create a new rule. Body is shape-validated by Pydantic; the
         unique (exam_id, scope, rule_type) constraint surfaces 409.

  PUT    /api/admin/exam-eligibility/rules/{rule_id}
         Update value / source / reviewer_status. Moving status to
         ``verified`` stamps ``verified_by`` and ``verified_at``.

  DELETE /api/admin/exam-eligibility/rules/{rule_id}
         Soft-delete via ``reviewer_status = 'archived'`` (the row stays
         for audit). Pass ``?hard=true`` to actually delete the row.

The user-facing evaluator (``GET /api/exams/eligibility-summary``)
already filters to ``reviewer_status='verified'`` only, so a rule
moves in/out of the live summary purely by status changes here.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin
from app.exam_eligibility.evaluator import invalidate_eligibility_rules_cache

logger = logging.getLogger("career_copilot.api.admin_exam_eligibility")

ADMIN_PERM = "exam_eligibility.manage"

router = APIRouter(prefix="/admin/exam-eligibility", tags=["admin-exam-eligibility"])


# ── Validation ───────────────────────────────────────────────────────────


_ALLOWED_SCOPES = {"all", "general", "obc", "sc", "st", "ews", "pwd", "ex_serviceman", "women"}
_ALLOWED_RULE_TYPES = {
    "age_min", "age_max", "education_min_level", "nationality", "gender", "attempts_max"
}
_ALLOWED_REVIEWER_STATUS = {"draft", "verified", "archived"}
_NUMERIC_RULE_TYPES = {"age_min", "age_max", "attempts_max"}
_TEXT_RULE_TYPES = {"education_min_level", "nationality", "gender"}


class RuleCreate(BaseModel):
    scope: str = Field(default="all")
    rule_type: str
    value_num: float | None = None
    value_text: str | None = None
    is_knockout: bool = True
    source_url: str | None = None
    source_notes: str | None = None
    reviewer_status: str = Field(default="draft")


class RuleUpdate(BaseModel):
    scope: str | None = None
    rule_type: str | None = None
    value_num: float | None = None
    value_text: str | None = None
    is_knockout: bool | None = None
    source_url: str | None = None
    source_notes: str | None = None
    reviewer_status: str | None = None


def _validate_rule_shape(
    *,
    scope: str,
    rule_type: str,
    value_num: float | None,
    value_text: str | None,
    reviewer_status: str,
) -> None:
    if scope not in _ALLOWED_SCOPES:
        raise HTTPException(status_code=400, detail=f"invalid_scope: {scope}")
    if rule_type not in _ALLOWED_RULE_TYPES:
        raise HTTPException(status_code=400, detail=f"invalid_rule_type: {rule_type}")
    if reviewer_status not in _ALLOWED_REVIEWER_STATUS:
        raise HTTPException(status_code=400, detail=f"invalid_reviewer_status: {reviewer_status}")
    if rule_type in _NUMERIC_RULE_TYPES:
        if value_num is None:
            raise HTTPException(
                status_code=400,
                detail=f"{rule_type} requires value_num",
            )
    if rule_type in _TEXT_RULE_TYPES:
        if not value_text or not str(value_text).strip():
            raise HTTPException(
                status_code=400,
                detail=f"{rule_type} requires value_text",
            )


# ── Read endpoints ───────────────────────────────────────────────────────


@router.get("/exams")
def list_exams_with_rule_counts(
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    exams = (
        supabase.table("exams")
        .select("id, slug, name, is_active, exam_family_id")
        .eq("is_active", True)
        .order("name")
        .limit(500)
        .execute()
        .data
        or []
    )
    rules = (
        supabase.table("exam_eligibility_rules")
        .select("exam_id, reviewer_status")
        .limit(5000)
        .execute()
        .data
        or []
    )
    counts: dict[str, dict[str, int]] = {}
    for r in rules:
        bucket = counts.setdefault(
            r["exam_id"], {"draft": 0, "verified": 0, "archived": 0}
        )
        status = r.get("reviewer_status") or "draft"
        bucket[status] = bucket.get(status, 0) + 1
    items = []
    for e in exams:
        c = counts.get(e["id"], {"draft": 0, "verified": 0, "archived": 0})
        items.append({**e, "rule_counts": c, "total_rules": sum(c.values())})
    return {"items": items}


@router.get("/exams/{exam_id}/rules")
def list_rules_for_exam(
    exam_id: UUID,
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    exam_row = (
        supabase.table("exams")
        .select("id, slug, name")
        .eq("id", str(exam_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not exam_row:
        raise HTTPException(status_code=404, detail="exam_not_found")
    rules = (
        supabase.table("exam_eligibility_rules")
        .select(
            "id, exam_id, scope, rule_type, value_num, value_text, is_knockout, "
            "source_url, source_notes, reviewer_status, verified_by, verified_at, "
            "created_at, updated_at"
        )
        .eq("exam_id", str(exam_id))
        .order("rule_type")
        .order("scope")
        .limit(500)
        .execute()
        .data
        or []
    )
    return {"exam": exam_row[0], "rules": rules}


# ── Write endpoints ──────────────────────────────────────────────────────


@router.post("/exams/{exam_id}/rules")
def create_rule(
    exam_id: UUID,
    body: RuleCreate,
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    _validate_rule_shape(
        scope=body.scope,
        rule_type=body.rule_type,
        value_num=body.value_num,
        value_text=body.value_text,
        reviewer_status=body.reviewer_status,
    )
    supabase = get_supabase_admin()
    if not (
        supabase.table("exams").select("id").eq("id", str(exam_id)).limit(1).execute().data
    ):
        raise HTTPException(status_code=404, detail="exam_not_found")

    # Pre-empt the unique constraint to give a clean 409.
    existing = (
        supabase.table("exam_eligibility_rules")
        .select("id")
        .eq("exam_id", str(exam_id))
        .eq("scope", body.scope)
        .eq("rule_type", body.rule_type)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "RULE_ALREADY_EXISTS",
                "rule_id": existing[0]["id"],
                "message": "A rule with this (scope, rule_type) already exists. Edit the existing row.",
            },
        )

    payload: dict[str, Any] = {
        "exam_id": str(exam_id),
        "scope": body.scope,
        "rule_type": body.rule_type,
        "value_num": body.value_num,
        "value_text": body.value_text,
        "is_knockout": body.is_knockout,
        "source_url": body.source_url,
        "source_notes": body.source_notes,
        "reviewer_status": body.reviewer_status,
    }
    if body.reviewer_status == "verified":
        payload["verified_by"] = admin.get("id")
        payload["verified_at"] = datetime.now(timezone.utc).isoformat()
    inserted = (
        supabase.table("exam_eligibility_rules")
        .insert(payload)
        .execute()
        .data
        or []
    )
    invalidate_eligibility_rules_cache()
    return {"rule": inserted[0] if inserted else None}


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: UUID,
    body: RuleUpdate,
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = (
        supabase.table("exam_eligibility_rules")
        .select(
            "id, exam_id, scope, rule_type, value_num, value_text, reviewer_status"
        )
        .eq("id", str(rule_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing:
        raise HTTPException(status_code=404, detail="rule_not_found")
    current = existing[0]

    merged_scope = body.scope if body.scope is not None else current["scope"]
    merged_type = body.rule_type if body.rule_type is not None else current["rule_type"]
    merged_value_num = body.value_num if body.value_num is not None else current.get("value_num")
    merged_value_text = (
        body.value_text if body.value_text is not None else current.get("value_text")
    )
    merged_status = (
        body.reviewer_status if body.reviewer_status is not None else current["reviewer_status"]
    )
    _validate_rule_shape(
        scope=merged_scope,
        rule_type=merged_type,
        value_num=merged_value_num,
        value_text=merged_value_text,
        reviewer_status=merged_status,
    )

    patch: dict[str, Any] = {}
    if body.scope is not None:
        patch["scope"] = body.scope
    if body.rule_type is not None:
        patch["rule_type"] = body.rule_type
    if body.value_num is not None:
        patch["value_num"] = body.value_num
    if body.value_text is not None:
        patch["value_text"] = body.value_text
    if body.is_knockout is not None:
        patch["is_knockout"] = body.is_knockout
    if body.source_url is not None:
        patch["source_url"] = body.source_url
    if body.source_notes is not None:
        patch["source_notes"] = body.source_notes
    if body.reviewer_status is not None:
        patch["reviewer_status"] = body.reviewer_status
        # Promotion to ``verified`` stamps the reviewer + timestamp; any
        # transition AWAY from verified clears them so we never claim a
        # draft row was verified by someone.
        if body.reviewer_status == "verified":
            patch["verified_by"] = admin.get("id")
            patch["verified_at"] = datetime.now(timezone.utc).isoformat()
        else:
            patch["verified_by"] = None
            patch["verified_at"] = None
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()

    updated = (
        supabase.table("exam_eligibility_rules")
        .update(patch)
        .eq("id", str(rule_id))
        .execute()
        .data
        or []
    )
    invalidate_eligibility_rules_cache()
    return {"rule": updated[0] if updated else None}


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: UUID,
    hard: bool = Query(default=False),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = (
        supabase.table("exam_eligibility_rules")
        .select("id")
        .eq("id", str(rule_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing:
        raise HTTPException(status_code=404, detail="rule_not_found")

    if hard:
        supabase.table("exam_eligibility_rules").delete().eq("id", str(rule_id)).execute()
        invalidate_eligibility_rules_cache()
        return {"deleted": True, "hard": True}

    supabase.table("exam_eligibility_rules").update(
        {
            "reviewer_status": "archived",
            "verified_by": None,
            "verified_at": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", str(rule_id)).execute()
    invalidate_eligibility_rules_cache()
    return {"deleted": True, "hard": False, "archived_by": admin.get("id")}
