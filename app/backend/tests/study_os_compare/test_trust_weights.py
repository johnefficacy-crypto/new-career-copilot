"""PR 7 — trust weighting tests."""
from __future__ import annotations

from datetime import date

from app.study_os.trust_weights import TRUST_WEIGHTS, upsert_source_breakdown

from ._stub import SBStub


def test_trust_weight_hierarchy_matches_spec():
    # Spec § "Hours trust hierarchy".
    assert TRUST_WEIGHTS["platform_verified"] == 1.00
    assert TRUST_WEIGHTS["mentor_verified"] == 0.95
    assert TRUST_WEIGHTS["group_focus_checked"] == 0.90
    assert TRUST_WEIGHTS["group_presence"] == 0.75
    assert TRUST_WEIGHTS["partner_costudy"] == 0.70
    assert TRUST_WEIGHTS["solo_timer"] == 0.60
    assert TRUST_WEIGHTS["screenshot"] == 0.45
    assert TRUST_WEIGHTS["self_claimed"] == 0.25
    # Weights are strictly ordered.
    keys = [
        "platform_verified", "mentor_verified", "group_focus_checked",
        "group_presence", "partner_costudy", "solo_timer", "screenshot", "self_claimed",
    ]
    for a, b in zip(keys, keys[1:]):
        assert TRUST_WEIGHTS[a] > TRUST_WEIGHTS[b]


def test_breakdown_rows_sum_to_parent_totals():
    today = date(2026, 5, 15)
    sb = SBStub(
        {
            "study_behavior_daily_snapshots": [
                {"user_id": "u", "snapshot_date": today.isoformat()}
            ],
            "study_behavior_source_breakdown": [],
        }
    )
    result = upsert_source_breakdown(
        sb,
        "u",
        today,
        {"group_focus_checked": 480, "solo_timer": 240, "self_claimed": 390},
    )
    # Spec example breakdown: 8h + 4h + 6.5h = 18.5h raw, 13.275 trust-adjusted.
    assert result["raw_total_minutes"] == 480 + 240 + 390
    expected_trust = 480 * 0.90 + 240 * 0.60 + 390 * 0.25
    assert abs(result["trust_adjusted_minutes"] - round(expected_trust, 2)) < 1e-6
    # Per-source rows match.
    rows = sb.db["study_behavior_source_breakdown"]
    assert len(rows) == 3
    raw_sum = sum(int(r["raw_minutes"]) for r in rows)
    assert raw_sum == result["raw_total_minutes"]


def test_unknown_source_ignored():
    sb = SBStub(
        {
            "study_behavior_daily_snapshots": [
                {"user_id": "u", "snapshot_date": "2026-05-15"}
            ],
            "study_behavior_source_breakdown": [],
        }
    )
    result = upsert_source_breakdown(
        sb, "u", date(2026, 5, 15), {"telepathy": 999, "solo_timer": 60}
    )
    sources = [r["source"] for r in sb.db["study_behavior_source_breakdown"]]
    assert "telepathy" not in sources
    assert sources == ["solo_timer"]
    assert result["raw_total_minutes"] == 60
