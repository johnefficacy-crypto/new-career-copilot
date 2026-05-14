"""Mission Control / engine-trace status for exam intelligence."""
from __future__ import annotations

import logging
from typing import Any, Callable

from app.exam_intelligence.coverage import (
    verified_pyq_topic_counts,
    verified_topic_coverage,
)
from app.exam_intelligence.lookup import resolve_exam_by_id, resolve_exam_by_slug

logger = logging.getLogger("career_copilot.exam_intelligence.status")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("exam_intelligence status read failed: %s", exc)
        return default


def _resolve(supabase: Any, exam_id_or_slug: str | None) -> dict[str, Any] | None:
    if not exam_id_or_slug:
        return None
    # Slugs look like "ssc-cgl"; uuids contain hyphens too. Try id first
    # (uuid is 36 chars), then slug as fallback.
    candidate = str(exam_id_or_slug)
    if len(candidate) == 36 and candidate.count("-") == 4:
        exam = resolve_exam_by_id(supabase, candidate)
        if exam:
            return exam
    return resolve_exam_by_slug(supabase, candidate)


def _verified_syllabus_count(supabase: Any, exam_id: str) -> int:
    rows = _safe(
        lambda: (
            supabase.table("syllabus_topic_mentions")
            .select("id, reviewer_status")
            .eq("exam_id", exam_id)
            .eq("reviewer_status", "verified")
            .limit(5000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return len(rows)


def exam_intelligence_status(
    supabase: Any, exam_id_or_slug: str | None
) -> dict[str, Any]:
    """Return ``{available, exam_id, exam_slug, exam_name, ...counts}``.

    ``available`` is true ONLY when at least one of:
      - verified topic coverage row,
      - verified PYQ topic tag,
      - verified syllabus mention,
    exists. No verified data → ``available=False``.
    """
    exam = _resolve(supabase, exam_id_or_slug)
    if not exam:
        return {
            "available": False,
            "exam_id": None,
            "exam_slug": exam_id_or_slug,
            "exam_name": None,
            "verified_topics": 0,
            "verified_pyq_tags": 0,
            "verified_syllabus_mentions": 0,
        }

    exam_id = exam.get("id")
    coverage = verified_topic_coverage(supabase, exam_id) or []
    pyq_counts = verified_pyq_topic_counts(supabase, exam_id) or {}
    syllabus_verified = _verified_syllabus_count(supabase, exam_id)
    verified_pyq_tags = sum(pyq_counts.values())

    available = bool(coverage) or verified_pyq_tags > 0 or syllabus_verified > 0
    return {
        "available": available,
        "exam_id": exam_id,
        "exam_slug": exam.get("slug"),
        "exam_name": exam.get("name"),
        "verified_topics": len(coverage),
        "verified_pyq_tags": verified_pyq_tags,
        "verified_syllabus_mentions": syllabus_verified,
    }


def exam_intelligence_summary(
    supabase: Any, exam_id_or_slug: str | None
) -> dict[str, Any]:
    """Return the full read-summary contract used by /api/exam-intelligence/exams/{slug}."""
    exam = _resolve(supabase, exam_id_or_slug)
    if not exam:
        return {
            "exam": None,
            "available": False,
            "topics": [],
            "verified_pyq_counts": {},
            "verified_syllabus_mentions": 0,
            "verified_only": True,
        }

    exam_id = exam.get("id")
    coverage = verified_topic_coverage(supabase, exam_id) or []
    pyq_counts = verified_pyq_topic_counts(supabase, exam_id) or {}
    syllabus_verified = _verified_syllabus_count(supabase, exam_id)

    topics_payload: list[dict[str, Any]] = []
    for row in coverage:
        topic_id = row.get("topic_id")
        topics_payload.append(
            {
                **row,
                "verified_pyq_count": int(pyq_counts.get(topic_id, 0)),
            }
        )

    available = bool(topics_payload) or any(pyq_counts.values()) or syllabus_verified > 0
    return {
        "exam": {
            "id": exam_id,
            "slug": exam.get("slug"),
            "name": exam.get("name"),
            "exam_type": exam.get("exam_type"),
        },
        "available": available,
        "topics": topics_payload,
        "verified_pyq_counts": pyq_counts,
        "verified_syllabus_mentions": syllabus_verified,
        "verified_only": True,
    }
