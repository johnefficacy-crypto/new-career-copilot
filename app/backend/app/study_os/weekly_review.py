"""Study OS — Weekly Review service.

Deterministically computes a week's review snapshot from real
study_sessions, study_tasks and mock_tests rows, derives the
improved/declined/next-change item lists with rule-based logic (no AI),
and upserts the result into ``weekly_reviews`` + ``weekly_review_items``.

Public entry points:
  * ``get_weekly_review(supabase, user_id, week_start=None)`` — read or
    compute the snapshot for the given (or current) Monday-start week.
  * ``compute_weekly_review(supabase, user_id, week_start=None)`` — force
    a fresh compute + persist.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable

logger = logging.getLogger("career_copilot.study_os.weekly_review")


# ───────────────────────────── helpers ──────────────────────────────────────
def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("weekly_review supabase call failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _ratio(a: float, b: float) -> float | None:
    try:
        if b is None or float(b) == 0:
            return None
        return round(float(a) / float(b), 3)
    except (TypeError, ValueError):
        return None


def _isofmt(d: date) -> str:
    return d.isoformat()


# ─────────────────────────── data collectors ────────────────────────────────
def _sum_study_sessions(
    supabase: Any, user_id: str, week_start: date, week_end: date
) -> float:
    """Hours studied in the week — sum of completed study_sessions minutes."""
    rows = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("duration_mins, started_at, ended_at")
            .eq("user_id", user_id)
            .gte("started_at", _isofmt(week_start))
            .lte("started_at", _isofmt(week_end + timedelta(days=1)))
            .execute()
        ),
        default=None,
    )
    total = 0
    for r in getattr(rows, "data", None) or []:
        try:
            total += int(r.get("duration_mins") or 0)
        except (TypeError, ValueError):
            continue
    return round(total / 60, 1)


def _task_counts(
    supabase: Any, user_id: str, week_start: date, week_end: date
) -> tuple[int, int, int, int, int]:
    """Returns (planned, completed, missed, carried_forward, revision_total).

    A task counts as planned in the week if its ``scheduled_date`` falls
    inside the week. ``revision_total`` is the subset where
    ``task_type='revision'``.
    """
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("status, task_type, scheduled_date, planned_minutes")
            .eq("user_id", user_id)
            .gte("scheduled_date", _isofmt(week_start))
            .lte("scheduled_date", _isofmt(week_end))
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    planned = len(items)
    completed = sum(1 for r in items if r.get("status") == "completed")
    missed = sum(1 for r in items if r.get("status") in {"missed", "skipped"})
    carried = sum(1 for r in items if r.get("status") == "carried_forward")
    revisions = sum(1 for r in items if r.get("task_type") == "revision")
    return planned, completed, missed, carried, revisions


def _planned_minutes_for_week(
    supabase: Any, user_id: str, week_start: date, week_end: date
) -> int:
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("planned_minutes, duration_mins")
            .eq("user_id", user_id)
            .gte("scheduled_date", _isofmt(week_start))
            .lte("scheduled_date", _isofmt(week_end))
            .execute()
        ),
        default=None,
    )
    total = 0
    for r in getattr(rows, "data", None) or []:
        v = r.get("planned_minutes") or r.get("duration_mins") or 0
        try:
            total += int(v)
        except (TypeError, ValueError):
            continue
    return total


def _backlog_count(supabase: Any, user_id: str, on_date: date) -> int:
    """How many tasks were unfinished + scheduled at or before ``on_date``."""
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("status, scheduled_date")
            .eq("user_id", user_id)
            .lte("scheduled_date", _isofmt(on_date))
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    return sum(
        1
        for r in items
        if r.get("status") in {"planned", "in_progress", "carried_forward"}
    )


def _mocks_in_week(
    supabase: Any, user_id: str, week_start: date, week_end: date
) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("id, test_name, scored_marks, total_marks, attempted_at")
            .eq("user_id", user_id)
            .gte("attempted_at", _isofmt(week_start))
            .lte("attempted_at", _isofmt(week_end + timedelta(days=1)))
            .order("attempted_at", desc=False)
            .execute()
        ),
        default=None,
    )
    return getattr(rows, "data", None) or []


def _mock_trend_history(
    supabase: Any, user_id: str, week_end: date, weeks: int = 6
) -> list[dict[str, Any]]:
    """The last N mocks' percentages, oldest first — for the headline trend."""
    rows = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("id, test_name, scored_marks, total_marks, attempted_at")
            .eq("user_id", user_id)
            .lte("attempted_at", _isofmt(week_end + timedelta(days=1)))
            .order("attempted_at", desc=True)
            .limit(weeks)
            .execute()
        ),
        default=None,
    )
    items = list(reversed(getattr(rows, "data", None) or []))
    out: list[dict[str, Any]] = []
    for m in items:
        scored = m.get("scored_marks") or 0
        total = m.get("total_marks") or 0
        pct = round((float(scored) / float(total)) * 100, 1) if float(total or 0) > 0 else 0
        out.append({
            "id": m.get("id"),
            "name": m.get("test_name"),
            "percentage": pct,
        })
    return out


