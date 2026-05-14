"""Entry resolution tests — CTA verified-only contract + cold fallback."""
from __future__ import annotations

from app.onboarding_unified.entry_resolver import (
    normalize_intent,
    resolve_entry,
    slugify,
)
from tests.onboarding_unified._seed import SBStub, cta_world


def test_cta_resolve_loads_only_verified_recruitment_questions():
    sb = SBStub(cta_world())
    entry = resolve_entry(
        sb,
        intent="check-eligibility",
        recruitment_slug="cnp-nashik-2026",
        post_slug="safety-officer",
    )
    assert entry["entry_mode"] == "cta"
    assert entry["fallback"] is False
    keys = [q["question_key"] for q in entry["recruitment_questions"]]
    # Only the verified row is returned.
    assert keys == ["has_marathi_knowledge"]


def test_unverified_recruitment_questions_are_not_returned():
    sb = SBStub(cta_world())
    entry = resolve_entry(
        sb,
        intent="check_eligibility",
        recruitment_slug="cnp-nashik-2026",
        post_slug="safety-officer",
    )
    texts = [q["question_text"] for q in entry["recruitment_questions"]]
    assert all("must not appear" not in t for t in texts)


def test_cta_with_no_verified_contract_falls_back_safely():
    world = cta_world()
    # Drop the verified row — only pending/rejected remain.
    world["recruitment_question_requirements"] = [
        r
        for r in world["recruitment_question_requirements"]
        if r["reviewer_status"] != "verified"
    ]
    sb = SBStub(world)
    entry = resolve_entry(
        sb, recruitment_slug="cnp-nashik-2026", post_slug="safety-officer"
    )
    assert entry["fallback"] is True
    assert entry["fallback_reason"] == "recruitment_contract_pending"
    assert entry["recruitment_questions"] == []


def test_cta_unknown_recruitment_falls_back():
    sb = SBStub(cta_world())
    entry = resolve_entry(sb, recruitment_slug="does-not-exist")
    assert entry["fallback"] is True
    assert entry["fallback_reason"] == "recruitment_not_found"


def test_cold_resolve_has_no_recruitment_and_unknown_intent_is_dropped():
    sb = SBStub({})
    entry = resolve_entry(sb, mode="discovery", intent="something_weird")
    assert entry["entry_mode"] == "discovery"
    assert entry["intent"] is None
    assert entry["recruitment"] is None


def test_normalize_intent_and_slugify():
    assert normalize_intent("check-eligibility") == "check_eligibility"
    assert normalize_intent("find-jobs") == "check_eligibility"
    assert normalize_intent("documents-required") == "track_deadlines"
    assert normalize_intent(None) is None
    assert slugify("Safety Officer") == "safety-officer"
