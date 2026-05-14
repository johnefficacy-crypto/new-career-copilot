"""Admin Exam Intelligence review API (PR5).

Read-light admin surface that lets operators move the
``reviewer_status`` of existing intelligence rows. Nothing is created
here; this PR strictly contracts on top of migrations 029–034.

Allowed status transitions (``reviewer_status``):
    pending → verified | rejected | needs_correction
    needs_correction → verified | rejected | pending
    verified → rejected (operator reversal) | needs_correction
    rejected → pending | needs_correction
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.admin_exam_intelligence")

ADMIN_PERM = "exam_intelligence.review"

router = APIRouter(prefix="/admin/exam-intelligence", tags=["admin-exam-intelligence"])


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_exam_intelligence read failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Tables we expose. Each table must already have:
#   - reviewer_status (text, check-constrained in 031/032)
#   - reviewed_by / reviewed_at columns
_REVIEWABLE = {
    "syllabus_topic_mention": {
        "table": "syllabus_topic_mentions",
        "select": (
            "id, exam_id, exam_cycle_id, exam_phase_id, topic_id, raw_text, "
            "normalized_text, mention_type, confidence_score, reviewer_status, "
            "reviewed_by, reviewed_at, reviewer_notes, created_at"
        ),
        "supports_notes": True,
    },
    "pyq_question_topic_tag": {
        "table": "pyq_question_topic_tags",
        "select": (
            "id, question_id, topic_id, tag_weight, tag_role, "
            "tagging_source, confidence_score, reviewer_status, "
            "reviewed_by, reviewed_at, created_at"
        ),
        "supports_notes": False,
    },
    "pyq_question": {
        "table": "pyq_questions",
        "select": (
            "id, pyq_paper_id, question_number, question_type, language, "
            "reviewer_status, created_at, updated_at"
        ),
        "supports_notes": False,
    },
}

_ALLOWED_STATUSES = {"pending", "verified", "rejected", "needs_correction"}


# ─── 1. Overview ──────────────────────────────────────────────────────────
@router.get("/overview")
def overview(_admin: dict = Depends(require_permission(ADMIN_PERM))) -> dict[str, Any]:
    sb = get_supabase_admin()
    out: dict[str, Any] = {"tables": {}, "generated_at": _now_iso()}
    for kind, cfg in _REVIEWABLE.items():
        rows = _safe(
            lambda t=cfg["table"]: (
                sb.table(t).select("reviewer_status").limit(20000).execute().data
            ),
            default=[],
        ) or []
        counts = {s: 0 for s in _ALLOWED_STATUSES}
        for r in rows:
            counts[r.get("reviewer_status") or "pending"] = (
                counts.get(r.get("reviewer_status") or "pending", 0) + 1
            )
        out["tables"][kind] = {"total": len(rows), **counts}
    # Active exam count for context.
    exam_rows = _safe(
        lambda: sb.table("exams").select("id, is_active").limit(10000).execute().data,
        default=[],
    ) or []
    out["exams"] = {
        "total": len(exam_rows),
        "active": sum(1 for r in exam_rows if r.get("is_active")),
    }
    return out


# ─── 2. Exam list with verified/pending counts ────────────────────────────
@router.get("/exams")
def list_exams(
    limit: int = Query(100, ge=1, le=200),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    sb = get_supabase_admin()
    exams = _safe(
        lambda: (
            sb.table("exams")
            .select("id, slug, name, exam_type, is_active, exam_family_id")
            .order("name")
            .limit(limit)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not exams:
        return {"items": [], "count": 0}
    exam_ids = [e["id"] for e in exams if e.get("id")]

    syllabus = _safe(
        lambda: (
            sb.table("syllabus_topic_mentions")
            .select("exam_id, reviewer_status")
            .in_("exam_id", exam_ids)
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    coverage = _safe(
        lambda: (
            sb.table("exam_topic_coverage")
            .select("exam_id, is_active")
            .in_("exam_id", exam_ids)
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []

    def _counts():
        d: dict[str, dict[str, int]] = {}
        for r in syllabus:
            slot = d.setdefault(
                r.get("exam_id") or "",
                {"syllabus_verified": 0, "syllabus_pending": 0, "coverage_active": 0},
            )
            if r.get("reviewer_status") == "verified":
                slot["syllabus_verified"] += 1
            elif r.get("reviewer_status") in {"pending", "needs_correction"}:
                slot["syllabus_pending"] += 1
        for r in coverage:
            slot = d.setdefault(
                r.get("exam_id") or "",
                {"syllabus_verified": 0, "syllabus_pending": 0, "coverage_active": 0},
            )
            if r.get("is_active"):
                slot["coverage_active"] += 1
        return d

    counts = _counts()
    items = []
    for e in exams:
        c = counts.get(e["id"], {})
        items.append(
            {
                **e,
                "syllabus_verified": c.get("syllabus_verified", 0),
                "syllabus_pending": c.get("syllabus_pending", 0),
                "coverage_active": c.get("coverage_active", 0),
            }
        )
    return {"items": items, "count": len(items)}


# ─── 3. Items for a specific exam (filtered by reviewer_status) ───────────
@router.get("/exams/{exam_id}/items")
def list_items(
    exam_id: str,
    kind: str = Query("syllabus_topic_mention"),
    status: str = Query("pending"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    if kind not in _REVIEWABLE:
        raise HTTPException(status_code=400, detail=f"Unknown kind: {kind}")
    if status != "all" and status not in _ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    cfg = _REVIEWABLE[kind]
    sb = get_supabase_admin()

    def _builder():
        q = sb.table(cfg["table"]).select(cfg["select"])
        # syllabus mentions and pyq question topic tags have exam-side joins.
        if kind == "syllabus_topic_mention":
            q = q.eq("exam_id", exam_id)
        elif kind == "pyq_question_topic_tag":
            # Tags are keyed via question → paper → exam.
            paper_rows = _safe(
                lambda: (
                    sb.table("pyq_papers")
                    .select("id")
                    .eq("exam_id", exam_id)
                    .limit(5000)
                    .execute()
                    .data
                ),
                default=[],
            ) or []
            paper_ids = [r["id"] for r in paper_rows if r.get("id")]
            if not paper_ids:
                return []
            question_rows = _safe(
                lambda: (
                    sb.table("pyq_questions")
                    .select("id")
                    .in_("pyq_paper_id", paper_ids)
                    .limit(10000)
                    .execute()
                    .data
                ),
                default=[],
            ) or []
            question_ids = [r["id"] for r in question_rows if r.get("id")]
            if not question_ids:
                return []
            q = q.in_("question_id", question_ids)
        elif kind == "pyq_question":
            paper_rows = _safe(
                lambda: (
                    sb.table("pyq_papers")
                    .select("id")
                    .eq("exam_id", exam_id)
                    .limit(5000)
                    .execute()
                    .data
                ),
                default=[],
            ) or []
            paper_ids = [r["id"] for r in paper_rows if r.get("id")]
            if not paper_ids:
                return []
            q = q.in_("pyq_paper_id", paper_ids)
        if status != "all":
            q = q.eq("reviewer_status", status)
        return q.order("created_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    return {"items": rows[offset : offset + limit], "count": len(rows)}


# ─── 4. Mark review status ────────────────────────────────────────────────
class ReviewBody(BaseModel):
    reviewer_status: str = Field(..., pattern="^(pending|verified|rejected|needs_correction)$")
    reviewer_notes: str | None = Field(default=None, max_length=500)


@router.patch("/items/{kind}/{row_id}/review")
def review_item(
    kind: str,
    row_id: str,
    body: ReviewBody = Body(...),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    if kind not in _REVIEWABLE:
        raise HTTPException(status_code=400, detail=f"Unknown kind: {kind}")
    cfg = _REVIEWABLE[kind]
    sb = get_supabase_admin()

    patch: dict[str, Any] = {
        "reviewer_status": body.reviewer_status,
        "reviewed_by": admin.get("id"),
        "reviewed_at": _now_iso(),
    }
    if cfg.get("supports_notes") and body.reviewer_notes is not None:
        patch["reviewer_notes"] = body.reviewer_notes

    updated = _safe(
        lambda: sb.table(cfg["table"]).update(patch).eq("id", row_id).execute().data,
        default=None,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Row not found")
    return updated[0]
