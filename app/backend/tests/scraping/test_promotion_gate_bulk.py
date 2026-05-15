"""Tests for the bulk gate evaluation surface (PR6 dry-run logic).

The actual HTTP routes are tested separately via FastAPI client. Here
we lock the gate-result-to-bulk-blocker mapping that feeds bulk-dry-run.
Plan §6 contract: ``blocking_level ∈ {promotion_blocker, publish_blocker, warning}``.
"""
from __future__ import annotations

from app.scraping.promotion_gate import (
    check_gateway_promotion,
    check_gateway_publish,
)


def test_blocker_shape_carries_reason_code_and_level():
    report = {
        "id": "rep-1",
        "criticality_tier": "A_HIGH_STAKES",
        "official_resolution_status": "unresolved",
    }
    result = check_gateway_promotion(report)
    assert result.ok is False
    assert result.reason_code == "official_proof_missing"
    assert result.blocking_level == "promotion_blocker"


def test_publish_blocker_distinct_from_promotion_blocker():
    # Same report passes the promotion gate but fails the publish gate
    # — the contract shape returned must use blocking_level=publish_blocker.
    report = {
        "id": "rep-1",
        "criticality_tier": "B_TECHNICAL_CONDITIONAL",
        "official_resolution_status": "auto_resolved",
        "conflicts": [],
        "risk_flags": [
            {
                "flag": "requires_domicile",
                "field_key": "profile.domicile_state",
                "source_field_path": "posts[0].raw_requirement_text",
                "blocking_level": "publish_blocker",
            }
        ],
    }
    promotion = check_gateway_promotion(report)
    publish = check_gateway_publish(report)
    assert promotion.ok is True
    assert publish.ok is False
    assert publish.blocking_level == "publish_blocker"


def test_no_blocker_when_all_gates_pass():
    report = {
        "id": "rep-1",
        "criticality_tier": "C_STANDARD_LONG_TAIL",
        "official_resolution_status": "auto_resolved",
        "conflicts": [],
        "risk_flags": [],
    }
    assert check_gateway_promotion(report).ok is True
    assert check_gateway_publish(report).ok is True


def test_missing_report_blocks_both_gates_at_promotion_level():
    promotion = check_gateway_promotion(None)
    publish = check_gateway_publish(None)
    assert promotion.ok is False
    assert publish.ok is False
    # Both report ``gateway_not_ready`` at promotion_blocker level —
    # the publish gate inherits the promotion gate's earlier failure.
    assert promotion.reason_code == "gateway_not_ready"
    assert publish.reason_code == "gateway_not_ready"
