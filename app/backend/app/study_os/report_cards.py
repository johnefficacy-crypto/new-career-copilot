from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.study_os import weekly_review as weekly_review_service


def _safe(fn, default):
    try:
        return fn()
    except Exception:
        return default


def _ratio(n: int, d: int) -> float | None:
    if not d:
        return None
    return round(float(n) / float(d), 3)


def _period_bounds(period: str, anchor: date) -> tuple[date, date]:
    if period == "daily":
        return anchor, anchor
    if period == "weekly":
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if period == "monthly":
        start = anchor.replace(day=1)
        if start.month == 12:
            nxt = date(start.year + 1, 1, 1)
        else:
            nxt = date(start.year, start.month + 1, 1)
        return start, nxt - timedelta(days=1)
    raise ValueError("period must be daily|weekly|monthly")


def _score_labels(score: float | None) -> str:
    if score is None:
        return "No evidence"
    pct = score * 100
    if pct >= 90:
        return "Excellent adherence"
    if pct >= 75:
        return "On track"
    if pct >= 60:
        return "Recoverable gap"
    if pct >= 40:
        return "Needs plan correction"
    return "Plan mismatch"


def _compute(supabase: Any, user_id: str, period: str, anchor: date) -> dict[str, Any]:
    start, end = _period_bounds(period, anchor)
    tasks = _safe(lambda: supabase.table("study_tasks").select("status, task_type, scheduled_date, planned_minutes").eq("user_id", user_id).gte("scheduled_date", start.isoformat()).lte("scheduled_date", end.isoformat()).execute().data, []) or []
    sessions = _safe(lambda: supabase.table("study_sessions").select("duration_mins, started_at").eq("user_id", user_id).gte("started_at", start.isoformat()).lte("started_at", (end + timedelta(days=1)).isoformat()).execute().data, []) or []
    mocks = _safe(lambda: supabase.table("mock_tests").select("id, attempted_at, review_state, trust_label").eq("user_id", user_id).gte("attempted_at", start.isoformat()).lte("attempted_at", (end + timedelta(days=1)).isoformat()).execute().data, []) or []
    corrections = _safe(lambda: supabase.table("mock_correction_tasks").select("id, status, created_at").eq("user_id", user_id).gte("created_at", start.isoformat()).lte("created_at", (end + timedelta(days=1)).isoformat()).execute().data, []) or []

    planned_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.get("status") == "completed")
    missed_tasks = sum(1 for t in tasks if t.get("status") == "missed")
    skipped_tasks = sum(1 for t in tasks if t.get("status") == "skipped")
    carried = sum(1 for t in tasks if t.get("status") == "carried_forward")
    planned_minutes = sum(int(t.get("planned_minutes") or 0) for t in tasks)
    completed_minutes = sum(int(t.get("planned_minutes") or 0) for t in tasks if t.get("status") == "completed")
    focus_minutes = sum(int(s.get("duration_mins") or 0) for s in sessions)
    active_days = len({(s.get("started_at") or "")[:10] for s in sessions if s.get("started_at")})
    planned_days = len({str(t.get("scheduled_date")) for t in tasks if t.get("scheduled_date")})
    revision_total = sum(1 for t in tasks if t.get("task_type") == "revision")
    revision_done = sum(1 for t in tasks if t.get("task_type") == "revision" and t.get("status") == "completed")

    mocks_taken = len(mocks)
    mocks_reviewed = sum(1 for m in mocks if (m.get("review_state") or "") in {"reviewed", "correction_drafted"})
    corr_created = len(corrections)
    corr_completed = sum(1 for c in corrections if c.get("status") == "completed")

    scores = {
        "plan_adherence_score": _ratio(completed_tasks, planned_tasks),
        "plan_completion_score": _ratio(completed_minutes, planned_minutes),
        "focus_adherence_score": _ratio(focus_minutes, planned_minutes),
        "consistency_score": _ratio(active_days, planned_days),
        "backlog_delta": carried,
        "revision_completion_score": _ratio(revision_done, revision_total),
        "mock_review_score": _ratio(mocks_reviewed, mocks_taken),
        "correction_completion_score": _ratio(corr_completed, corr_created),
    }

    payload = {
        "user_id": user_id,
        "period_type": period,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "planned_tasks": planned_tasks,
        "completed_tasks": completed_tasks,
        "missed_tasks": missed_tasks,
        "skipped_tasks": skipped_tasks,
        "carried_forward_tasks": carried,
        "planned_minutes": planned_minutes,
        "completed_minutes": completed_minutes,
        "focus_minutes": focus_minutes,
        "active_study_days": active_days,
        "planned_study_days": planned_days,
        "mocks_taken": mocks_taken,
        "mocks_reviewed": mocks_reviewed,
        "correction_tasks_created": corr_created,
        "correction_tasks_completed": corr_completed,
        "scores": {
            **scores,
            "label": _score_labels(scores.get("plan_adherence_score")),
        },
        "highlights": [],
        "corrections": [],
        "next_actions": [],
        "evidence_summary": {
            "source": "platform_tracked",
            "mock_score_block": {
                "mocks_taken": mocks_taken,
                "mocks_reviewed": mocks_reviewed,
                "trust_label": "platform_verified",
            },
        },
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    _safe(lambda: supabase.table("study_report_cards").upsert(payload, on_conflict="user_id,period_type,period_start").execute(), None)
    row = _safe(lambda: supabase.table("study_report_cards").select("*").eq("user_id", user_id).eq("period_type", period).eq("period_start", start.isoformat()).limit(1).execute().data, [])
    return (row or [payload])[0]


def get_report_card(supabase: Any, user_id: str, period: str, anchor: date) -> dict[str, Any]:
    start, _ = _period_bounds(period, anchor)
    row = _safe(lambda: supabase.table("study_report_cards").select("*").eq("user_id", user_id).eq("period_type", period).eq("period_start", start.isoformat()).limit(1).execute().data, [])
    if row:
        return row[0]
    if period == "daily" and start == datetime.now(timezone.utc).date():
        return _compute(supabase, user_id, period, anchor)
    return _compute(supabase, user_id, period, anchor)


def compute_report_card(supabase: Any, user_id: str, period: str, anchor: date) -> dict[str, Any]:
    if period == "weekly":
        weekly_review_service.compute_weekly_review(supabase, user_id, anchor - timedelta(days=anchor.weekday()))
    return _compute(supabase, user_id, period, anchor)


def history(supabase: Any, user_id: str, period: str, limit: int = 12) -> list[dict[str, Any]]:
    rows = _safe(lambda: supabase.table("study_report_cards").select("*").eq("user_id", user_id).eq("period_type", period).order("period_start", desc=True).limit(limit).execute().data, [])
    return rows or []
