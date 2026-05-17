"""Aspirant-facing reader for option-level analytics rollups.

Reads from the materialised ``pyq_option_repetitions`` and
``pyq_option_patterns`` tables that the admin recompute endpoint
populates. Returns a clean, UI-shaped payload — including
human-readable ``tip`` strings rendered server-side so the frontend
stays dumb. Verified-only contract: the rollups derive from verified
questions only, so anything surfaced here is transitively verified.

The endpoint returns gracefully empty payloads when the rollup tables
haven't been populated for an exam yet, so the UI can render a neutral
"no insights ready" state without erroring out.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.option_insights")

# Display names for the elimination markers emitted by the admin
# recompute. Kept here (not imported from the admin module) so the
# aspirant reader doesn't depend on the admin surface.
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
        logger.warning("option_insights read failed: %s", exc)
        return default


def _distractor_tip(row: dict[str, Any]) -> str:
    occ = int(row.get("occurrence_count") or 0)
    first_year = row.get("first_seen_year")
    last_year = row.get("last_seen_year")
    label = (row.get("normalized_value") or "").strip() or "this option"
    year_clause = ""
    if first_year and last_year and first_year != last_year:
        year_clause = f" between {first_year} and {last_year}"
    elif last_year:
        year_clause = f" in {last_year}"
    wrong = int(((row.get("metadata") or {}).get("is_wrong_count")) or 0)
    if wrong and wrong >= occ - 1:
        return f"Examiners reused “{label}” {occ}× as a distractor{year_clause} — it's almost always wrong."
    if wrong:
        return f"“{label}” has shown up {occ}× across PYQs{year_clause}; wrong {wrong} of those times."
    return f"“{label}” recurred {occ}×{year_clause} in past papers."


def _elimination_tip(marker: str, occ: int, correct: int) -> str:
    display = _MARKER_DISPLAY.get(marker, marker.replace("_", " "))
    if not occ:
        return f"“{display}” is rare on this exam."
    if correct <= 0:
        return f"“{display}” appeared {occ}× — and was never the correct answer."
    rate_pct = round(100 * correct / occ)
    return f"“{display}” shows up {occ}× — correct only {rate_pct}% of the time."


def option_insights(
    sb: Any,
    exam_id: str,
    *,
    topic_id: str | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Return the aspirant-shaped option-insights payload for one exam.

    Reads only the materialised rollup tables; if those are empty for
    the exam the response carries ``has_data=False`` and empty arrays.
    """
    out: dict[str, Any] = {
        "exam_id": exam_id,
        "topic_id": topic_id,
        "verified_only": True,
        "has_data": False,
        "recurring_distractors": [],
        "elimination_tips": [],
    }
    if not exam_id:
        return out

    # 1. Recurring distractors — read repetitions table directly.
    rep_q = (
        sb.table("pyq_option_repetitions")
        .select(
            "normalized_value, occurrence_count, first_seen_year, "
            "last_seen_year, metadata, topic_id"
        )
        .eq("exam_id", exam_id)
    )
    if topic_id:
        rep_q = rep_q.eq("topic_id", topic_id)
    reps = _safe(lambda: rep_q.limit(500).execute().data, default=[]) or []

    # 2. Elimination tips — walk papers → questions → options →
    #    patterns so we can scope per-exam without an exam_id on the
    #    pattern table. Skip the join when the materialised tables
    #    haven't been populated.
    paper_rows = _safe(
        lambda: (
            sb.table("pyq_papers")
            .select("id")
            .eq("exam_id", exam_id)
            .limit(2000)
            .execute()
            .data
        ),
        default=[],
    ) or []
    paper_ids = [p["id"] for p in paper_rows if p.get("id")]
    elim_rows: list[dict[str, Any]] = []
    options_by_id: dict[str, dict[str, Any]] = {}
    if paper_ids:
        q_rows = _safe(
            lambda: (
                sb.table("pyq_questions")
                .select("id")
                .in_("pyq_paper_id", paper_ids)
                .eq("reviewer_status", "verified")
                .limit(10000)
                .execute()
                .data
            ),
            default=[],
        ) or []
        q_ids = [q["id"] for q in q_rows if q.get("id")]
        if q_ids:
            opt_rows = _safe(
                lambda: (
                    sb.table("pyq_options")
                    .select("id, is_correct, question_id")
                    .in_("question_id", q_ids)
                    .limit(40000)
                    .execute()
                    .data
                ),
                default=[],
            ) or []
            options_by_id = {o["id"]: o for o in opt_rows if o.get("id")}
            if options_by_id:
                elim_rows = _safe(
                    lambda: (
                        sb.table("pyq_option_patterns")
                        .select("option_id, pattern_type, metadata, topic_id")
                        .in_("option_id", list(options_by_id))
                        .eq("pattern_type", "elimination_pattern")
                        .limit(20000)
                        .execute()
                        .data
                    ),
                    default=[],
                ) or []
                if topic_id:
                    elim_rows = [r for r in elim_rows if r.get("topic_id") == topic_id]

    # ── Shape distractors ────────────────────────────────────────────
    # Bias toward wrong-leaning recurrences; if metadata is missing,
    # fall back to occurrence_count.
    def _wrong_bias(row: dict[str, Any]) -> tuple[int, int]:
        md = row.get("metadata") or {}
        wrong = int(md.get("is_wrong_count") or 0)
        occ = int(row.get("occurrence_count") or 0)
        return (wrong, occ)

    reps.sort(key=lambda r: (-_wrong_bias(r)[0], -_wrong_bias(r)[1]))
    seen_values: set[str] = set()
    for r in reps:
        key = (r.get("normalized_value") or "").strip().lower()
        if not key or key in seen_values:
            continue
        seen_values.add(key)
        out["recurring_distractors"].append(
            {
                "normalized_value": r.get("normalized_value"),
                "occurrence_count": int(r.get("occurrence_count") or 0),
                "first_seen_year": r.get("first_seen_year"),
                "last_seen_year": r.get("last_seen_year"),
                "wrong_count": int((r.get("metadata") or {}).get("is_wrong_count") or 0),
                "correct_count": int((r.get("metadata") or {}).get("is_correct_count") or 0),
                "tip": _distractor_tip(r),
            }
        )
        if len(out["recurring_distractors"]) >= limit:
            break

    # ── Shape elimination tips ───────────────────────────────────────
    buckets: dict[str, dict[str, int]] = {}
    for r in elim_rows:
        marker = ((r.get("metadata") or {}).get("marker") or "").strip()
        if not marker:
            continue
        opt = options_by_id.get(r.get("option_id"))
        if not opt:
            continue
        slot = buckets.setdefault(marker, {"occurrence_count": 0, "correct_count": 0})
        slot["occurrence_count"] += 1
        if opt.get("is_correct"):
            slot["correct_count"] += 1
    elim_tips: list[dict[str, Any]] = []
    for marker, slot in buckets.items():
        occ = slot["occurrence_count"]
        correct = slot["correct_count"]
        elim_tips.append(
            {
                "pattern": marker,
                "display_text": _MARKER_DISPLAY.get(marker, marker.replace("_", " ")),
                "occurrence_count": occ,
                "correct_count": correct,
                "wrong_count": occ - correct,
                "correct_rate": round(correct / occ, 3) if occ else 0.0,
                "tip": _elimination_tip(marker, occ, correct),
            }
        )
    elim_tips.sort(key=lambda t: -t["occurrence_count"])
    out["elimination_tips"] = elim_tips[:limit]

    out["has_data"] = bool(out["recurring_distractors"] or out["elimination_tips"])
    return out
