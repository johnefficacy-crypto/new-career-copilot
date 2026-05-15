"""Study OS — Subject progress service.

Production-grade replacement for the in-memory placeholder /subjects
endpoint. Computes per-subject progress + weak-topic count + trend
directly from locked exam_topic_coverage + user_topic_mastery rows.

Verified-only contract: only ``reviewer_status='locked'`` coverage rows
flow through. Subjects without any locked topics for the user's target
exam never appear.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from app.study_os.planner import (  # type: ignore  # private helpers reused intentionally
    _load_locked_coverage,
    _load_user_signals,
    _resolve_target_exam,
)

logger = logging.getLogger("career_copilot.study_os.subjects")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("study_os.subjects supabase call failed: %s", exc)
        return default


def _classify_trend(this_avg: float | None, prev_avg: float | None) -> str:
    """``up``/``down``/``flat`` from this-week vs last-week average mastery."""
    if this_avg is None or prev_avg is None:
        return "flat"
    delta = this_avg - prev_avg
    if delta >= 2:
        return "up"
    if delta <= -2:
        return "down"
    return "flat"


def _previous_review_mastery_by_subject(
    supabase: Any, user_id: str
) -> dict[str, float]:
    """Best-effort prior-week mastery per subject id.

    Reads the most recent ``weekly_reviews`` row's snapshot, if present,
    so the trend can compare against persisted history without recomputing.
    Returns an empty mapping when no prior snapshot exists — tests treat
    this as a clean "flat" trend.
    """
    rows = _safe(
        lambda: (
            supabase.table("weekly_reviews")
            .select("computed_at")
            .eq("user_id", user_id)
            .order("week_start", desc=True)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    # The trend channel intentionally stays flat for now — surfacing a
    # weekly delta requires persisting per-subject mastery snapshots, which
    # is its own feature. Keeping this seam in place means we can light it
    # up later without changing the public contract.
    _ = rows
    return {}


def list_subjects(supabase: Any, user_id: str) -> list[dict[str, Any]]:
    """Return per-subject progress for the user's target exam.

    Output rows match the existing frontend contract::

        {
          "subject_id": str | None,
          "subject": str,
          "progress": int (0..100),  # average mastery of locked topics
          "trend": "up" | "down" | "flat",
          "weak_count": int,
          "locked_topics": int,
        }
    """
    if not user_id:
        return []
    target = _resolve_target_exam(supabase, user_id)
    exam_id = target.get("id") if target else None
    if not exam_id:
        return []

    coverage = _load_locked_coverage(supabase, exam_id)
    if not coverage:
        return []

    mastery, error_topics = _load_user_signals(supabase, user_id, exam_id)

    # Bucket coverage rows by subject id.
    buckets: dict[str, dict[str, Any]] = {}
    for c in coverage:
        sid = c.get("subject_id") or "__no_subject__"
        bucket = buckets.setdefault(
            sid,
            {
                "subject_id": c.get("subject_id"),
                "subject": c.get("subject_name") or c.get("subject") or "Other",
                "topic_ids": [],
                "weak_count": 0,
            },
        )
        bucket["topic_ids"].append(c.get("topic_id"))
        # A topic counts as weak if (a) mastery < 50 OR (b) it has logged
        # error patterns — both signals are explicit.
        tid = c.get("topic_id")
        mast = mastery.get(tid)
        if (mast is not None and mast < 50) or tid in error_topics:
            bucket["weak_count"] += 1

    prev_by_subject = _previous_review_mastery_by_subject(supabase, user_id)

    items: list[dict[str, Any]] = []
    for sid, bucket in buckets.items():
        tids = [t for t in bucket["topic_ids"] if t]
        masts = [mastery.get(t) for t in tids if mastery.get(t) is not None]
        avg = round(sum(masts) / len(masts)) if masts else 0
        items.append(
            {
                "subject_id": bucket["subject_id"],
                "subject": bucket["subject"],
                "progress": int(avg),
                "trend": _classify_trend(avg, prev_by_subject.get(sid)),
                "weak_count": int(bucket["weak_count"]),
                "locked_topics": len(tids),
            }
        )
    # Stable order: highest weak_count first, then alphabetical.
    items.sort(key=lambda r: (-r["weak_count"], r["subject"].lower()))
    return items
