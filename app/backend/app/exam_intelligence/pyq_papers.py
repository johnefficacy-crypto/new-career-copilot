"""PYQ paper inventory + difficulty heatmap (Phase 12).

Surfaces only PYQ papers whose ``trust_status='verified'`` and questions
whose ``reviewer_status='verified'``. The heatmap counts verified
questions by (subject, observed_difficulty) so admins/aspirants can see
where prep weight should sit.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.pyq_papers")

_DIFFICULTY_BUCKETS = ("easy", "medium", "hard", "unknown")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("pyq_papers read failed: %s", exc)
        return default


def _normalize_difficulty(value: Any) -> str:
    if not value:
        return "unknown"
    text = str(value).strip().lower()
    if text in _DIFFICULTY_BUCKETS:
        return text
    if text in ("e", "easy_low", "easy_mid"):
        return "easy"
    if text in ("m", "moderate", "medium_high"):
        return "medium"
    if text in ("h", "tough", "very_hard"):
        return "hard"
    return "unknown"


def verified_pyq_papers(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    """Return verified PYQ papers for ``exam_id`` newest first."""
    if not exam_id:
        return []
    rows = _safe(
        lambda: (
            supabase.table("pyq_papers")
            .select(
                "id, exam_id, exam_cycle_id, exam_phase_id, year, "
                "paper_date, shift, paper_code, source_url, source_type, trust_status"
            )
            .eq("exam_id", exam_id)
            .eq("trust_status", "verified")
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []

    phase_ids = {r.get("exam_phase_id") for r in rows if r.get("exam_phase_id")}
    phases_by_id: dict[str, dict[str, Any]] = {}
    if phase_ids:
        phase_rows = _safe(
            lambda: (
                supabase.table("exam_phases")
                .select("id, phase_name, phase_slug")
                .in_("id", list(phase_ids))
                .limit(200)
                .execute()
                .data
            ),
            default=[],
        ) or []
        phases_by_id = {p["id"]: p for p in phase_rows if p.get("id")}

    out: list[dict[str, Any]] = []
    for r in rows:
        phase = phases_by_id.get(r.get("exam_phase_id") or "") or {}
        out.append(
            {
                "id": r.get("id"),
                "year": r.get("year"),
                "paper_date": r.get("paper_date"),
                "shift": r.get("shift"),
                "paper_code": r.get("paper_code"),
                "source_url": r.get("source_url"),
                "source_type": r.get("source_type"),
                "phase_id": r.get("exam_phase_id"),
                "phase_name": phase.get("phase_name"),
                "phase_slug": phase.get("phase_slug"),
            }
        )

    out.sort(key=lambda p: (p.get("year") or 0, p.get("paper_date") or ""), reverse=True)
    return out


def difficulty_heatmap(supabase: Any, exam_id: str) -> dict[str, Any]:
    """Subject × difficulty count grid built from verified PYQ questions.

    Returns::

        {
          "buckets": ["easy", "medium", "hard", "unknown"],
          "rows": [
            {"subject_id": "...", "subject_name": "Quant",
             "counts": {"easy": 12, "medium": 33, "hard": 8, "unknown": 4},
             "total": 57},
            ...
          ],
          "verified_question_count": 412
        }
    """
    if not exam_id:
        return {"buckets": list(_DIFFICULTY_BUCKETS), "rows": [], "verified_question_count": 0}

    paper_rows = _safe(
        lambda: (
            supabase.table("pyq_papers")
            .select("id")
            .eq("exam_id", exam_id)
            .eq("trust_status", "verified")
            .limit(1000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    paper_ids = [r["id"] for r in paper_rows if r.get("id")]
    if not paper_ids:
        return {"buckets": list(_DIFFICULTY_BUCKETS), "rows": [], "verified_question_count": 0}

    question_rows = _safe(
        lambda: (
            supabase.table("pyq_questions")
            .select("id, pyq_paper_id, observed_difficulty, reviewer_status")
            .in_("pyq_paper_id", paper_ids)
            .eq("reviewer_status", "verified")
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not question_rows:
        return {"buckets": list(_DIFFICULTY_BUCKETS), "rows": [], "verified_question_count": 0}

    question_ids = [r["id"] for r in question_rows if r.get("id")]
    difficulty_by_qid = {
        r["id"]: _normalize_difficulty(r.get("observed_difficulty"))
        for r in question_rows
    }

    tag_rows = _safe(
        lambda: (
            supabase.table("pyq_question_topic_tags")
            .select("question_id, topic_id, tag_role, reviewer_status")
            .in_("question_id", question_ids)
            .eq("reviewer_status", "verified")
            .eq("tag_role", "primary")
            .limit(40000)
            .execute()
            .data
        ),
        default=[],
    ) or []

    # Each question may have multiple primary tags; we keep the first to
    # avoid double-counting subjects against a single question.
    primary_topic_by_qid: dict[str, str] = {}
    for tag in tag_rows:
        qid = tag.get("question_id")
        tid = tag.get("topic_id")
        if not qid or not tid or qid in primary_topic_by_qid:
            continue
        primary_topic_by_qid[qid] = tid

    topic_ids = list(set(primary_topic_by_qid.values()))
    subject_by_topic: dict[str, str] = {}
    if topic_ids:
        topic_rows = _safe(
            lambda: (
                supabase.table("topics")
                .select("id, subject_id, is_active")
                .in_("id", topic_ids)
                .limit(5000)
                .execute()
                .data
            ),
            default=[],
        ) or []
        subject_by_topic = {
            t["id"]: t["subject_id"]
            for t in topic_rows
            if t.get("id") and t.get("subject_id") and t.get("is_active") is not False
        }

    subject_ids = list(set(subject_by_topic.values()))
    subjects_by_id: dict[str, dict[str, Any]] = {}
    if subject_ids:
        subj_rows = _safe(
            lambda: (
                supabase.table("subjects")
                .select("id, name, slug, is_active")
                .in_("id", subject_ids)
                .limit(500)
                .execute()
                .data
            ),
            default=[],
        ) or []
        subjects_by_id = {
            s["id"]: s
            for s in subj_rows
            if s.get("id") and s.get("is_active") is not False
        }

    counts: dict[str, dict[str, int]] = {}
    for qid, difficulty in difficulty_by_qid.items():
        topic_id = primary_topic_by_qid.get(qid)
        subject_id = subject_by_topic.get(topic_id) if topic_id else None
        if not subject_id or subject_id not in subjects_by_id:
            continue
        bucket = counts.setdefault(subject_id, {b: 0 for b in _DIFFICULTY_BUCKETS})
        bucket[difficulty] = bucket.get(difficulty, 0) + 1

    rows: list[dict[str, Any]] = []
    for subject_id, bucket in counts.items():
        subject = subjects_by_id.get(subject_id) or {}
        total = sum(bucket.values())
        rows.append(
            {
                "subject_id": subject_id,
                "subject_name": subject.get("name"),
                "subject_slug": subject.get("slug"),
                "counts": bucket,
                "total": total,
            }
        )
    rows.sort(key=lambda r: r.get("total") or 0, reverse=True)

    return {
        "buckets": list(_DIFFICULTY_BUCKETS),
        "rows": rows,
        "verified_question_count": len(difficulty_by_qid),
    }
