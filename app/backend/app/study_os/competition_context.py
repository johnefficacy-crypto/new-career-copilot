"""Competition Intelligence context for Study OS (read-only).

Reads ``exam_competition_metrics`` (migration 055) and exposes the
verified competition picture for an exam: vacancy, applicant ratio,
cutoff / difficulty trends and a derived cycle-pressure block.

Verified-only contract: only ``reviewer_status in ('locked', 'reviewed')``
rows are read, and ``locked`` is preferred over ``reviewed``. Nothing is
estimated silently — when no reviewed row exists the helper returns a
safe ``available=False`` shape. There is no AI and no scraping here.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.competition_context")

_READABLE_STATUSES = ("locked", "reviewed")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("competition_context read failed: %s", exc)
        return default


def _empty(exam_id: str | None = None) -> dict[str, Any]:
    return {
        "available": False,
        "exam_id": exam_id,
        "exam_cycle_id": None,
        "exam_phase_id": None,
        "vacancy_total": None,
        "vacancy_by_category": {},
        "applicant_count": None,
        "selection_ratio": None,
        "cutoff_trend": {},
        "difficulty_trend": {},
        "competition_pressure_score": None,
        "cycle_pressure": {
            "days_remaining": None,
            "pressure_level": "unknown",
            "reason": None,
        },
        "trust": {
            "source_basis": None,
            "reviewer_status": None,
            "confidence_score": None,
            "evidence_count": 0,
        },
    }


def _pick_best(
    rows: list[dict[str, Any]], exam_cycle_id: str | None
) -> dict[str, Any] | None:
    """Pick the most authoritative metrics row.

    Preference order: matches the requested cycle → ``locked`` over
    ``reviewed`` → most recently created.
    """
    if not rows:
        return None

    def _key(r: dict[str, Any]) -> tuple:
        cycle_match = 1 if exam_cycle_id and r.get("exam_cycle_id") == exam_cycle_id else 0
        locked = 1 if r.get("reviewer_status") == "locked" else 0
        return (cycle_match, locked, str(r.get("created_at") or ""))

    return sorted(rows, key=_key, reverse=True)[0]


def _pressure_level(score: float | None, days_remaining: int | None) -> str:
    """Coarse, deterministic pressure bucket.

    Driven primarily by the reviewed ``competition_pressure_score`` and
    nudged up one bucket when the exam is very close.
    """
    if score is None:
        return "unknown"
    if score >= 66:
        level = "high"
    elif score >= 33:
        level = "medium"
    else:
        level = "low"
    if days_remaining is not None and days_remaining <= 30:
        level = {"low": "medium", "medium": "high", "high": "high"}[level]
    return level


def _pressure_reason(
    level: str, days_remaining: int | None, selection_ratio: float | None
) -> str | None:
    if level == "unknown":
        return None
    bits: list[str] = []
    if days_remaining is not None:
        bits.append(f"{days_remaining} days to the exam")
    if selection_ratio is not None and selection_ratio > 0:
        bits.append(f"selection ratio ~{selection_ratio:.4f}")
    if not bits:
        return f"Competition pressure is {level}."
    return f"Competition pressure is {level} ({', '.join(bits)})."


def competition_context(
    supabase: Any,
    exam_id: str | None,
    *,
    exam_cycle_id: str | None = None,
    days_remaining: int | None = None,
) -> dict[str, Any]:
    """Return the ``competition_context`` block for ``exam_id``.

    ``days_remaining`` is supplied by the caller (Mission Control already
    computes it from ``exam_cycles``) so this helper never duplicates that
    read. Always returns a dict — never raises.
    """
    if not exam_id:
        return _empty(exam_id)

    rows = _safe(
        lambda: (
            supabase.table("exam_competition_metrics")
            .select(
                "id, exam_id, exam_cycle_id, exam_phase_id, vacancy_total, "
                "vacancy_by_category, applicant_count, selection_ratio, "
                "cutoff_trend, difficulty_trend, competition_pressure_score, "
                "source_basis, confidence_score, evidence_count, "
                "reviewer_status, created_at"
            )
            .eq("exam_id", exam_id)
            .in_("reviewer_status", list(_READABLE_STATUSES))
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []

    best = _pick_best(rows, exam_cycle_id)
    if not best:
        return _empty(exam_id)

    score = best.get("competition_pressure_score")
    try:
        score = float(score) if score is not None else None
    except (TypeError, ValueError):
        score = None

    selection_ratio = best.get("selection_ratio")
    try:
        selection_ratio = float(selection_ratio) if selection_ratio is not None else None
    except (TypeError, ValueError):
        selection_ratio = None

    level = _pressure_level(score, days_remaining)
    return {
        "available": True,
        "exam_id": exam_id,
        "exam_cycle_id": best.get("exam_cycle_id"),
        "exam_phase_id": best.get("exam_phase_id"),
        "vacancy_total": best.get("vacancy_total"),
        "vacancy_by_category": best.get("vacancy_by_category") or {},
        "applicant_count": best.get("applicant_count"),
        "selection_ratio": selection_ratio,
        "cutoff_trend": best.get("cutoff_trend") or {},
        "difficulty_trend": best.get("difficulty_trend") or {},
        "competition_pressure_score": score,
        "cycle_pressure": {
            "days_remaining": days_remaining,
            "pressure_level": level,
            "reason": _pressure_reason(level, days_remaining, selection_ratio),
        },
        "trust": {
            "source_basis": best.get("source_basis"),
            "reviewer_status": best.get("reviewer_status"),
            "confidence_score": best.get("confidence_score"),
            "evidence_count": best.get("evidence_count") or 0,
        },
    }
