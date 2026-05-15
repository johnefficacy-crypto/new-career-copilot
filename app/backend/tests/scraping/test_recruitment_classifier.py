"""Tests for ``app.scraping.recruitment_classifier``.

The classifier is the entry point of the Recruitment Verification
Gateway. Tier A wins over B over C; an exam-family hint flows through
into the report row so admin UI can bucket by family.
"""
from __future__ import annotations

from app.scraping.recruitment_classifier import classify_recruitment


# ── Tier A ─────────────────────────────────────────────────────────────


def test_upsc_is_tier_a():
    out = classify_recruitment({"title": "UPSC Civil Services Examination 2026"})
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "upsc"
    assert out["review_strategy"] == "strict_official_multi_source"
    assert out["publish_policy"] == "manual_verified_only"


def test_ssc_is_tier_a():
    out = classify_recruitment({"title": "SSC CGL Notification 2026"})
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "ssc"


def test_ibps_is_tier_a():
    out = classify_recruitment({"title": "IBPS Clerk Recruitment 2026"})
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "ibps"


def test_defence_is_tier_a():
    out = classify_recruitment({"title": "Indian Army Agniveer Recruitment 2026"})
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "defence"


def test_state_psc_is_tier_a():
    out = classify_recruitment({
        "title": "Maharashtra Public Service Commission Notification",
        "organization_name": "MPSC",
    })
    assert out["criticality_tier"] == "A_HIGH_STAKES"


def test_railway_is_tier_a():
    out = classify_recruitment({"title": "RRB Group D Recruitment 2026"})
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "railways"


def test_source_registry_hint_promotes_to_tier_a_when_payload_is_sparse():
    # SSC source whose extracted title got truncated to a generic
    # "Notification 2026" string — source_registry.org_type pulls it
    # back into Tier A so the verification gate runs the strict path.
    out = classify_recruitment(
        {"title": "Notification 2026"},
        source={"org_type": "ssc"},
    )
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "ssc"


# ── Tier B ─────────────────────────────────────────────────────────────


def test_psu_is_tier_b():
    out = classify_recruitment({"title": "ONGC Engineer Recruitment 2026"})
    assert out["criticality_tier"] == "B_TECHNICAL_CONDITIONAL"
    assert out["exam_family_key"] == "psu"


def test_gate_based_is_tier_b():
    out = classify_recruitment({"title": "Recruitment of Scientists through GATE score 2026"})
    assert out["criticality_tier"] == "B_TECHNICAL_CONDITIONAL"


def test_university_professor_is_tier_b():
    out = classify_recruitment({"title": "University Recruitment of Assistant Professor"})
    assert out["criticality_tier"] == "B_TECHNICAL_CONDITIONAL"
    assert out["exam_family_key"] == "university"


def test_conditional_rule_keyword_pulls_into_tier_b():
    # A long-tail recruitment that has a conditional domicile rule should
    # still get Tier B's stricter review_strategy.
    out = classify_recruitment({
        "title": "District Notice 2026",
        "posts": [{"post_name": "Clerk", "raw_requirement_text": "Domicile of the state required."}],
    })
    assert out["criticality_tier"] == "B_TECHNICAL_CONDITIONAL"
    assert out["exam_family_key"] == "conditional_rules"


# ── Tier C ─────────────────────────────────────────────────────────────


def test_simple_long_tail_is_tier_c():
    out = classify_recruitment({"title": "Vacancy Notice — Office Assistant"})
    assert out["criticality_tier"] == "C_STANDARD_LONG_TAIL"
    # Service layer applies the 'other' default; the classifier itself
    # may return None here.
    assert out["exam_family_key"] is None
    assert out["review_strategy"] == "standard_validate_verify_publish"


def test_empty_payload_defaults_to_tier_c():
    out = classify_recruitment({})
    assert out["criticality_tier"] == "C_STANDARD_LONG_TAIL"


def test_none_payload_defaults_to_tier_c():
    out = classify_recruitment(None)
    assert out["criticality_tier"] == "C_STANDARD_LONG_TAIL"


# ── Tie-break / priority ───────────────────────────────────────────────


def test_tier_a_wins_when_payload_mentions_both_tiers():
    # A UPSC notification that also references a GATE qualification must
    # stay Tier A.
    out = classify_recruitment({"title": "UPSC IES Recruitment — GATE qualified candidates"})
    assert out["criticality_tier"] == "A_HIGH_STAKES"
    assert out["exam_family_key"] == "upsc"
