from app.scraping.aggregator import (
    DiscoveryResult,
    classify_aggregator_link,
    discover_aggregator_detail_urls,
    is_aggregator_source,
    mock_aggregator_detail_urls,
)
from app.scraping.sources import normalize_source_registry


def test_discover_aggregator_detail_urls_filters_listing_noise():
    html = """
      <a href="/government-jobs/">Government Jobs</a>
      <a href="/exam-results/">Results</a>
      <a href="/ssc-cgl-2026-recruitment/">SSC CGL 2026 Recruitment</a>
      <a href="https://www.freejobalert.com/bank-vacancy-2026/">Bank Vacancy 2026</a>
      <a href="https://external.example/recruitment/">External Recruitment</a>
      <a href="/ssc-cgl-2026-recruitment/#comments">Duplicate fragment</a>
    """
    result = discover_aggregator_detail_urls(
        "".join(html),
        "https://www.freejobalert.com/government-jobs/",
        max_items=10,
    )
    assert isinstance(result, DiscoveryResult)
    assert result.urls == [
        "https://www.freejobalert.com/ssc-cgl-2026-recruitment/",
        "https://www.freejobalert.com/bank-vacancy-2026/",
    ]
    # Stats are returned inline now, not stashed on the function attribute.
    assert result.stats["discovered"] == 2
    assert result.stats["domain"] >= 1  # external.example was filtered


def test_discover_skips_lifecycle_events_by_default():
    html = """
      <a href="/ssc-cgl-2026-recruitment/">SSC CGL 2026 Recruitment</a>
      <a href="/ssc-cgl-2026-admit-card/">SSC CGL 2026 Admit Card</a>
      <a href="/ibps-po-2026-result/">IBPS PO 2026 Result</a>
      <a href="/upsc-2026-corrigendum/">UPSC 2026 Corrigendum</a>
    """
    result = discover_aggregator_detail_urls(html, "https://www.freejobalert.com/")
    assert result.urls == ["https://www.freejobalert.com/ssc-cgl-2026-recruitment/"]
    assert result.stats["lifecycle_skipped"] >= 3
    # Lifecycle classification is preserved on every accepted link.
    assert result.links[0].event_type == "new_recruitment"


def test_discover_can_keep_lifecycle_events_when_requested():
    html = '<a href="/ssc-cgl-2026-admit-card/">Admit Card</a>'
    result = discover_aggregator_detail_urls(
        html, "https://www.freejobalert.com/", skip_lifecycle_events=False
    )
    assert result.urls == ["https://www.freejobalert.com/ssc-cgl-2026-admit-card/"]
    assert result.links[0].event_type == "admit_card"


def test_aggregator_detection_and_mock_urls():
    row = {
        "id": "s1",
        "source_name": "Free Job Alert",
        "source_type": "aggregator",
        # Migration 074 dropped ``source_url`` — aggregators now carry
        # their listing-page URL in ``official_url``.
        "official_url": "https://www.freejobalert.com/government-jobs/",
    }
    assert is_aggregator_source(row)
    source = normalize_source_registry(row)
    assert mock_aggregator_detail_urls(source, count=2) == [
        "https://www.freejobalert.com/government-jobs/mock-recruitment-1/",
        "https://www.freejobalert.com/government-jobs/mock-recruitment-2/",
    ]


def test_requires_official_confirmation_alone_is_not_aggregator():
    """Trust policy and parsing policy are separate now.

    PR 1 routed ``requires_official_confirmation`` through the promotion
    gate. The aggregator detector must not treat that flag as "aggregator"
    or an official source that wants verification will be wrongly crawled
    like an aggregator listing page.
    """
    row = {
        "id": "official-needs-verify",
        "source_name": "UPSC",
        "source_type": "official",
        "requires_official_confirmation": True,
    }
    assert is_aggregator_source(row) is False


def test_aggregator_detection_via_discovery_only_flag():
    row = {"id": "x", "source_name": "y", "discovery_only": True}
    assert is_aggregator_source(row) is True


def test_classify_aggregator_link_lifecycle_buckets():
    assert classify_aggregator_link("SSC CGL Admit Card", "https://x/admit-card/") == "admit_card"
    assert classify_aggregator_link("UPSC Result 2026", "https://x/result/") == "result"
    assert classify_aggregator_link("Answer Key out", "https://x/key/") == "answer_key"
    assert classify_aggregator_link("Corrigendum issued", "https://x/corrigendum") == "corrigendum"
    assert classify_aggregator_link("Last date extended", "https://x/notice") == "date_extended"
    assert classify_aggregator_link("Syllabus PDF", "https://x/syllabus") == "syllabus"
    assert classify_aggregator_link("Interview schedule", "https://x/iv") == "interview_schedule"


def test_classify_aggregator_link_defaults_to_new_recruitment():
    assert classify_aggregator_link("SSC CGL Recruitment 2026", "https://x/cgl") == "new_recruitment"
    assert classify_aggregator_link(None, None) == "new_recruitment"


# ── Lifecycle links retained on DiscoveryResult ─────────────────────────────


def test_discovery_keeps_lifecycle_links_in_lifecycle_links_list():
    html = """
      <a href="/ssc-cgl-2026-recruitment/">SSC CGL Recruitment</a>
      <a href="/ssc-cgl-2026-admit-card/">SSC CGL Admit Card</a>
      <a href="/upsc-2026-corrigendum/">UPSC 2026 Corrigendum</a>
    """
    result = discover_aggregator_detail_urls(html, "https://www.freejobalert.com/")
    # urls still contains only the new_recruitment link
    assert result.urls == ["https://www.freejobalert.com/ssc-cgl-2026-recruitment/"]
    # lifecycle_links has the rest, each tagged with its event_type
    types = sorted(l.event_type for l in result.lifecycle_links)
    assert types == ["admit_card", "corrigendum"]
    assert all(l.url.startswith("https://www.freejobalert.com/") for l in result.lifecycle_links)


def test_discover_filters_cloudflare_cdn_cgi_decoy_urls():
    """Cloudflare's scrape-shield rewrites some links into ``/cdn-cgi/...``
    decoys with opaque, unstable URLs. Queueing those poisons evidence
    traceability and URL-based dedup. The discoverer must drop them."""
    html = """
      <a href="/government-jobs/">Government Jobs (listing root)</a>
      <a href="/nhai-recruitment-2026/">NHAI Recruitment 2026</a>
      <a href="/cdn-cgi/content?url=https://www.indgovtjobs.net/something">Hidden decoy</a>
      <a href="/cdn-cgi/l/email-protection#abcdef">Obfuscated email</a>
    """
    result = discover_aggregator_detail_urls(
        html,
        "https://www.indgovtjobs.net/government-jobs/",
        max_items=10,
    )
    assert "https://www.indgovtjobs.net/nhai-recruitment-2026/" in result.urls
    assert all("/cdn-cgi/" not in u for u in result.urls)
    assert result.stats.get("cloudflare_filtered", 0) == 2
