"""PR 1 — behavior snapshot aggregation tests."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.study_os.behavior_scores import (
    BEHAVIOR_INDEX_WEIGHTS,
    compute_behavior_snapshot,
)

from ._stub import SBStub


USER = "user-1"


def _session(day: date, minutes: int) -> dict:
    started = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=10)
    return {
        "user_id": USER,
        "duration_minutes": minutes,
        "duration_mins": minutes,
        "started_at": started.isoformat(),
    }


def _task(day: date, status: str = "completed", task_type: str = "concept") -> dict:
    return {
        "user_id": USER,
        "scheduled_date": day.isoformat(),
        "status": status,
        "task_type": task_type,
    }


def test_focus_rule_only_counts_25min_blocks():
    today = date(2026, 5, 15)
    sb = SBStub(
        {
            "study_sessions": [_session(today, 50), _session(today, 10), _session(today, 30)],
            "study_tasks": [],
            "mock_tests": [],
            "mock_correction_tasks": [],
            "study_behavior_daily_snapshots": [],
        }
    )
    snap = compute_behavior_snapshot(sb, USER, today)
    # Only the 50-min and 30-min sessions are >= 25 minutes.
    assert snap["focus_minutes"] == 80
    assert snap["focus_session_count"] == 2
    assert snap["total_study_minutes"] == 90  # 50 + 10 + 30
    assert snap["avg_focus_session_minutes"] == 40.0


def test_completion_and_adherence():
    today = date(2026, 5, 15)
    tasks = (
        [_task(today, "completed") for _ in range(7)]
        + [_task(today, "missed") for _ in range(2)]
        + [_task(today, "skipped")]
    )
    sb = SBStub(
        {
            "study_sessions": [_session(today, 90)],
            "study_tasks": tasks,
            "mock_tests": [],
            "mock_correction_tasks": [],
            "study_behavior_daily_snapshots": [],
        }
    )
    snap = compute_behavior_snapshot(sb, USER, today)
    assert snap["planned_tasks"] == 10
    assert snap["completed_tasks"] == 7
    assert snap["missed_tasks"] == 2
    assert snap["skipped_tasks"] == 1
    assert snap["behavior_adherence_score"] == 0.7


def test_behavior_index_weights_sum_to_one():
    assert abs(sum(BEHAVIOR_INDEX_WEIGHTS.values()) - 1.0) < 1e-9


def test_behavior_index_zero_for_empty_user():
    today = date(2026, 5, 15)
    sb = SBStub(
        {
            "study_sessions": [],
            "study_tasks": [],
            "mock_tests": [],
            "mock_correction_tasks": [],
            "study_behavior_daily_snapshots": [],
        }
    )
    snap = compute_behavior_snapshot(sb, USER, today)
    assert snap["_behavior_index"] >= 0.0
    # No work, no mocks → no focus, no adherence → index dominated by neutral
    # backlog_recovery (0.5) and zero everywhere else.
    expected_min = BEHAVIOR_INDEX_WEIGHTS["backlog_recovery"] * 0.5
    assert snap["_behavior_index"] >= expected_min - 1e-6


def test_mock_review_rate_when_no_mocks_is_neutral_not_negative():
    today = date(2026, 5, 15)
    sb = SBStub(
        {
            "study_sessions": [_session(today, 60)],
            "study_tasks": [_task(today, "completed")],
            "mock_tests": [],
            "mock_correction_tasks": [],
            "study_behavior_daily_snapshots": [],
        }
    )
    snap = compute_behavior_snapshot(sb, USER, today)
    assert snap["mock_count"] == 0
    assert snap["mock_review_count"] == 0
    # Behavior index should not be penalised below zero for the missing mock data.
    assert 0.0 <= snap["_behavior_index"] <= 1.0
