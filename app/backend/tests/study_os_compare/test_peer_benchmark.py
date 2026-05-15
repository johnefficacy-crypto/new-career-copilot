"""PR 3 — cohort percentile + fallback ladder."""
from __future__ import annotations

from datetime import date

from app.study_os.peer_benchmark import (
    _percentile_from_checkpoints,
    _rank_band,
    get_cohort_comparison,
)

from ._stub import SBStub


def test_percentile_interpolates_between_checkpoints():
    row = {"p10": 0.1, "p25": 0.25, "p50": 0.5, "p75": 0.75, "p90": 0.9}
    assert _percentile_from_checkpoints(0.5, row) == 50
    assert _percentile_from_checkpoints(0.625, row) == 62
    assert _percentile_from_checkpoints(0.05, row) == 10
    assert _percentile_from_checkpoints(0.95, row) == 90


def test_rank_band_thresholds():
    assert _rank_band(80) == "ahead"
    assert _rank_band(50) == "on_track"
    assert _rank_band(20) == "behind"
    assert _rank_band(None) is None


def test_fallback_ladder_skips_undersample_cohorts():
    sb = SBStub(
        {
            "study_cohort_definitions": [
                {"cohort_key": "phase", "fallback_level": 0, "is_active": True, "min_sample_size": 30},
                {"cohort_key": "exam", "fallback_level": 1, "is_active": True, "min_sample_size": 30},
            ],
            "study_cohort_memberships": [
                {"user_id": "u", "cohort_key": "phase", "joined_at": "2026-01-01"},
                {"user_id": "u", "cohort_key": "exam", "joined_at": "2026-01-01"},
            ],
            "study_cohort_metric_snapshots": [
                # phase cohort under-sampled — must be skipped.
                {
                    "cohort_key": "phase", "metric_key": "consistency",
                    "period_type": "weekly", "period_end": "2026-05-11",
                    "sample_size": 7, "p10": 0.2, "p25": 0.4, "p50": 0.5,
                    "p75": 0.7, "p90": 0.9,
                },
                {
                    "cohort_key": "exam", "metric_key": "consistency",
                    "period_type": "weekly", "period_end": "2026-05-11",
                    "sample_size": 200, "p10": 0.2, "p25": 0.4, "p50": 0.5,
                    "p75": 0.7, "p90": 0.9,
                },
            ],
        }
    )
    result = get_cohort_comparison(sb, "u", {"consistency": 0.5})
    assert result["cohort"] == "exam"
    assert result["metrics"]["consistency"]["percentile"] == 50


def test_no_eligible_cohort_returns_none_metrics():
    sb = SBStub(
        {
            "study_cohort_definitions": [],
            "study_cohort_memberships": [],
            "study_cohort_metric_snapshots": [],
        }
    )
    result = get_cohort_comparison(sb, "u", {"consistency": 0.5})
    assert result["cohort"] is None
    assert result["metrics"]["consistency"]["percentile"] is None
