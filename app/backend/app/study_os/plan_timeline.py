"""Study OS — Exam Cycle Timeline service.

Composes the data behind the Study Plan page's full-cycle view:
  * exam_context — the user's target exam + the soonest upcoming cycle.
  * plan_context — active study_plan and its latest version timestamp.
  * cycle_progress — planned vs actual progress for the cycle so far.
  * milestones — notification / application / exam markers from
    exam_cycles plus phase markers from exam_phases when available.
  * phase_bands — study-cycle bands (Foundation → Coverage → Revision →
    Mock-intensive → Final sprint) derived deterministically from the
    cycle's start / end dates. No band invents an exam phase.
  * series — weekly (date, planned_pct, actual_pct) points used by the
    PlannedVsActualChart.
  * subjects — per-subject planned vs actual progress from study_tasks +
    study_sessions, tagged with the same locked / preview trust contract
    used by the rest of Study OS.
  * risk_flags — deterministic, rule-based suggestions (no AI).

Never invents an exam_start. When the soonest cycle has no exam_start the
top-level status drops to ``not_connected`` and the UI renders a calm
empty state.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from app.study_os.planner import (  # type: ignore
    _load_locked_coverage,
    _load_user_signals,
    _resolve_target_exam,
)

logger = logging.getLogger("career_copilot.study_os.plan_timeline")

PLANNER_VERSION = "planner_v1"

PHASE_BAND_TEMPLATE = (
    {"name": "Foundation", "weight": 0.30, "color": "#A68057"},
    {"name": "Coverage", "weight": 0.30, "color": "#54794E"},
    {"name": "Revision", "weight": 0.20, "color": "#524864"},
    {"name": "Mock-intensive", "weight": 0.15, "color": "#7A8AA5"},
    {"name": "Final sprint", "weight": 0.05, "color": "#7A3925"},
)


# ───────────────────────────── helpers ──────────────────────────────────────
def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("plan_timeline supabase call failed: %s", exc)
        return default


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _to_date(raw: Any) -> date | None:
    if raw is None:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    if isinstance(raw, datetime):
        return raw.date()
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date()
    except (TypeError, ValueError):
        try:
            return datetime.strptime(str(raw)[:10], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return None


def _iso(d: date | None) -> str | None:
    return d.isoformat() if isinstance(d, date) else None


def _pct(numerator: float, denominator: float) -> int:
    if not denominator:
        return 0
    val = (float(numerator) / float(denominator)) * 100
    return max(0, min(100, round(val)))


def _empty_payload(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    base = {
        "exam_context": {
            "exam_id": None,
            "exam_name": None,
            "cycle": None,
            "phase": None,
            "exam_start": None,
            "days_remaining": None,
            "trust_status": "preview",
        },
        "plan_context": {
            "plan_id": None,
            "plan_version": None,
            "created_at": None,
            "last_adapted_at": None,
            "planner_version": PLANNER_VERSION,
        },
        "cycle_progress": {
            "total_days": 0,
            "elapsed_days": 0,
            "planned_progress_pct": 0,
            "actual_progress_pct": 0,
            "gap_pct": 0,
            "status": "not_connected",
        },
        "milestones": [],
        "phase_bands": [],
        "series": [],
        "subjects": [],
        "risk_flags": [],
    }
    if extra:
        base.update(extra)
    return base


# ─────────────────────────── data collectors ────────────────────────────────
def _load_active_cycle(supabase: Any, exam_id: str) -> dict[str, Any] | None:
    today = _today().isoformat()
    rows = _safe(
        lambda: (
            supabase.table("exam_cycles")
            .select(
                "id, cycle_name, status, notification_date, application_start, "
                "application_end, exam_start, exam_end, year"
            )
            .eq("exam_id", exam_id)
            .gte("exam_start", today)
            .order("exam_start")
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if rows:
        return rows[0]
    # Fall back to the most recent past cycle so the timeline still has a
    # cycle name even when the next exam date isn't published yet.
    rows = _safe(
        lambda: (
            supabase.table("exam_cycles")
            .select("id, cycle_name, status, year")
            .eq("exam_id", exam_id)
            .order("exam_start", desc=True)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def _load_phases(supabase: Any, exam_id: str, cycle_id: str | None) -> list[dict[str, Any]]:
    if not cycle_id:
        return []
    rows = _safe(
        lambda: (
            supabase.table("exam_phases")
            .select("id, phase_name, phase_slug, phase_order, status")
            .eq("exam_id", exam_id)
            .eq("exam_cycle_id", cycle_id)
            .order("phase_order")
            .execute()
            .data
        ),
        default=[],
    )
    return rows or []


def _load_active_plan(supabase: Any, user_id: str) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("study_plans")
            .select(
                "id, status, target_exam, start_date, end_date, weekly_hours_goal, "
                "metadata, created_at, updated_at"
            )
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def _latest_plan_version(supabase: Any, plan_id: str | None) -> dict[str, Any] | None:
    if not plan_id:
        return None
    rows = _safe(
        lambda: (
            supabase.table("study_plan_versions")
            .select("id, version, created_at")
            .eq("plan_id", plan_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def _load_tasks(
    supabase: Any, user_id: str, start: date, end: date
) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select(
                "id, status, subject, subject_id, scheduled_date, completed_at, "
                "planned_minutes, duration_mins, task_type"
            )
            .eq("user_id", user_id)
            .gte("scheduled_date", _iso(start))
            .lte("scheduled_date", _iso(end))
            .execute()
            .data
        ),
        default=[],
    )
    return rows or []


def _load_focus_sessions(
    supabase: Any, user_id: str, start: date, end: date
) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("study_sessions")
            .select("id, subject, duration_mins, started_at, ended_at, plan_id")
            .eq("user_id", user_id)
            .gte("started_at", _iso(start))
            .lte("started_at", _iso(end + timedelta(days=1)))
            .execute()
            .data
        ),
        default=[],
    )
    return rows or []


def _load_overdue_count(supabase: Any, user_id: str, before: date) -> int:
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select("status, scheduled_date")
            .eq("user_id", user_id)
            .lte("scheduled_date", _iso(before - timedelta(days=1)))
            .execute()
            .data
        ),
        default=[],
    ) or []
    return sum(
        1
        for r in rows
        if r.get("status") in {"planned", "in_progress", "carried_forward"}
    )


def _load_unreviewed_mocks(supabase: Any, user_id: str) -> int:
    rows = _safe(
        lambda: (
            supabase.table("mock_tests")
            .select("review_state")
            .eq("user_id", user_id)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return sum(1 for r in rows if r.get("review_state") in {"unreviewed", "scheduled"})


# ─────────────────────────── computation ────────────────────────────────────
def _task_minutes(t: dict[str, Any]) -> int:
    v = t.get("planned_minutes") or t.get("duration_mins") or 0
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _build_milestones(
    cycle: dict[str, Any] | None,
    phases: list[dict[str, Any]],
    today: date,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if cycle:
        for key, kind in (
            ("notification_date", "notification"),
            ("application_start", "application_start"),
            ("application_end", "application_end"),
        ):
            d = _to_date(cycle.get(key))
            if d:
                items.append({
                    "kind": kind,
                    "label": kind.replace("_", " ").title(),
                    "date": _iso(d),
                    "status": "past" if d < today else "upcoming",
                })
    items.append({"kind": "today", "label": "Today", "date": _iso(today), "status": "current"})
    if cycle:
        exam_start = _to_date(cycle.get("exam_start"))
        if exam_start:
            items.append({
                "kind": "exam",
                "label": "Exam day",
                "date": _iso(exam_start),
                "status": "past" if exam_start < today else "upcoming",
            })
    for p in phases:
        # exam_phases doesn't carry per-phase dates in this schema — surface
        # the name as a non-dated marker so the UI can still list them.
        items.append({
            "kind": "phase",
            "label": p.get("phase_name") or p.get("phase_slug") or "Phase",
            "date": None,
            "status": "preview",
            "phase_slug": p.get("phase_slug"),
            "phase_order": p.get("phase_order"),
        })
    return items


def _build_phase_bands(
    cycle_start: date | None, exam_start: date | None
) -> list[dict[str, Any]]:
    if not cycle_start or not exam_start or exam_start <= cycle_start:
        return []
    total = (exam_start - cycle_start).days
    bands: list[dict[str, Any]] = []
    cursor = 0
    for i, b in enumerate(PHASE_BAND_TEMPLATE):
        days = round(total * b["weight"])
        # Ensure the last band ends exactly on exam day even after rounding.
        if i == len(PHASE_BAND_TEMPLATE) - 1:
            days = total - cursor
        start = cycle_start + timedelta(days=cursor)
        end = cycle_start + timedelta(days=cursor + max(days, 0))
        bands.append({
            "name": b["name"],
            "color": b["color"],
            "weight": b["weight"],
            "start": _iso(start),
            "end": _iso(end),
            "days": max(days, 0),
        })
        cursor += days
    return bands


def _build_series(
    tasks: list[dict[str, Any]],
    cycle_start: date,
    exam_start: date,
    total_planned: int,
) -> list[dict[str, Any]]:
    """Weekly cumulative planned vs actual percentages.

    A weekly resolution keeps the curve readable for cycles between a few
    weeks and a year long. ``planned_pct`` is the share of the total
    planned-minutes scheduled on or before that week; ``actual_pct`` is
    the share of those minutes whose task is marked ``completed``.
    """
    if total_planned <= 0 or exam_start <= cycle_start:
        return []
    points: list[dict[str, Any]] = []
    week_end = cycle_start
    while week_end <= exam_start:
        planned = 0
        actual = 0
        for t in tasks:
            sched = _to_date(t.get("scheduled_date"))
            if not sched or sched > week_end:
                continue
            mins = _task_minutes(t)
            planned += mins
            if t.get("status") == "completed":
                actual += mins
        points.append({
            "date": _iso(week_end),
            "planned_pct": _pct(planned, total_planned),
            "actual_pct": _pct(actual, total_planned),
        })
        week_end += timedelta(days=7)
    # Ensure the last point sits exactly on exam_start when the loop
    # overshot.
    if points and points[-1]["date"] != _iso(exam_start):
        planned = 0
        actual = 0
        for t in tasks:
            sched = _to_date(t.get("scheduled_date"))
            if not sched or sched > exam_start:
                continue
            mins = _task_minutes(t)
            planned += mins
            if t.get("status") == "completed":
                actual += mins
        points.append({
            "date": _iso(exam_start),
            "planned_pct": _pct(planned, total_planned),
            "actual_pct": _pct(actual, total_planned),
        })
    return points


def _build_subjects(
    tasks: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    locked_subject_ids: set[str],
) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for t in tasks:
        name = t.get("subject") or "General"
        sid = t.get("subject_id")
        key = sid or f"name:{name.lower()}"
        b = buckets.setdefault(
            key,
            {
                "subject_id": sid,
                "subject_name": name,
                "planned_minutes": 0,
                "completed_minutes": 0,
                "task_count": 0,
                "completed_tasks": 0,
            },
        )
        mins = _task_minutes(t)
        b["planned_minutes"] += mins
        b["task_count"] += 1
        if t.get("status") == "completed":
            b["completed_minutes"] += mins
            b["completed_tasks"] += 1
    # Fold session minutes into the matching subject bucket. Sessions are
    # how aspirants log "actual" hours that didn't necessarily map to a
    # scheduled task.
    for s in sessions:
        name = s.get("subject") or "General"
        # We only attach to existing buckets so unknown subjects don't
        # invent rows that have no planned counterpart.
        for b in buckets.values():
            if b["subject_name"].lower() == name.lower():
                mins = 0
                try:
                    mins = int(s.get("duration_mins") or 0)
                except (TypeError, ValueError):
                    mins = 0
                b["completed_minutes"] += mins
                break

    items: list[dict[str, Any]] = []
    for b in buckets.values():
        planned_pct = _pct(b["completed_minutes"], b["planned_minutes"]) if b["planned_minutes"] else 0
        items.append({
            "subject_id": b["subject_id"],
            "subject_name": b["subject_name"],
            "planned_hours": round(b["planned_minutes"] / 60, 1),
            "actual_hours": round(b["completed_minutes"] / 60, 1),
            "planned_pct": 100,  # the row represents 100% of its own plan
            "actual_pct": planned_pct,
            "task_count": b["task_count"],
            "completed_tasks": b["completed_tasks"],
            "trust_status": "locked" if (b["subject_id"] and b["subject_id"] in locked_subject_ids) else "preview",
        })
    items.sort(key=lambda r: (-r["planned_hours"], r["subject_name"].lower()))
    return items


def _build_risk_flags(
    *,
    exam_start: date | None,
    today: date,
    cycle_progress: dict[str, Any],
    overdue_count: int,
    unreviewed_mocks: int,
    subjects: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    if exam_start is None:
        flags.append({
            "code": "no_exam_date",
            "label": "No verified exam date",
            "reason": "The soonest exam cycle for this exam does not have an exam_start yet.",
            "suggested_action": "Watch the official notification — the timeline lights up the moment a date is locked.",
            "severity": "low",
        })

    planned = cycle_progress.get("planned_progress_pct") or 0
    actual = cycle_progress.get("actual_progress_pct") or 0
    if planned - actual >= 10:
        flags.append({
            "code": "behind_plan",
            "label": "Behind plan",
            "reason": f"Actual progress is {planned - actual}% behind the planned curve.",
            "suggested_action": "Shrink today's task size or reschedule to recover gradually.",
            "severity": "medium",
        })

    total_days = cycle_progress.get("total_days") or 0
    elapsed_days = cycle_progress.get("elapsed_days") or 0
    if total_days and elapsed_days / total_days > 0.5 and actual < 30:
        flags.append({
            "code": "low_actual_progress",
            "label": "Cycle is halfway, completion is low",
            "reason": "More than half of the cycle has elapsed but completed work is under 30%.",
            "suggested_action": "Pick one weak topic to close fully this week.",
            "severity": "medium",
        })

    if overdue_count >= 5:
        flags.append({
            "code": "high_backlog",
            "label": "Backlog growing",
            "reason": f"{overdue_count} tasks are scheduled in the past and still open.",
            "suggested_action": "Use Carry forward backlog or drop low-value items.",
            "severity": "medium",
        })

    if unreviewed_mocks >= 1:
        flags.append({
            "code": "mock_review_pending",
            "label": "Mock review pending",
            "reason": f"{unreviewed_mocks} logged mock(s) have no review yet.",
            "suggested_action": "Open Mocks → review the most recent attempt before the next.",
            "severity": "low",
        })

    behind_subjects = [
        s["subject_name"] for s in subjects if s["planned_hours"] > 0 and s["actual_pct"] < 50
    ]
    if behind_subjects:
        flags.append({
            "code": "subject_behind",
            "label": "Subjects under 50% complete",
            "reason": "These subjects are below 50% of their planned hours: " + ", ".join(behind_subjects[:4]) + ("…" if len(behind_subjects) > 4 else ""),
            "suggested_action": "Reweight the next week toward these subjects in Plan preferences.",
            "severity": "low" if len(behind_subjects) == 1 else "medium",
        })

    return flags


# ─────────────────────────── public entry ───────────────────────────────────
def get_plan_timeline(supabase: Any, user_id: str) -> dict[str, Any]:
    """Compose the Exam Cycle Timeline payload for a user.

    Returns the empty fallback envelope (status='not_connected') when the
    user has no target exam, no upcoming cycle, or no active plan — the
    frontend is expected to render a calm empty state in those cases.
    """
    if not user_id:
        return _empty_payload()

    try:
        target = _resolve_target_exam(supabase, user_id)
    except Exception:  # noqa: BLE001
        logger.exception("plan_timeline target_exam lookup failed")
        return _empty_payload()
    exam_id = target.get("id") if target else None
    exam_name = (target.get("name") if target else None) or (target.get("slug") if target else None)

    cycle = _load_active_cycle(supabase, exam_id) if exam_id else None
    cycle_id = cycle.get("id") if cycle else None
    exam_start = _to_date(cycle.get("exam_start")) if cycle else None
    phases = _load_phases(supabase, exam_id, cycle_id) if exam_id else []
    primary_phase = next((p for p in phases if p.get("status") in {None, "active"}), phases[0] if phases else None)
    today = _today()

    plan = _load_active_plan(supabase, user_id)
    plan_id = plan.get("id") if plan else None
    plan_start = _to_date(plan.get("start_date")) if plan else None
    plan_end = _to_date(plan.get("end_date")) if plan else None
    plan_created = _to_date(plan.get("created_at")) if plan else None
    cycle_start = plan_start or plan_created or today
    cycle_end = exam_start or plan_end or (cycle_start + timedelta(days=30))

    version_row = _latest_plan_version(supabase, plan_id)

    # Even when there's no plan or no exam_start, we still want to surface
    # the exam_context + an empty payload rather than a hard 404.
    if not plan and not exam_start:
        empty = _empty_payload({
            "exam_context": {
                "exam_id": exam_id,
                "exam_name": exam_name,
                "cycle": cycle.get("cycle_name") if cycle else None,
                "phase": primary_phase.get("phase_name") if primary_phase else None,
                "exam_start": _iso(exam_start),
                "days_remaining": None,
                "trust_status": "preview",
            },
        })
        empty["risk_flags"] = _build_risk_flags(
            exam_start=None,
            today=today,
            cycle_progress=empty["cycle_progress"],
            overdue_count=0,
            unreviewed_mocks=0,
            subjects=[],
        )
        return empty

    tasks = _load_tasks(supabase, user_id, cycle_start, cycle_end)
    sessions = _load_focus_sessions(supabase, user_id, cycle_start, cycle_end)

    total_planned = sum(_task_minutes(t) for t in tasks)
    # Minutes-based progress; falls back to task counts when planned
    # minutes are absent on every row.
    use_counts = total_planned == 0 and len(tasks) > 0
    if use_counts:
        total_units = len(tasks)
        completed_units = sum(1 for t in tasks if t.get("status") == "completed")
        planned_so_far = sum(
            1 for t in tasks if _to_date(t.get("scheduled_date")) and _to_date(t.get("scheduled_date")) <= today
        )
    else:
        total_units = total_planned
        completed_units = sum(_task_minutes(t) for t in tasks if t.get("status") == "completed")
        planned_so_far = sum(
            _task_minutes(t)
            for t in tasks
            if _to_date(t.get("scheduled_date")) and _to_date(t.get("scheduled_date")) <= today
        )

    total_days = max(0, (cycle_end - cycle_start).days)
    elapsed_days = max(0, min(total_days, (today - cycle_start).days)) if total_days else 0
    planned_progress_pct = _pct(planned_so_far, total_units) if total_units else 0
    actual_progress_pct = _pct(completed_units, total_units) if total_units else 0
    gap_pct = planned_progress_pct - actual_progress_pct

    if not exam_start:
        status = "not_connected"
    elif gap_pct >= 10:
        status = "behind"
    elif actual_progress_pct - planned_progress_pct >= 5:
        status = "ahead"
    else:
        status = "on_track"

    locked_coverage = _load_locked_coverage(supabase, exam_id) if exam_id else []
    locked_subject_ids = {
        c.get("subject_id") for c in locked_coverage if c.get("subject_id")
    }
    # user_topic_mastery isn't directly read here — _load_user_signals is
    # invoked so future callers (e.g. risk-flag tuning) can chain off the
    # same code path without re-querying. We discard the return for now.
    if exam_id:
        try:
            _load_user_signals(supabase, user_id, exam_id)
        except Exception:  # noqa: BLE001
            logger.debug("plan_timeline user signal preload failed", exc_info=True)

    series = _build_series(tasks, cycle_start, exam_start, total_units) if exam_start else []
    subjects = _build_subjects(tasks, sessions, locked_subject_ids)
    milestones = _build_milestones(cycle, phases, today)
    phase_bands = _build_phase_bands(cycle_start, exam_start)

    overdue = _load_overdue_count(supabase, user_id, today)
    unreviewed_mocks = _load_unreviewed_mocks(supabase, user_id)

    cycle_progress = {
        "total_days": total_days,
        "elapsed_days": elapsed_days,
        "planned_progress_pct": planned_progress_pct,
        "actual_progress_pct": actual_progress_pct,
        "gap_pct": gap_pct,
        "status": status,
        "unit": "tasks" if use_counts else "minutes",
    }

    risk_flags = _build_risk_flags(
        exam_start=exam_start,
        today=today,
        cycle_progress=cycle_progress,
        overdue_count=overdue,
        unreviewed_mocks=unreviewed_mocks,
        subjects=subjects,
    )

    return {
        "exam_context": {
            "exam_id": exam_id,
            "exam_name": exam_name,
            "cycle": cycle.get("cycle_name") if cycle else None,
            "phase": primary_phase.get("phase_name") if primary_phase else None,
            "exam_start": _iso(exam_start),
            "days_remaining": (exam_start - today).days if exam_start else None,
            "trust_status": "locked" if exam_start else "preview",
        },
        "plan_context": {
            "plan_id": plan_id,
            "plan_version": version_row.get("version") if version_row else None,
            "created_at": plan.get("created_at") if plan else None,
            "last_adapted_at": (version_row.get("created_at") if version_row else (plan.get("updated_at") if plan else None)),
            "planner_version": PLANNER_VERSION,
        },
        "cycle_progress": cycle_progress,
        "milestones": milestones,
        "phase_bands": phase_bands,
        "series": series,
        "subjects": subjects,
        "risk_flags": risk_flags,
    }
