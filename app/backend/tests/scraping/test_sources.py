import warnings

import pytest

from app.scraping.sources import ScrapeSource, normalize_legacy_source, normalize_source_registry


# ── Legacy table normalisation ──────────────────────────────────────────────


def test_normalize_legacy_source_joins_path():
    # Legacy adapter emits a DeprecationWarning; suppress for this exercise.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        src = normalize_legacy_source(
            {"id": "1", "name": "SSC", "base_url": "https://a", "notification_path": "/b"}
        )
    assert src.primary_fetch_url() == "https://a/b"


def test_normalize_legacy_source_with_only_base_url():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        src = normalize_legacy_source({"id": "1", "name": "X", "base_url": "https://x"})
    assert src.primary_fetch_url() == "https://x"


def test_normalize_legacy_source_emits_deprecation_warning():
    """Runtime callers should not use this adapter; the warning makes
    accidental imports visible in CI / admin logs."""
    with pytest.warns(DeprecationWarning, match="normalize_legacy_source is deprecated"):
        normalize_legacy_source({"id": "1", "name": "X", "base_url": "https://x"})


# ── source_registry → typed ScrapeSource ────────────────────────────────────


def test_aggregator_source_prefers_crawl_url():
    # Migration 074 dropped ``source_registry.source_url``; ``official_url``
    # is the canonical listing-page column for aggregators now. The test
    # name is kept for grep-ability — the preference order between
    # crawl_url / notification_url / official_url is still what's covered.
    src = normalize_source_registry(
        {
            "id": "s1",
            "source_name": "Free Job Alert",
            "source_type": "aggregator",
            "official_url": "https://www.freejobalert.com/government-jobs/",
            "notification_url": "https://ignored.example/jobs",
        }
    )
    assert src.id == "s1"
    assert src.name == "Free Job Alert"
    assert src.source_type == "aggregator"
    assert src.is_aggregator is True
    assert src.primary_fetch_url() == "https://www.freejobalert.com/government-jobs/"


def test_discovery_only_flag_routes_to_crawl_url_even_without_source_type():
    src = normalize_source_registry(
        {
            "id": "s2",
            "source_name": "Discovery Site",
            "discovery_only": True,
            "official_url": "https://discovery.example/list",
            "notification_url": "https://ignored.example/post",
        }
    )
    assert src.is_aggregator is True
    assert src.primary_fetch_url() == "https://discovery.example/list"


def test_direct_source_prefers_notification_url():
    src = normalize_source_registry(
        {
            "id": "s3",
            "source_name": "UPSC",
            "source_type": "official",
            "notification_url": "https://upsc.gov.in/notices/2026/cgl",
            "official_url": "https://upsc.gov.in",
        }
    )
    assert src.is_aggregator is False
    assert src.primary_fetch_url() == "https://upsc.gov.in/notices/2026/cgl"


def test_rss_adapter_picks_rss_url():
    src = normalize_source_registry(
        {
            "id": "s4",
            "source_name": "RSS Source",
            "adapter_type": "rss",
            "rss_url": "https://example.gov.in/feed.xml",
            "notification_url": "https://example.gov.in/notices",
        }
    )
    assert src.primary_fetch_url() == "https://example.gov.in/feed.xml"


def test_api_adapter_picks_api_url():
    src = normalize_source_registry(
        {
            "id": "s5",
            "source_name": "API Source",
            "adapter_type": "api",
            "api_url": "https://example.gov.in/api/notifications",
            "notification_url": "https://example.gov.in/notices",
        }
    )
    assert src.primary_fetch_url() == "https://example.gov.in/api/notifications"


def test_pdf_adapter_picks_pdf_bulletin_url():
    src = normalize_source_registry(
        {
            "id": "s6",
            "source_name": "PDF Bulletin",
            "adapter_type": "pdf",
            "pdf_bulletin_url": "https://example.gov.in/bulletin.pdf",
        }
    )
    assert src.primary_fetch_url() == "https://example.gov.in/bulletin.pdf"


def test_returns_none_when_adapter_url_is_missing():
    # adapter_type='rss' but rss_url is missing → None (config error, not silent fallback).
    src = normalize_source_registry(
        {
            "id": "s7",
            "source_name": "Misconfigured RSS",
            "adapter_type": "rss",
            "notification_url": "https://example.gov.in/notices",
        }
    )
    assert src.primary_fetch_url() is None


def test_returns_none_when_no_urls_at_all():
    src = normalize_source_registry({"id": "s8", "source_name": "Empty"})
    assert src.primary_fetch_url() is None


def test_policy_flags_are_typed():
    src = normalize_source_registry(
        {
            "id": "s9",
            "source_name": "Policy",
            "is_official_source": True,
            "discovery_only": False,
            "requires_official_confirmation": True,
            "adapter_config": {"include_patterns": ["recruitment"]},
            "scrape_config": {"max_items_per_run": 5},
        }
    )
    assert src.is_official_source is True
    assert src.discovery_only is False
    assert src.requires_official_confirmation is True
    assert src.adapter_config == {"include_patterns": ["recruitment"]}
    assert src.scrape_config == {"max_items_per_run": 5}


def test_whitespace_url_is_treated_as_missing():
    src = normalize_source_registry(
        {"id": "s10", "source_name": "Whitespace", "notification_url": "   "}
    )
    assert src.notification_url is None
    assert src.primary_fetch_url() is None


def test_sitemap_adapter_picks_adapter_config_url():
    src = normalize_source_registry({
        "id": "s1",
        "source_name": "Sitemap source",
        "adapter_type": "sitemap",
        "adapter_config": {"sitemap_url": "https://x.gov.in/recruitment-sitemap.xml"},
    })
    assert src.primary_fetch_url() == "https://x.gov.in/recruitment-sitemap.xml"


def test_sitemap_adapter_falls_back_to_crawl_url_plus_sitemap():
    src = normalize_source_registry({
        "id": "s2",
        "source_name": "Default sitemap",
        "adapter_type": "sitemap",
        "crawl_url": "https://x.gov.in",
    })
    assert src.primary_fetch_url() == "https://x.gov.in/sitemap.xml"


def test_sitemap_adapter_returns_none_when_no_url_or_base():
    src = normalize_source_registry({
        "id": "s3",
        "source_name": "Misconfigured sitemap",
        "adapter_type": "sitemap",
    })
    assert src.primary_fetch_url() is None
