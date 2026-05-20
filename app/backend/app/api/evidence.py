"""Universal evidence read API.

Surfaces the row that backs a TrustStamp / SourceTrustBadge on any
production surface. Admin-only — the evidence drawer is reviewer
tooling, not user-facing.

A ``kind`` is a domain label that maps to an underlying table. The
endpoint is intentionally narrow: it returns the canonical row plus a
shallow trust envelope (status / confidence / reviewed_at). It does not
synthesize prose or compute trust labels; the source row already carries
those.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_permission
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.evidence")

EVIDENCE_PERM = "exam_intelligence.review"

router = APIRouter(prefix="/evidence", tags=["evidence"])


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("evidence read failed: %s", exc)
        return default


# Each evidence kind maps to a table + the columns to project + the
# columns we copy into the response envelope. Keep this list narrow and
# explicit — adding a kind is a deliberate, reviewer-visible change.
_KIND_MAP: dict[str, dict[str, Any]] = {
    "exam_topic_coverage": {
        "table": "exam_topic_coverage",
        "select": (
            "id, exam_id, exam_cycle_id, exam_phase_id, section_id, topic_id, "
            "coverage_depth, expected_difficulty, exam_priority_score, "
            "is_high_yield, confidence_score, source_basis, reviewer_status, "
            "reviewed_by, reviewed_at, reviewer_notes, metadata, created_at"
        ),
        "trust": {
            "status_field": "reviewer_status",
            "confidence_field": "confidence_score",
        },
    },
    "syllabus_topic_mention": {
        "table": "syllabus_topic_mentions",
        "select": (
            "id, exam_id, exam_cycle_id, exam_phase_id, topic_id, raw_text, "
            "normalized_text, mention_type, confidence_score, reviewer_status, "
            "reviewed_by, reviewed_at, reviewer_notes, created_at"
        ),
        "trust": {
            "status_field": "reviewer_status",
            "confidence_field": "confidence_score",
        },
    },
    "pyq_question_topic_tag": {
        "table": "pyq_question_topic_tags",
        "select": (
            "id, pyq_question_id, topic_id, confidence_score, reviewer_status, "
            "reviewed_by, reviewed_at, created_at"
        ),
        "trust": {
            "status_field": "reviewer_status",
            "confidence_field": "confidence_score",
        },
    },
    "pyq_question": {
        "table": "pyq_questions",
        "select": (
            "id, exam_id, exam_cycle_id, exam_phase_id, question_text, "
            "source_url, year, reviewer_status, reviewed_by, reviewed_at, created_at"
        ),
        "trust": {"status_field": "reviewer_status", "confidence_field": None},
    },
    # pyq_option is in the admin review queue (admin_exam_intelligence
    # ``_REVIEWABLE``); add it here so the evidence drawer can deep-link
    # to it the same way it deep-links every other reviewable kind.
    "pyq_option": {
        "table": "pyq_options",
        "select": (
            "id, question_id, option_label, option_text, is_correct, "
            "normalized_value, reviewer_status, reviewed_by, reviewed_at, "
            "metadata, created_at"
        ),
        "trust": {"status_field": "reviewer_status", "confidence_field": None},
    },
    "exam_competition_metrics": {
        "table": "exam_competition_metrics",
        "select": (
            "id, exam_id, exam_cycle_id, exam_phase_id, vacancy_total, "
            "vacancy_by_category, applicant_count, selection_ratio, cutoff_trend, "
            "difficulty_trend, competition_pressure_score, source_basis, "
            "confidence_score, evidence_count, reviewer_status, reviewed_at, "
            "reviewer_notes, metadata, created_at"
        ),
        "trust": {
            "status_field": "reviewer_status",
            "confidence_field": "confidence_score",
        },
    },
    "exam_policy_updates": {
        "table": "exam_policy_updates",
        "select": (
            "id, exam_id, exam_cycle_id, source_id, update_type, title, summary, "
            "source_url, source_type, claim_status, reviewer_status, affects_plan, "
            "affects_deadline, affects_eligibility, affects_documents, "
            "affects_syllabus, affects_vacancy, change_summary, published_at, "
            "effective_from, reviewed_at, reviewer_notes, created_at"
        ),
        "trust": {"status_field": "reviewer_status", "confidence_field": None},
    },
    "study_adaptation_event": {
        "table": "study_adaptation_events",
        "select": (
            "id, user_id, plan_id, plan_version_id, event_type, trigger_source, "
            "trigger_payload, change_summary, created_at"
        ),
        "trust": {"status_field": None, "confidence_field": None},
    },
}


@router.get("/{kind}/{row_id}")
def get_evidence(
    kind: str,
    row_id: str,
    _admin: dict = Depends(require_permission(EVIDENCE_PERM)),
) -> dict[str, Any]:
    """Return the raw evidence row for ``(kind, row_id)`` plus a trust envelope.

    Used by EvidenceDrawer to deep-link from any TrustStamp to the
    underlying source. Returns 400 when ``kind`` is not registered and 404
    when the row is missing.
    """
    cfg = _KIND_MAP.get(kind)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown evidence kind: {kind}")
    sb = get_supabase_admin()
    rows = _safe(
        lambda: (
            sb.table(cfg["table"]).select(cfg["select"]).eq("id", row_id).limit(1).execute().data
        ),
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Evidence row not found")
    row = rows[0]
    trust = cfg.get("trust") or {}
    status_field = trust.get("status_field")
    confidence_field = trust.get("confidence_field")
    return {
        "kind": kind,
        "id": row.get("id"),
        "row": row,
        "trust": {
            "status": row.get(status_field) if status_field else None,
            "confidence_score": row.get(confidence_field) if confidence_field else None,
            "reviewed_at": row.get("reviewed_at"),
        },
    }
