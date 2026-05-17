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
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin
from app.study_os.plan_impact import compute_plan_impact, record_plan_impact_decision

logger = logging.getLogger("career_copilot.api.admin_exam_intelligence")

ADMIN_PERM = "exam_intelligence.review"

router = APIRouter(prefix="/admin/exam-intelligence", tags=["admin-exam-intelligence"])

# A review row is "stale" once it has sat un-actioned for this long.
_STALE_REVIEW_DAYS = 14
# Mappings below this confidence need a closer look before they can be trusted.
_LOW_CONFIDENCE_THRESHOLD = 0.5
# exam_topic_coverage lifecycle (migration 030). Only `locked` rows are
# planner-ready under the verified-only contract.
_COVERAGE_STATUSES = ("draft", "pending_review", "reviewed", "locked", "rejected")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("admin_exam_intelligence read failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


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
    "pyq_option": {
        "table": "pyq_options",
        "select": (
            "id, question_id, option_label, option_text, is_correct, "
            "normalized_value, reviewer_status, reviewed_by, reviewed_at, "
            "metadata, created_at"
        ),
        # pyq_options has no reviewer_notes column; notes ride on metadata.
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

    # Topic coverage status breakdown. Only `locked` rows reach the Study OS
    # planner — surfacing the funnel tells operators how much verified
    # intelligence is actually planner-ready.
    coverage_rows = _safe(
        lambda: (
            sb.table("exam_topic_coverage")
            .select("reviewer_status, is_high_yield")
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    coverage_counts = {s: 0 for s in _COVERAGE_STATUSES}
    for r in coverage_rows:
        st = r.get("reviewer_status") or "draft"
        coverage_counts[st] = coverage_counts.get(st, 0) + 1
    out["topic_coverage"] = {
        "total": len(coverage_rows),
        "high_yield": sum(1 for r in coverage_rows if r.get("is_high_yield")),
        **coverage_counts,
    }

    # Low-confidence mappings + stale review items. Only the two mapping
    # tables carry confidence_score; pyq_questions does not, so it is
    # excluded from the confidence pass but still counted for staleness.
    stale_cutoff = _iso_days_ago(_STALE_REVIEW_DAYS)
    low_confidence = 0
    stale_review_items = 0
    for kind, cfg in _REVIEWABLE.items():
        has_confidence = kind in {"syllabus_topic_mention", "pyq_question_topic_tag"}
        cols = "reviewer_status, created_at"
        if has_confidence:
            cols += ", confidence_score"
        detail_rows = _safe(
            lambda t=cfg["table"], c=cols: (
                sb.table(t).select(c).limit(20000).execute().data
            ),
            default=[],
        ) or []
        for r in detail_rows:
            status_val = r.get("reviewer_status") or "pending"
            if has_confidence:
                cs = _as_float(r.get("confidence_score"))
                if cs is not None and cs < _LOW_CONFIDENCE_THRESHOLD and status_val != "rejected":
                    low_confidence += 1
            if status_val in {"pending", "needs_correction"} and (
                r.get("created_at") or ""
            ) < stale_cutoff:
                stale_review_items += 1
    out["low_confidence_mappings"] = low_confidence
    out["stale_review_items"] = stale_review_items

    # User-facing readiness: a coarse signal of whether verified intelligence
    # is actually flowing to aspirants. `ready` once locked coverage exists
    # and no stale review backlog remains; `partial` if verified data exists
    # but review work is outstanding; otherwise `not_ready`.
    locked_coverage = coverage_counts.get("locked", 0)
    verified_syllabus = out["tables"].get("syllabus_topic_mention", {}).get("verified", 0)
    if locked_coverage > 0 and stale_review_items == 0:
        readiness_level = "ready"
    elif locked_coverage > 0 or verified_syllabus > 0:
        readiness_level = "partial"
    else:
        readiness_level = "not_ready"
    out["user_facing_readiness"] = {
        "level": readiness_level,
        "locked_topic_coverage": locked_coverage,
        "verified_syllabus_mentions": verified_syllabus,
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
    # Coverage lifecycle read, kept separate from the legacy `is_active` read
    # above so the new readiness fields stay populated regardless.
    coverage_status_rows = _safe(
        lambda: (
            sb.table("exam_topic_coverage")
            .select("exam_id, reviewer_status, is_high_yield")
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

    # Per-exam coverage lifecycle aggregation.
    coverage_by_exam: dict[str, dict[str, int]] = {}
    for r in coverage_status_rows:
        slot = coverage_by_exam.setdefault(
            r.get("exam_id") or "",
            {"coverage_total": 0, "verified_topic_count": 0, "high_yield_topic_count": 0},
        )
        slot["coverage_total"] += 1
        # `locked` is planner-ready; `reviewed` is verified-but-not-yet-locked.
        if r.get("reviewer_status") in {"locked", "reviewed"}:
            slot["verified_topic_count"] += 1
        if r.get("is_high_yield"):
            slot["high_yield_topic_count"] += 1

    counts = _counts()
    items = []
    for e in exams:
        c = counts.get(e["id"], {})
        cov = coverage_by_exam.get(e["id"], {})
        verified_topics = cov.get("verified_topic_count", 0)
        syllabus_verified = c.get("syllabus_verified", 0)
        syllabus_pending = c.get("syllabus_pending", 0)
        if verified_topics > 0:
            readiness_level = "ready"
        elif syllabus_verified > 0:
            readiness_level = "partial"
        else:
            readiness_level = "not_ready"
        items.append(
            {
                **e,
                "syllabus_verified": syllabus_verified,
                "syllabus_pending": syllabus_pending,
                "coverage_active": c.get("coverage_active", 0),
                "coverage_total": cov.get("coverage_total", 0),
                "verified_topic_count": verified_topics,
                "high_yield_topic_count": cov.get("high_yield_topic_count", 0),
                "pyq_coverage_status": "covered" if cov.get("coverage_total", 0) else "none",
                "readiness_level": readiness_level,
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
        elif kind in {"pyq_question_topic_tag", "pyq_option"}:
            # Both are keyed via question → paper → exam.
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


# ─── 3b. Topic coverage (read-only) ───────────────────────────────────────
_TOPIC_COVERAGE_COLUMNS = (
    "id, exam_id, exam_cycle_id, exam_phase_id, section_id, topic_id, "
    "coverage_depth, expected_difficulty, exam_priority_score, is_high_yield, "
    "confidence_score, source_basis, reviewer_status, reviewed_at, "
    "metadata, created_at"
)


@router.get("/topic-coverage")
def list_topic_coverage(
    exam_id: str | None = Query(None),
    status: str = Query("all"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Read-only view of ``exam_topic_coverage``.

    PR scope is strictly read: no reviewer write actions, no planner
    mutation. Rows are mapped to the field names the admin UI expects and
    enriched with topic / subject / exam names via follow-up reads.
    """
    if status != "all" and status not in _COVERAGE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    sb = get_supabase_admin()

    def _builder():
        q = sb.table("exam_topic_coverage").select(_TOPIC_COVERAGE_COLUMNS)
        if exam_id:
            q = q.eq("exam_id", exam_id)
        if status != "all":
            q = q.eq("reviewer_status", status)
        return q.order("created_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    page = rows[offset : offset + limit]

    topic_ids = list({r.get("topic_id") for r in page if r.get("topic_id")})
    exam_ids = list({r.get("exam_id") for r in page if r.get("exam_id")})
    topics_by_id: dict[str, dict[str, Any]] = {}
    subjects_by_id: dict[str, dict[str, Any]] = {}
    exams_by_id: dict[str, dict[str, Any]] = {}
    if topic_ids:
        topic_rows = _safe(
            lambda: (
                sb.table("topics")
                .select("id, name, slug, subject_id")
                .in_("id", topic_ids)
                .limit(2000)
                .execute()
                .data
            ),
            default=[],
        ) or []
        topics_by_id = {t["id"]: t for t in topic_rows if t.get("id")}
        subject_ids = list(
            {t.get("subject_id") for t in topics_by_id.values() if t.get("subject_id")}
        )
        if subject_ids:
            subj_rows = _safe(
                lambda: (
                    sb.table("subjects")
                    .select("id, name")
                    .in_("id", subject_ids)
                    .limit(500)
                    .execute()
                    .data
                ),
                default=[],
            ) or []
            subjects_by_id = {s["id"]: s for s in subj_rows if s.get("id")}
    if exam_ids:
        exam_rows = _safe(
            lambda: (
                sb.table("exams")
                .select("id, slug, name")
                .in_("id", exam_ids)
                .limit(500)
                .execute()
                .data
            ),
            default=[],
        ) or []
        exams_by_id = {e["id"]: e for e in exam_rows if e.get("id")}

    items: list[dict[str, Any]] = []
    for r in page:
        topic = topics_by_id.get(r.get("topic_id")) or {}
        subject = subjects_by_id.get(topic.get("subject_id")) or {}
        exam = exams_by_id.get(r.get("exam_id")) or {}
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        items.append(
            {
                "id": r.get("id"),
                "exam_id": r.get("exam_id"),
                "exam": exam.get("name"),
                "exam_slug": exam.get("slug"),
                "exam_phase_id": r.get("exam_phase_id"),
                "phase": r.get("exam_phase_id"),
                "subject": subject.get("name"),
                "topic": topic.get("name"),
                "topic_id": r.get("topic_id"),
                "coverage_depth": r.get("coverage_depth"),
                "expected_difficulty": r.get("expected_difficulty"),
                "priority_score": r.get("exam_priority_score"),
                "high_yield": bool(r.get("is_high_yield")),
                "confidence_score": r.get("confidence_score"),
                "evidence_count": meta.get("evidence_count", 0),
                "source_basis": r.get("source_basis"),
                "status": r.get("reviewer_status"),
                "reviewed_at": r.get("reviewed_at"),
            }
        )
    return {"items": items, "count": len(rows)}


# ─── 3c. Topic coverage lifecycle review ──────────────────────────────────
class CoverageReviewBody(BaseModel):
    reviewer_status: str = Field(
        ..., pattern="^(draft|pending_review|reviewed|locked|rejected)$"
    )


@router.patch("/topic-coverage/{row_id}/review")
def review_topic_coverage(
    row_id: str,
    body: CoverageReviewBody = Body(...),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Move an ``exam_topic_coverage`` row through its review lifecycle.

    Lifecycle: ``draft → pending_review → reviewed → locked → rejected``.
    Only ``locked`` rows are planner-ready — ``locked_topic_coverage`` in
    the Study OS mission-control path consumes nothing else. Transitions
    are operator-driven and any target state is allowed so a reviewer can
    walk a row back (e.g. ``locked → reviewed``).
    """
    sb = get_supabase_admin()
    patch: dict[str, Any] = {
        "reviewer_status": body.reviewer_status,
        "reviewed_by": admin.get("id"),
        "reviewed_at": _now_iso(),
    }
    updated = _safe(
        lambda: (
            sb.table("exam_topic_coverage")
            .update(patch)
            .eq("id", row_id)
            .execute()
            .data
        ),
        default=None,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Coverage row not found")
    return updated[0]


# ─── 3d. Topic coverage data-field edit (admin-only) ──────────────────────
class CoverageEditBody(BaseModel):
    coverage_depth: str | None = Field(default=None, max_length=64)
    expected_difficulty: str | None = Field(default=None, max_length=64)
    exam_priority_score: float | None = Field(default=None, ge=0, le=100)
    is_high_yield: bool | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=1)
    source_basis: str | None = Field(default=None, max_length=128)
    reviewer_notes: str | None = Field(default=None, max_length=500)


@router.patch("/topic-coverage/{row_id}")
def edit_topic_coverage(
    row_id: str,
    body: CoverageEditBody = Body(...),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Edit a coverage row's intelligence fields without changing lifecycle.

    Lifecycle moves (``draft``/``pending_review``/``reviewed``/``locked``/
    ``rejected``) use ``PATCH /topic-coverage/{id}/review``. This endpoint
    is for the underlying intelligence fields the reviewer is grading.
    Records the reviewer id and ``reviewed_at`` so the lock audit trail
    stays meaningful even when the lifecycle bit isn't moving.
    """
    sb = get_supabase_admin()
    patch: dict[str, Any] = body.model_dump(exclude_unset=True, exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    patch["reviewed_by"] = admin.get("id")
    patch["reviewed_at"] = _now_iso()
    updated = _safe(
        lambda: (
            sb.table("exam_topic_coverage")
            .update(patch)
            .eq("id", row_id)
            .execute()
            .data
        ),
        default=None,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Coverage row not found")
    return updated[0]


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


# ─── 5. Competition Intelligence (exam_competition_metrics) ───────────────
_COMPETITION_COLUMNS = (
    "id, exam_id, exam_cycle_id, exam_phase_id, vacancy_total, "
    "vacancy_by_category, applicant_count, selection_ratio, cutoff_trend, "
    "difficulty_trend, competition_pressure_score, source_basis, "
    "confidence_score, evidence_count, reviewer_status, reviewed_at, "
    "reviewer_notes, metadata, created_at"
)


def _exam_name_map(sb: Any, exam_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not exam_ids:
        return {}
    rows = _safe(
        lambda: (
            sb.table("exams")
            .select("id, slug, name")
            .in_("id", exam_ids)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {e["id"]: e for e in rows if e.get("id")}


@router.get("/competition-metrics")
def list_competition_metrics(
    exam_id: str | None = Query(None),
    status: str = Query("all"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """List ``exam_competition_metrics`` rows for admin review.

    Only ``locked`` rows are planner-ready; the lifecycle mirrors
    ``exam_topic_coverage`` (draft → pending_review → reviewed → locked →
    rejected).
    """
    if status != "all" and status not in _COVERAGE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    sb = get_supabase_admin()

    def _builder():
        q = sb.table("exam_competition_metrics").select(_COMPETITION_COLUMNS)
        if exam_id:
            q = q.eq("exam_id", exam_id)
        if status != "all":
            q = q.eq("reviewer_status", status)
        return q.order("created_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    page = rows[offset : offset + limit]
    exams_by_id = _exam_name_map(
        sb, list({r.get("exam_id") for r in page if r.get("exam_id")})
    )

    items = []
    for r in page:
        exam = exams_by_id.get(r.get("exam_id")) or {}
        items.append(
            {
                **r,
                "exam": exam.get("name"),
                "exam_slug": exam.get("slug"),
                "status": r.get("reviewer_status"),
            }
        )
    return {"items": items, "count": len(rows)}


@router.patch("/competition-metrics/{row_id}/review")
def review_competition_metric(
    row_id: str,
    body: CoverageReviewBody = Body(...),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Move an ``exam_competition_metrics`` row through its lifecycle.

    Lifecycle: ``draft → pending_review → reviewed → locked → rejected``.
    Only ``locked`` rows are read by ``competition_context`` in Study OS.
    """
    sb = get_supabase_admin()
    patch: dict[str, Any] = {
        "reviewer_status": body.reviewer_status,
        "reviewed_by": admin.get("id"),
        "reviewed_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    updated = _safe(
        lambda: (
            sb.table("exam_competition_metrics")
            .update(patch)
            .eq("id", row_id)
            .execute()
            .data
        ),
        default=None,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Competition metric not found")
    return updated[0]


# ─── 6. Policy / Update Intelligence (exam_policy_updates) ────────────────
_POLICY_COLUMNS = (
    "id, exam_id, exam_cycle_id, source_id, update_type, title, summary, "
    "source_url, source_type, claim_status, reviewer_status, affects_plan, "
    "affects_deadline, affects_eligibility, affects_documents, "
    "affects_syllabus, affects_vacancy, change_summary, published_at, "
    "effective_from, reviewed_at, reviewer_notes, created_at"
)
_POLICY_SOURCE_TYPES = ("official", "aggregator", "research", "opportunity", "unknown")


@router.get("/policy-updates")
def list_policy_updates(
    exam_id: str | None = Query(None),
    status: str = Query("all"),
    source_type: str = Query("all"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0, le=10000),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """List ``exam_policy_updates`` rows for admin review.

    Two axes are surfaced: ``reviewer_status`` (operator workflow) and
    ``source_type`` (trust origin). Only verified official rows ever reach
    the planner; non-official rows are discovery-only.
    """
    if status != "all" and status not in _ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    if source_type != "all" and source_type not in _POLICY_SOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid source_type filter")
    sb = get_supabase_admin()

    def _builder():
        q = sb.table("exam_policy_updates").select(_POLICY_COLUMNS)
        if exam_id:
            q = q.eq("exam_id", exam_id)
        if status != "all":
            q = q.eq("reviewer_status", status)
        if source_type != "all":
            q = q.eq("source_type", source_type)
        return q.order("created_at", desc=True).limit(limit + offset).execute().data

    rows = _safe(_builder, default=[]) or []
    page = rows[offset : offset + limit]
    exams_by_id = _exam_name_map(
        sb, list({r.get("exam_id") for r in page if r.get("exam_id")})
    )

    items = []
    for r in page:
        exam = exams_by_id.get(r.get("exam_id")) or {}
        items.append(
            {
                **r,
                "exam": exam.get("name"),
                "exam_slug": exam.get("slug"),
                "status": r.get("reviewer_status"),
            }
        )
    return {"items": items, "count": len(rows)}


class PolicyUpdateReviewBody(BaseModel):
    reviewer_status: str = Field(
        ..., pattern="^(pending|verified|rejected|needs_correction)$"
    )
    reviewer_notes: str | None = Field(default=None, max_length=500)


@router.patch("/policy-updates/{row_id}/review")
def review_policy_update(
    row_id: str,
    body: PolicyUpdateReviewBody = Body(...),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Move an ``exam_policy_updates`` row through operator review.

    Only ``source_type='official'`` rows that reach ``verified`` are read
    by ``policy_update_context`` as plan-affecting; everything else stays
    discovery-only. This endpoint never flips ``affects_*`` flags — those
    are set when the row is created and gated by a DB check constraint.
    """
    sb = get_supabase_admin()
    patch: dict[str, Any] = {
        "reviewer_status": body.reviewer_status,
        "reviewed_by": admin.get("id"),
        "reviewed_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if body.reviewer_notes is not None:
        patch["reviewer_notes"] = body.reviewer_notes

    updated = _safe(
        lambda: (
            sb.table("exam_policy_updates")
            .update(patch)
            .eq("id", row_id)
            .execute()
            .data
        ),
        default=None,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Policy update not found")
    return updated[0]


# ─── 7. Plan Impact (before/after diff of locking a coverage row) ─────────
@router.get("/plan-impact/{coverage_id}")
def get_plan_impact(
    coverage_id: str,
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Return the before/after planner-ranking diff of locking a coverage row.

    Deterministic and read-only — see ``app/study_os/plan_impact.py``.
    """
    sb = get_supabase_admin()
    impact = _safe(lambda: compute_plan_impact(sb, coverage_id), default=None)
    if impact is None:
        raise HTTPException(status_code=500, detail="Plan impact computation failed")
    if not impact.get("available"):
        raise HTTPException(status_code=404, detail="Coverage row not found")
    return impact


class PlanImpactDecisionBody(BaseModel):
    decision: str = Field(..., pattern="^(hold|stage|approve)$")
    notes: str | None = Field(default=None, max_length=500)


@router.post("/plan-impact/{coverage_id}/decision")
def post_plan_impact_decision(
    coverage_id: str,
    body: PlanImpactDecisionBody = Body(...),
    admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Record a hold / stage / approve rollout-gate decision for a coverage row.

    The impact snapshot is recomputed server-side before it is stored, so
    ``impact_summary`` always reflects the real diff at decision time. This
    endpoint records intent only — it does not lock the coverage row.
    """
    sb = get_supabase_admin()
    row = _safe(
        lambda: record_plan_impact_decision(
            sb,
            coverage_id,
            decision=body.decision,
            admin_id=admin.get("id"),
            notes=body.notes,
        ),
        default=None,
    )
    if row is None:
        raise HTTPException(
            status_code=404, detail="Coverage row not found or decision invalid"
        )
    return row


# ─── 7. Option-level analytics ─────────────────────────────────────────────
# Heuristic classifiers for "elimination-style" answers. Matched against a
# lowercased, trimmed option text; first matching marker wins. Order
# matters — multi-item subset patterns are checked before single "N only"
# so that "1 and 2 only" doesn't fall into the single bucket.
_ELIMINATION_MARKERS: list[tuple[str, str, re.Pattern[str]]] = [
    ("all_of_the_above", "All of the above", re.compile(r"^all\s+of\s+the\s+above\b")),
    ("none_of_the_above", "None of the above", re.compile(r"^none\s+of\s+the\s+above\b")),
    ("both_x_and_y", "Both X and Y", re.compile(r"^both\s+\S+\s+and\s+\S+\b")),
    ("neither_x_nor_y", "Neither X nor Y", re.compile(r"^neither\s+\S+\s+nor\s+\S+\b")),
    (
        "subset_only",
        "Combination only",
        re.compile(r"^\d+(\s*,\s*\d+)+\s+(only|and)\b|^\d+\s+and\s+\d+(\s+only)?\b"),
    ),
    ("single_only", "N only", re.compile(r"^\d+\s+only\b")),
]


def _option_group_key(opt: dict[str, Any]) -> str:
    """Pick the canonical group key for an option row.

    Prefers ``normalized_option_hash`` (populated by the ETL pipeline),
    then ``normalized_value``, then a lowercased ``option_text``. Returns
    an empty string for options with no usable text — those rows are
    dropped from the rollup.
    """
    hash_v = (opt.get("normalized_option_hash") or "").strip()
    if hash_v:
        return hash_v
    norm = (opt.get("normalized_value") or "").strip().lower()
    if norm:
        return norm
    return (opt.get("option_text") or "").strip().lower()


def _classify_elimination(text: str) -> tuple[str, str] | None:
    t = (text or "").strip().lower()
    if not t:
        return None
    for key, display, pattern in _ELIMINATION_MARKERS:
        if pattern.search(t):
            return key, display
    return None


def _fetch_option_universe(
    sb: Any, exam_id: str, topic_id: str | None = None
) -> tuple[list[dict[str, Any]], dict[str, int | None], dict[str, list[str]]]:
    """Return options for verified questions on an exam (optionally a topic).

    Returns ``(options, year_by_question, topics_by_question)`` so callers
    can roll up by year and topic without re-querying.
    """
    paper_rows = _safe(
        lambda: (
            sb.table("pyq_papers")
            .select("id, year")
            .eq("exam_id", exam_id)
            .limit(5000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not paper_rows:
        return [], {}, {}
    paper_ids = [p["id"] for p in paper_rows if p.get("id")]
    year_by_paper: dict[str, int | None] = {
        p["id"]: p.get("year") for p in paper_rows if p.get("id")
    }

    question_rows = _safe(
        lambda: (
            sb.table("pyq_questions")
            .select("id, pyq_paper_id, reviewer_status")
            .in_("pyq_paper_id", paper_ids)
            .eq("reviewer_status", "verified")
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    question_ids = [q["id"] for q in question_rows if q.get("id")]
    year_by_question: dict[str, int | None] = {
        q["id"]: year_by_paper.get(q.get("pyq_paper_id"))
        for q in question_rows
        if q.get("id")
    }
    if not question_ids:
        return [], year_by_question, {}

    tag_rows = _safe(
        lambda: (
            sb.table("pyq_question_topic_tags")
            .select("question_id, topic_id, tag_role, reviewer_status")
            .in_("question_id", question_ids)
            .eq("reviewer_status", "verified")
            .limit(40000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    topics_by_question: dict[str, list[str]] = {}
    for tr in tag_rows:
        qid = tr.get("question_id")
        tid = tr.get("topic_id")
        if not qid or not tid:
            continue
        topics_by_question.setdefault(qid, []).append(tid)

    if topic_id:
        question_ids = [
            qid for qid in question_ids if topic_id in topics_by_question.get(qid, [])
        ]
        if not question_ids:
            return [], year_by_question, topics_by_question

    options = _safe(
        lambda: (
            sb.table("pyq_options")
            .select(
                "id, question_id, option_label, option_text, "
                "normalized_option_hash, normalized_value, is_correct, "
                "reviewer_status"
            )
            .in_("question_id", question_ids)
            .limit(80000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return options, year_by_question, topics_by_question


def _group_options(
    options: list[dict[str, Any]],
    year_by_question: dict[str, int | None],
    topics_by_question: dict[str, list[str]],
) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for o in options:
        key = _option_group_key(o)
        if not key:
            continue
        qid = o.get("question_id")
        year = year_by_question.get(qid) if qid else None
        slot = groups.setdefault(
            key,
            {
                "normalized_value": (
                    o.get("normalized_value") or o.get("option_text") or ""
                ).strip(),
                "option_text_sample": o.get("option_text"),
                "occurrence_count": 0,
                "is_correct_count": 0,
                "is_wrong_count": 0,
                "first_seen_year": None,
                "last_seen_year": None,
                "sample_question_ids": [],
                "sample_option_ids": [],
                "topic_ids": set(),
            },
        )
        slot["occurrence_count"] += 1
        if o.get("is_correct"):
            slot["is_correct_count"] += 1
        else:
            slot["is_wrong_count"] += 1
        if year is not None:
            if slot["first_seen_year"] is None or year < slot["first_seen_year"]:
                slot["first_seen_year"] = year
            if slot["last_seen_year"] is None or year > slot["last_seen_year"]:
                slot["last_seen_year"] = year
        if qid and qid not in slot["sample_question_ids"] and len(slot["sample_question_ids"]) < 5:
            slot["sample_question_ids"].append(qid)
        oid = o.get("id")
        if oid and len(slot["sample_option_ids"]) < 5:
            slot["sample_option_ids"].append(oid)
        for tid in topics_by_question.get(qid or "", []):
            slot["topic_ids"].add(tid)
    out: list[dict[str, Any]] = []
    for key, slot in groups.items():
        slot["group_key"] = key
        slot["topic_ids"] = sorted(slot["topic_ids"])
        out.append(slot)
    return out


@router.get("/options/repetitions")
def list_option_repetitions(
    exam_id: str = Query(...),
    topic_id: str | None = Query(None),
    min_occurrences: int = Query(2, ge=1, le=50),
    correctness: str = Query("any", pattern="^(any|correct|wrong)$"),
    limit: int = Query(100, ge=1, le=500),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Same option text recurring across verified questions in an exam.

    Computed live from ``pyq_options`` joined to verified questions in
    the given exam (and topic, if supplied). Falls back to a lowercased
    ``option_text`` when the ETL hash is unset — which is the seed case.
    """
    sb = get_supabase_admin()
    options, year_by_question, topics_by_question = _fetch_option_universe(
        sb, exam_id, topic_id
    )
    groups = _group_options(options, year_by_question, topics_by_question)
    if correctness == "correct":
        groups = [g for g in groups if g["is_correct_count"] > 0]
    elif correctness == "wrong":
        groups = [g for g in groups if g["is_wrong_count"] > 0]
    groups = [g for g in groups if g["occurrence_count"] >= min_occurrences]
    groups.sort(key=lambda g: (-g["occurrence_count"], g.get("normalized_value") or ""))
    return {
        "exam_id": exam_id,
        "topic_id": topic_id,
        "groups": groups[:limit],
        "total_groups": len(groups),
    }


@router.get("/options/traps")
def list_option_traps(
    exam_id: str = Query(...),
    topic_id: str | None = Query(None),
    min_occurrences: int = Query(2, ge=1, le=50),
    limit: int = Query(100, ge=1, le=500),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Wrong-option repetitions ranked by a "trap score".

    Without attempt data we approximate trap-likelihood as
    ``wrong_count^2 / occurrence_count`` (i.e. how dominant the
    wrong-answer pattern is). Helpful for spotting distractors that
    examiners keep recycling.
    """
    sb = get_supabase_admin()
    options, year_by_question, topics_by_question = _fetch_option_universe(
        sb, exam_id, topic_id
    )
    groups = _group_options(options, year_by_question, topics_by_question)
    out: list[dict[str, Any]] = []
    for g in groups:
        if g["is_wrong_count"] < min_occurrences:
            continue
        denom = g["occurrence_count"] or 1
        g["trap_score"] = round((g["is_wrong_count"] ** 2) / denom, 3)
        out.append(g)
    out.sort(key=lambda g: (-g["trap_score"], -g["is_wrong_count"]))
    return {
        "exam_id": exam_id,
        "topic_id": topic_id,
        "groups": out[:limit],
        "total_groups": len(out),
    }


@router.get("/options/elimination-patterns")
def list_elimination_patterns(
    exam_id: str = Query(...),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Counts of structural option markers used on verified questions.

    Buckets the option text into a small set of well-known elimination
    markers (``all_of_the_above``, ``none_of_the_above``, ``both_x_and_y``,
    ``neither_x_nor_y``, ``single_only``, ``subset_only``) and reports
    how often each appears and how often it ends up correct.
    """
    sb = get_supabase_admin()
    options, _years, _topics = _fetch_option_universe(sb, exam_id)
    counts: dict[str, dict[str, Any]] = {}
    for o in options:
        classified = _classify_elimination(o.get("option_text") or "")
        if not classified:
            continue
        key, display = classified
        slot = counts.setdefault(
            key,
            {
                "pattern": key,
                "display_text": display,
                "occurrence_count": 0,
                "correct_count": 0,
                "wrong_count": 0,
            },
        )
        slot["occurrence_count"] += 1
        if o.get("is_correct"):
            slot["correct_count"] += 1
        else:
            slot["wrong_count"] += 1
    out: list[dict[str, Any]] = []
    for slot in counts.values():
        total = slot["occurrence_count"] or 1
        slot["correct_rate"] = round(slot["correct_count"] / total, 3)
        out.append(slot)
    out.sort(key=lambda s: -s["occurrence_count"])
    return {"exam_id": exam_id, "patterns": out}


@router.post("/options/recompute")
def recompute_option_analytics(
    exam_id: str = Query(...),
    _admin: dict = Depends(require_permission(ADMIN_PERM)),
) -> dict[str, Any]:
    """Materialise the live group/marker rollups into the persisted tables.

    Wipes existing ``pyq_option_repetitions`` + ``pyq_option_patterns``
    rows scoped to this exam, then re-inserts. Safe to run repeatedly.
    """
    sb = get_supabase_admin()
    options, year_by_question, topics_by_question = _fetch_option_universe(sb, exam_id)
    groups = _group_options(options, year_by_question, topics_by_question)

    rep_rows: list[dict[str, Any]] = []
    for g in groups:
        if g["occurrence_count"] < 2:
            continue
        topic_ids: list[str | None] = list(g["topic_ids"]) or [None]
        for tid in topic_ids:
            rep_rows.append(
                {
                    "exam_id": exam_id,
                    "topic_id": tid,
                    "option_hash": g["group_key"],
                    "normalized_value": g["normalized_value"],
                    "occurrence_count": g["occurrence_count"],
                    "first_seen_year": g["first_seen_year"],
                    "last_seen_year": g["last_seen_year"],
                    "examples": {"question_ids": g["sample_question_ids"]},
                    "metadata": {
                        "is_correct_count": g["is_correct_count"],
                        "is_wrong_count": g["is_wrong_count"],
                    },
                    "updated_at": _now_iso(),
                }
            )

    options_by_key: dict[str, list[dict[str, Any]]] = {}
    for o in options:
        k = _option_group_key(o)
        if k:
            options_by_key.setdefault(k, []).append(o)

    pattern_rows: list[dict[str, Any]] = []
    for g in groups:
        if g["occurrence_count"] < 2:
            continue
        for o in options_by_key.get(g["group_key"], []):
            primary_topic = (topics_by_question.get(o.get("question_id") or "", []) or [None])[0]
            pattern_type = "common_trap" if not o.get("is_correct") else "repeated_value"
            pattern_rows.append(
                {
                    "option_id": o["id"],
                    "topic_id": primary_topic,
                    "pattern_type": pattern_type,
                    "normalized_value": g["normalized_value"],
                    "confidence_score": min(0.95, 0.4 + 0.1 * g["occurrence_count"]),
                    "metadata": {
                        "group_key": g["group_key"],
                        "occurrence_count": g["occurrence_count"],
                    },
                }
            )
    for o in options:
        classified = _classify_elimination(o.get("option_text") or "")
        if not classified:
            continue
        key, _display = classified
        primary_topic = (topics_by_question.get(o.get("question_id") or "", []) or [None])[0]
        pattern_rows.append(
            {
                "option_id": o["id"],
                "topic_id": primary_topic,
                "pattern_type": "elimination_pattern",
                "normalized_value": o.get("option_text"),
                "confidence_score": 0.9,
                "metadata": {"marker": key},
            }
        )

    _safe(
        lambda: sb.table("pyq_option_repetitions")
        .delete()
        .eq("exam_id", exam_id)
        .execute()
        .data,
        default=[],
    )
    option_ids = [o["id"] for o in options if o.get("id")]
    if option_ids:
        _safe(
            lambda: sb.table("pyq_option_patterns")
            .delete()
            .in_("option_id", option_ids)
            .execute()
            .data,
            default=[],
        )

    rep_inserted = 0
    if rep_rows:
        inserted = (
            _safe(
                lambda: sb.table("pyq_option_repetitions").insert(rep_rows).execute().data,
                default=[],
            )
            or []
        )
        rep_inserted = len(inserted)
    pat_inserted = 0
    if pattern_rows:
        inserted = (
            _safe(
                lambda: sb.table("pyq_option_patterns").insert(pattern_rows).execute().data,
                default=[],
            )
            or []
        )
        pat_inserted = len(inserted)

    return {
        "exam_id": exam_id,
        "repetitions_upserted": rep_inserted,
        "patterns_upserted": pat_inserted,
        "groups_considered": len(groups),
    }
