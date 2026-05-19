"""Tests for the PR3 override service helper and lifecycle integration.

Plan §4 ship gate:

* override_scope rejects 'report'
* prior_value and chosen_value audited
* conflict_id is stable across writes
* matching conflict on report flips to ``resolved_by_admin``
* lifecycle transition matrix amended via ``extend_transitions``
"""
from __future__ import annotations

import pytest

from app.scraping.verification_reports import (
    ALLOWED_REPORT_TRANSITIONS,
    record_override,
    update_lifecycle_status,
    write_conflicts,
)

from tests.scraping._verification_fakes import FakeSupabase


def _seed_report_with_conflict(sb: FakeSupabase, conflict_id: str = "cid-1") -> dict:
    # Build a minimal valid report row.
    row = {
        "id": "rep-1",
        "scrape_queue_id": "queue-1",
        "recruitment_id": None,
        "lifecycle_status": "conflict",
        "criticality_tier": "A_HIGH_STAKES",
        "exam_family_key": "upsc",
        "review_strategy": "strict_official_multi_source",
        "publish_policy": "manual_verified_only",
        "recommended_action": "resolve_conflict",
        "trigger_reason": "initial_scrape",
        "report_version": 1,
        "chain_root_id": "rep-1",
        "risk_flags": [],
        "evidence_summary": {},
        "conflicts": [
            {
                "conflict_id": conflict_id,
                "conflict_key": "apply_end_date.official_disagreement",
                "field_path": "apply_end_date",
                "values": [
                    {"source": "queue:q-off-1", "value": "2026-06-30", "confidence": 1.0},
                    {"source": "queue:q-off-2", "value": "2026-07-15", "confidence": 1.0},
                ],
                "status": "open",
            }
        ],
    }
    sb.rows.append(row)
    sb.get_table("profiles").append({"id": "admin-1"})
    return row


# ── override_scope contract ───────────────────────────────────────────


def test_override_scope_report_is_rejected():
    sb = FakeSupabase()
    _seed_report_with_conflict(sb)
    with pytest.raises(ValueError, match="override_scope"):
        record_override(
            sb,
            verification_report_id="rep-1",
            conflict_id="cid-1",
            conflict_key="apply_end_date.official_disagreement",
            field_path="apply_end_date",
            prior_value="2026-06-30",
            chosen_value="2026-07-15",
            reason="Official corrigendum",
            evidence_url="https://upsc.gov.in/corrigendum",
            override_scope="report",
            created_by="admin-1",
        )


def test_override_scope_field_is_accepted():
    sb = FakeSupabase()
    _seed_report_with_conflict(sb)
    out = record_override(
        sb,
        verification_report_id="rep-1",
        conflict_id="cid-1",
        conflict_key="apply_end_date.official_disagreement",
        field_path="apply_end_date",
        prior_value="2026-06-30",
        chosen_value="2026-07-15",
        reason="Official corrigendum",
        evidence_url="https://upsc.gov.in/corrigendum",
        override_scope="field",
        created_by="admin-1",
    )
    assert out["override_scope"] == "field"
    assert out["prior_value"] == "2026-06-30"
    assert out["chosen_value"] == "2026-07-15"


def test_override_scope_recruitment_is_accepted():
    sb = FakeSupabase()
    _seed_report_with_conflict(sb)
    out = record_override(
        sb,
        verification_report_id="rep-1",
        conflict_id="cid-1",
        conflict_key="apply_end_date.official_disagreement",
        field_path="apply_end_date",
        prior_value="2026-06-30",
        chosen_value="2026-07-15",
        reason="Whole-recruitment corrigendum",
        evidence_url=None,
        override_scope="recruitment",
        created_by="admin-1",
    )
    assert out["override_scope"] == "recruitment"


# ── conflict resolution flow ─────────────────────────────────────────


def test_override_flips_conflict_status_to_resolved_by_admin():
    sb = FakeSupabase()
    _seed_report_with_conflict(sb)
    record_override(
        sb,
        verification_report_id="rep-1",
        conflict_id="cid-1",
        conflict_key="apply_end_date.official_disagreement",
        field_path="apply_end_date",
        prior_value="2026-06-30",
        chosen_value="2026-07-15",
        reason="Official corrigendum",
        evidence_url=None,
        override_scope="field",
        created_by="admin-1",
    )
    rep = sb._find_by_id(sb.TABLE, "rep-1")
    statuses = {c["status"] for c in rep["conflicts"]}
    assert statuses == {"resolved_by_admin"}


def test_override_rejects_unknown_conflict_id():
    sb = FakeSupabase()
    _seed_report_with_conflict(sb)
    with pytest.raises(LookupError):
        record_override(
            sb,
            verification_report_id="rep-1",
            conflict_id="cid-does-not-exist",
            conflict_key="x",
            field_path=None,
            prior_value=None, chosen_value=None,
            reason="r", evidence_url=None,
            override_scope="field",
            created_by="admin-1",
        )


def test_override_rejects_unknown_report_id():
    sb = FakeSupabase()
    with pytest.raises(LookupError):
        record_override(
            sb,
            verification_report_id="nope",
            conflict_id="cid-1",
            conflict_key="x",
            field_path=None,
            prior_value=None, chosen_value=None,
            reason="r", evidence_url=None,
            override_scope="field",
            created_by="admin-1",
        )


# ── lifecycle transitions ─────────────────────────────────────────────


def test_pr3_lifecycle_transitions_unioned_with_pr1():
    # PR1's classified → superseded MUST still be allowed after PR3
    # appended classified → consensus_pending.
    allowed = ALLOWED_REPORT_TRANSITIONS["classified"]
    assert "superseded" in allowed
    assert "rejected" in allowed
    assert "consensus_pending" in allowed


def test_consensus_pending_can_transition_to_conflict():
    allowed = ALLOWED_REPORT_TRANSITIONS["consensus_pending"]
    assert {"classified", "conflict", "admin_override_required",
            "superseded", "rejected"} <= allowed


def test_conflict_can_transition_to_admin_override_required():
    allowed = ALLOWED_REPORT_TRANSITIONS["conflict"]
    assert "admin_override_required" in allowed
    assert "classified" in allowed


def test_admin_override_required_can_transition_back_to_classified():
    allowed = ALLOWED_REPORT_TRANSITIONS["admin_override_required"]
    assert "classified" in allowed


# ── write_conflicts ───────────────────────────────────────────────────


def test_write_conflicts_writes_validated_payload():
    sb = FakeSupabase()
    rep = _seed_report_with_conflict(sb)
    # Clear conflicts → moves recommended_action.
    write_conflicts(
        sb, "rep-1", conflicts=[],
        recommended_action="request_admin_review",
    )
    rep_after = sb._find_by_id(sb.TABLE, "rep-1")
    assert rep_after["conflicts"] == []
    assert rep_after["recommended_action"] == "request_admin_review"


def test_write_conflicts_validates_required_conflict_id():
    sb = FakeSupabase()
    _seed_report_with_conflict(sb)
    # PR3 added conflict_id as required. Missing it must raise.
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        write_conflicts(sb, "rep-1", conflicts=[
            {
                "conflict_key": "k", "field_path": "p",
                "values": [{"source": "x", "value": "y"}],
            }
        ])
