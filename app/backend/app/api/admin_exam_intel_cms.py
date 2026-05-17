"""Admin Exam Intelligence CMS — Phase 4 full-lifecycle CRUD.

The existing ``admin_exam_intelligence`` router (PR5) handles the
**review queue** for already-existing rows. This router adds the
**creation** side: admin can land new exam families, exams, cycles,
phases, syllabus documents, PYQ papers/questions/options, topic
coverage, and policy updates.

Per the spec's answered open question §12 #4: **CMS feeds the review
queue — nothing is auto-published**. So:

- Tables with ``reviewer_status`` (syllabus_topic_mentions,
  pyq_questions, exam_topic_coverage, exam_policy_updates) land at
  ``'pending'`` regardless of what the operator sends.
- Tables with ``trust_status`` (syllabus_documents, pyq_papers) land at
  ``'pending'`` regardless of what the operator sends.
- Tables with neither (exam_families, exams, exam_cycles, exam_phases,
  pyq_options) are admin-only schemas with no aspirant review surface;
  they save with whatever ``is_active``/``status`` the admin chooses.

Every write inserts an ``admin_audit_logs`` row. The same
``ADMIN_STUDY_OS_ENABLED`` env flag gates this router so the whole
Study OS admin layer toggles together.

All endpoints are gated by ``exam_intelligence.cms`` permission, with
``super_admin`` bypass (matching the rest of the admin surface). We
deliberately do NOT reuse ``exam_intelligence.review`` because the
review-queue role and the lifecycle-creator role should be separable.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import require_permission
from app.core.config import get_settings
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.admin_exam_intel_cms")

router = APIRouter(prefix="/admin/exam-intelligence-cms", tags=["admin-exam-intelligence-cms"])

PERM_CMS = "exam_intelligence.cms"


# ─── Helpers (mirror admin_study_os patterns) ─────────────────────────────


def _flag_enabled() -> None:
    if not get_settings().ADMIN_STUDY_OS_ENABLED:
        raise HTTPException(
            status_code=404,
            detail="admin.study_os.enabled is off",
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _audit(
    supabase,
    actor: dict,
    action: str,
    *,
    entity_type: str,
    entity_id: str | None = None,
    new_value: Any = None,
    notes: str = "admin_exam_intel_cms",
) -> str | None:
    try:
        rows = (
            supabase.table("admin_audit_logs")
            .insert(
                {
                    "actor_id": actor.get("id"),
                    "actor_email": actor.get("email"),
                    "action": action,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "new_value": new_value,
                    "notes": notes,
                }
            )
            .execute()
            .data
            or []
        )
        return rows[0].get("id") if rows else None
    except Exception:  # noqa: BLE001
        logger.exception("audit log insert failed (admin_exam_intel_cms)")
        return None


def _safe_select(supabase, table: str, **filters):
    try:
        q = supabase.table(table).select("*").limit(1)
        for k, v in filters.items():
            q = q.eq(k, v)
        return (q.execute().data or [None])[0]
    except Exception:  # noqa: BLE001
        return None


class WriteEnvelope(BaseModel):
    """Standard write-body shape used by every CMS endpoint."""

    reason: str = Field(..., min_length=8, max_length=500)
    payload: dict[str, Any] = Field(default_factory=dict)


# ════════════════════════════════════════════════════════════════════════
#  Exam families
# ════════════════════════════════════════════════════════════════════════


_FAMILY_FIELDS = {"slug", "name", "description", "is_active", "metadata"}


@router.get("/exam-families")
def list_exam_families(
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = (
        supabase.table("exam_families")
        .select("id, slug, name, description, is_active, metadata, created_at, updated_at", count="exact")
        .order("created_at", desc=True)
    )
    if is_active is not None:
        q = q.eq("is_active", is_active)
    try:
        res = q.range(offset, offset + limit - 1).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"List failed: {exc}")
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/exam-families")
def create_exam_family(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _FAMILY_FIELDS}
    if not row.get("slug") or not row.get("name"):
        raise HTTPException(status_code=422, detail="slug and name are required")
    try:
        inserted = supabase.table("exam_families").insert(row).execute().data or []
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=409, detail=f"Insert failed: {exc}")
    if not inserted:
        raise HTTPException(status_code=500, detail="No row returned from insert")
    new = inserted[0]
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.family.create",
        entity_type="exam_family", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


@router.patch("/exam-families/{family_id}")
def update_exam_family(
    family_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = _safe_select(supabase, "exam_families", id=family_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Exam family not found")
    patch = {k: v for k, v in body.payload.items() if k in _FAMILY_FIELDS}
    if not patch:
        raise HTTPException(status_code=422, detail="No allowed fields in payload")
    patch["updated_at"] = _now_iso()
    try:
        updated = (
            supabase.table("exam_families").update(patch).eq("id", family_id).execute().data or []
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=409, detail=f"Update failed: {exc}")
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.family.update",
        entity_type="exam_family", entity_id=family_id,
        new_value={"reason": body.reason, "patch": patch, "previous": existing},
    )
    return {"ok": True, "audit_id": audit_id, "row": updated[0] if updated else existing | patch}


@router.delete("/exam-families/{family_id}")
def soft_delete_exam_family(
    family_id: str,
    reason: str = Query(..., min_length=8, max_length=500),
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Soft-delete by flipping ``is_active=false``. We never hard-delete
    because child exams may still FK-reference this row."""
    supabase = get_supabase_admin()
    existing = _safe_select(supabase, "exam_families", id=family_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Exam family not found")
    supabase.table("exam_families").update(
        {"is_active": False, "updated_at": _now_iso()}
    ).eq("id", family_id).execute()
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.family.soft_delete",
        entity_type="exam_family", entity_id=family_id,
        new_value={"reason": reason, "previous_is_active": existing.get("is_active")},
    )
    return {"ok": True, "audit_id": audit_id, "id": family_id, "is_active": False}


