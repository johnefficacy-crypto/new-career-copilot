"""Locked-only coverage / PYQ aggregates.

Reads ``exam_topic_coverage`` joined with ``topics`` + ``subjects``.
Only ``reviewer_status='locked'`` rows are planner-ready and may surface
to aspirants. PYQ aggregates filter strictly to
``pyq_question_topic_tags.reviewer_status='verified'``.

No claims, no AI inference, no scraping. If a table is missing every
helper returns an empty list.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.coverage")

# Postgres SQLSTATEs we want to surface loudly (schema drift / missing
# table) rather than swallow as a warning.
_LOUD_PG_CODES = {"42703", "42P01"}


def _safe(call: Callable[[], Any], default: Any = None, *, table: str | None = None, operation: str | None = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        code = getattr(exc, "code", None) or getattr(exc, "pgcode", None)
        message = str(exc)
        level = logging.ERROR if code in _LOUD_PG_CODES else logging.WARNING
        logger.log(
            level,
            "exam_intelligence coverage read failed",
            extra={
                "operation": operation or "read",
                "table": table,
                "error_code": code,
                "error_message": message,
            },
        )
        return default


def locked_topic_coverage_summary(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    """Return locked topic-coverage rows for ``exam_id`` joined with topic + subject metadata.

    Only ``reviewer_status='locked'`` rows surface — the same verified-only
    contract the rest of exam intelligence uses. Joined via two follow-up
    reads against ``topics`` and ``subjects`` so behaviour is identical
    against the live client and against unit-test stubs.

    Result row shape::

        {
            "topic_id": "...",
            "topic_slug": "...",
            "topic_name": "...",
            "topic_level": "topic|microtopic|concept",
            "subject_id": "...",
            "subject_name": "...",
            "exam_priority_score": float|None,   # 0..100 numeric
            "is_high_yield": bool,
            "confidence_score": float|None,
            "reviewer_status": "locked",
            "exam_phase_id": str|None,
        }
    """
    if not exam_id:
        return []

    flat = _safe(
        lambda: (
            supabase.table("exam_topic_coverage")
            .select(
                "topic_id, exam_phase_id, exam_priority_score, "
                "is_high_yield, confidence_score, reviewer_status"
            )
            .eq("exam_id", exam_id)
            .eq("reviewer_status", "locked")
            .limit(1000)
            .execute()
            .data
        ),
        default=[],
        table="exam_topic_coverage",
        operation="select_locked_summary",
    ) or []
    topic_ids = list({r.get("topic_id") for r in flat if r.get("topic_id")})
    if not topic_ids:
        return []

    topic_rows = _safe(
        lambda: (
            supabase.table("topics")
            .select("id, slug, name, level, is_active, subject_id")
            .in_("id", topic_ids)
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
        table="topics",
        operation="select_by_ids",
    ) or []
    topics_by_id = {t["id"]: t for t in topic_rows if t.get("id")}

    subject_ids = list({t.get("subject_id") for t in topics_by_id.values() if t.get("subject_id")})
    subjects_by_id: dict[str, dict[str, Any]] = {}
    if subject_ids:
        subj_rows = _safe(
            lambda: (
                supabase.table("subjects")
                .select("id, slug, name, subject_group, is_active")
                .in_("id", subject_ids)
                .limit(500)
                .execute()
                .data
            ),
            default=[],
            table="subjects",
            operation="select_by_ids",
        ) or []
        subjects_by_id = {s["id"]: s for s in subj_rows if s.get("id")}

    out: list[dict[str, Any]] = []
    for r in flat:
        topic = topics_by_id.get(r.get("topic_id")) or {}
        if not topic or topic.get("is_active") is False:
            continue
        subject = subjects_by_id.get(topic.get("subject_id")) or {}
        if subject and subject.get("is_active") is False:
            continue
        out.append(
            {
                "topic_id": topic.get("id") or r.get("topic_id"),
                "topic_slug": topic.get("slug"),
                "topic_name": topic.get("name"),
                "topic_level": topic.get("level"),
                "subject_id": subject.get("id") or topic.get("subject_id"),
                "subject_name": subject.get("name"),
                "exam_priority_score": r.get("exam_priority_score"),
                "is_high_yield": bool(r.get("is_high_yield")),
                "confidence_score": r.get("confidence_score"),
                "reviewer_status": r.get("reviewer_status"),
                "exam_phase_id": r.get("exam_phase_id"),
            }
        )
    return out


def verified_pyq_topic_counts(supabase: Any, exam_id: str) -> dict[str, int]:
    """Return ``{topic_id: verified_pyq_count}`` for ``exam_id``.

    Only counts PYQ question→topic tags whose ``reviewer_status='verified'``.
    Joins through ``pyq_papers`` → ``pyq_questions`` → ``pyq_question_topic_tags``.
    """
    if not exam_id:
        return {}

    # Filter ``trust_status='verified'`` at the paper level. Without this
    # guard a verified question/tag attached to an unverified paper would
    # still feed planner counts — the function used to count tags filtered
    # by question/tag reviewer_status alone, never auditing the parent
    # paper's trust. Enforce the invariant at the source.
    paper_rows = _safe(
        lambda: (
            supabase.table("pyq_papers")
            .select("id")
            .eq("exam_id", exam_id)
            .eq("trust_status", "verified")
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
        table="pyq_papers",
        operation="select_verified_by_exam",
    ) or []
    paper_ids = [r["id"] for r in paper_rows if r.get("id")]
    if not paper_ids:
        return {}

    question_rows = _safe(
        lambda: (
            supabase.table("pyq_questions")
            .select("id, pyq_paper_id, reviewer_status")
            .in_("pyq_paper_id", paper_ids)
            .eq("reviewer_status", "verified")
            .limit(5000)
            .execute()
            .data
        ),
        default=[],
        table="pyq_questions",
        operation="select_verified",
    ) or []
    question_ids = [r["id"] for r in question_rows if r.get("id")]
    if not question_ids:
        return {}

    tag_rows = _safe(
        lambda: (
            supabase.table("pyq_question_topic_tags")
            .select("question_id, topic_id, reviewer_status, tag_role")
            .in_("question_id", question_ids)
            .eq("reviewer_status", "verified")
            .limit(10000)
            .execute()
            .data
        ),
        default=[],
        table="pyq_question_topic_tags",
        operation="select_verified",
    ) or []

    counts: dict[str, int] = {}
    for tag in tag_rows:
        topic_id = tag.get("topic_id")
        if not topic_id:
            continue
        counts[topic_id] = counts.get(topic_id, 0) + 1
    return counts


def locked_topic_coverage(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    """Return ``exam_topic_coverage`` rows whose ``reviewer_status='locked'``.

    Verified-only contract: ONLY ``locked`` rows are planner-ready and may
    surface to aspirants. ``draft`` / ``pending_review`` / ``reviewed`` /
    ``rejected`` rows are excluded here on purpose.

    Result row shape::

        {
            "topic": "Percentage",
            "topic_id": "...",
            "priority_score": float|None,
            "confidence_score": float|None,
            "high_yield": bool,
            "status": "locked",
        }

    Sorted by ``priority_score`` descending so callers can take the top N.
    """
    if not exam_id:
        return []

    flat = _safe(
        lambda: (
            supabase.table("exam_topic_coverage")
            .select(
                "topic_id, exam_priority_score, is_high_yield, "
                "confidence_score, reviewer_status"
            )
            .eq("exam_id", exam_id)
            .eq("reviewer_status", "locked")
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
        table="exam_topic_coverage",
        operation="select_locked",
    ) or []
    if not flat:
        return []

    topic_ids = list({r.get("topic_id") for r in flat if r.get("topic_id")})
    topic_rows = _safe(
        lambda: (
            supabase.table("topics")
            .select("id, name, slug, is_active")
            .in_("id", topic_ids)
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
        table="topics",
        operation="select_by_ids",
    ) or []
    topics_by_id = {t["id"]: t for t in topic_rows if t.get("id")}

    out: list[dict[str, Any]] = []
    for r in flat:
        topic = topics_by_id.get(r.get("topic_id")) or {}
        if topic.get("is_active") is False:
            continue
        out.append(
            {
                "topic": topic.get("name") or topic.get("slug"),
                "topic_id": r.get("topic_id"),
                "priority_score": r.get("exam_priority_score"),
                "confidence_score": r.get("confidence_score"),
                "high_yield": bool(r.get("is_high_yield")),
                "status": "locked",
            }
        )

    def _score(row: dict[str, Any]) -> float:
        try:
            return float(row.get("priority_score") or 0.0)
        except (TypeError, ValueError):
            return 0.0

    out.sort(key=_score, reverse=True)
    return out
