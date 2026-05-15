"""Tests for ``app.scraping.official_resolver``.

Plan §3 acceptance:

* aggregator source never satisfies official proof
* L1–L5 deterministic only; no AI calls
* confidence bands map to status correctly
* every resolver attempt stored in ``official_resolution_attempts``
"""
from __future__ import annotations

from app.scraping.official_resolver import (
    resolve_l1_direct_links,
    resolve_l3_canonical_match,
    resolve_l4_source_registry,
    resolve_l5_sitemap_cached,
    run_resolver_waterfall,
    write_resolution_attempts,
)

from tests.scraping._verification_fakes import FakeSupabase


# ── L1 — direct official links ─────────────────────────────────────────


def test_l1_govt_host_scores_auto_resolve():
    out = resolve_l1_direct_links({
        "official_notification_url": "https://upsc.gov.in/notif/abc",
    })
    assert len(out) == 1
    assert out[0].confidence >= 0.85   # auto-resolve band
    assert out[0].host == "upsc.gov.in"
    assert out[0].url_type == "notification"


def test_l1_aggregator_host_is_excluded():
    out = resolve_l1_direct_links({
        "official_notification_url": "https://sarkariresult.com/upsc-notif",
    })
    assert out == []


def test_l1_non_govt_non_aggregator_is_low_confidence():
    # Bare third-party host that's not a known aggregator — we keep
    # it as a low-confidence candidate so the audit trail records it,
    # but it can't reach the suggest band on its own.
    out = resolve_l1_direct_links({
        "official_apply_url": "https://example.org/upsc-form",
    })
    assert len(out) == 1
    assert out[0].confidence < 0.60


def test_l1_pdf_field_classifies_as_pdf():
    out = resolve_l1_direct_links({
        "source_pdf_url": "https://upsc.gov.in/notif.pdf",
    })
    assert out[0].url_type == "pdf"


def test_l1_skips_empty_and_non_string():
    out = resolve_l1_direct_links({
        "official_notification_url": "",
        "official_apply_url": None,
        "source_pdf_url": 12345,
    })
    assert out == []


# ── L3 — canonical recruitment match ──────────────────────────────────


def test_l3_substring_title_match_lifts_canonical_url():
    sb = FakeSupabase()
    sb.get_table("recruitments").append({
        "id": "rec-1",
        "name": "UPSC Civil Services Examination 2026",
        "official_notification_url": "https://upsc.gov.in/notif/civil-services-2026",
        "year": 2026,
    })
    out = resolve_l3_canonical_match(
        sb, organization_name="UPSC",
        title="UPSC Civil Services Examination",
        year=2026,
    )
    assert len(out) == 1
    assert out[0].method == "canonical_match"
    assert out[0].confidence >= 0.85


def test_l3_returns_empty_when_no_year_match():
    sb = FakeSupabase()
    sb.get_table("recruitments").append({
        "id": "rec-1",
        "name": "UPSC 2025",
        "official_notification_url": "https://upsc.gov.in/x",
        "year": 2025,
    })
    out = resolve_l3_canonical_match(sb, organization_name="UPSC", title="UPSC", year=2026)
    assert out == []


# ── L4 — source_registry ──────────────────────────────────────────────


def test_l4_govt_official_url_lands_in_suggest_band():
    out = resolve_l4_source_registry({
        "id": "src-1",
        "official_url": "https://upsc.gov.in",
    })
    assert len(out) == 1
    assert 0.60 <= out[0].confidence < 0.85


def test_l4_career_page_url_tagged_career_page():
    out = resolve_l4_source_registry({
        "id": "src-1",
        "career_page_url": "https://ntpc.gov.in/careers",
    })
    assert any(c.url_type == "career_page" for c in out)


def test_l4_skips_aggregator_host():
    out = resolve_l4_source_registry({
        "id": "src-1",
        "official_url": "https://sarkariresult.com",
    })
    assert out == []


# ── L5 — cached sitemap ───────────────────────────────────────────────


