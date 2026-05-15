"""Study OS — daily behavior snapshot aggregation (PR 1).

Aggregates `study_sessions`, `study_tasks`, `mock_tests`, and `mock_correction_tasks`
into a single `study_behavior_daily_snapshots` row per (user, day).

The Behavior Index defined in the spec is a weighted composite over the four
score components stored here. All scores are normalised to [0, 1].

The aggregation is deterministic — no AI. It is safe to recompute idempotently
since each row is keyed by (user_id, snapshot_date).
"""
from __future__ import annotations

import logging
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.behavior_scores")


# Behavior Index weights — must sum to 1.0. See spec § "Behavior Index".
BEHAVIOR_INDEX_WEIGHTS = {
    "plan_adherence": 0.25,
    "consistency": 0.20,
    "focus_minutes": 0.15,
    "task_completion": 0.15,
    "mock_review": 0.10,
    "backlog_recovery": 0.10,
    "revision_regularity": 0.05,
}

# Daily targets for normalising raw counts into [0,1] components.
FOCUS_MINUTES_TARGET = 240   # 4h of focus is treated as the saturating top.
CONSISTENCY_WINDOW_DAYS = 7
DEFAULT_DAILY_BACKLOG_RECOVERY = 0.5  # neutral if no comparable yesterday row


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("behavior_scores supabase call failed: %s", exc)
        return default


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _ratio(num: float, den: float) -> float | None:
    if den is None or float(den) == 0:
        return None
    return float(num) / float(den)


def _day_bounds(day: date) -> tuple[str, str]:
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _read_session_minutes(supabase: Any, user_id: str, day: date) -> list[int]:
    """Return per-session durations (minutes) for `day`."""
    start_iso, end_iso = _day_bounds(day)
    rows = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("duration_minutes, duration_mins, started_at")
            .eq("user_id", user_id)
            .gte("started_at", start_iso)
            .lt("started_at", end_iso)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    out: list[int] = []
    for r in items:
        v = r.get("duration_minutes") or r.get("duration_mins") or 0
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv > 0:
            out.append(iv)
    return out


def _read_task_counts(supabase: Any, user_id: str, day: date) -> dict[str, int]:
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("status, task_type, scheduled_date")
            .eq("user_id", user_id)
            .eq("scheduled_date", day.isoformat())
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    planned = len(items)
    completed = sum(1 for r in items if r.get("status") == "completed")
    missed = sum(1 for r in items if r.get("status") == "missed")
    skipped = sum(1 for r in items if r.get("status") == "skipped")
    revision = sum(1 for r in items if r.get("task_type") == "revision")
    revision_done = sum(
        1
        for r in items
        if r.get("task_type") == "revision" and r.get("status") == "completed"
    )
    return {
        "planned": planned,
        "completed": completed,
        "missed": missed,
        "skipped": skipped,
        "revision_total": revision,
        "revision_done": revision_done,
    }


def _read_backlog_count(supabase: Any, user_id: str, on_date: date) -> int:
    """Open tasks scheduled on or before `on_date` that are not completed."""
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("status, scheduled_date")
            .eq("user_id", user_id)
            .lte("scheduled_date", on_date.isoformat())
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    return sum(1 for r in items if r.get("status") not in ("completed", "skipped"))


def _read_mock_counts(supabase: Any, user_id: str, day: date) -> dict[str, int]:
    start_iso, end_iso = _day_bounds(day)
    rows = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("id, review_state, attempted_at")
            .eq("user_id", user_id)
            .gte("attempted_at", start_iso)
            .lt("attempted_at", end_iso)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    mock_ids = [r["id"] for r in items if r.get("id")]
    reviewed = sum(
        1 for r in items if (r.get("review_state") or "") in ("reviewed", "correction_drafted")
    )
    corrections_completed = 0
    if mock_ids:
        crows = _safe(
            lambda: (
                supabase.table("mock_correction_tasks")
                .select("status, mock_test_id")
                .in_("mock_test_id", mock_ids)
                .execute()
            ),
            default=None,
        )
        for cr in getattr(crows, "data", None) or []:
            if cr.get("status") == "completed":
                corrections_completed += 1
    return {
        "count": len(items),
        "reviewed": reviewed,
        "corrections_completed": corrections_completed,
    }


