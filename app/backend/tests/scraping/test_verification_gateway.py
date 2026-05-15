"""Tests for ``app.scraping.verification_gateway``.

Plan §3 acceptance:

* verification_gateway runs after scrape_queue insert
* resolver state written onto the report
* same-hash reprocess does not re-run the resolver
"""
from __future__ import annotations

from app.scraping.verification_gateway import (
    enqueue_or_run_gateway_after_scrape_queue_insert,
    run_gateway_for_queue_item,
    run_resolver_stage,
)

from tests.scraping._verification_fakes import FakeSupabase


def _seed_queue_item(sb: FakeSupabase, qid: str, **extracted) -> dict:
    item = {
        "id": qid,
        "source_url": extracted.pop("source_url", "https://upsc.gov.in/notif"),
        "source_name": extracted.pop("source_name", "UPSC"),
        "extracted_data": dict(
            {
                "title": "UPSC Civil Services Examination 2026",
                "organization_name": "UPSC",
                "official_notification_url": "https://upsc.gov.in/notif/cse-2026",
            },
            **extracted,
        ),
        "recruitment_id": None,
    }
    sb.get_table("scrape_queue").append(item)
    return item


def _seed_source(sb: FakeSupabase, **fields) -> dict:
    src = {
        "id": fields.pop("id", "src-1"),
        "official_url": fields.pop("official_url", "https://upsc.gov.in"),
        "org_type": fields.pop("org_type", "upsc"),
    }
    src.update(fields)
    sb.get_table("source_registry").append(src)
    return src


# ── End-to-end ─────────────────────────────────────────────────────────


def test_gateway_creates_report_and_runs_resolver_on_first_insert():
    sb = FakeSupabase()
    _seed_queue_item(sb, "queue-1")
    _seed_source(sb)

    result = run_gateway_for_queue_item(sb, "queue-1")

    assert result.classification_outcome == "created"
    assert result.resolver_status == "auto_resolved"
    assert result.resolver_method == "direct_link"
    assert result.suggested_count >= 1

    # The report row carries the resolver state.
    reports = [r for r in sb.rows if not r.get("superseded_by")]
    assert len(reports) == 1
    rep = reports[0]
    assert rep["official_resolution_status"] == "auto_resolved"
    assert rep["official_resolution_method"] == "direct_link"
    assert rep["suggested_official_urls"]


def test_gateway_noop_does_not_rewrite_resolver_state():
    sb = FakeSupabase()
    _seed_queue_item(sb, "queue-1")
    _seed_source(sb)

    run_gateway_for_queue_item(sb, "queue-1")
    # Second invocation: same hash, no new report version, no resolver call.
    second = run_gateway_for_queue_item(sb, "queue-1")
    assert second.classification_outcome == "noop"
    # Resolver state is read off the existing row.
    assert second.resolver_status == "auto_resolved"


def test_gateway_unresolved_when_no_govt_url_found():
    sb = FakeSupabase()
    _seed_queue_item(
        sb, "queue-1",
        source_url="https://example.org/notice",
        official_notification_url="https://example.org/notice",
        organization_name="Some Org",
        title="Some recruitment",
    )
    # No source row — L4/L5 contribute nothing.
    result = run_gateway_for_queue_item(sb, "queue-1")
    assert result.classification_outcome == "created"
    # example.org is non-govt non-aggregator: 0.55 → unresolved band.
    assert result.resolver_status == "unresolved"

    rep = sb.rows[0]
    assert rep["recommended_action"] == "await_official_proof"


def test_gateway_suggested_when_only_source_registry_matches():
    sb = FakeSupabase()
    # Generic queue with a non-govt URL → L1 produces low-confidence only.
    _seed_queue_item(
        sb, "queue-1",
        source_url="https://gen-news.org/notice",
        official_notification_url=None,
        organization_name="Some Org",
        title="Notification 2026",
    )
    _seed_source(sb, official_url="https://upsc.gov.in")
    # Re-stamp the queue item's source_url so the lookup hits this src.
    sb.get_table("scrape_queue")[0]["source_url"] = "https://upsc.gov.in/queue-page"

    result = run_gateway_for_queue_item(sb, "queue-1")
    assert result.resolver_status == "suggested"
    assert result.suggested_count >= 1
    rep = sb.rows[0]
    assert rep["recommended_action"] == "confirm_suggested_proof"


def test_run_resolver_stage_can_be_invoked_directly():
    sb = FakeSupabase()
    _seed_queue_item(sb, "queue-1")
    _seed_source(sb)
    # First invocation creates the report.
    first = run_gateway_for_queue_item(sb, "queue-1")
    assert first.report_id is not None
    # Direct stage invocation reproduces the resolver outcome.
    result = run_resolver_stage(sb, first.report_id)
    assert result.resolver_status == "auto_resolved"


def test_enqueue_or_run_sync_mode_runs_inline():
    sb = FakeSupabase()
    _seed_queue_item(sb, "queue-1")
    result = enqueue_or_run_gateway_after_scrape_queue_insert(sb, "queue-1")
    assert result is not None
    assert result.classification_outcome == "created"


def test_missing_queue_item_raises_lookup_error():
    sb = FakeSupabase()
    import pytest
    with pytest.raises(LookupError):
        run_gateway_for_queue_item(sb, "nonexistent")


def test_resolver_attempts_persisted_to_audit_table():
    sb = FakeSupabase()
    _seed_queue_item(sb, "queue-1")
    _seed_source(sb)
    run_gateway_for_queue_item(sb, "queue-1")
    attempts = sb.get_table("official_resolution_attempts")
    assert len(attempts) >= 1
    # Every attempt links back to the report.
    assert all(a["verification_report_id"] for a in attempts)
