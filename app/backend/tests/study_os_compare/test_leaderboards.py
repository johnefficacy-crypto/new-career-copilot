"""PR 4 — leaderboard build respects privacy + system-verified metric scope."""
from __future__ import annotations

from datetime import date

import pytest

from app.study_os.leaderboards import build_leaderboard

from ._stub import SBStub


def test_behavior_board_rejects_non_system_verified_metric():
    sb = SBStub({})
    with pytest.raises(ValueError):
        build_leaderboard(
            sb, "behavior", "self_reported_score", "cohort-1",
            date(2026, 5, 11), date(2026, 5, 17),
        )


def test_opt_out_user_gets_no_rank_but_row_written():
    week = (date(2026, 5, 11), date(2026, 5, 17))
    sb = SBStub(
        {
            "study_cohort_memberships": [
                {"user_id": "a", "cohort_key": "cohort-1"},
                {"user_id": "b", "cohort_key": "cohort-1"},
            ],
            "study_comparison_settings": [
                {"user_id": "a", "public_leaderboard_enabled": True, "solo_mode": False},
                {"user_id": "b", "public_leaderboard_enabled": False, "solo_mode": False},
            ],
            "study_behavior_daily_snapshots": [
                {
                    "user_id": "a", "snapshot_date": "2026-05-12",
                    "consistency_score": 0.9, "planned_tasks": 10, "completed_tasks": 9,
                    "focus_minutes": 200, "backlog_count": 1, "mock_count": 0,
                    "mock_review_count": 0, "discipline_score": 0.8,
                    "behavior_adherence_score": 0.9,
                },
                {
                    "user_id": "b", "snapshot_date": "2026-05-12",
                    "consistency_score": 0.5, "planned_tasks": 10, "completed_tasks": 5,
                    "focus_minutes": 120, "backlog_count": 5, "mock_count": 0,
                    "mock_review_count": 0, "discipline_score": 0.5,
                    "behavior_adherence_score": 0.5,
                },
            ],
            "study_leaderboard_entries": [],
        }
    )
    result = build_leaderboard(sb, "behavior", "consistency", "cohort-1", *week)
    assert result["written"] == 2
    assert result["skipped_private"] == 1
    rows = sb.db["study_leaderboard_entries"]
    a_row = next(r for r in rows if r["user_id"] == "a")
    b_row = next(r for r in rows if r["user_id"] == "b")
    assert a_row["rank"] == 1
    assert b_row["rank"] is None  # opted out — listed for self only.


def test_solo_mode_user_is_excluded_entirely():
    week = (date(2026, 5, 11), date(2026, 5, 17))
    sb = SBStub(
        {
            "study_cohort_memberships": [{"user_id": "a", "cohort_key": "cohort-1"}],
            "study_comparison_settings": [
                {"user_id": "a", "public_leaderboard_enabled": True, "solo_mode": True}
            ],
            "study_behavior_daily_snapshots": [
                {"user_id": "a", "snapshot_date": "2026-05-12",
                 "consistency_score": 0.9, "planned_tasks": 1, "completed_tasks": 1,
                 "focus_minutes": 60, "backlog_count": 0, "mock_count": 0,
                 "mock_review_count": 0, "discipline_score": 0.9,
                 "behavior_adherence_score": 0.9}
            ],
            "study_leaderboard_entries": [],
        }
    )
    result = build_leaderboard(sb, "behavior", "consistency", "cohort-1", *week)
    assert result["written"] == 0
