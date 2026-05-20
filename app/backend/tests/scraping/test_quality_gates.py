"""Scraper quality gates (PR: scraper-org-type-gates).

P1-1  resolved-without-host gate (host-applicable source types only).
P1-3  data_quality_score ceiling observability flag.
plus  the ``_guess_org_type`` word-boundary fix (root cause of the MPSC
      ``org_type=Insurance`` mis-classification: "lic" inside "pubLIC").
"""
from __future__ import annotations

import logging

import pytest

from app.scraping.extractor import _guess_org_type
from app.scraping.runner import run_scraping_pass
from tests.test_scrape_runner_promote import RunnerSB


# ── _guess_org_type: whole-word matching, no substring false positives ──────


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Maharashtra Public Service Commission", "Other"),   # was wrongly "Insurance"
        ("Kerala Public Service Commission", "Other"),
        ("Life Insurance Corporation of India", "Insurance"),  # full word still matches
        ("LIC", "Insurance"),                                  # abbreviation as a word
        ("SSC CGL 2026", "SSC"),
        ("UPSC Civil Services Exam", "UPSC"),                  # abbreviation as a word
        ("Union Public Service Commission", "Other"),          # spelled-out: no 'upsc' token (matches prior behaviour)
        ("Railway Recruitment Board", "Railway"),
        ("State Bank of India", "Banking"),                    # "bank" substring is fine
    ],
)
def test_guess_org_type_word_boundary(name, expected):
    assert _guess_org_type(name) == expected


def test_guess_org_type_public_is_not_insurance():
    """The exact regression: 'Public' must never resolve to Insurance."""
    assert _guess_org_type("Maharashtra Public Service Commission") != "Insurance"


# ── P1-1: resolved-without-host gate ────────────────────────────────────────


def _host_applicable_source(source_type):
    return [{
        "id": "src-h",
        "source_name": "Some State Public Service Commission",
        "source_type": source_type,
        "adapter_type": "html",
        "official_url": "https://psc.example.gov.in/notices",
        "is_active": True,
        # The MPSC misconfig: an official source that does not require
        # official confirmation → else-branch sets resolved=True, host=None.
        "requires_official_confirmation": False,
    }]


def test_p1_resolved_without_host_blocks_official_html():
    sb = RunnerSB()
    sb.db["source_registry"] = _host_applicable_source("official_html")
    run_scraping_pass(sb, source_ids=["src-h"], mock=True)
    rows = sb.db["scrape_queue"]
    assert rows
    row = rows[0]
    # Flipped back to unresolved + routed to review + audited in _meta.
    assert row["official_source_resolved"] is False
    assert row["extraction_status"] == "needs_review"
    assert "resolved_without_host_blocked" in (row["extracted_data"]["_meta"]["warnings"])


def test_p1_api_source_exempt_from_host_gate():
    sb = RunnerSB()
    sb.db["source_registry"] = [{
        "id": "src-api",
        "source_name": "Some API Source",
        "source_type": "api",
        "adapter_type": "api",
        "api_url": "https://example.gov.in/wp-json/wp/v2/posts",
        "is_active": True,
        "requires_official_confirmation": False,
    }]
    run_scraping_pass(sb, source_ids=["src-api"], mock=True)
    rows = sb.db["scrape_queue"]
    assert rows
    # api is intentionally exempt — host may not apply; resolved stays True.
    for row in rows:
        assert row["official_source_resolved"] is True
        assert "resolved_without_host_blocked" not in (row["extracted_data"]["_meta"]["warnings"] or [])


# ── P1-3: data_quality_score ceiling flag ───────────────────────────────────


def test_p1_quality_ceiling_flag_set_and_logged(caplog):
    """The complete mock payload scores a perfect 1.0 → the ceiling flag is
    set on _meta and a greppable warning is logged."""
    sb = RunnerSB()
    caplog.set_level(logging.WARNING, logger="career_copilot.scraping.runner")
    run_scraping_pass(sb, source_ids=["src-1"], mock=True)
    rows = sb.db["scrape_queue"]
    assert rows
    assert all(r["extracted_data"]["_meta"].get("quality_ceiling_flag") is True for r in rows)
    assert any("quality_score_ceiling" in rec.getMessage() for rec in caplog.records)


# ── P1-2: per-source org_type allowlist (fail-open) ─────────────────────────


def _state_psc_source(*, expected_org_types):
    # Mock _guess_org_type("... State Public Service Commission") → "State".
    # source_type='official' is NOT host-applicable, so P1-1 stays out of the
    # way and we can assert P1-2 in isolation.
    return [{
        "id": "src-otype",
        "source_name": "Example State Public Service Commission",
        "source_type": "official",
        "adapter_type": "html",
        "official_url": "https://psc.example.gov.in/notices",
        "is_active": True,
        "requires_official_confirmation": False,
        "trust_config": {"expected_org_types": expected_org_types},
    }]


def test_p1_org_type_mismatch_routes_to_review():
    sb = RunnerSB()
    sb.db["source_registry"] = _state_psc_source(expected_org_types=["UPSC"])
    run_scraping_pass(sb, source_ids=["src-otype"], mock=True)
    row = sb.db["scrape_queue"][0]
    # Extracted org_type is "State"; allowlist is {"UPSC"} → mismatch.
    assert row["extraction_status"] == "needs_review"
    assert any(
        w.startswith("org_type_mismatch:")
        for w in (row["extracted_data"]["_meta"]["warnings"] or [])
    )


def test_p1_org_type_match_passes():
    sb = RunnerSB()
    sb.db["source_registry"] = _state_psc_source(expected_org_types=["State"])
    run_scraping_pass(sb, source_ids=["src-otype"], mock=True)
    row = sb.db["scrape_queue"][0]
    assert row["extraction_status"] == "ok"
    assert not any(
        w.startswith("org_type_mismatch:")
        for w in (row["extracted_data"]["_meta"]["warnings"] or [])
    )


def test_p1_org_type_gate_fail_open_when_unconfigured():
    """A source with no expected_org_types config is never gated on org_type."""
    sb = RunnerSB()
    src = _state_psc_source(expected_org_types=["State"])[0]
    src.pop("trust_config")
    sb.db["source_registry"] = [src]
    run_scraping_pass(sb, source_ids=["src-otype"], mock=True)
    row = sb.db["scrape_queue"][0]
    assert not any(
        w.startswith("org_type_mismatch:")
        for w in (row["extracted_data"]["_meta"]["warnings"] or [])
    )
