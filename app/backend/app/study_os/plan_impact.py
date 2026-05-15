"""Phase 8 — Plan Impact: before/after diff of locking a coverage row.

``compute_plan_impact(supabase, coverage_id)`` answers the operator
question "if I lock this ``exam_topic_coverage`` row, how does it reshape
the planner-ready topic ranking for this exam?" — *before* it is actually
locked and rolled out to aspirants.

It works at the exam-intelligence level, not per-user: it ranks topics by
the deterministic, user-independent component of the planner score
(``0.50 * coverage_priority + pyq_factor + high_yield_bonus`` — the same
formula as ``planner._score_topic`` minus the per-user mastery / error
terms). That keeps Plan Impact deterministic and avoids a per-user
fan-out. No persistence, no AI.

``record_plan_impact_decision`` writes the operator's hold / stage /
approve decision (with the computed impact snapshot) to
``plan_impact_decisions``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from app.exam_intelligence.coverage import verified_pyq_topic_counts

logger = logging.getLogger("career_copilot.study_os.plan_impact")

_VALID_DECISIONS = {"hold", "stage", "approve"}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("plan_impact read/write failed: %s", exc)
        return default


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _exam_level_score(coverage_priority: float, pyq_count: int, high_yield: bool) -> float:
    """User-independent planner score component (see module docstring)."""
    pyq_factor = min(20.0, pyq_count * 5.0)
    high_yield_bonus = 10.0 if high_yield else 0.0
    return round(0.50 * coverage_priority + pyq_factor + high_yield_bonus, 2)


def _coverage_row(supabase: Any, coverage_id: str) -> dict[str, Any] | None:
    rows = (
        _safe(
            lambda: (
                supabase.table("exam_topic_coverage")
                .select(
                    "id, exam_id, exam_cycle_id, exam_phase_id, topic_id, "
                    "exam_priority_score, is_high_yield, confidence_score, "
                    "reviewer_status"
                )
                .eq("id", coverage_id)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    return rows[0] if rows else None


def _locked_rows(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    return (
        _safe(
            lambda: (
                supabase.table("exam_topic_coverage")
                .select(
                    "id, topic_id, exam_priority_score, is_high_yield, reviewer_status"
                )
                .eq("exam_id", exam_id)
                .eq("reviewer_status", "locked")
                .limit(2000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )


def _topic_names(supabase: Any, topic_ids: list[str]) -> dict[str, str]:
    if not topic_ids:
        return {}
    rows = (
        _safe(
            lambda: (
                supabase.table("topics")
                .select("id, name, slug")
                .in_("id", topic_ids)
                .limit(2000)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )
    return {t["id"]: (t.get("name") or t.get("slug") or t["id"]) for t in rows if t.get("id")}


def _rank(rows: list[dict[str, Any]], pyq_counts: dict[str, int], names: dict[str, str]) -> list[dict[str, Any]]:
    """Score + rank a coverage-row set by the exam-level score, descending."""
    scored = []
    for r in rows:
        tid = r.get("topic_id")
        score = _exam_level_score(
            _num(r.get("exam_priority_score")),
            int(pyq_counts.get(tid, 0)),
            bool(r.get("is_high_yield")),
        )
        scored.append(
            {
                "topic_id": tid,
                "topic": names.get(tid, tid),
                "coverage_priority": _num(r.get("exam_priority_score")),
                "high_yield": bool(r.get("is_high_yield")),
                "verified_pyq_count": int(pyq_counts.get(tid, 0)),
                "exam_level_score": score,
            }
        )
    scored.sort(key=lambda c: (c["exam_level_score"], c["topic_id"]), reverse=True)
    for i, c in enumerate(scored, start=1):
        c["rank"] = i
    return scored


def _risk_level(candidate_rank: int, total_after: int, high_yield: bool, displaced_top: bool) -> str:
    """Deterministic risk heuristic.

    high   — a high-yield candidate that displaces a previously top-3 topic.
    medium — lands in the top 3, or is high-yield.
    low    — everything else (a modest addition low in the ranking).
    """
    top3 = candidate_rank <= 3
    if high_yield and displaced_top:
        return "high"
    if top3 or high_yield:
        return "medium"
    return "low"


def compute_plan_impact(supabase: Any, coverage_id: str) -> dict[str, Any]:
    """Return the before/after impact of locking ``coverage_id``.

    Always returns a dict — never raises. ``available=False`` with a
    ``reason`` when the row is missing.
    """
    candidate = _coverage_row(supabase, coverage_id)
    if not candidate:
        return {"available": False, "reason": "coverage_not_found"}

    exam_id = candidate.get("exam_id")
    candidate_topic_id = candidate.get("topic_id")
    already_locked = candidate.get("reviewer_status") == "locked"

    locked = _locked_rows(supabase, exam_id)
    # "after" = currently-locked set with the candidate treated as locked.
    after_rows = list(locked)
    if not any(r.get("id") == coverage_id for r in after_rows):
        after_rows.append(
            {
                "id": coverage_id,
                "topic_id": candidate_topic_id,
                "exam_priority_score": candidate.get("exam_priority_score"),
                "is_high_yield": candidate.get("is_high_yield"),
                "reviewer_status": "locked",
            }
        )

    pyq_counts = verified_pyq_topic_counts(supabase, exam_id) or {}
    topic_ids = list(
        {r.get("topic_id") for r in after_rows if r.get("topic_id")}
    )
    names = _topic_names(supabase, topic_ids)

    before = _rank(locked, pyq_counts, names)
    after = _rank(after_rows, pyq_counts, names)

    before_rank = {c["topic_id"]: c["rank"] for c in before}
    before_ids = set(before_rank)

    changes: list[dict[str, Any]] = []
    displaced_top = False
    for c in after:
        tid = c["topic_id"]
        if tid not in before_ids:
            changes.append(
                {
                    "type": "topic_added",
                    "topic": c["topic"],
                    "rank": c["rank"],
                    "exam_level_score": c["exam_level_score"],
                    "high_yield": c["high_yield"],
                }
            )
        elif before_rank[tid] != c["rank"]:
            old, new = before_rank[tid], c["rank"]
            changes.append(
                {
                    "type": "rank_change",
                    "topic": c["topic"],
                    "old_rank": old,
                    "new_rank": new,
                    "direction": "up" if new < old else "down",
                }
            )
            if old <= 3 and new > 3:
                displaced_top = True

    candidate_rank = next(
        (c["rank"] for c in after if c["topic_id"] == candidate_topic_id), len(after)
    )
    candidate_high_yield = bool(candidate.get("is_high_yield"))
    risk_level = (
        "low"
        if already_locked
        else _risk_level(candidate_rank, len(after), candidate_high_yield, displaced_top)
    )
    candidate_topic_name = names.get(candidate_topic_id, candidate_topic_id)

    if already_locked:
        summary = f"{candidate_topic_name} is already locked — locking it again has no effect."
    elif not before:
        summary = (
            f"{candidate_topic_name} would be the first locked topic for this exam, "
            f"entering the planner at rank {candidate_rank}."
        )
    else:
        summary = (
            f"Locking {candidate_topic_name} adds it to the planner at rank "
            f"{candidate_rank} of {len(after)}; {len(changes)} topic(s) change position."
        )

    latest = (
        _safe(
            lambda: (
                supabase.table("plan_impact_decisions")
                .select("decision, risk_level, notes, decided_by, decided_at")
                .eq("exam_topic_coverage_id", coverage_id)
                .order("decided_at", desc=True)
                .limit(1)
                .execute()
                .data
            ),
            default=[],
        )
        or []
    )

    return {
        "available": True,
        "coverage_id": coverage_id,
        "exam_id": exam_id,
        "candidate_topic": candidate_topic_name,
        "candidate_topic_id": candidate_topic_id,
        "candidate_status": candidate.get("reviewer_status"),
        "already_locked": already_locked,
        "risk_level": risk_level,
        "before": before,
        "after": after,
        "changes": changes,
        "affected_topic_count": len(changes),
        "summary": summary,
        "latest_decision": latest[0] if latest else None,
    }


def record_plan_impact_decision(
    supabase: Any,
    coverage_id: str,
    *,
    decision: str,
    admin_id: str | None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    """Persist a hold / stage / approve decision for ``coverage_id``.

    Recomputes the impact server-side so the stored ``impact_summary`` is
    trustworthy. An ``approve`` decision is the rollout gate: it flips the
    ``exam_topic_coverage`` row to ``reviewer_status='locked'`` so the
    planner starts consuming it. ``hold`` / ``stage`` record intent only and
    never touch the coverage row.

    This deliberately does *not* fan out a plan regeneration — the daily
    ``study:plan_regen`` sweep and on-demand generation pick the newly
    locked row up on their next run. Returns the inserted decision row
    (with a ``coverage_locked`` flag), or ``None`` when the coverage row is
    missing / the decision is invalid.
    """
    if decision not in _VALID_DECISIONS:
        return None
    impact = compute_plan_impact(supabase, coverage_id)
    if not impact.get("available"):
        return None

    payload = {
        "exam_id": impact.get("exam_id"),
        "exam_topic_coverage_id": coverage_id,
        "decision": decision,
        "risk_level": impact.get("risk_level"),
        "impact_summary": {
            "summary": impact.get("summary"),
            "affected_topic_count": impact.get("affected_topic_count"),
            "changes": impact.get("changes"),
            "candidate_topic": impact.get("candidate_topic"),
        },
        "notes": notes,
        "decided_by": admin_id,
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }
    rows = (
        _safe(
            lambda: supabase.table("plan_impact_decisions").insert(payload).execute().data,
            default=[],
        )
        or []
    )
    row = rows[0] if rows else None
    if row is None:
        return None

    # `approve` is the rollout gate — lock the coverage row so it becomes
    # planner-ready. Idempotent: an already-locked row is left untouched.
    coverage_locked = False
    if decision == "approve" and not impact.get("already_locked"):
        now = datetime.now(timezone.utc).isoformat()
        updated = _safe(
            lambda: (
                supabase.table("exam_topic_coverage")
                .update(
                    {
                        "reviewer_status": "locked",
                        "reviewed_by": admin_id,
                        "reviewed_at": now,
                        "updated_at": now,
                    }
                )
                .eq("id", coverage_id)
                .execute()
                .data
            ),
            default=None,
        )
        coverage_locked = bool(updated)

    row["coverage_locked"] = coverage_locked
    return row
