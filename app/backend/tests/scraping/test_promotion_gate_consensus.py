"""PR3 promotion gate tests — gate strengthens with consensus.

Plan §4 ship gate:

* conflict blocks Tier A promotion
* resolved_by_admin conflict passes promotion gate
* Tier B/C still pass through (PR4 adds Tier B blockers)
"""
from __future__ import annotations

from app.scraping.promotion_gate import check_gateway_promotion


def _report(tier: str, *, status: str | None, conflicts=None) -> dict:
    return {
        "id": "rep-1",
        "criticality_tier": tier,
        "official_resolution_status": status,
        "lifecycle_status": "conflict" if conflicts else "classified",
        "conflicts": conflicts or [],
    }


def test_tier_a_blocks_on_unresolved_conflict():
    result = check_gateway_promotion(_report(
        "A_HIGH_STAKES",
        status="auto_resolved",
        conflicts=[{"conflict_id": "c1", "status": "open"}],
    ))
    assert result.ok is False
    assert result.reason_code == "consensus_conflict_unresolved"
    assert result.blocking_level == "promotion_blocker"


def test_tier_a_passes_when_all_conflicts_resolved():
    result = check_gateway_promotion(_report(
        "A_HIGH_STAKES",
        status="admin_attached",
        conflicts=[
            {"conflict_id": "c1", "status": "resolved_by_admin"},
            {"conflict_id": "c2", "status": "ignored"},
        ],
    ))
    assert result.ok is True


def test_tier_a_official_proof_missing_takes_priority_over_conflict():
    # Both blockers present — the official-proof one is reported first
    # so the admin sees the deeper problem.
    result = check_gateway_promotion(_report(
        "A_HIGH_STAKES",
        status="unresolved",
        conflicts=[{"conflict_id": "c1", "status": "open"}],
    ))
    assert result.ok is False
    assert result.reason_code == "official_proof_missing"


def test_tier_b_still_passes_with_open_conflict_at_pr3():
    # PR3 only strengthens Tier A. Tier B real blockers (eligibility
    # complexity) land in PR4.
    result = check_gateway_promotion(_report(
        "B_TECHNICAL_CONDITIONAL",
        status=None,
        conflicts=[{"conflict_id": "c1", "status": "open"}],
    ))
    assert result.ok is True


def test_tier_c_passes_unconditionally():
    result = check_gateway_promotion(_report(
        "C_STANDARD_LONG_TAIL",
        status=None,
        conflicts=[{"conflict_id": "c1", "status": "open"}],
    ))
    assert result.ok is True


def test_missing_conflicts_field_is_treated_as_no_conflicts():
    result = check_gateway_promotion({
        "id": "rep-1",
        "criticality_tier": "A_HIGH_STAKES",
        "official_resolution_status": "auto_resolved",
        # No "conflicts" key at all.
    })
    assert result.ok is True
