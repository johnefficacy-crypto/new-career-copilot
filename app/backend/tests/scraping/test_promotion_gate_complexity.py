"""PR4 promotion + publish gate tests.

Plan §5 ship gate:

* promotion gate respects ``promotion_blocker`` level
* publish gate (``check_gateway_publish``) respects ``publish_blocker``
  but not ``promotion_blocker`` alone (draft path stays open for hard
  complexity flags? No — promotion_blocker is stricter and blocks both;
  publish_blocker blocks publish but allows draft).
"""
from __future__ import annotations

from app.scraping.promotion_gate import (
    check_gateway_promotion,
    check_gateway_publish,
)


def _report(tier: str, *, risk_flags=None) -> dict:
    return {
        "id": "rep-1",
        "criticality_tier": tier,
        "official_resolution_status": "auto_resolved",
        "lifecycle_status": "classified",
        "conflicts": [],
        "risk_flags": risk_flags or [],
    }


def _flag(level: str, flag: str = "requires_domicile") -> dict:
    return {
        "flag": flag,
        "field_key": "profile.domicile_state",
        "source_field_path": "posts[0].raw_requirement_text",
        "blocking_level": level,
    }


# ── promotion_blocker — blocks both gates ─────────────────────────────


def test_promotion_blocker_blocks_promotion_gate_tier_b():
    result = check_gateway_promotion(_report(
        "B_TECHNICAL_CONDITIONAL",
        risk_flags=[_flag("promotion_blocker")],
    ))
    assert result.ok is False
    assert result.reason_code == "eligibility_rule_missing"
    assert result.blocking_level == "promotion_blocker"


def test_promotion_blocker_blocks_publish_gate_tier_b():
    result = check_gateway_publish(_report(
        "B_TECHNICAL_CONDITIONAL",
        risk_flags=[_flag("promotion_blocker")],
    ))
    assert result.ok is False
    assert result.reason_code == "eligibility_rule_missing"


def test_promotion_blocker_blocks_tier_c():
    # The complexity gate is tier-agnostic at PR4 — any tier with an
    # unrepresented promotion_blocker is held.
    result = check_gateway_promotion(_report(
        "C_STANDARD_LONG_TAIL",
        risk_flags=[_flag("promotion_blocker")],
    ))
    assert result.ok is False


# ── publish_blocker — promotion allowed, publish blocked ─────────────


def test_publish_blocker_passes_promotion_gate():
    result = check_gateway_promotion(_report(
        "B_TECHNICAL_CONDITIONAL",
        risk_flags=[_flag("publish_blocker")],
    ))
    assert result.ok is True


def test_publish_blocker_fails_publish_gate():
    result = check_gateway_publish(_report(
        "B_TECHNICAL_CONDITIONAL",
        risk_flags=[_flag("publish_blocker")],
    ))
    assert result.ok is False
    assert result.reason_code == "eligibility_rule_missing"
    assert result.blocking_level == "publish_blocker"


# ── warning — never blocks ───────────────────────────────────────────


def test_warning_level_does_not_block_either_gate():
    rep = _report("B_TECHNICAL_CONDITIONAL", risk_flags=[_flag("warning")])
    assert check_gateway_promotion(rep).ok is True
    assert check_gateway_publish(rep).ok is True


def test_conditional_result_allowed_does_not_block_either_gate():
    rep = _report("B_TECHNICAL_CONDITIONAL",
                  risk_flags=[_flag("conditional_result_allowed")])
    assert check_gateway_promotion(rep).ok is True
    assert check_gateway_publish(rep).ok is True


# ── interaction with PR2 / PR3 blockers ──────────────────────────────


def test_publish_gate_inherits_promotion_gate_blocks():
    # Tier A with unresolved official proof — publish must also fail,
    # and the reason should be the promotion-level one (more specific).
    rep = {
        "id": "rep-1",
        "criticality_tier": "A_HIGH_STAKES",
        "official_resolution_status": "unresolved",
        "conflicts": [],
        "risk_flags": [_flag("publish_blocker")],
    }
    result = check_gateway_publish(rep)
    assert result.ok is False
    # The earlier blocker wins.
    assert result.reason_code == "official_proof_missing"


# ── clean report ─────────────────────────────────────────────────────


def test_clean_tier_b_passes_both_gates():
    rep = _report("B_TECHNICAL_CONDITIONAL", risk_flags=[])
    assert check_gateway_promotion(rep).ok is True
    assert check_gateway_publish(rep).ok is True
