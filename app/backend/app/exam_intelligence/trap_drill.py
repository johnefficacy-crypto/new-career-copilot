"""Trap-awareness drill — server-built quiz over the option-analytics rollups.

Builds a short MCQ run from verified ``pyq_questions`` whose options
carry known ``pyq_option_patterns`` annotations (``common_trap``,
``elimination_pattern``, ``repeated_value``). Falls back to recently
verified questions when not enough annotated ones exist, so the drill
still works on freshly seeded exams.

Every drill payload carries server-rendered ``trap_insights`` per
option so the frontend can render the post-answer reveal without
re-doing analytics.
"""
from __future__ import annotations

import logging
import random
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.trap_drill")

_PATTERN_DISPLAY = {
    "common_trap": "Commonly-chosen wrong answer.",
    "elimination_pattern": "Structural elimination marker.",
    "repeated_value": "This option keeps reappearing in past papers.",
}

# Markers to a friendlier name used inside ``trap_insights[*].note``.
_MARKER_DISPLAY = {
    "all_of_the_above": "All of the above",
    "none_of_the_above": "None of the above",
    "both_x_and_y": "Both X and Y",
    "neither_x_nor_y": "Neither X nor Y",
    "subset_only": "Multi-item combination only",
    "single_only": "Single-item only (e.g. \"1 only\")",
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("trap_drill read failed: %s", exc)
        return default


def _option_pattern_note(pattern_type: str, metadata: dict[str, Any] | None) -> str:
    md = metadata or {}
    base = _PATTERN_DISPLAY.get(pattern_type, "Notable option pattern.")
    if pattern_type == "elimination_pattern":
        marker = md.get("marker")
        if marker:
            display = _MARKER_DISPLAY.get(marker, marker.replace("_", " "))
            return f"{base} ({display})"
    if pattern_type in ("common_trap", "repeated_value"):
        occ = md.get("occurrence_count")
        if isinstance(occ, int) and occ >= 2:
            return f"{base} Reused ×{occ} across PYQs."
    return base


def _shape_question(
    q_row: dict[str, Any],
    options_for_q: list[dict[str, Any]],
    patterns_for_q: list[dict[str, Any]],
    paper_year: int | None,
) -> dict[str, Any]:
    options_payload: list[dict[str, Any]] = []
    correct_option_id: str | None = None
    for o in sorted(
        options_for_q,
        key=lambda x: (x.get("option_label") or "", x.get("id") or ""),
    ):
        oid = o.get("id")
        if not oid:
            continue
        if o.get("is_correct"):
            correct_option_id = oid
        options_payload.append(
            {
                "id": oid,
                "label": o.get("option_label"),
                "text": o.get("option_text") or "",
            }
        )

    trap_insights: list[dict[str, Any]] = []
    for p in patterns_for_q:
        oid = p.get("option_id")
        if not oid:
            continue
        trap_insights.append(
            {
                "option_id": oid,
                "pattern_type": p.get("pattern_type"),
                "note": _option_pattern_note(
                    p.get("pattern_type") or "", p.get("metadata")
                ),
            }
        )

    return {
        "id": q_row.get("id"),
        "question_text": q_row.get("question_text") or "",
        "year": paper_year,
        "options": options_payload,
        "correct_option_id": correct_option_id,
        "trap_insights": trap_insights,
    }


def build_trap_drill(
    sb: Any,
    exam_id: str,
    *,
    topic_id: str | None = None,
    size: int = 5,
    seed: int | None = None,
) -> dict[str, Any]:
    """Return ``size`` verified MCQs primed for a trap-awareness drill.

    Selection priority:
    1. Verified questions whose options carry ``common_trap`` or
       ``elimination_pattern`` rows (the richest drills).
    2. Then any other verified question on the exam (so the drill
       still works pre-recompute, just without highlighted insights).

    ``seed`` is exposed for testing — production callers leave it
    unset so each fetch returns a fresh shuffle.
    """
    out: dict[str, Any] = {
        "exam_id": exam_id,
        "topic_id": topic_id,
        "verified_only": True,
        "questions": [],
        "total_pool_size": 0,
        "trap_annotated_pool_size": 0,
    }
    if not exam_id or size <= 0:
        return out

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
    paper_ids = [p["id"] for p in paper_rows if p.get("id")]
    if not paper_ids:
        return out
    year_by_paper = {p["id"]: p.get("year") for p in paper_rows if p.get("id")}

    question_rows = _safe(
        lambda: (
            sb.table("pyq_questions")
            .select("id, pyq_paper_id, question_text, reviewer_status")
            .in_("pyq_paper_id", paper_ids)
            .eq("reviewer_status", "verified")
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    question_ids = [q["id"] for q in question_rows if q.get("id")]
    if not question_ids:
        return out

    # Topic-tag scoping (verified tags only) when topic_id is supplied.
    if topic_id:
        tag_rows = _safe(
            lambda: (
                sb.table("pyq_question_topic_tags")
                .select("question_id")
                .in_("question_id", question_ids)
                .eq("topic_id", topic_id)
                .eq("reviewer_status", "verified")
                .limit(20000)
                .execute()
                .data
            ),
            default=[],
        ) or []
        scoped_qids = {r.get("question_id") for r in tag_rows if r.get("question_id")}
        question_ids = [qid for qid in question_ids if qid in scoped_qids]
        if not question_ids:
            return out

    option_rows = _safe(
        lambda: (
            sb.table("pyq_options")
            .select("id, question_id, option_label, option_text, is_correct")
            .in_("question_id", question_ids)
            .limit(80000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    options_by_qid: dict[str, list[dict[str, Any]]] = {}
    options_by_id: dict[str, dict[str, Any]] = {}
    for o in option_rows:
        qid = o.get("question_id")
        if not qid:
            continue
        options_by_qid.setdefault(qid, []).append(o)
        if o.get("id"):
            options_by_id[o["id"]] = o

    pattern_rows: list[dict[str, Any]] = []
    if options_by_id:
        pattern_rows = _safe(
            lambda: (
                sb.table("pyq_option_patterns")
                .select("option_id, pattern_type, metadata")
                .in_("option_id", list(options_by_id))
                .in_("pattern_type", ["common_trap", "elimination_pattern", "repeated_value"])
                .limit(40000)
                .execute()
                .data
            ),
            default=[],
        ) or []
    patterns_by_qid: dict[str, list[dict[str, Any]]] = {}
    for p in pattern_rows:
        opt = options_by_id.get(p.get("option_id"))
        if not opt:
            continue
        patterns_by_qid.setdefault(opt["question_id"], []).append(p)

    # Drop questions that don't actually have at least 2 options + a
    # correct one — half-ingested rows would render an unanswerable
    # drill card.
    def _drillable(qid: str) -> bool:
        opts = options_by_qid.get(qid) or []
        return len(opts) >= 2 and any(o.get("is_correct") for o in opts)

    pool = [q for q in question_rows if q.get("id") in question_ids and _drillable(q["id"])]
    annotated = [q for q in pool if patterns_by_qid.get(q["id"])]
    out["total_pool_size"] = len(pool)
    out["trap_annotated_pool_size"] = len(annotated)
    if not pool:
        return out

    rng = random.Random(seed)
    rng.shuffle(annotated)
    pick: list[dict[str, Any]] = list(annotated[:size])
    if len(pick) < size:
        remaining = [q for q in pool if q not in pick]
        rng.shuffle(remaining)
        pick.extend(remaining[: size - len(pick)])

    shaped = []
    for q in pick:
        paper_year = year_by_paper.get(q.get("pyq_paper_id"))
        shaped.append(
            _shape_question(
                q,
                options_by_qid.get(q["id"], []),
                patterns_by_qid.get(q["id"], []),
                paper_year,
            )
        )
    out["questions"] = shaped
    return out
