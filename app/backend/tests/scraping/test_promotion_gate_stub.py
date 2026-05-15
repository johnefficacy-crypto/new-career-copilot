"""Tests for the PR2 gateway promotion gate stub.

Plan §3 acceptance:

* Tier A blocks when resolver state missing / unresolved
* Tier B and C pass through unconditionally at PR2
* admin_attached / auto_resolved status passes Tier A
"""
from __future__ import annotations

from app.scraping.promotion_gate import check_gateway_promotion


def _report(tier: str, **kw) -> dict:
    return {
        "id": "rep-1",
        "criticality_tier": tier,
        "official_resolution_status": kw.get("status"),
        "lifecycle_status": "classified",
    }


# ── Tier A — blocked unless resolved ───────────────────────────────────


def test_tier_a_blocks_when_resolver_status_is_null():
    result = check_gateway_promotion(_report("A_HIGH_STAKES", status=None))
    assert result.ok is False
    assert result.reason_code == "official_proof_missing"
    assert result.blocking_level == "promotion_blocker"


def test_tier_a_blocks_when_resolver_status_is_not_attempted():
    result = check_gateway_promotion(_report("A_HIGH_STAKES", status="not_attempted"))
    assert result.ok is False
    assert result.reason_code == "official_proof_missing"


def test_tier_a_blocks_when_resolver_status_is_unresolved():
    result = check_gateway_promotion(_report("A_HIGH_STAKES", status="unresolved"))
    assert result.ok is False


def test_tier_a_passes_when_auto_resolved():
    result = check_gateway_promotion(_report("A_HIGH_STAKES", status="auto_resolved"))
    assert result.ok is True


def test_tier_a_passes_when_admin_attached():
    result = check_gateway_promotion(_report("A_HIGH_STAKES", status="admin_attached"))
    assert result.ok is True


def test_tier_a_passes_when_status_is_suggested():
    # 'suggested' is a softer state but not a blocker by PR2's stub —
    # the admin must explicitly confirm it via the confirm-suggested-proof
    # endpoint, which flips it to admin_attached. Until then this is
    # an admin-warning, not a hard block.
    result = check_gateway_promotion(_report("A_HIGH_STAKES", status="suggested"))
    assert result.ok is True


# ── Tier B / Tier C — pass through ────────────────────────────────────


def test_tier_b_passes_regardless_of_resolver_status():
    for status in [None, "not_attempted", "unresolved", "suggested"]:
        result = check_gateway_promotion(_report("B_TECHNICAL_CONDITIONAL", status=status))
        assert result.ok is True, f"Tier B blocked on status={status!r}"


def test_tier_c_passes_regardless_of_resolver_status():
    for status in [None, "not_attempted", "unresolved", "suggested"]:
        result = check_gateway_promotion(_report("C_STANDARD_LONG_TAIL", status=status))
        assert result.ok is True, f"Tier C blocked on status={status!r}"


# ── Missing report ────────────────────────────────────────────────────


def test_missing_report_blocks_with_gateway_not_ready():
    result = check_gateway_promotion(None)
    assert result.ok is False
    assert result.reason_code == "gateway_not_ready"
    assert result.blocking_level == "promotion_blocker"
