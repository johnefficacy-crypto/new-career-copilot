"""Study OS — Plan by Subject service.

Derives per-subject allocation for the current planning week from real
study_tasks rows joined to subjects + locked exam_topic_coverage.

Subject colour comes from a stable per-subject palette. Trust status
reflects whether the subject has any locked coverage rows in the user's
target exam — when there are none we surface "preview" so the frontend
can label the row honestly.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from app.study_os.planner import (  # type: ignore  # private helpers reused
    _load_locked_coverage,
    _resolve_target_exam,
)

logger = logging.getLogger("career_copilot.study_os.plan_by_subject")

_PALETTE = [
    "#54794E",
    "#A68057",
    "#524864",
    "#BE9C6B",
    "#94B28A",
    "#8F86A1",
    "#6C5038",
    "#7A8AA5",
    "#33482F",
]


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("study_os.plan_by_subject supabase call failed: %s", exc)
        return default


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _week_bounds(today: date | None = None) -> tuple[str, str]:
    monday = _monday_of(today or date.today())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def _color_for(index: int) -> str:
    return _PALETTE[index % len(_PALETTE)]


def _resolve_subject_label(row: dict[str, Any]) -> str:
    return (
        row.get("subject")
        or row.get("subject_name")
        or "General"
    )


def _load_week_tasks(
    supabase: Any, user_id: str, week_start: str, week_end: str
) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select(
                "id, subject, topic, topic_id, scheduled_date, status, "
                "planned_minutes, duration_mins, task_type, metadata"
            )
            .eq("user_id", user_id)
            .gte("scheduled_date", week_start)
            .lte("scheduled_date", week_end)
            .execute()
        ),
        default=None,
    )
    return getattr(rows, "data", None) or []


def _locked_subjects(supabase: Any, exam_id: str) -> dict[str, str]:
    """Map subject_id → subject_name for subjects that have any locked
    coverage row in the target exam. Used to decide trust_status.
    """
    coverage = _load_locked_coverage(supabase, exam_id) if exam_id else []
    out: dict[str, str] = {}
    for c in coverage:
        sid = c.get("subject_id")
        if not sid:
            continue
        name = c.get("subject_name") or c.get("subject") or sid
        out.setdefault(sid, name)
    return out


def list_plan_by_subject(
    supabase: Any, user_id: str, week_start: date | None = None
) -> dict[str, Any]:
    """Return per-subject allocation for the user's planning week.

    Output shape::

        {
          "week_start": "2026-05-12",
          "week_end":   "2026-05-18",
          "total_minutes": 2310,
          "total_hours":   38.5,
          "items": [
            {
              "subject_id":      "s1" | None,
              "subject_name":    "Polity",
              "color":           "#54794E",
              "planned_minutes": 540,
              "planned_hours":   9.0,
              "weight":          0.23,
              "task_count":      6,
              "source":          "exam_intelligence" | "weakness_map" | "manual_override",
              "trust_status":    "locked" | "preview" | "partial",
            },
            …
          ],
          "trust_status": "locked" | "preview" | "partial",
        }
    """
    if not user_id:
        return {"week_start": None, "week_end": None, "items": [], "total_minutes": 0, "total_hours": 0, "trust_status": "preview"}
    week_start_s, week_end_s = _week_bounds(week_start)

    tasks = _load_week_tasks(supabase, user_id, week_start_s, week_end_s)
    if not tasks:
        return {
            "week_start": week_start_s,
            "week_end": week_end_s,
            "items": [],
            "total_minutes": 0,
            "total_hours": 0.0,
            "trust_status": "preview",
        }

    target = _resolve_target_exam(supabase, user_id)
    exam_id = target.get("id") if target else None
    locked = _locked_subjects(supabase, exam_id) if exam_id else {}

    # Bucket tasks by subject. Subject id is best-effort: prefer the row's
    # subject_id when present; otherwise fall back to the subject name.
    buckets: dict[str, dict[str, Any]] = {}
    for t in tasks:
        subject_name = _resolve_subject_label(t)
        subject_id = t.get("subject_id")
        bucket_key = subject_id or f"name:{subject_name.lower()}"
        bucket = buckets.setdefault(
            bucket_key,
            {
                "subject_id": subject_id,
                "subject_name": subject_name,
                "planned_minutes": 0,
                "task_count": 0,
                "has_manual_override": False,
            },
        )
        minutes = t.get("planned_minutes") or t.get("duration_mins") or 0
        try:
            bucket["planned_minutes"] += int(minutes)
        except (TypeError, ValueError):
            pass
        bucket["task_count"] += 1
        meta = t.get("metadata") or {}
        if isinstance(meta, dict) and meta.get("manual_override"):
            bucket["has_manual_override"] = True

    total_minutes = sum(b["planned_minutes"] for b in buckets.values())

    items: list[dict[str, Any]] = []
    sorted_buckets = sorted(
        buckets.values(),
        key=lambda b: (-b["planned_minutes"], b["subject_name"].lower()),
    )
    locked_count = 0
    preview_count = 0
    for i, b in enumerate(sorted_buckets):
        sid = b["subject_id"]
        is_locked = bool(sid and sid in locked)
        if is_locked:
            locked_count += 1
        else:
            preview_count += 1
        source = (
            "manual_override"
            if b["has_manual_override"]
            else ("exam_intelligence" if is_locked else "weakness_map")
        )
        weight = round(b["planned_minutes"] / total_minutes, 3) if total_minutes else 0
        items.append({
            "subject_id": sid,
            "subject_name": b["subject_name"],
            "color": _color_for(i),
            "planned_minutes": b["planned_minutes"],
            "planned_hours": round(b["planned_minutes"] / 60, 2),
            "weight": weight,
            "task_count": b["task_count"],
            "source": source,
            "trust_status": "locked" if is_locked else "preview",
        })

    overall_trust = (
        "locked"
        if locked_count and preview_count == 0
        else ("preview" if not locked_count else "partial")
    )

    return {
        "week_start": week_start_s,
        "week_end": week_end_s,
        "items": items,
        "total_minutes": total_minutes,
        "total_hours": round(total_minutes / 60, 2),
        "trust_status": overall_trust,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
