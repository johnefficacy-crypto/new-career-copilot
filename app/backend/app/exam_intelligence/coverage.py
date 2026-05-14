"""Verified-only coverage / PYQ aggregates.

Reads ``exam_topic_coverage`` joined with ``topics`` + ``subjects``
(taxonomy is itself admin-managed, so we filter only on ``is_active``).
PYQ aggregates filter strictly to ``pyq_question_topic_tags.reviewer_status='verified'``.

No claims, no AI inference, no scraping. If a table is missing every
helper returns an empty list.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.coverage")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("exam_intelligence coverage read failed: %s", exc)
        return default


def verified_topic_coverage(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    """Return active topic-coverage rows for ``exam_id``.

    Joined via two follow-up reads against ``topics`` and ``subjects``
    rather than a Supabase embedded-select, so behaviour is identical
    against the live client and against unit-test stubs.

    Result row shape::

        {
            "topic_id": "...",
            "topic_slug": "...",
            "topic_name": "...",
            "topic_level": "topic|microtopic|concept",
            "subject_id": "...",
            "subject_name": "...",
            "priority": int|None,
            "exam_phase_id": str|None,
        }
    """
    if not exam_id:
        return []

    flat = _safe(
        lambda: (
            supabase.table("exam_topic_coverage")
            .select("topic_id, exam_phase_id, priority, is_active")
            .eq("exam_id", exam_id)
            .eq("is_active", True)
            .limit(1000)
            .execute()
            .data
        ),
        default=[],
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
                "priority": r.get("priority"),
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

    paper_rows = _safe(
        lambda: (
            supabase.table("pyq_papers")
            .select("id")
            .eq("exam_id", exam_id)
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
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
    ) or []

    counts: dict[str, int] = {}
    for tag in tag_rows:
        topic_id = tag.get("topic_id")
        if not topic_id:
            continue
        counts[topic_id] = counts.get(topic_id, 0) + 1
    return counts
