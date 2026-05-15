"""Duplicate detection tests.

Covers the failure modes that prompted the dedup rewrite:
    * Title-only similarity must not cross organisations or years.
    * Exact URL match decides regardless of title wording.
    * Same similarity key returns the canonical recruitment id, not the
      queue id (and vice versa for queue→queue matches).
"""
from __future__ import annotations

from app.scraping.dedup import find_duplicate, fuzzy_duplicate
from app.scraping.extractor import compute_similarity_key, recruitment_key
from app.scraping.schemas import ExtractedRecruitment


def _extracted(**overrides):
    base = {
        "title": "Combined Graduate Level",
        "organization_name": "SSC",
        "org_type": "SSC",
        "year": 2026,
        "official_notification_url": "https://ssc.gov.in/cgl-2026",
        "official_apply_url": None,
    }
    base.update(overrides)
    return base


def _existing(**overrides):
    base = {
        "id": "rec-1",
        "name": "Combined Graduate Level",
        "year": 2026,
        "organizations": {"name": "SSC"},
        "official_notification_url": None,
        "official_apply_url": None,
    }
    base.update(overrides)
    return base


def test_fuzzy_duplicate_true_for_near_identical_titles():
    # SequenceMatcher ratio on these is well above 0.85.
    assert fuzzy_duplicate("SSC CGL Recruitment 2026", "SSC CGL Recruitment 2026.")


def test_fuzzy_duplicate_false_for_different_titles():
    assert not fuzzy_duplicate("SSC CGL", "IBPS PO")


def test_fuzzy_duplicate_requires_real_similarity_not_substring():
    # "Inspector" sits inside "Inspector of Income Tax" but is a different
    # recruitment. Old substring-containment behaviour false-matched here.
    assert fuzzy_duplicate("Inspector", "Inspector of Income Tax") is False


def test_same_title_different_org_is_not_duplicate():
    extracted = _extracted(organization_name="IBPS")
    existing = [_existing()]
    sim_key = recruitment_key("IBPS", 2026, "Combined Graduate Level")
    decision = find_duplicate(extracted, sim_key=sim_key, existing_recruitments=existing, queued={})
    assert decision.is_duplicate is False


def test_same_title_different_year_is_not_duplicate():
    extracted = _extracted(year=2027)
    existing = [_existing(year=2026)]
    sim_key = recruitment_key("SSC", 2027, "Combined Graduate Level")
    decision = find_duplicate(extracted, sim_key=sim_key, existing_recruitments=existing, queued={})
    assert decision.is_duplicate is False


def test_exact_official_url_wins_regardless_of_title():
    extracted = _extracted(title="Totally different wording", official_notification_url="https://ssc.gov.in/cgl-2026")
    existing = [_existing(name="X", official_notification_url="https://ssc.gov.in/cgl-2026")]
    sim_key = recruitment_key("SSC", 2026, "Totally different wording")
    decision = find_duplicate(extracted, sim_key=sim_key, existing_recruitments=existing, queued={})
    assert decision.is_duplicate is True
    assert decision.reason == "official_url_exact"
    assert decision.duplicate_recruitment_id == "rec-1"


def test_similarity_key_match_returns_recruitment_id():
    extracted = _extracted()
    existing = [_existing()]
    sim_key = compute_similarity_key(ExtractedRecruitment(**{**extracted, "org_type": "SSC"}))
    decision = find_duplicate(extracted, sim_key=sim_key, existing_recruitments=existing, queued={})
    assert decision.is_duplicate is True
    assert decision.duplicate_recruitment_id == "rec-1"
    assert decision.duplicate_queue_id is None


def test_queued_match_returns_queue_id_not_recruitment_id():
    extracted = _extracted()
    sim_key = recruitment_key("SSC", 2026, "Combined Graduate Level")
    decision = find_duplicate(
        extracted,
        sim_key=sim_key,
        existing_recruitments=[],
        queued={sim_key: "queue-7"},
    )
    assert decision.is_duplicate is True
    assert decision.reason == "similarity_key_queued"
    assert decision.duplicate_queue_id == "queue-7"
    assert decision.duplicate_recruitment_id is None


def test_notification_number_exact_match_with_same_org():
    extracted = _extracted(
        title="CGL 2026 Notice",  # different title wording
        notification_number="Advt. No. 05/2026",
        official_notification_url="https://ssc.gov.in/cgl-notice-page",
    )
    existing = _existing(notification_number="Advt No 05/2026")  # punctuation differs
    decision = find_duplicate(
        extracted,
        sim_key=recruitment_key("SSC", 2026, "CGL 2026 Notice"),
        existing_recruitments=[existing],
    )
    assert decision.is_duplicate is True
    assert decision.reason == "notification_number_exact"
    assert decision.duplicate_recruitment_id == "rec-1"


def test_notification_number_does_not_match_across_orgs():
    extracted = _extracted(
        organization_name="UPSC",
        notification_number="05/2026",
        official_notification_url="https://upsc.gov.in/x",
    )
    # Same number, different org — must NOT collide.
    existing = _existing(
        organizations={"name": "SSC"},
        notification_number="05/2026",
    )
    decision = find_duplicate(
        extracted,
        sim_key=recruitment_key("UPSC", 2026, "Combined Graduate Level"),
        existing_recruitments=[existing],
    )
    assert decision.reason != "notification_number_exact"


def test_recruitment_key_unified_across_callers():
    # The runner's existing-recruitment loop and new-extraction loop must
    # produce the same key for the same (org, year, title).
    same = recruitment_key("SSC", 2026, "Combined Graduate Level")
    data = ExtractedRecruitment(
        title="Combined Graduate Level",
        organization_name="SSC",
        org_type="SSC",
        year=2026,
        official_notification_url="https://x",
    )
    assert compute_similarity_key(data) == same
