"""Trap-awareness drill — server-built quiz over the option-analytics rollups.

Builds a short MCQ run from verified ``pyq_questions`` whose options
carry known ``pyq_option_patterns`` annotations (``common_trap``,
``elimination_pattern``, ``repeated_value``). Falls back to recently
verified questions when not enough annotated ones exist, so the drill
still works on freshly seeded exams.

Every drill payload carries server-rendered ``trap_insights`` per
option so the frontend can render the post-answer reveal without
re-doing analytics.

Adaptive ranking: when ``user_id`` is supplied, the builder consults
``user_trap_drill_attempts`` and reorders the candidate pool so that
questions the user has previously missed (``is_correct=false`` within
the last ADAPTIVE_HISTORY_DAYS) bubble to the top and questions the
user has answered correctly very recently are pushed to the bottom.
This is the only behaviour change keyed on the user — anonymous calls
get the same shuffle as before.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.trap_drill")

# How far back the adaptive ranker looks when deciding whether the user
# has missed (or aced) a candidate question. Long enough that the
# ranker has signal, short enough that improvements aren't penalised
# forever.
ADAPTIVE_HISTORY_DAYS = 90

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


def _adaptive_history(
    sb: Any, user_id: str, question_ids: list[str]
) -> tuple[set[str], set[str]]:
    """Return ``(missed_qids, recent_correct_qids)`` for the user.

    Only looks at the last ``ADAPTIVE_HISTORY_DAYS``. ``missed_qids``
    is "the user got this question wrong at least once". ``recent_
    correct_qids`` is "the user got this right within the last 30 days"
    — used to push easy wins to the back of the queue so drills feel
    less repetitive.
    """
    if not user_id or not question_ids:
        return set(), set()
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=ADAPTIVE_HISTORY_DAYS)
    ).isoformat()
    rows = _safe(
        lambda: (
            sb.table("user_trap_drill_attempts")
            .select("question_id, is_correct, attempted_at")
            .eq("user_id", user_id)
            .in_("question_id", question_ids)
            .gte("attempted_at", cutoff)
            .limit(20000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    missed: set[str] = set()
    recent_correct: set[str] = set()
    recent_cutoff = (
        datetime.now(timezone.utc) - timedelta(days=30)
    ).isoformat()
    for r in rows:
        qid = r.get("question_id")
        if not qid:
            continue
        if r.get("is_correct") is False:
            missed.add(qid)
        elif r.get("is_correct") is True and (r.get("attempted_at") or "") >= recent_cutoff:
            recent_correct.add(qid)
    # Don't double-count: if the user has both missed and recently aced
    # a question, treat it as missed (re-drill until consistently right).
    recent_correct.difference_update(missed)
    return missed, recent_correct


def build_trap_drill(
    sb: Any,
    exam_id: str,
    *,
    topic_id: str | None = None,
    size: int = 5,
    seed: int | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Return ``size`` verified MCQs primed for a trap-awareness drill.

    Selection priority:
    1. Verified questions whose options carry ``common_trap`` or
       ``elimination_pattern`` rows (the richest drills).
    2. Then any other verified question on the exam (so the drill
       still works pre-recompute, just without highlighted insights).

    When ``user_id`` is supplied the candidate pool is reordered by
    ``_adaptive_history``: missed-before questions first, recently-aced
    questions last. ``seed`` makes the shuffle deterministic for tests
    and for the deep-link contract.

    The effective seed used to build this drill is returned on the
    payload as ``drill_seed`` so the client can pin it into a deep-link.
    """
    # Pin the seed up-front so the deep-link contract can echo it back
    # even when the caller passes ``None`` and we generate a fresh one.
    effective_seed = (
        seed
        if isinstance(seed, int)
        else random.SystemRandom().randint(1, 2**31 - 1)
    )
    out: dict[str, Any] = {
        "exam_id": exam_id,
        "topic_id": topic_id,
        "verified_only": True,
        "questions": [],
        "total_pool_size": 0,
        "trap_annotated_pool_size": 0,
        "drill_seed": effective_seed,
        "adaptive": bool(user_id),
        "personalised_for_user": bool(user_id),
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

    missed_qids: set[str] = set()
    recent_correct_qids: set[str] = set()
    if user_id:
        missed_qids, recent_correct_qids = _adaptive_history(
            sb, user_id, [q["id"] for q in pool]
        )

    rng = random.Random(effective_seed)

    def _rank(q: dict[str, Any]) -> tuple[int, float]:
        """Lower rank = picked sooner. ``rng.random()`` breaks ties."""
        qid = q["id"]
        if qid in missed_qids:
            primary = 0  # show me what I keep getting wrong
        elif qid in recent_correct_qids:
            primary = 2  # I just aced this — push to the back
        else:
            primary = 1
        return (primary, rng.random())

    annotated.sort(key=_rank)
    pick: list[dict[str, Any]] = list(annotated[:size])
    if len(pick) < size:
        remaining = [q for q in pool if q not in pick]
        remaining.sort(key=_rank)
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
    out["adaptive_summary"] = {
        "missed_before": len([q for q in pick if q["id"] in missed_qids]),
        "recently_correct": len([q for q in pick if q["id"] in recent_correct_qids]),
        "fresh": len(
            [q for q in pick if q["id"] not in missed_qids and q["id"] not in recent_correct_qids]
        ),
    }
    return out


def log_drill_attempts(
    sb: Any,
    *,
    user_id: str,
    exam_id: str,
    attempts: list[dict[str, Any]],
    drill_seed: str | int | None = None,
) -> dict[str, Any]:
    """Insert one ``user_trap_drill_attempts`` row per attempt.

    Returns ``{"inserted": N, "skipped": M}``. Skipped rows are ones
    where the inbound payload was missing ``question_id`` or
    ``is_correct`` — we drop them rather than failing the whole batch
    because the typical UI failure mode is "one mid-drill row is
    malformed, the rest are fine".
    """
    if not user_id or not exam_id or not isinstance(attempts, list):
        return {"inserted": 0, "skipped": 0}
    seed_str = str(drill_seed) if drill_seed is not None else None
    rows: list[dict[str, Any]] = []
    skipped = 0
    for a in attempts:
        if not isinstance(a, dict):
            skipped += 1
            continue
        qid = a.get("question_id")
        is_correct = a.get("is_correct")
        if not qid or not isinstance(is_correct, bool):
            skipped += 1
            continue
        rows.append(
            {
                "user_id": user_id,
                "exam_id": exam_id,
                "topic_id": a.get("topic_id") or None,
                "question_id": qid,
                "option_id": a.get("option_id") or None,
                "is_correct": is_correct,
                "drill_seed": seed_str,
            }
        )
    if not rows:
        return {"inserted": 0, "skipped": skipped}
    inserted = _safe(
        lambda: sb.table("user_trap_drill_attempts").insert(rows).execute().data,
        default=[],
    ) or []
    return {"inserted": len(inserted), "skipped": skipped}


def drill_streak(sb: Any, *, user_id: str, exam_id: str | None = None) -> dict[str, Any]:
    """Compute the user's drill streak from ``user_trap_drill_attempts``.

    A "streak day" is any calendar day (UTC) on which the user logged
    at least one drill attempt. ``current_streak_days`` counts back
    from today, breaking on the first gap. ``longest_streak_days``
    walks the entire history. ``drills_this_week`` is a 7-day rolling
    count of distinct attempt-days, not attempts — keeps it from
    inflating off long drills.
    """
    if not user_id:
        return {
            "current_streak_days": 0,
            "longest_streak_days": 0,
            "drills_this_week": 0,
            "total_attempts": 0,
            "last_attempt_at": None,
        }
    q = (
        sb.table("user_trap_drill_attempts")
        .select("attempted_at, exam_id")
        .eq("user_id", user_id)
    )
    if exam_id:
        q = q.eq("exam_id", exam_id)
    rows = _safe(
        lambda: q.order("attempted_at", desc=True).limit(20000).execute().data,
        default=[],
    ) or []
    if not rows:
        return {
            "current_streak_days": 0,
            "longest_streak_days": 0,
            "drills_this_week": 0,
            "total_attempts": 0,
            "last_attempt_at": None,
        }
    # Distinct UTC dates the user logged something on.
    days: set[str] = set()
    last_attempt_at = rows[0].get("attempted_at")
    for r in rows:
        ts = r.get("attempted_at")
        if not ts:
            continue
        # ISO timestamp slice → 'YYYY-MM-DD'.
        days.add(ts[:10])
    today = datetime.now(timezone.utc).date()
    seven_days_ago = today - timedelta(days=6)
    drills_this_week = sum(
        1
        for d in days
        if seven_days_ago.isoformat() <= d <= today.isoformat()
    )
    # Current streak: walk back from today (or yesterday if no attempt
    # today) until we hit a missing day.
    current_streak = 0
    cursor = today
    if cursor.isoformat() not in days:
        cursor = cursor - timedelta(days=1)
    while cursor.isoformat() in days:
        current_streak += 1
        cursor = cursor - timedelta(days=1)
    # Longest streak: walk sorted days, count consecutive runs.
    sorted_days = sorted(days)
    longest = 0
    run = 0
    prev: datetime | None = None
    for d in sorted_days:
        dt = datetime.fromisoformat(d).date()
        if prev is not None and (dt - prev).days == 1:
            run += 1
        else:
            run = 1
        if run > longest:
            longest = run
        prev = dt
    return {
        "current_streak_days": current_streak,
        "longest_streak_days": longest,
        "drills_this_week": drills_this_week,
        "total_attempts": len(rows),
        "last_attempt_at": last_attempt_at,
    }
