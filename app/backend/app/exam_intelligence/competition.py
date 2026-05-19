"""Competition Intelligence read helpers (Phase 12).

Reads ``exam_competition_metrics`` rows that have cleared review
(``reviewer_status in ('reviewed', 'locked')``) and shapes them into the
time series the aspirant-facing Exam Intelligence page consumes:

* ``competition_series``  - one row per (cycle, phase) with vacancy,
  applicant count, selection ratio and the raw cutoff / difficulty
  payloads.
* ``cutoff_series``       - flattened {category -> [{year, marks, phase}]}
  built from the ``cutoff_trend`` jsonb. Convention for the jsonb shape::

      {
        "<category>": <number>,            -- single cutoff for the cycle
        "<category>": [<n1>, <n2>, ...]    -- multi-stage cutoffs ordered
      }

  Anything else is ignored. The function is forgiving so admin-entered
  rows that don't match the convention silently degrade rather than
  poison the response.
* ``vacancy_series``      - {category -> [{year, count}]} built from
  ``vacancy_by_category`` jsonb + ``vacancy_total``.

No AI. No inference. Empty inputs → empty payloads.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.exam_intelligence.competition")

_READY_STATUSES = ("reviewed", "locked")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("competition read failed: %s", exc)
        return default


def _cycle_year(cycle: dict[str, Any] | None) -> int | None:
    if not cycle:
        return None
    raw = cycle.get("year")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _coerce_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _load_cycles(supabase: Any, exam_id: str) -> dict[str, dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("exam_cycles")
            .select("id, exam_id, year, cycle_name, status, application_start, application_end, exam_start, exam_end")
            .eq("exam_id", exam_id)
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {r["id"]: r for r in rows if r.get("id")}


def _load_phases(supabase: Any, exam_id: str) -> dict[str, dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("exam_phases")
            .select("id, exam_id, phase_name, phase_slug, phase_order")
            .eq("exam_id", exam_id)
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {r["id"]: r for r in rows if r.get("id")}


def _load_metrics(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("exam_competition_metrics")
            .select(
                "id, exam_id, exam_cycle_id, exam_phase_id, "
                "vacancy_total, vacancy_by_category, applicant_count, "
                "selection_ratio, cutoff_trend, difficulty_trend, "
                "competition_pressure_score, source_basis, confidence_score, "
                "reviewer_status, created_at"
            )
            .eq("exam_id", exam_id)
            .in_("reviewer_status", list(_READY_STATUSES))
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return list(rows)


def competition_series(supabase: Any, exam_id: str) -> list[dict[str, Any]]:
    """Return verified competition metrics, newest cycle last."""
    if not exam_id:
        return []
    metrics = _load_metrics(supabase, exam_id)
    if not metrics:
        return []
    cycles = _load_cycles(supabase, exam_id)
    phases = _load_phases(supabase, exam_id)

    out: list[dict[str, Any]] = []
    for row in metrics:
        cycle = cycles.get(row.get("exam_cycle_id") or "")
        phase = phases.get(row.get("exam_phase_id") or "")
        out.append(
            {
                "id": row.get("id"),
                "cycle_id": row.get("exam_cycle_id"),
                "cycle_year": _cycle_year(cycle),
                "cycle_name": (cycle or {}).get("cycle_name"),
                "cycle_status": (cycle or {}).get("status"),
                "phase_id": row.get("exam_phase_id"),
                "phase_name": (phase or {}).get("phase_name"),
                "phase_slug": (phase or {}).get("phase_slug"),
                "vacancy_total": row.get("vacancy_total"),
                "vacancy_by_category": row.get("vacancy_by_category") or {},
                "applicant_count": row.get("applicant_count"),
                "selection_ratio": row.get("selection_ratio"),
                "cutoff_trend": row.get("cutoff_trend") or {},
                "difficulty_trend": row.get("difficulty_trend") or {},
                "competition_pressure_score": row.get("competition_pressure_score"),
                "source_basis": row.get("source_basis"),
                "confidence_score": row.get("confidence_score"),
                "reviewer_status": row.get("reviewer_status"),
            }
        )

    def _sort_key(r: dict[str, Any]) -> tuple[int, str]:
        year = r.get("cycle_year")
        return (int(year) if isinstance(year, int) else -1, r.get("phase_slug") or "")

    out.sort(key=_sort_key)
    return out


def cutoff_series(series: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Flatten ``cutoff_trend`` jsonb across cycles into per-category points.

    Result shape::

        {
          "general":  [{"year": 2024, "marks": 105.34, "phase_slug": "prelims"}, ...],
          "obc":      [...],
          ...
        }
    """
    out: dict[str, list[dict[str, Any]]] = {}
    for row in series:
        year = row.get("cycle_year")
        if year is None:
            continue
        trend = row.get("cutoff_trend") or {}
        if not isinstance(trend, dict):
            continue
        phase_slug = row.get("phase_slug")
        for category, raw in trend.items():
            if isinstance(raw, list):
                # Multi-stage: take the last meaningful number.
                values = [_coerce_number(v) for v in raw]
                marks = next((v for v in reversed(values) if v is not None), None)
            else:
                marks = _coerce_number(raw)
            if marks is None:
                continue
            out.setdefault(str(category).lower(), []).append(
                {"year": year, "marks": marks, "phase_slug": phase_slug}
            )
    for points in out.values():
        points.sort(key=lambda p: (p.get("year") or 0, p.get("phase_slug") or ""))
    return out


def vacancy_series(series: list[dict[str, Any]]) -> dict[str, Any]:
    """Build vacancy-by-year series.

    Returns::

        {
          "total":      [{"year": 2023, "count": 1105}, ...],
          "by_category": {
            "general": [{"year": 2023, "count": 442}, ...],
            ...
          }
        }

    When multiple phases exist for the same cycle we collapse on the
    earliest phase row (vacancy is a cycle-level figure, not a phase-level
    one — duplicates would double-count).
    """
    seen_cycles: set[Any] = set()
    total_points: list[dict[str, Any]] = []
    by_cat: dict[str, list[dict[str, Any]]] = {}

    for row in series:
        cycle_id = row.get("cycle_id")
        year = row.get("cycle_year")
        if year is None or cycle_id in seen_cycles:
            continue
        seen_cycles.add(cycle_id)
        if row.get("vacancy_total") is not None:
            total_points.append({"year": year, "count": int(row["vacancy_total"])})
        cat_map = row.get("vacancy_by_category") or {}
        if isinstance(cat_map, dict):
            for category, raw in cat_map.items():
                count = _coerce_number(raw)
                if count is None:
                    continue
                by_cat.setdefault(str(category).lower(), []).append(
                    {"year": year, "count": int(count)}
                )

    total_points.sort(key=lambda p: p.get("year") or 0)
    for points in by_cat.values():
        points.sort(key=lambda p: p.get("year") or 0)
    return {"total": total_points, "by_category": by_cat}
