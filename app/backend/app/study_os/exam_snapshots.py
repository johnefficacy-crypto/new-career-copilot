"""Study OS — per-exam daily snapshot aggregation (PR 2).

Where `study_behavior_daily_snapshots` is exam-agnostic, this writes one row
per (user, exam, day) using `study_tasks.exam_id` (or `plan_id → study_plans.exam_id`)
to attribute tasks.

The multi-exam attribution rules from spec § "Multi-exam handling":
  single_exam     → credit to that exam
  shared_syllabus → split by `user_exam_goals.weekly_weight_pct`
  general_skill   → behavior-only (not written here)
  unassigned      → behavior-only (not written here)
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any, Callable

logger = logging.getLogger("career_copilot.study_os.exam_snapshots")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("exam_snapshots supabase call failed: %s", exc)
        return default


def _exam_weights(supabase: Any, user_id: str) -> dict[str, float]:
    rows = _safe(
        lambda: (
            supabase.table("user_exam_goals")
            .select("exam_id, weekly_weight_pct")
            .eq("user_id", user_id)
            .eq("status", "active")
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    total = sum(float(r.get("weekly_weight_pct") or 0) for r in items)
    if total <= 0:
        return {}
    return {r["exam_id"]: float(r["weekly_weight_pct"]) / total for r in items}


def compute_exam_snapshots(
    supabase: Any, user_id: str, day: date
) -> list[dict[str, Any]]:
    rows = _safe(
        lambda: (
            supabase.table("study_tasks")
            .select(
                "status, planned_minutes, duration_mins, exam_id, exam_phase_id, "
                "scope, task_type, scheduled_date"
            )
            .eq("user_id", user_id)
            .eq("scheduled_date", day.isoformat())
            .execute()
        ),
        default=None,
    )
    items = getattr(rows, "data", None) or []
    if not items:
        return []

    weights = _exam_weights(supabase, user_id)
    by_exam: dict[tuple[str, str | None], dict[str, float]] = {}

    for r in items:
        exam_id = r.get("exam_id")
        scope = (r.get("scope") or "").lower()
        if not exam_id and scope == "shared_syllabus":
            # Distribute across all active exams.
            for ex, w in weights.items():
                _accumulate(by_exam, ex, r.get("exam_phase_id"), r, w)
            continue
        if not exam_id:
            continue
        _accumulate(by_exam, exam_id, r.get("exam_phase_id"), r, 1.0)

    out: list[dict[str, Any]] = []
    for (exam_id, phase_id), agg in by_exam.items():
        planned = agg["planned"]
        completed = agg["completed"]
        planned_min = agg["planned_minutes"]
        completed_min = agg["completed_minutes"]
        revision_total = agg["revision_total"]
        revision_done = agg["revision_done"]
        adherence = (completed / planned) if planned > 0 else None
        completion = adherence
        rev_cov = (revision_done / revision_total) if revision_total > 0 else None
        out.append(
            {
                "user_id": user_id,
                "exam_id": exam_id,
                "exam_phase_id": phase_id,
                "snapshot_date": day.isoformat(),
                "planned_tasks": int(round(planned)),
                "completed_tasks": int(round(completed)),
                "planned_minutes": int(round(planned_min)),
                "completed_minutes": int(round(completed_min)),
                "plan_adherence_score": round(adherence, 3) if adherence is not None else None,
                "completion_score": round(completion, 3) if completion is not None else None,
                "revision_coverage_score": round(rev_cov, 3) if rev_cov is not None else None,
            }
        )
    return out


def _accumulate(
    by_exam: dict[tuple[str, str | None], dict[str, float]],
    exam_id: str,
    phase_id: str | None,
    row: dict[str, Any],
    weight: float,
) -> None:
    key = (exam_id, phase_id)
    bucket = by_exam.setdefault(
        key,
        {
            "planned": 0.0,
            "completed": 0.0,
            "planned_minutes": 0.0,
            "completed_minutes": 0.0,
            "revision_total": 0.0,
            "revision_done": 0.0,
        },
    )
    bucket["planned"] += weight
    if row.get("status") == "completed":
        bucket["completed"] += weight
    try:
        pm = int(row.get("planned_minutes") or 0)
    except (TypeError, ValueError):
        pm = 0
    try:
        cm = int(row.get("duration_mins") or 0)
    except (TypeError, ValueError):
        cm = 0
    bucket["planned_minutes"] += pm * weight
    if row.get("status") == "completed":
        bucket["completed_minutes"] += max(cm, pm) * weight
    if (row.get("task_type") or "") == "revision":
        bucket["revision_total"] += weight
        if row.get("status") == "completed":
            bucket["revision_done"] += weight


def upsert_exam_snapshots(supabase: Any, user_id: str, day: date) -> int:
    snaps = compute_exam_snapshots(supabase, user_id, day)
    if not snaps:
        return 0
    _safe(
        lambda: (
            supabase.table("study_exam_daily_snapshots")
            .upsert(
                snaps,
                on_conflict="user_id,exam_id,exam_cycle_id,exam_phase_id,snapshot_date",
            )
            .execute()
        )
    )
    return len(snaps)
