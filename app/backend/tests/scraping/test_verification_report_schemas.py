"""Tests for ``app.scraping.verification_report_schemas``.

Pydantic gate for the three jsonb columns. Invalid shapes must raise
before the row reaches the DB.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.scraping.verification_report_schemas import (
    validate_conflicts,
    validate_evidence_summary,
    validate_risk_flags,
)


# ── risk_flags ─────────────────────────────────────────────────────────


def test_valid_risk_flag_passes():
    out = validate_risk_flags([
        {
            "flag": "official_proof_missing",
            "field_key": "official_notification_url",
            "blocking_level": "promotion_blocker",
        }
    ])
    assert out[0]["flag"] == "official_proof_missing"
    assert out[0]["blocking_level"] == "promotion_blocker"


def test_empty_risk_flags_is_valid():
    assert validate_risk_flags([]) == []
    assert validate_risk_flags(None) == []


def test_risk_flag_with_unknown_blocking_level_rejected():
    with pytest.raises(ValidationError):
        validate_risk_flags([{"flag": "foo", "blocking_level": "block_everything"}])


def test_risk_flag_with_empty_flag_rejected():
    with pytest.raises(ValidationError):
        validate_risk_flags([{"flag": "", "blocking_level": "warning"}])


def test_risk_flag_extra_fields_rejected():
    # extra="forbid" — unknown keys are silent bugs otherwise.
    with pytest.raises(ValidationError):
        validate_risk_flags([
            {"flag": "x", "blocking_level": "warning", "made_up_field": True}
        ])


# ── conflicts ──────────────────────────────────────────────────────────


def test_valid_conflict_passes():
    out = validate_conflicts([
        {
            "conflict_key": "apply_end_date.mismatch",
            "field_path": "apply_end_date",
            "values": [
                {"source": "official", "value": "2026-06-30", "confidence": 0.92},
                {"source": "sarkari_result", "value": "2026-07-15", "confidence": 0.6},
            ],
        }
    ])
    assert out[0]["status"] == "open"  # default
    assert len(out[0]["values"]) == 2


def test_conflict_with_no_values_rejected():
    with pytest.raises(ValidationError):
        validate_conflicts([
            {"conflict_key": "k", "field_path": "p", "values": []}
        ])


def test_conflict_value_confidence_out_of_range_rejected():
    with pytest.raises(ValidationError):
        validate_conflicts([
            {
                "conflict_key": "k",
                "field_path": "p",
                "values": [{"source": "x", "value": "y", "confidence": 1.5}],
            }
        ])


def test_conflict_status_must_be_known_value():
    with pytest.raises(ValidationError):
        validate_conflicts([
            {
                "conflict_key": "k",
                "field_path": "p",
                "values": [{"source": "x", "value": "y"}],
                "status": "maybe",
            }
        ])


# ── evidence_summary ───────────────────────────────────────────────────


def test_valid_evidence_summary_passes():
    out = validate_evidence_summary({
        "apply_end_date_proof": {
            "key": "apply_end_date_proof",
            "field_path": "apply_end_date",
            "source_url": "https://upsc.gov.in/notif",
            "snippet": "Last date: 30 June 2026.",
            "confidence": 0.9,
        }
    })
    assert "apply_end_date_proof" in out


def test_evidence_summary_backfills_key_from_mapping():
    # Ergonomics: writers can omit the inner "key" field; the validator
    # backfills it from the mapping key.
    out = validate_evidence_summary({
        "apply_end_date_proof": {
            "source_url": "https://upsc.gov.in/notif",
        }
    })
    assert out["apply_end_date_proof"]["key"] == "apply_end_date_proof"


def test_evidence_summary_key_mismatch_rejected():
    with pytest.raises(ValueError):
        validate_evidence_summary({
            "key_a": {"key": "key_b", "source_url": "https://x"}
        })


def test_empty_evidence_summary_is_valid():
    assert validate_evidence_summary({}) == {}
    assert validate_evidence_summary(None) == {}
