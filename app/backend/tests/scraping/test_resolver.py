from app.scraping.resolver import ResolverResult, resolve_official_source
from app.scraping.sources import normalize_source_registry


def _src(**overrides):
    base = {"id": "s1", "source_name": "Aggregator X"}
    base.update(overrides)
    return normalize_source_registry(base)


def test_resolver_returns_none_for_empty_html():
    assert resolve_official_source("", "https://agg.example/x", _src()) is None
    assert resolve_official_source(None, "https://agg.example/x", _src()) is None


def test_resolver_picks_gov_anchor():
    html = """
      <a href="https://random.example/ad">Sponsored</a>
      <a href="https://ssc.nic.in/recruitment/2026/cgl.pdf">Official notification PDF</a>
      <a href="/relative-path">Internal</a>
    """
    r = resolve_official_source(html, "https://agg.example/post/", _src())
    assert isinstance(r, ResolverResult)
    assert r.official_url == "https://ssc.nic.in/recruitment/2026/cgl.pdf"
    assert r.host == "ssc.nic.in"
    assert r.reason == "gov_anchor"
    assert r.matched_anchor_text == "Official notification PDF"


def test_resolver_prefers_registry_host_when_present():
    html = """
      <a href="https://ssc.nic.in/">SSC homepage</a>
      <a href="https://upsc.gov.in/notice/2026/abc.pdf">UPSC notice (deeper)</a>
    """
    # Registry advertises ssc.nic.in as the source's official host; the
    # resolver should pick that even though the upsc.gov.in anchor has a
    # deeper path.
    src = _src(official_url="https://ssc.nic.in")
    r = resolve_official_source(html, "https://agg.example/post/", src)
    assert r is not None
    assert r.official_url == "https://ssc.nic.in/"
    assert r.reason == "registry_host_match"


def test_resolver_picks_deepest_gov_anchor_when_multiple():
    html = """
      <a href="https://ssc.nic.in/">homepage</a>
      <a href="https://ssc.nic.in/recruitment/2026/cgl.pdf">cgl notice</a>
    """
    r = resolve_official_source(html, "https://agg.example/post/", _src())
    assert r is not None
    assert r.official_url == "https://ssc.nic.in/recruitment/2026/cgl.pdf"


def test_resolver_skips_non_official_anchors_only():
    html = """
      <a href="https://news.example.com/sarkari-job-recruitment">News article</a>
      <a href="mailto:x@x.com">Contact</a>
      <a href="javascript:void(0)">JS</a>
    """
    assert resolve_official_source(html, "https://agg.example/post/", _src()) is None


def test_resolver_recognises_ac_in_for_educational_bodies():
    html = '<a href="https://iitb.ac.in/recruitment/2026.pdf">IITB Recruitment 2026</a>'
    r = resolve_official_source(html, "https://agg.example/post/", _src())
    assert r is not None
    assert r.host == "iitb.ac.in"


# ── PR P2: resolver registry + WordPress-style resolver ─────────────────────


from app.scraping.resolver import (
    RESOLVER_REGISTRY,
    _wordpress_apply_online_resolver,
    resolve_with_registry,
)


def test_wordpress_apply_online_picks_official_anchor_by_label():
    html = """
      <a href="https://random.example/sponsor">Sponsor</a>
      <a href="https://ssc.nic.in/apply/2026">Apply Online</a>
    """
    r = _wordpress_apply_online_resolver(html, "https://agg.example/post/", _src())
    assert r is not None
    assert r.reason == "wordpress_apply_button"
    assert r.host == "ssc.nic.in"


def test_wordpress_apply_online_ignores_non_gov_apply_link():
    html = '<a href="https://coaching.example/buy-course">Apply Online</a>'
    assert _wordpress_apply_online_resolver(html, "https://agg.example/", _src()) is None


def test_resolve_with_registry_uses_first_match():
    html = """
      <a href="https://ssc.nic.in/apply/2026">Apply Online</a>
      <a href="https://upsc.gov.in/older-notice.pdf">UPSC notice</a>
    """
    # WordPress resolver fires first (matches Apply Online label) and
    # wins even though the generic gov-anchor resolver would have picked
    # the deeper UPSC URL.
    r = resolve_with_registry(html, "https://agg.example/post/", _src())
    assert r is not None
    assert r.reason == "wordpress_apply_button"


def test_resolve_with_registry_falls_back_to_generic_resolver():
    html = '<a href="https://ssc.nic.in/recruitment/2026/cgl.pdf">PDF</a>'
    r = resolve_with_registry(html, "https://agg.example/post/", _src())
    assert r is not None
    assert r.reason == "gov_anchor"


def test_registry_includes_generic_resolver_as_fallback():
    # The order matters: source-specific resolvers must come first; the
    # generic resolver is the last entry.
    assert RESOLVER_REGISTRY[-1].__name__ == "resolve_official_source"
