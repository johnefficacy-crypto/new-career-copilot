"""Study OS — cohort percentile compute + read (PR 3).

Given a cohort_key (resolved from a user's exam goals + preferences), reads
the latest `study_cohort_metric_snapshots` row and returns the user's
percentile for each tracked metric, applying the spec's fallback ladder
(`exam_phase → exam → exam_family → all`) when the sample is below
`min_sample_size`.

Percentile is computed by linear interpolation between the stored p10..p90
checkpoints, which is good enough for the percentile-band UI ("ahead /
on track / behind") without storing full distributions.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Callable, Iterable

logger = logging.getLogger("career_copilot.study_os.peer_benchmark")


PERCENTILE_CHECKPOINTS = [
    ("p10", 10),
    ("p25", 25),
    ("p50", 50),
    ("p75", 75),
    ("p90", 90),
]


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("peer_benchmark supabase call failed: %s", exc)
        return default


def _percentile_from_checkpoints(value: float, row: dict[str, Any]) -> int | None:
    points = [(p, row.get(name)) for name, p in PERCENTILE_CHECKPOINTS]
    points = [(p, float(v)) for p, v in points if v is not None]
    if not points:
        return None
    if value <= points[0][1]:
        return points[0][0]
    if value >= points[-1][1]:
        return points[-1][0]
    for (p_low, v_low), (p_high, v_high) in zip(points, points[1:]):
        if v_low <= value <= v_high:
            if v_high == v_low:
                return p_high
            frac = (value - v_low) / (v_high - v_low)
            return int(round(p_low + frac * (p_high - p_low)))
    return None


def _rank_band(percentile: int | None) -> str | None:
    if percentile is None:
        return None
    if percentile >= 67:
        return "ahead"
    if percentile >= 34:
        return "on_track"
    return "behind"


def _resolve_cohort_keys(
    supabase: Any, user_id: str
) -> list[str]:
    """Return the cohort key ladder for a user, ordered most-specific first."""
    rows = _safe(
        lambda: (
            supabase.table("study_cohort_memberships")
            .select("cohort_key, joined_at, left_at")
            .eq("user_id", user_id)
            .is_("left_at", None)
            .execute()
        ),
        default=None,
    )
    keys = [r["cohort_key"] for r in (getattr(rows, "data", None) or []) if r.get("cohort_key")]
    if not keys:
        return []
    defs = _safe(
        lambda: (
            supabase.table("study_cohort_definitions")
            .select("cohort_key, fallback_level, is_active")
            .in_("cohort_key", keys)
            .execute()
        ),
        default=None,
    )
    by_level: list[tuple[int, str]] = []
    for d in getattr(defs, "data", None) or []:
        if d.get("is_active") is False:
            continue
        by_level.append((int(d.get("fallback_level") or 0), d["cohort_key"]))
    by_level.sort()
    return [k for _, k in by_level]


def get_cohort_comparison(
    supabase: Any,
    user_id: str,
    metric_values: dict[str, float],
    period_type: str = "weekly",
    on_date: date | None = None,
) -> dict[str, Any]:
    """Look up each metric across the user's cohort ladder.

    `metric_values` is the user's own value per metric_key (typically from
    `study_behavior_daily_snapshots` aggregated over the period).
    """
    ladder = _resolve_cohort_keys(supabase, user_id)
    if not ladder:
        return {"cohort": None, "metrics": {k: {"value": v, "percentile": None,
                                                "rank_band": None,
                                                "sample_size": 0} for k, v in metric_values.items()}}

    on_date = on_date or date.today()
    result: dict[str, Any] = {"metrics": {}}
    chosen_cohort: str | None = None

    for cohort_key in ladder:
        rows = _safe(
            lambda ck=cohort_key: (
                supabase.table("study_cohort_metric_snapshots")
                .select("metric_key, sample_size, p10, p25, p50, p75, p90, period_end")
                .eq("cohort_key", ck)
                .eq("period_type", period_type)
                .order("period_end", desc=True)
                .limit(50)
                .execute()
            ),
            default=None,
        )
        items = getattr(rows, "data", None) or []
        defn = _safe(
            lambda ck=cohort_key: (
                supabase.table("study_cohort_definitions")
                .select("min_sample_size")
                .eq("cohort_key", ck)
                .limit(1)
                .execute()
            ),
            default=None,
        )
        min_sample = 30
        if getattr(defn, "data", None):
            try:
                min_sample = int(defn.data[0].get("min_sample_size") or 30)
            except (TypeError, ValueError):
                min_sample = 30

        latest_by_metric: dict[str, dict[str, Any]] = {}
        for row in items:
            mk = row.get("metric_key")
            if not mk or mk in latest_by_metric:
                continue
            latest_by_metric[mk] = row

        ok = all(
            mk in latest_by_metric
            and int(latest_by_metric[mk].get("sample_size") or 0) >= min_sample
            for mk in metric_values
        )
        if not ok:
            continue
        chosen_cohort = cohort_key
        for mk, value in metric_values.items():
            row = latest_by_metric[mk]
            pct = _percentile_from_checkpoints(value, row)
            result["metrics"][mk] = {
                "value": value,
                "percentile": pct,
                "rank_band": _rank_band(pct),
                "sample_size": int(row.get("sample_size") or 0),
                "period_end": row.get("period_end"),
            }
        break

    if chosen_cohort is None:
        return {
            "cohort": None,
            "fallback_exhausted": True,
            "metrics": {
                mk: {"value": v, "percentile": None, "rank_band": None, "sample_size": 0}
                for mk, v in metric_values.items()
            },
        }

    result["cohort"] = chosen_cohort
    return result


def aggregate_user_weekly(
    supabase: Any, user_id: str, week_start: date
) -> dict[str, float]:
    """Aggregate a user's behavior snapshots for the week starting Monday
    `week_start` (inclusive, 7 days). Returns metric_key → value."""
    week_end = week_start + timedelta(days=6)
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .select(
                "total_study_minutes, focus_minutes, "
                "planned_tasks, completed_tasks, "
                "mock_count, mock_review_count, "
                "consistency_score, behavior_adherence_score, "
                "focus_depth_score, discipline_score, "
                "active_study_day"
            )
            .eq("user_id", user_id)
            .gte("snapshot_date", week_start.isoformat())
            .lte("snapshot_date", week_end.isoformat())
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []

    def _avg(field: str) -> float:
        vals = [r.get(field) for r in items if r.get(field) is not None]
        return float(sum(vals)) / len(vals) if vals else 0.0

    def _sum(field: str) -> float:
        return float(sum(int(r.get(field) or 0) for r in items))

    total_planned = _sum("planned_tasks")
    total_completed = _sum("completed_tasks")
    mock_count = _sum("mock_count")
    mock_reviewed = _sum("mock_review_count")
    active_days = sum(1 for r in items if r.get("active_study_day"))

    return {
        "consistency": active_days / 7.0,
        "plan_adherence": (total_completed / total_planned) if total_planned else 0.0,
        "focus_minutes": _sum("focus_minutes"),
        "task_completion": (total_completed / total_planned) if total_planned else 0.0,
        "mock_review_rate": (mock_reviewed / mock_count) if mock_count else 0.0,
        "discipline": _avg("discipline_score"),
    }