# ════════════════════════════════════════════════════════════════════════
#  Exams
# ════════════════════════════════════════════════════════════════════════


_EXAM_FIELDS = {
    "exam_family_id", "slug", "name", "exam_type", "default_difficulty_level",
    "description", "is_active", "metadata",
}
_EXAM_TYPES = ("recruitment", "entrance", "certification", "opportunity", "other")


@router.get("/exams")
def list_exams(
    is_active: bool | None = Query(default=None),
    exam_family_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("exams").select(
        "id, exam_family_id, slug, name, exam_type, default_difficulty_level, description, is_active, metadata, created_at, updated_at",
        count="exact",
    ).order("created_at", desc=True)
    if is_active is not None:
        q = q.eq("is_active", is_active)
    if exam_family_id:
        q = q.eq("exam_family_id", exam_family_id)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/exams")
def create_exam(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _EXAM_FIELDS}
    if not row.get("slug") or not row.get("name"):
        raise HTTPException(status_code=422, detail="slug and name are required")
    if row.get("exam_type") and row["exam_type"] not in _EXAM_TYPES:
        raise HTTPException(status_code=422, detail=f"exam_type must be one of {_EXAM_TYPES}")
    if row.get("exam_family_id") and not _safe_select(supabase, "exam_families", id=row["exam_family_id"]):
        raise HTTPException(status_code=422, detail="exam_family_id does not resolve")
    try:
        inserted = supabase.table("exams").insert(row).execute().data or []
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=409, detail=f"Insert failed: {exc}")
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.exam.create",
        entity_type="exam", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


