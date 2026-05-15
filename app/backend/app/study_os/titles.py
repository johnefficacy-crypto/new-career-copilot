"""Study OS — earned titles (spec § "Titles").

Pure-function evaluator over recent behavior snapshots + social data. No DB
writes — titles are derived on read so they always reflect current state.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.titles")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("titles supabase call failed: %s", exc)
        return default


TITLE_DEFS = [
    {
        "key": "plan_keeper",
        "label": "Plan Keeper",
        "rule": "90%+ adherence over 60 days",
    },
    {
        "key": "deep_focus",
        "label": "Deep Focus",
        "rule": "Avg focus session > 45 min",
    },
    {
        "key": "steady",
        "label": "Steady",
        "rule": "Low variance in daily minutes",
    },
    {
        "key": "comeback",
        "label": "Comeback",
        "rule": "Broke streak, rebuilt within 3 days, backlog reduced",
    },
    {
        "key": "mock_reviewer",
        "label": "Mock Reviewer",
        "rule": "High mock review + correction completion",
    },
    {
        "key": "revision_closer",
        "label": "Revision Closer",
        "rule": "Revision regularity",
    },
    {
        "key": "backlog_breaker",
        "label": "Backlog Breaker",
        "rule": "Strong backlog recovery",
    },
    {
        "key": "sustained_effort",
        "label": "Sustained Effort",
        "rule": "High hours WITH healthy consistency and low variance",
    },
]


def _variance(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    mean = sum(xs) / len(xs)
    return sum((x - mean) ** 2 for x in xs) / len(xs)


def evaluate_titles(supabase: Any, user_id: str) -> dict[str, Any]:
    today = date.today()
    start = today - timedelta(days=60)
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .select(
                "snapshot_date, total_study_minutes, focus_minutes, "
                "avg_focus_session_minutes, "
                "behavior_adherence_score, consistency_score, "
                "planned_tasks, completed_tasks, "
                "mock_count, mock_review_count, correction_tasks_completed, "
                "backlog_count, active_study_day"
            )
            .eq("user_id", user_id)
            .gte("snapshot_date", start.isoformat())
            .lte("snapshot_date", today.isoformat())
            .order("snapshot_date")
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    earned: list[str] = []
    progress: dict[str, float] = {}

    if items:
        # plan_keeper
        adh = [
            float(r.get("behavior_adherence_score") or 0)
            for r in items
            if r.get("behavior_adherence_score") is not None
        ]
        if adh and len(adh) >= 30 and (sum(adh) / len(adh)) >= 0.9:
            earned.append("plan_keeper")
        if adh:
            progress["plan_keeper"] = round(sum(adh) / len(adh), 3)

        # deep_focus
        afs = [
            float(r.get("avg_focus_session_minutes") or 0)
            for r in items
            if r.get("avg_focus_session_minutes")
        ]
        if afs and (sum(afs) / len(afs)) > 45:
            earned.append("deep_focus")
        progress["deep_focus"] = round(sum(afs) / len(afs), 1) if afs else 0.0

        # steady — low variance in daily total minutes
        mins = [float(r.get("total_study_minutes") or 0) for r in items]
        var = _variance(mins)
        if mins and (sum(mins) / len(mins)) > 60 and var < 1500:  # ~ ±40 min stddev
            earned.append("steady")
        progress["steady_variance"] = round(var, 1)

        # mock_reviewer
        mc = sum(int(r.get("mock_count") or 0) for r in items)
        mr = sum(int(r.get("mock_review_count") or 0) for r in items)
        cc = sum(int(r.get("correction_tasks_completed") or 0) for r in items)
        if mc >= 3 and (mr / mc) >= 0.8 and cc >= mc:
            earned.append("mock_reviewer")
        progress["mock_reviewer"] = round((mr / mc) if mc else 0, 3)

        # backlog_breaker — strong reduction over the window
        first_bl = next((int(r.get("backlog_count") or 0) for r in items), None)
        last_bl = next((int(r.get("backlog_count") or 0) for r in reversed(items)), None)
        if first_bl is not None and last_bl is not None and first_bl >= 5 and last_bl <= first_bl * 0.5:
            earned.append("backlog_breaker")
        progress["backlog_breaker"] = round(
            ((first_bl - last_bl) / first_bl) if first_bl else 0.0, 3
        )

        # sustained_effort — high hours AND consistency AND low variance
        if (
            mins
            and (sum(mins) / len(mins)) >= 180
            and var < 3000
            and len([r for r in items if r.get("active_study_day")]) >= len(items) * 0.7
        ):
            earned.append("sustained_effort")

        # comeback — found a 2+ day gap then a 3-day rebuild with declining backlog
        active_flags = [bool(r.get("active_study_day")) for r in items]
        backlog_seq = [int(r.get("backlog_count") or 0) for r in items]
        for i in range(2, len(active_flags) - 3):
            if not active_flags[i - 1] and not active_flags[i - 2]:
                window = active_flags[i : i + 3]
                if all(window) and len(backlog_seq) > i + 2 and backlog_seq[i + 2] < backlog_seq[i - 1]:
                    earned.append("comeback")
                    break

    return {
        "earned": sorted(set(earned)),
        "all_titles": TITLE_DEFS,
        "progress": progress,
    }