def _read_recent_active_days(
    supabase: Any, user_id: str, anchor: date, window: int = CONSISTENCY_WINDOW_DAYS
) -> int:
    """Count distinct UTC dates with at least one positive-duration session
    inside [anchor - (window-1), anchor]."""
    start_day = anchor - timedelta(days=window - 1)
    start_iso = datetime.combine(start_day, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    end_iso = datetime.combine(
        anchor + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    ).isoformat()
    rows = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("started_at, duration_minutes, duration_mins")
            .eq("user_id", user_id)
            .gte("started_at", start_iso)
            .lt("started_at", end_iso)
            .execute()
        ),
        default=None,
    )
    days: set[str] = set()
    for r in getattr(rows, "data", None) or []:
        started = r.get("started_at")
        dur = r.get("duration_minutes") or r.get("duration_mins") or 0
        try:
            if int(dur) <= 0:
                continue
        except (TypeError, ValueError):
            continue
        if not started:
            continue
        days.add(str(started)[:10])
    return len(days)


def _read_yesterday_backlog(supabase: Any, user_id: str, day: date) -> int | None:
    """Read `backlog_count` from yesterday's snapshot, if present."""
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .select("backlog_count")
            .eq("user_id", user_id)
            .eq("snapshot_date", (day - timedelta(days=1)).isoformat())
            .limit(1)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    if not items:
        return None
    try:
        return int(items[0].get("backlog_count") or 0)
    except (TypeError, ValueError):
        return None


def _focus_minutes(session_minutes: list[int]) -> tuple[int, int, float | None]:
    """Apply the spec's focus rule: a session is focus-credited when it is
    >= 25 minutes (a Pomodoro-grade block). Returns
    (focus_minutes, focus_session_count, avg_focus_minutes)."""
    focus = [m for m in session_minutes if m >= 25]
    total = sum(focus)
    count = len(focus)
    avg = round(statistics.fmean(focus), 1) if focus else None
    return total, count, avg


def compute_behavior_snapshot(
    supabase: Any, user_id: str, day: date | None = None
) -> dict[str, Any]:
    """Compute (do not persist) a behavior snapshot for the given day."""
    day = day or datetime.now(timezone.utc).date()

    session_mins = _read_session_minutes(supabase, user_id, day)
    total_minutes = sum(session_mins)
    focus_min, focus_count, avg_focus = _focus_minutes(session_mins)

    tasks = _read_task_counts(supabase, user_id, day)
    mocks = _read_mock_counts(supabase, user_id, day)
    backlog_today = _read_backlog_count(supabase, user_id, day)
    backlog_yesterday = _read_yesterday_backlog(supabase, user_id, day)
    active_days = _read_recent_active_days(supabase, user_id, day)

    adherence = _ratio(tasks["completed"], tasks["planned"])
    completion_today = _ratio(tasks["completed"], max(tasks["planned"], 1))
    focus_norm = _clamp(focus_min / FOCUS_MINUTES_TARGET) if FOCUS_MINUTES_TARGET else 0.0
    consistency = _clamp(active_days / CONSISTENCY_WINDOW_DAYS)
    mock_review_rate = _ratio(mocks["reviewed"], mocks["count"])

    if backlog_yesterday is None or backlog_yesterday == 0:
        backlog_recovery = DEFAULT_DAILY_BACKLOG_RECOVERY
    else:
        delta = max(backlog_yesterday - backlog_today, 0)
        backlog_recovery = _clamp(delta / max(backlog_yesterday, 1))

    revision_regularity = (
        _clamp(tasks["revision_done"] / tasks["revision_total"])
        if tasks["revision_total"] > 0
        else None
    )

    components = {
        "plan_adherence": adherence if adherence is not None else 0.0,
        "consistency": consistency,
        "focus_minutes": focus_norm,
        "task_completion": completion_today if completion_today is not None else 0.0,
        "mock_review": mock_review_rate if mock_review_rate is not None else 0.0,
        "backlog_recovery": backlog_recovery,
        "revision_regularity": revision_regularity if revision_regularity is not None else 0.0,
    }
    behavior_index = sum(BEHAVIOR_INDEX_WEIGHTS[k] * v for k, v in components.items())

    discipline = _clamp(
        0.5 * (adherence or 0.0) + 0.3 * consistency + 0.2 * (1 if tasks["skipped"] == 0 else 0)
    )

    return {
        "user_id": user_id,
        "snapshot_date": day.isoformat(),
        "total_study_minutes": total_minutes,
        "focus_minutes": focus_min,
        "focus_session_count": focus_count,
        "avg_focus_session_minutes": avg_focus,
        "active_study_day": total_minutes > 0,
        "planned_tasks": tasks["planned"],
        "completed_tasks": tasks["completed"],
        "missed_tasks": tasks["missed"],
        "skipped_tasks": tasks["skipped"],
        "backlog_count": backlog_today,
        "mock_count": mocks["count"],
        "mock_review_count": mocks["reviewed"],
        "correction_tasks_completed": mocks["corrections_completed"],
        "behavior_adherence_score": round(adherence, 3) if adherence is not None else None,
        "consistency_score": round(consistency, 3),
        "focus_depth_score": round(focus_norm, 3),
        "discipline_score": round(discipline, 3),
        "source_trust": "platform_tracked",
        "_behavior_index": round(_clamp(behavior_index), 3),
        "_components": {k: round(v, 3) for k, v in components.items()},
    }