def test_l5_cached_sitemap_returns_low_band_candidate():
    out = resolve_l5_sitemap_cached({
        "id": "src-1",
        "sitemap_url": "https://upsc.gov.in/sitemap.xml",
    })
    assert len(out) == 1
    assert out[0].method == "sitemap"


def test_l5_skips_non_govt_sitemap():
    out = resolve_l5_sitemap_cached({
        "id": "src-1",
        "sitemap_url": "https://example.org/sitemap.xml",
    })
    assert out == []


# ── Waterfall integration ─────────────────────────────────────────────


def test_waterfall_auto_resolves_on_govt_direct_link():
    sb = FakeSupabase()
    result = run_resolver_waterfall(
        sb,
        extracted_data={
            "title": "UPSC CSE 2026",
            "official_notification_url": "https://upsc.gov.in/notif",
        },
        source=None,
    )
    assert result.status == "auto_resolved"
    assert result.chosen is not None
    assert result.chosen.host == "upsc.gov.in"
    # Auto-resolve doesn't itself bump recommended_action.
    assert result.recommended_action is None


def test_waterfall_suggests_when_only_source_registry_matches():
    sb = FakeSupabase()
    result = run_resolver_waterfall(
        sb,
        extracted_data={"title": "Unknown Recruitment"},
        source={"id": "src-1", "official_url": "https://upsc.gov.in"},
    )
    assert result.status == "suggested"
    assert result.recommended_action == "confirm_suggested_proof"
    assert len(result.suggested) >= 1


def test_waterfall_unresolved_with_no_candidates():
    sb = FakeSupabase()
    result = run_resolver_waterfall(
        sb,
        extracted_data={"title": "Some recruitment"},
        source=None,
    )
    assert result.status == "unresolved"
    assert result.recommended_action == "await_official_proof"
    assert result.chosen is None


def test_waterfall_records_attempt_for_every_candidate():
    sb = FakeSupabase()
    result = run_resolver_waterfall(
        sb,
        extracted_data={
            "title": "UPSC CSE 2026",
            "official_notification_url": "https://upsc.gov.in/notif",
            "source_pdf_url": "https://upsc.gov.in/notif.pdf",
        },
        source={"id": "src-1", "official_url": "https://upsc.gov.in"},
    )
    # Two L1 candidates + one L4 candidate = 3 attempts minimum.
    methods = {a["method"] for a in result.attempts}
    assert "direct_link" in methods
    assert "source_registry" in methods


def test_waterfall_excludes_aggregator_data_from_auto_resolve():
    sb = FakeSupabase()
    result = run_resolver_waterfall(
        sb,
        extracted_data={
            "title": "UPSC CSE 2026",
            "official_notification_url": "https://sarkariresult.com/upsc",
        },
        source=None,
    )
    # Aggregator URL is excluded, no other candidates → unresolved.
    assert result.status == "unresolved"


# ── Attempt persistence ───────────────────────────────────────────────


def test_write_resolution_attempts_persists_to_table():
    sb = FakeSupabase()
    write_resolution_attempts(
        sb,
        verification_report_id="rep-1",
        scrape_queue_id="queue-1",
        source_id="src-1",
        attempts=[
            {"method": "direct_link", "status": "auto_resolved", "confidence": 0.92,
             "candidate_url": "https://upsc.gov.in/x", "official_source_host": "upsc.gov.in"},
            {"method": "duplicate", "status": "skipped", "confidence": None,
             "candidate_url": None, "official_source_host": None},
        ],
    )
    rows = sb.get_table("official_resolution_attempts")
    assert len(rows) == 2
    assert all(r["verification_report_id"] == "rep-1" for r in rows)
    assert all(r["scrape_queue_id"] == "queue-1" for r in rows)


def test_write_resolution_attempts_silently_skips_empty():
    sb = FakeSupabase()
    write_resolution_attempts(
        sb, verification_report_id="rep-1",
        scrape_queue_id=None, source_id=None, attempts=[],
    )
    assert sb.get_table("official_resolution_attempts") == []