def _previous_review(
    supabase: Any, user_id: str, before_week_start: date
) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("weekly_reviews")
            .select("*")
            .eq("user_id", user_id)
            .lte("week_start", _isofmt(before_week_start - timedelta(days=1)))
            .order("week_start", desc=True)
            .limit(1)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    return items[0] if items else None


# ───────────────────────── derived items (no AI) ────────────────────────────
def _derive_items(
    *,
    this_week: dict[str, Any],
    prev_week: dict[str, Any] | None,
    mocks_this_week: list[dict[str, Any]],
    mock_trend: list[dict[str, Any]],
    missed_this_week: int,
    carried_this_week: int,
) -> list[dict[str, Any]]:
    """Deterministic improved/declined/next_change list.

    Every entry has {kind, label, delta?, note?, source}. ``delta`` is a
    short human string ("+12%"); ``note`` is one short sentence.
    """
    items: list[dict[str, Any]] = []
    hours = float(this_week.get("hours_studied") or 0)
    hours_prev = float((prev_week or {}).get("hours_studied") or 0)
    planned_hours = float(this_week.get("hours_planned") or 0)
    adherence = this_week.get("adherence")
    adherence_prev = (prev_week or {}).get("adherence")
    rev_cov = this_week.get("revision_coverage")

    # ── improved ─────────────────────────────────────────────────────────
    if hours_prev > 0 and hours > hours_prev:
        delta = round(hours - hours_prev, 1)
        items.append({
            "kind": "improved",
            "label": "Study hours",
            "delta": f"+{delta}h",
            "note": f"Up from {hours_prev}h last week.",
            "source": "study_sessions",
        })
    if adherence is not None and adherence_prev is not None and adherence > adherence_prev:
        pct = round((adherence - adherence_prev) * 100)
        items.append({
            "kind": "improved",
            "label": "Adherence",
            "delta": f"+{pct}%",
            "note": "More planned tasks completed than last week.",
            "source": "study_tasks",
        })
    if len(mock_trend) >= 2:
        last = mock_trend[-1].get("percentage") or 0
        first = mock_trend[0].get("percentage") or 0
        if last - first >= 5:
            items.append({
                "kind": "improved",
                "label": "Mock score trend",
                "delta": f"+{round(last - first)}%",
                "note": f"Across the last {len(mock_trend)} mocks.",
                "source": "mock_tests",
            })

    # ── declined ─────────────────────────────────────────────────────────
    if planned_hours > 0 and hours < planned_hours * 0.7:
        items.append({
            "kind": "declined",
            "label": "Hours vs plan",
            "delta": f"-{round(planned_hours - hours, 1)}h",
            "note": "Studied less than 70% of the planned hours.",
            "source": "study_sessions",
        })
    if missed_this_week >= 3:
        items.append({
            "kind": "declined",
            "label": "Missed tasks",
            "delta": f"{missed_this_week} missed",
            "note": "Three or more planned tasks slipped this week.",
            "source": "study_tasks",
        })
    if rev_cov is not None and rev_cov < 0.5:
        items.append({
            "kind": "declined",
            "label": "Revision coverage",
            "delta": f"{int(round(rev_cov * 100))}%",
            "note": "Less than half of scheduled revisions landed.",
            "source": "study_tasks",
        })

    # ── next_change ──────────────────────────────────────────────────────
    if carried_this_week > 0:
        items.append({
            "kind": "next_change",
            "label": f"Absorb {carried_this_week} carried-forward task(s) early next week.",
            "delta": None,
            "note": "Engine will front-load these before Friday.",
            "source": "study_tasks",
        })
    if mocks_this_week and any(
        (m.get("scored_marks") or 0) / max(1, m.get("total_marks") or 1) < 0.6
        for m in mocks_this_week
    ):
        items.append({
            "kind": "next_change",
            "label": "Review last week's mocks before attempting a new one.",
            "delta": None,
            "note": "Policy: mock_review_before_mock.",
            "source": "mock_tests",
        })
    if planned_hours > 0 and hours < planned_hours * 0.75:
        items.append({
            "kind": "next_change",
            "label": "Lighter Friday to protect weekend consistency.",
            "delta": None,
            "note": "Auto-suggested when hours slip > 25%.",
            "source": "rule:lighter_friday",
        })

    # Position values per kind, in insertion order.
    by_kind: dict[str, int] = {}
    for it in items:
        k = it["kind"]
        it["position"] = by_kind.get(k, 0)
        by_kind[k] = it["position"] + 1
    return items