def upsert_behavior_snapshot(
    supabase: Any, user_id: str, day: date | None = None
) -> dict[str, Any]:
    """Compute + upsert a snapshot row. Returns the computed payload."""
    payload = compute_behavior_snapshot(supabase, user_id, day)
    row = {k: v for k, v in payload.items() if not k.startswith("_")}
    _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .upsert(row, on_conflict="user_id,snapshot_date")
            .execute()
        ),
        default=None,
    )
    return payload


def read_compare_me(
    supabase: Any, user_id: str, window_days: int = 30
) -> dict[str, Any]:
    """Self-view read for GET /api/study/compare/me.

    Returns today's freshly computed Behavior Index + per-component values, plus
    a sparkline of recent daily total_study_minutes.
    """
    today = datetime.now(timezone.utc).date()
    payload = upsert_behavior_snapshot(supabase, user_id, today)

    spark_start = today - timedelta(days=window_days - 1)
    rows = _safe(
        lambda: (
            supabase.table("study_behavior_daily_snapshots")
            .select(
                "snapshot_date, total_study_minutes, focus_minutes, "
                "behavior_adherence_score, consistency_score, focus_depth_score, "
                "discipline_score"
            )
            .eq("user_id", user_id)
            .gte("snapshot_date", spark_start.isoformat())
            .lte("snapshot_date", today.isoformat())
            .order("snapshot_date")
            .execute()
        ),
        default=None,
    )
    history = getattr(rows, "data", None) or []

    return {
        "as_of": payload["snapshot_date"],
        "behavior_index": payload["_behavior_index"],
        "components": payload["_components"],
        "today": {
            "total_study_minutes": payload["total_study_minutes"],
            "focus_minutes": payload["focus_minutes"],
            "focus_session_count": payload["focus_session_count"],
            "avg_focus_session_minutes": payload["avg_focus_session_minutes"],
            "planned_tasks": payload["planned_tasks"],
            "completed_tasks": payload["completed_tasks"],
            "missed_tasks": payload["missed_tasks"],
            "backlog_count": payload["backlog_count"],
            "mock_count": payload["mock_count"],
            "mock_review_count": payload["mock_review_count"],
            "correction_tasks_completed": payload["correction_tasks_completed"],
        },
        "scores": {
            "behavior_adherence": payload["behavior_adherence_score"],
            "consistency": payload["consistency_score"],
            "focus_depth": payload["focus_depth_score"],
            "discipline": payload["discipline_score"],
        },
        "history": history,
        "trust_level": "system_verified",
    }
