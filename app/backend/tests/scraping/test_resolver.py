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
