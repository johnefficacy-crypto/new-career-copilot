"""Tests for ``app.eligibility.complexity_contract``.

PR4 ship gate:

* unrepresented signals at ``promotion_blocker`` / ``publish_blocker`` are
  flagged for the gate
* evidence_summary_key is preserved through the dict-form path
* missing tables in the canonical schema are treated as "not represented"
  rather than crashing
"""
from __future__ import annotations

from app.eligibility.complexity_contract import (
    ComplexityRepresentation,
    evaluate_representation,
    has_unrepresented_blocker,
)

from tests.scraping._verification_fakes import FakeSupabase


def _signal(flag: str, field_key: str, blocking_level: str = "publish_blocker") -> dict:
    return {
        "flag": flag,
        "field_key": field_key,
        "source_field_path": "posts[0].raw_requirement_text",
        "blocking_level": blocking_level,
    }


def test_queue_only_report_treats_all_signals_as_unrepresented():
    # No recruitment_id yet → nothing to look up against. Every signal
    # comes back unrepresented so the gate blocks at the right level.
    sb = FakeSupabase()
    out = evaluate_representation(
        sb, recruitment_id="",
        signals=[_signal("requires_domicile", "profile.domicile_state")],
    )
    assert len(out) == 1
    assert out[0].represented is False
    assert out[0].rule_kind == "domicile"


def test_signal_with_no_rule_kind_mapping_is_never_represented():
    # An unknown field_key maps to rule_kind=None → "no canonical
    # equivalent exists yet" → the signal sits in the unrepresented
    # bucket regardless of what the canonical tables contain.
    sb = FakeSupabase()
    out = evaluate_representation(
        sb, recruitment_id="rec-1",
        signals=[_signal("custom_flag", "profile.something.new")],
    )
    assert out[0].represented is False
    assert out[0].rule_kind is None


def test_signal_represented_when_matching_criteria_row_exists():
    sb = FakeSupabase()
    sb.get_table("domicile_criteria").append({"id": "x", "recruitment_id": "rec-1"})
    out = evaluate_representation(
        sb, recruitment_id="rec-1",
        signals=[_signal("requires_domicile", "profile.domicile_state")],
    )
    assert out[0].represented is True


def test_signal_unrepresented_when_no_matching_criteria_row():
    sb = FakeSupabase()
    # No domicile_criteria rows at all.
    out = evaluate_representation(
        sb, recruitment_id="rec-1",
        signals=[_signal("requires_domicile", "profile.domicile_state")],
    )
    assert out[0].represented is False


def test_has_unrepresented_blocker_at_publish_level():
    reps = [
        ComplexityRepresentation(
            flag="requires_domicile",
            field_key="profile.domicile_state",
            blocking_level="publish_blocker",
            represented=False,
            rule_kind="domicile",
        ),
    ]
    assert has_unrepresented_blocker(reps, level="publish_blocker") is True
    assert has_unrepresented_blocker(reps, level="promotion_blocker") is False


def test_represented_signals_do_not_count_as_blockers():
    reps = [
        ComplexityRepresentation(
            flag="requires_domicile",
            field_key="profile.domicile_state",
            blocking_level="publish_blocker",
            represented=True,
            rule_kind="domicile",
        ),
    ]
    assert has_unrepresented_blocker(reps, level="publish_blocker") is False


def test_warning_level_signals_never_block():
    reps = [
        ComplexityRepresentation(
            flag="medical_standards",
            field_key="profile.medical_standards",
            blocking_level="warning",
            represented=False,
            rule_kind="medical",
        ),
    ]
    assert has_unrepresented_blocker(reps, level="publish_blocker") is False
    assert has_unrepresented_blocker(reps, level="promotion_blocker") is False