# ─────────────────────────── compute + persist ──────────────────────────────
def _serialise_review(review: dict[str, Any], items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    by_kind: dict[str, list[dict[str, Any]]] = {"improved": [], "declined": [], "next_change": []}
    for it in items or []:
        by_kind.setdefault(it.get("kind") or "", []).append(it)
    for k in by_kind:
        by_kind[k].sort(key=lambda r: r.get("position") or 0)
    return {
        "id": review.get("id"),
        "week_start": review.get("week_start"),
        "week_end": review.get("week_end"),
        "week_of": review.get("week_start"),
        "hours_studied": float(review.get("hours_studied") or 0),
        "hours_planned": float(review.get("hours_planned") or 0),
        "adherence": review.get("adherence"),
        "tasks_completed": review.get("tasks_completed") or 0,
        "tasks_planned": review.get("tasks_planned") or 0,
        "mocks_taken": review.get("mocks_taken") or 0,
        "mock_trend": list(review.get("mock_trend") or []),
        "backlog_start": review.get("backlog_start"),
        "backlog_end": review.get("backlog_end"),
        "revision_coverage": review.get("revision_coverage"),
        "computed_at": review.get("computed_at"),
        "highlights": [
            i["label"] + (f" ({i['delta']})" if i.get("delta") else "")
            for i in by_kind.get("improved", [])
        ],
        "corrections": [
            i["label"] + (f" ({i['delta']})" if i.get("delta") else "")
            for i in by_kind.get("declined", [])
        ],
        "next_changes": [i["label"] for i in by_kind.get("next_change", [])],
        "improved": by_kind.get("improved", []),
        "declined": by_kind.get("declined", []),
    }


def compute_weekly_review(
    supabase: Any,
    user_id: str,
    week_start: date | None = None,
) -> dict[str, Any]:
    """Compute + upsert the week's review snapshot.

    ``week_start`` is the Monday of the target week (defaults to this week).
    """
    week_start = _monday_of(week_start or date.today())
    week_end = week_start + timedelta(days=6)

    hours_studied = _sum_study_sessions(supabase, user_id, week_start, week_end)
    planned, completed, missed, carried, rev_total = _task_counts(
        supabase, user_id, week_start, week_end
    )
    planned_minutes = _planned_minutes_for_week(supabase, user_id, week_start, week_end)
    hours_planned = round(planned_minutes / 60, 1)
    adherence = _ratio(completed, planned) if planned else None
    revision_coverage = _ratio(
        sum(1 for r in (_safe(
            lambda: (
                supabase.table("study_tasks")
                .select("status, task_type, scheduled_date")
                .eq("user_id", user_id)
                .eq("task_type", "revision")
                .gte("scheduled_date", _isofmt(week_start))
                .lte("scheduled_date", _isofmt(week_end))
                .execute()
            ),
            default=None,
        ).data or []) if r.get("status") == "completed"),
        rev_total,
    ) if rev_total else None
    backlog_start = _backlog_count(supabase, user_id, week_start - timedelta(days=1))
    backlog_end = _backlog_count(supabase, user_id, week_end)
    mocks = _mocks_in_week(supabase, user_id, week_start, week_end)
    mocks_taken = len(mocks)
    mock_trend = _mock_trend_history(supabase, user_id, week_end, weeks=6)

    payload = {
        "user_id": user_id,
        "week_start": _isofmt(week_start),
        "week_end": _isofmt(week_end),
        "hours_studied": hours_studied,
        "hours_planned": hours_planned,
        "adherence": adherence,
        "tasks_completed": completed,
        "tasks_planned": planned,
        "mocks_taken": mocks_taken,
        "mock_trend": mock_trend,
        "backlog_start": backlog_start,
        "backlog_end": backlog_end,
        "revision_coverage": revision_coverage,
        "computed_at": _now_iso(),
    }

    upserted = _safe(
        lambda: (
            supabase.table("weekly_reviews")
            .upsert(payload, on_conflict="user_id,week_start")
            .execute()
        ),
        default=None,
    )
    rows = getattr(upserted, "data", None) or []
    if not rows:
        # Stub backends sometimes don't honour upsert — fall back to insert.
        inserted = _safe(
            lambda: supabase.table("weekly_reviews").insert(payload).execute(),
            default=None,
        )
        rows = getattr(inserted, "data", None) or []
    review = rows[0] if rows else dict(payload)

    prev = _previous_review(supabase, user_id, week_start)
    derived = _derive_items(
        this_week=review,
        prev_week=prev,
        mocks_this_week=mocks,
        mock_trend=mock_trend,
        missed_this_week=missed,
        carried_this_week=carried,
    )

    # Wipe + reinsert items for this review id.
    review_id = review.get("id")
    if review_id:
        _safe(
            lambda: (
                supabase.table("weekly_review_items")
                .delete()
                .eq("weekly_review_id", review_id)
                .execute()
            ),
        )
        if derived:
            _safe(
                lambda: supabase.table("weekly_review_items")
                .insert(
                    [{**d, "weekly_review_id": review_id} for d in derived]
                )
                .execute(),
            )

    return _serialise_review(review, derived)


def get_weekly_review(
    supabase: Any,
    user_id: str,
    week_start: date | None = None,
) -> dict[str, Any]:
    """Read the persisted review for the week — computing if absent."""
    week_start = _monday_of(week_start or date.today())
    rows = _safe(
        lambda: (
            supabase.table("weekly_reviews")
            .select("*")
            .eq("user_id", user_id)
            .eq("week_start", _isofmt(week_start))
            .limit(1)
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    if not items:
        return compute_weekly_review(supabase, user_id, week_start)
    review = items[0]
    item_rows = _safe(
        lambda: (
            supabase.table("weekly_review_items")
            .select("*")
            .eq("weekly_review_id", review.get("id"))
            .execute()
        ),
        default=None,
    )
    return _serialise_review(review, getattr(item_rows, "data", None) or [])
