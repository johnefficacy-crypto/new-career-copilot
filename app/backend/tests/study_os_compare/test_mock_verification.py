"""PR 5 / PR 9 — mock verification tier rules."""
from __future__ import annotations

import pytest

from app.study_os.mock_verification import attest_mock

from ._stub import SBStub


def _sb():
    return SBStub({"mock_score_verification": []})


def test_self_report_lands_at_tier_3():
    sb = _sb()
    row = attest_mock(sb, "u-1", "m-1", attester_role="self")
    assert row["verification_tier"] == "tier_3"
    assert row["verification_status"] == "unverified"


def test_screenshot_alone_is_tier_2_pending():
    sb = _sb()
    row = attest_mock(
        sb, "u-1", "m-1", attester_role="self", evidence_url="https://x.invalid/s.png"
    )
    assert row["verification_tier"] == "tier_2"
    assert row["verification_status"] == "pending"


def test_partner_with_evidence_is_tier_1_5():
    sb = _sb()
    row = attest_mock(
        sb,
        "u-1",
        "m-1",
        attester_role="partner",
        attested_by="u-2",
        evidence_url="https://x.invalid/s.png",
    )
    assert row["verification_tier"] == "tier_1_5"
    assert row["verification_status"] == "verified"


def test_partner_must_not_be_self_collusion_risk():
    sb = _sb()
    with pytest.raises(ValueError):
        attest_mock(
            sb,
            "u-1",
            "m-1",
            attester_role="partner",
            attested_by="u-1",
            evidence_url="https://x.invalid/s.png",
        )


def test_provider_with_attempt_id_is_tier_1():
    sb = _sb()
    row = attest_mock(
        sb,
        "u-1",
        "m-1",
        attester_role="provider",
        provider_name="testbook",
        provider_attempt_id="att-42",
    )
    assert row["verification_tier"] == "tier_1"
    assert row["verification_status"] == "verified"


def test_mentor_attestation_is_tier_1():
    sb = _sb()
    row = attest_mock(
        sb, "u-1", "m-1", attester_role="mentor", attested_by="u-mentor"
    )
    assert row["verification_tier"] == "tier_1"