@router.patch("/exams/{exam_id}")
def update_exam(
    exam_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = _safe_select(supabase, "exams", id=exam_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Exam not found")
    patch = {k: v for k, v in body.payload.items() if k in _EXAM_FIELDS}
    if not patch:
        raise HTTPException(status_code=422, detail="No allowed fields in payload")
    patch["updated_at"] = _now_iso()
    updated = supabase.table("exams").update(patch).eq("id", exam_id).execute().data or []
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.exam.update",
        entity_type="exam", entity_id=exam_id,
        new_value={"reason": body.reason, "patch": patch, "previous": existing},
    )
    return {"ok": True, "audit_id": audit_id, "row": updated[0] if updated else existing | patch}


@router.delete("/exams/{exam_id}")
def soft_delete_exam(
    exam_id: str,
    reason: str = Query(..., min_length=8, max_length=500),
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = _safe_select(supabase, "exams", id=exam_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Exam not found")
    supabase.table("exams").update({"is_active": False, "updated_at": _now_iso()}).eq("id", exam_id).execute()
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.exam.soft_delete",
        entity_type="exam", entity_id=exam_id,
        new_value={"reason": reason, "previous_is_active": existing.get("is_active")},
    )
    return {"ok": True, "audit_id": audit_id, "id": exam_id, "is_active": False}


# ════════════════════════════════════════════════════════════════════════
#  Exam cycles
# ════════════════════════════════════════════════════════════════════════


_CYCLE_FIELDS = {
    "exam_id", "year", "cycle_name", "status", "notification_date",
    "application_start", "application_end", "exam_start", "exam_end",
    "source_url", "metadata",
}
_CYCLE_STATUSES = ("expected", "open", "active", "closed", "completed", "cancelled")


@router.get("/exam-cycles")
def list_cycles(
    exam_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    year: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("exam_cycles").select("*", count="exact").order("year", desc=True)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    if status:
        q = q.eq("status", status)
    if year:
        q = q.eq("year", year)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/exam-cycles")
def create_cycle(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _CYCLE_FIELDS}
    if not row.get("exam_id") or not row.get("year") or not row.get("cycle_name"):
        raise HTTPException(status_code=422, detail="exam_id, year, cycle_name are required")
    if row.get("status") and row["status"] not in _CYCLE_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {_CYCLE_STATUSES}")
    if not _safe_select(supabase, "exams", id=row["exam_id"]):
        raise HTTPException(status_code=422, detail="exam_id does not resolve")
    try:
        inserted = supabase.table("exam_cycles").insert(row).execute().data or []
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=409, detail=f"Insert failed: {exc}")
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.cycle.create",
        entity_type="exam_cycle", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


@router.patch("/exam-cycles/{cycle_id}")
def update_cycle(
    cycle_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = _safe_select(supabase, "exam_cycles", id=cycle_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Cycle not found")
    patch = {k: v for k, v in body.payload.items() if k in _CYCLE_FIELDS}
    if not patch:
        raise HTTPException(status_code=422, detail="No allowed fields in payload")
    if patch.get("status") and patch["status"] not in _CYCLE_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {_CYCLE_STATUSES}")
    patch["updated_at"] = _now_iso()
    updated = supabase.table("exam_cycles").update(patch).eq("id", cycle_id).execute().data or []
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.cycle.update",
        entity_type="exam_cycle", entity_id=cycle_id,
        new_value={"reason": body.reason, "patch": patch, "previous": existing},
    )
    return {"ok": True, "audit_id": audit_id, "row": updated[0] if updated else existing | patch}


# ════════════════════════════════════════════════════════════════════════
#  Exam phases
# ════════════════════════════════════════════════════════════════════════


_PHASE_FIELDS = {
    "exam_id", "exam_cycle_id", "phase_name", "phase_slug", "phase_order",
    "mode", "duration_mins", "total_questions", "total_marks",
    "negative_marking", "status", "metadata",
}
_PHASE_STATUSES = ("expected", "active", "completed", "cancelled")


@router.get("/exam-phases")
def list_phases(
    exam_id: str | None = Query(default=None),
    exam_cycle_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("exam_phases").select("*", count="exact").order("phase_order", desc=False)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    if exam_cycle_id:
        q = q.eq("exam_cycle_id", exam_cycle_id)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/exam-phases")
def create_phase(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _PHASE_FIELDS}
    if not row.get("exam_id") or not row.get("phase_name") or not row.get("phase_slug"):
        raise HTTPException(status_code=422, detail="exam_id, phase_name, phase_slug are required")
    if row.get("status") and row["status"] not in _PHASE_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {_PHASE_STATUSES}")
    inserted = supabase.table("exam_phases").insert(row).execute().data or []
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.phase.create",
        entity_type="exam_phase", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


@router.patch("/exam-phases/{phase_id}")
def update_phase(
    phase_id: str,
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    existing = _safe_select(supabase, "exam_phases", id=phase_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Phase not found")
    patch = {k: v for k, v in body.payload.items() if k in _PHASE_FIELDS}
    if not patch:
        raise HTTPException(status_code=422, detail="No allowed fields in payload")
    patch["updated_at"] = _now_iso()
    updated = supabase.table("exam_phases").update(patch).eq("id", phase_id).execute().data or []
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.phase.update",
        entity_type="exam_phase", entity_id=phase_id,
        new_value={"reason": body.reason, "patch": patch, "previous": existing},
    )
    return {"ok": True, "audit_id": audit_id, "row": updated[0] if updated else existing | patch}


# ════════════════════════════════════════════════════════════════════════
#  Syllabus documents — created at trust_status='pending'
# ════════════════════════════════════════════════════════════════════════


_DOC_FIELDS = {
    "exam_id", "exam_cycle_id", "source_id", "document_type", "title",
    "source_url", "storage_path", "content_hash", "published_at",
    "fetched_at", "metadata",
}
_DOC_TYPES = (
    "notification", "syllabus_pdf", "official_page", "pattern_notice",
    "corrigendum", "other",
)


@router.get("/syllabus-documents")
def list_syllabus_documents(
    exam_id: str | None = Query(default=None),
    trust_status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("syllabus_documents").select("*", count="exact").order("created_at", desc=True)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    if trust_status:
        q = q.eq("trust_status", trust_status)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/syllabus-documents")
def create_syllabus_document(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """CMS feeds the review queue — trust_status forced to 'pending'.

    Operators promote rows to verified via the existing review queue,
    not here. This keeps the official-verification ledger honest about
    who reviewed a document and when."""
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _DOC_FIELDS}
    if not row.get("exam_id") or not row.get("document_type") or not row.get("title"):
        raise HTTPException(status_code=422, detail="exam_id, document_type, title are required")
    if row["document_type"] not in _DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"document_type must be one of {_DOC_TYPES}")
    row["trust_status"] = "pending"  # spec §12 #4 — no auto-publish
    inserted = supabase.table("syllabus_documents").insert(row).execute().data or []
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.syllabus_document.create",
        entity_type="syllabus_document", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


# ════════════════════════════════════════════════════════════════════════
#  PYQ papers — created at trust_status='pending'
# ════════════════════════════════════════════════════════════════════════


_PAPER_FIELDS = {
    "pyq_source_id", "exam_id", "exam_cycle_id", "exam_phase_id",
    "year", "paper_date", "shift", "paper_code", "source_url",
    "source_type", "content_hash", "metadata",
}
_PAPER_SOURCE_TYPES = ("official", "memory_based", "coaching", "community", "aggregator", "unknown")


@router.get("/pyq-papers")
def list_pyq_papers(
    exam_id: str | None = Query(default=None),
    year: int | None = Query(default=None),
    trust_status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("pyq_papers").select("*", count="exact").order("year", desc=True)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    if year:
        q = q.eq("year", year)
    if trust_status:
        q = q.eq("trust_status", trust_status)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/pyq-papers")
def create_pyq_paper(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _PAPER_FIELDS}
    if not row.get("exam_id") or not row.get("year"):
        raise HTTPException(status_code=422, detail="exam_id and year are required")
    if row.get("source_type") and row["source_type"] not in _PAPER_SOURCE_TYPES:
        raise HTTPException(status_code=422, detail=f"source_type must be one of {_PAPER_SOURCE_TYPES}")
    row["trust_status"] = "pending"
    inserted = supabase.table("pyq_papers").insert(row).execute().data or []
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.pyq_paper.create",
        entity_type="pyq_paper", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


# ════════════════════════════════════════════════════════════════════════
#  PYQ questions — created at reviewer_status='pending'; options upsert
#  in the same call so the question + options land atomically (best
#  effort — no row-level transaction across two tables here, but at
#  least the audit row captures both)
# ════════════════════════════════════════════════════════════════════════


_QUESTION_FIELDS = {
    "pyq_paper_id", "question_number", "question_text",
    "normalized_question_hash", "question_type", "explanation_text",
    "observed_difficulty", "expected_solve_time_sec", "language", "metadata",
}
_QUESTION_TYPES = ("mcq", "numerical", "descriptive", "caselet", "matching", "other")
_OPTION_FIELDS = {"option_label", "option_text", "normalized_option_hash", "normalized_value", "is_correct", "metadata"}


@router.get("/pyq-questions")
def list_pyq_questions(
    pyq_paper_id: str | None = Query(default=None),
    reviewer_status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("pyq_questions").select("*", count="exact").order("question_number", desc=False)
    if pyq_paper_id:
        q = q.eq("pyq_paper_id", pyq_paper_id)
    if reviewer_status:
        q = q.eq("reviewer_status", reviewer_status)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/pyq-questions")
def create_pyq_question(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Create one PYQ question and optionally its options in a single
    call. Question lands at reviewer_status='pending'. Options are
    not gated by reviewer_status (they inherit from question)."""
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _QUESTION_FIELDS}
    if not row.get("pyq_paper_id") or not row.get("question_text"):
        raise HTTPException(status_code=422, detail="pyq_paper_id and question_text are required")
    if row.get("question_type") and row["question_type"] not in _QUESTION_TYPES:
        raise HTTPException(status_code=422, detail=f"question_type must be one of {_QUESTION_TYPES}")
    row["reviewer_status"] = "pending"
    inserted = supabase.table("pyq_questions").insert(row).execute().data or []
    new_q = inserted[0] if inserted else row
    question_id = new_q.get("id")

    inserted_options: list[dict] = []
    options = body.payload.get("options") or []
    if isinstance(options, list) and options and question_id:
        opt_rows = []
        for opt in options:
            if not isinstance(opt, dict):
                continue
            cleaned = {k: v for k, v in opt.items() if k in _OPTION_FIELDS}
            cleaned["question_id"] = question_id
            if cleaned.get("option_label") and cleaned.get("option_text"):
                opt_rows.append(cleaned)
        if opt_rows:
            try:
                inserted_options = supabase.table("pyq_options").insert(opt_rows).execute().data or []
            except Exception as exc:  # noqa: BLE001
                logger.exception("pyq_options insert failed for question %s", question_id)
                # Don't roll back the question — surface in audit + response.
                inserted_options = []

    audit_id = _audit(
        supabase, admin, "exam_intel.cms.pyq_question.create",
        entity_type="pyq_question", entity_id=question_id,
        new_value={
            "reason": body.reason,
            "question": new_q,
            "options_inserted": len(inserted_options),
        },
    )
    return {"ok": True, "audit_id": audit_id, "question": new_q, "options": inserted_options}


# ════════════════════════════════════════════════════════════════════════
#  PYQ options (standalone insert — for editing existing questions)
# ════════════════════════════════════════════════════════════════════════


@router.post("/pyq-options")
def create_pyq_option(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _OPTION_FIELDS}
    question_id = body.payload.get("question_id")
    if not question_id or not row.get("option_label") or not row.get("option_text"):
        raise HTTPException(status_code=422, detail="question_id, option_label, option_text are required")
    if not _safe_select(supabase, "pyq_questions", id=question_id):
        raise HTTPException(status_code=422, detail="question_id does not resolve")
    row["question_id"] = question_id
    inserted = supabase.table("pyq_options").insert(row).execute().data or []
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.pyq_option.create",
        entity_type="pyq_option", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


# ════════════════════════════════════════════════════════════════════════
#  Exam topic coverage — created at reviewer_status='pending_review'
# ════════════════════════════════════════════════════════════════════════


_COVERAGE_FIELDS = {
    "exam_id", "exam_phase_id", "topic_id", "priority", "is_high_yield",
    "is_active", "metadata",
}


@router.get("/exam-topic-coverage")
def list_exam_topic_coverage(
    exam_id: str | None = Query(default=None),
    reviewer_status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("exam_topic_coverage").select("*", count="exact").order("priority", desc=True)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    if reviewer_status:
        q = q.eq("reviewer_status", reviewer_status)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/exam-topic-coverage")
def create_exam_topic_coverage(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _COVERAGE_FIELDS}
    if not row.get("exam_id") or not row.get("topic_id"):
        raise HTTPException(status_code=422, detail="exam_id and topic_id are required")
    row["reviewer_status"] = "pending_review"
    inserted = supabase.table("exam_topic_coverage").insert(row).execute().data or []
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.coverage.create",
        entity_type="exam_topic_coverage", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


# ════════════════════════════════════════════════════════════════════════
#  Policy updates — created at reviewer_status='pending'
# ════════════════════════════════════════════════════════════════════════


_POLICY_FIELDS = {
    "exam_id", "exam_cycle_id", "source_id", "update_type", "title",
    "summary", "source_url", "source_type", "claim_status",
    "affects_plan", "affects_deadline", "affects_eligibility",
    "affects_documents", "affects_syllabus", "affects_vacancy",
    "change_summary", "evidence", "published_at", "effective_from",
}
_POLICY_UPDATE_TYPES = (
    "notification_change", "cycle_change", "date_change", "syllabus_change",
    "pattern_change", "vacancy_change", "eligibility_change",
    "reservation_change", "document_rule_change", "other",
)


@router.get("/policy-updates")
def list_policy_updates(
    exam_id: str | None = Query(default=None),
    reviewer_status: str | None = Query(default=None),
    update_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    q = supabase.table("exam_policy_updates").select("*", count="exact").order("created_at", desc=True)
    if exam_id:
        q = q.eq("exam_id", exam_id)
    if reviewer_status:
        q = q.eq("reviewer_status", reviewer_status)
    if update_type:
        q = q.eq("update_type", update_type)
    res = q.range(offset, offset + limit - 1).execute()
    return {"items": res.data or [], "total": getattr(res, "count", None), "limit": limit, "offset": offset}


@router.post("/policy-updates")
def create_policy_update(
    body: WriteEnvelope,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    row = {k: v for k, v in body.payload.items() if k in _POLICY_FIELDS}
    if not row.get("exam_id") or not row.get("update_type") or not row.get("title"):
        raise HTTPException(status_code=422, detail="exam_id, update_type, title are required")
    if row["update_type"] not in _POLICY_UPDATE_TYPES:
        raise HTTPException(status_code=422, detail=f"update_type must be one of {_POLICY_UPDATE_TYPES}")
    # Enforce the constraint in code as well so the error message is friendly,
    # not a raw Postgres constraint violation.
    if (row.get("source_type") or "official") != "official":
        for affect in ("affects_plan", "affects_deadline", "affects_eligibility",
                       "affects_documents", "affects_syllabus", "affects_vacancy"):
            if row.get(affect):
                raise HTTPException(
                    status_code=422,
                    detail=f"Non-official policy updates cannot set {affect}=true",
                )
    row["reviewer_status"] = "pending"
    inserted = supabase.table("exam_policy_updates").insert(row).execute().data or []
    new = inserted[0] if inserted else row
    audit_id = _audit(
        supabase, admin, "exam_intel.cms.policy_update.create",
        entity_type="exam_policy_update", entity_id=new.get("id"),
        new_value={"reason": body.reason, "row": new},
    )
    return {"ok": True, "audit_id": audit_id, "row": new}


# ════════════════════════════════════════════════════════════════════════
#  Bulk import — CSV/JSON paste-in for any CMS entity
# ════════════════════════════════════════════════════════════════════════
#
# One generic ``POST /bulk-import`` endpoint that accepts a list of rows
# plus an entity identifier. Each row goes through the same validation
# the single-row create endpoint applies — same allowed-field whitelist,
# same FK validation, same forced status. Per-row outcome is returned so
# the operator can fix the failed rows and re-submit only those.
#
# Capped at 500 rows per call so a single request can't fan out forever.


class BulkImportBody(BaseModel):
    """Body for ``POST /bulk-import``.

    ``entity`` is one of the CMS slugs already used by the per-entity
    endpoints (``exam-families``, ``exams``, ``exam-cycles``, etc.).
    ``rows`` is the list of payloads — each payload matches the
    single-row ``payload`` shape.
    """

    reason: str = Field(..., min_length=8, max_length=500)
    entity: str = Field(..., min_length=4, max_length=50)
    rows: list[dict[str, Any]] = Field(..., min_length=1, max_length=500)


# Per-entity import config. (allowed_fields, required_fields,
# enum_validations, forced_fields, fk_checks, audit_action)
_IMPORT_CONFIG: dict[str, dict[str, Any]] = {
    "exam-families": {
        "table": "exam_families",
        "allowed": _FAMILY_FIELDS,
        "required": ["slug", "name"],
        "forced": {},
        "fks": {},
        "enums": {},
        "audit": "exam_intel.cms.family.bulk_create",
    },
    "exams": {
        "table": "exams",
        "allowed": _EXAM_FIELDS,
        "required": ["slug", "name"],
        "forced": {},
        "fks": {"exam_family_id": "exam_families"},
        "enums": {"exam_type": _EXAM_TYPES},
        "audit": "exam_intel.cms.exam.bulk_create",
    },
    "exam-cycles": {
        "table": "exam_cycles",
        "allowed": _CYCLE_FIELDS,
        "required": ["exam_id", "year", "cycle_name"],
        "forced": {},
        "fks": {"exam_id": "exams"},
        "enums": {"status": _CYCLE_STATUSES},
        "audit": "exam_intel.cms.cycle.bulk_create",
    },
    "exam-phases": {
        "table": "exam_phases",
        "allowed": _PHASE_FIELDS,
        "required": ["exam_id", "phase_name", "phase_slug"],
        "forced": {},
        "fks": {"exam_id": "exams"},
        "enums": {"status": _PHASE_STATUSES},
        "audit": "exam_intel.cms.phase.bulk_create",
    },
    "syllabus-documents": {
        "table": "syllabus_documents",
        "allowed": _DOC_FIELDS,
        "required": ["exam_id", "document_type", "title"],
        "forced": {"trust_status": "pending"},  # CMS feeds the review queue
        "fks": {"exam_id": "exams"},
        "enums": {"document_type": _DOC_TYPES},
        "audit": "exam_intel.cms.syllabus_document.bulk_create",
    },
    "pyq-papers": {
        "table": "pyq_papers",
        "allowed": _PAPER_FIELDS,
        "required": ["exam_id", "year"],
        "forced": {"trust_status": "pending"},
        "fks": {"exam_id": "exams"},
        "enums": {"source_type": _PAPER_SOURCE_TYPES},
        "audit": "exam_intel.cms.pyq_paper.bulk_create",
    },
    "exam-topic-coverage": {
        "table": "exam_topic_coverage",
        "allowed": _COVERAGE_FIELDS,
        "required": ["exam_id", "topic_id"],
        "forced": {"reviewer_status": "pending_review"},
        "fks": {"exam_id": "exams"},
        "enums": {},
        "audit": "exam_intel.cms.coverage.bulk_create",
    },
    "policy-updates": {
        "table": "exam_policy_updates",
        "allowed": _POLICY_FIELDS,
        "required": ["exam_id", "update_type", "title"],
        "forced": {"reviewer_status": "pending"},
        "fks": {"exam_id": "exams"},
        "enums": {"update_type": _POLICY_UPDATE_TYPES},
        "audit": "exam_intel.cms.policy_update.bulk_create",
    },
}


def _validate_bulk_row(cfg: dict[str, Any], row: dict[str, Any], supabase, fk_cache: dict) -> tuple[dict | None, str | None]:
    """Validate one row against the entity config. Returns (cleaned_row, error_str).

    fk_cache is a per-call memo so 500 rows referencing 10 unique exam_ids
    cost 10 lookups, not 500.
    """
    if not isinstance(row, dict):
        return None, "row must be an object"
    cleaned = {k: v for k, v in row.items() if k in cfg["allowed"]}
    for req in cfg["required"]:
        if cleaned.get(req) in (None, ""):
            return None, f"missing required field {req!r}"
    for col, choices in cfg["enums"].items():
        v = cleaned.get(col)
        if v and v not in choices:
            return None, f"{col} must be one of {choices}"
    # Policy-update non-official affects_* check.
    if cfg["table"] == "exam_policy_updates" and (cleaned.get("source_type") or "official") != "official":
        for affect in ("affects_plan", "affects_deadline", "affects_eligibility",
                       "affects_documents", "affects_syllabus", "affects_vacancy"):
            if cleaned.get(affect):
                return None, f"non-official policy update cannot set {affect}=true"
    for col, fk_table in cfg["fks"].items():
        v = cleaned.get(col)
        if not v:
            continue
        cache_key = (fk_table, v)
        if cache_key in fk_cache:
            ok = fk_cache[cache_key]
        else:
            ok = bool(_safe_select(supabase, fk_table, id=v))
            fk_cache[cache_key] = ok
        if not ok:
            return None, f"{col}={v!r} does not resolve in {fk_table}"
    for col, val in cfg["forced"].items():
        cleaned[col] = val
    return cleaned, None


@router.post("/bulk-import")
def bulk_import(
    body: BulkImportBody,
    admin: dict = Depends(require_permission(PERM_CMS)),
    __: None = Depends(_flag_enabled),
) -> dict[str, Any]:
    """Insert many CMS rows in one call.

    Per-row result: ``{index, ok, error?, row?}``. Successful rows are
    inserted individually so one bad row in the middle doesn't block
    earlier or later rows. For maximum atomicity per row we don't try
    to bulk-insert all clean rows in one go — that would surface a
    Postgres-level error with no row attribution.
    """
    cfg = _IMPORT_CONFIG.get(body.entity)
    if not cfg:
        raise HTTPException(status_code=422, detail=f"Unknown entity {body.entity!r}; known: {sorted(_IMPORT_CONFIG)}")
    supabase = get_supabase_admin()
    fk_cache: dict = {}
    results: list[dict[str, Any]] = []
    ok_count = 0
    error_count = 0
    for idx, raw in enumerate(body.rows):
        cleaned, err = _validate_bulk_row(cfg, raw, supabase, fk_cache)
        if err:
            results.append({"index": idx, "ok": False, "error": err})
            error_count += 1
            continue
        try:
            inserted = supabase.table(cfg["table"]).insert(cleaned).execute().data or []
        except Exception as exc:  # noqa: BLE001
            results.append({"index": idx, "ok": False, "error": f"db: {str(exc)[:200]}"})
            error_count += 1
            continue
        row = inserted[0] if inserted else cleaned
        results.append({"index": idx, "ok": True, "row": row})
        ok_count += 1
    audit_id = _audit(
        supabase, admin, cfg["audit"],
        entity_type=cfg["table"], entity_id=None,
        new_value={
            "reason": body.reason,
            "total": len(body.rows),
            "ok": ok_count,
            "errors": error_count,
        },
    )
    return {
        "ok": error_count == 0,
        "audit_id": audit_id,
        "entity": body.entity,
        "total": len(body.rows),
        "ok_count": ok_count,
        "error_count": error_count,
        "results": results,
    }
