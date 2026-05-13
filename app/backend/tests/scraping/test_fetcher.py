from app.scraping.fetcher import FetchResult, fetch, fetch_page_html, fetch_page_text


def test_fetch_empty_url_returns_error():
    result = fetch("")
    assert result.ok is False
    assert result.error == "empty_url"
    assert result.text is None


def test_fetch_rss_adapter_is_not_implemented_yet():
    result = fetch("https://example.gov.in/feed.xml", adapter_type="rss")
    assert isinstance(result, FetchResult)
    assert result.ok is False
    assert result.error == "adapter_not_implemented"


def test_fetch_api_adapter_is_not_implemented_yet():
    result = fetch("https://example.gov.in/api", adapter_type="api")
    assert result.ok is False
    assert result.error == "adapter_not_implemented"


def test_fetch_pdf_adapter_is_not_implemented_yet():
    result = fetch("https://example.gov.in/bulletin.pdf", adapter_type="pdf")
    assert result.ok is False
    assert result.error == "adapter_not_implemented"


def test_fetch_html_returns_structured_result(monkeypatch):
    class _Resp:
        status_code = 200
        text = "<html><body>hello world</body></html>"
        content = b"<html><body>hello world</body></html>"
        headers = {
            "content-type": "text/html; charset=utf-8",
            "etag": "W/\"abc\"",
            "last-modified": "Wed, 01 Jan 2026 00:00:00 GMT",
        }
        url = "https://example.gov.in/final"

        def raise_for_status(self):
            pass

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", lambda url, **kwargs: _Resp())

    result = fetch("https://example.gov.in/start", adapter_type="html")
    assert result.ok is True
    assert result.status_code == 200
    assert result.final_url == "https://example.gov.in/final"
    assert result.content_type == "text/html; charset=utf-8"
    assert result.etag == 'W/"abc"'
    assert result.last_modified == "Wed, 01 Jan 2026 00:00:00 GMT"
    assert result.content_hash and len(result.content_hash) == 64
    assert "hello world" in result.text


def test_fetch_html_propagates_http_error(monkeypatch):
    import httpx

    class _Resp:
        status_code = 503
        text = "Service Unavailable"
        url = "https://example.gov.in/err"
        headers = {}

        def raise_for_status(self):
            raise httpx.HTTPStatusError("503", request=None, response=self)

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", lambda url, **kwargs: _Resp())

    result = fetch("https://example.gov.in/err", adapter_type="html")
    assert result.ok is False
    assert result.status_code == 503
    assert result.error == "http_503"


def test_legacy_fetch_page_text_still_works(monkeypatch):
    class _Resp:
        status_code = 200
        text = "<html><body>x</body></html>"
        content = b"<html><body>x</body></html>"
        headers = {}
        url = "https://x"

        def raise_for_status(self):
            pass

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", lambda url, **kwargs: _Resp())
    assert fetch_page_text("https://x") == "x"


def test_legacy_fetch_page_text_returns_none_on_error(monkeypatch):
    def _boom(url, **kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", _boom)
    assert fetch_page_text("https://x") is None
    assert fetch_page_html("https://x") is None


# ── PR P2: conditional fetch / change detection ─────────────────────────────


def test_fetch_returns_not_modified_on_304(monkeypatch):
    class _Resp:
        status_code = 304
        text = ""
        content = b""
        url = "https://x"
        headers = {"etag": 'W/"abc"', "last-modified": "Wed, 01 Jan 2026 00:00:00 GMT"}

        def raise_for_status(self):  # would raise, but 304 path skips this
            raise AssertionError("raise_for_status should not be called on 304")

    captured: dict = {}

    def _get(url, headers, timeout, follow_redirects):
        captured.update(headers)
        return _Resp()

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", _get)

    result = fetch(
        "https://x",
        adapter_type="html",
        if_none_match='W/"abc"',
        if_modified_since="Wed, 01 Jan 2026 00:00:00 GMT",
    )
    assert result.ok is False
    assert result.status_code == 304
    assert result.error == "not_modified"
    # Conditional headers were actually sent.
    assert captured.get("If-None-Match") == 'W/"abc"'
    assert captured.get("If-Modified-Since") == "Wed, 01 Jan 2026 00:00:00 GMT"


def test_fetch_without_conditional_headers_does_not_set_them(monkeypatch):
    class _Resp:
        status_code = 200
        text = "<html></html>"
        content = b"<html></html>"
        url = "https://x"
        headers = {}

        def raise_for_status(self):
            pass

    captured: dict = {}

    def _get(url, headers, timeout, follow_redirects):
        captured.update(headers)
        return _Resp()

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", _get)
    fetch("https://x", adapter_type="html")
    assert "If-None-Match" not in captured
    assert "If-Modified-Since" not in captured


# ── PR P1 follow-up: RSS adapter ────────────────────────────────────────────


from app.scraping.fetcher import RssEntry, parse_rss_feed


_RSS_2_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>SSC Recruitment</title>
    <item>
      <title>SSC CGL 2026 Recruitment</title>
      <link>https://ssc.nic.in/cgl-2026</link>
      <description>Combined Graduate Level Examination 2026</description>
      <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>SSC CGL 2026 Admit Card</title>
      <link>https://ssc.nic.in/cgl-2026/admit-card</link>
      <description>Admit cards now available</description>
    </item>
  </channel>
</rss>
"""

_ATOM_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>UPSC Notices</title>
  <entry>
    <title>UPSC CSE 2026</title>
    <link href="https://upsc.gov.in/cse-2026" rel="alternate"/>
    <summary>Civil Services Examination 2026 notification</summary>
    <updated>2026-01-15T00:00:00Z</updated>
  </entry>
</feed>
"""


def test_parse_rss_2_returns_each_item():
    entries = parse_rss_feed(_RSS_2_SAMPLE)
    assert len(entries) == 2
    assert entries[0].title == "SSC CGL 2026 Recruitment"
    assert entries[0].link == "https://ssc.nic.in/cgl-2026"
    assert entries[0].summary.startswith("Combined Graduate")
    assert entries[0].published == "Mon, 01 Jan 2026 00:00:00 GMT"


def test_parse_atom_returns_entries_with_href_link():
    entries = parse_rss_feed(_ATOM_SAMPLE)
    assert len(entries) == 1
    assert entries[0].link == "https://upsc.gov.in/cse-2026"
    assert entries[0].published == "2026-01-15T00:00:00Z"


def test_parse_rss_empty_input():
    assert parse_rss_feed("") == []
    assert parse_rss_feed(None) == []


def test_parse_rss_malformed_xml_returns_empty():
    assert parse_rss_feed("<rss><not-valid") == []


# ── PR P1 follow-up: JSON-API adapter ───────────────────────────────────────


from app.scraping.fetcher import ApiEntry, parse_json_feed


_WORDPRESS_PAYLOAD = [
    {
        "id": 1,
        "date": "2026-01-01T00:00:00",
        "link": "https://upsc.gov.in/cse-2026",
        "title": {"rendered": "UPSC CSE 2026"},
        "excerpt": {"rendered": "Civil Services 2026"},
    },
    {
        "id": 2,
        "date": "2026-02-01T00:00:00",
        "link": "https://upsc.gov.in/cds-2026",
        "title": {"rendered": "UPSC CDS 2026"},
        "excerpt": {"rendered": "Combined Defence Services 2026"},
    },
]


def test_parse_json_feed_wordpress_shape():
    entries = parse_json_feed(_WORDPRESS_PAYLOAD)
    assert len(entries) == 2
    assert entries[0].title == "UPSC CSE 2026"
    assert entries[0].link == "https://upsc.gov.in/cse-2026"
    assert entries[0].summary == "Civil Services 2026"
    assert entries[0].published == "2026-01-01T00:00:00"


def test_parse_json_feed_with_entries_path():
    payload = {"meta": {"count": 2}, "data": {"items": _WORDPRESS_PAYLOAD}}
    entries = parse_json_feed(payload, adapter_config={"entries_path": "data.items"})
    assert len(entries) == 2


def test_parse_json_feed_custom_field_mapping():
    payload = [
        {"heading": "Custom title", "url": "https://x.gov.in/n", "blurb": "summary", "issued_on": "2026-03-01"},
    ]
    entries = parse_json_feed(
        payload,
        adapter_config={
            "title_field": "heading",
            "link_field": "url",
            "summary_field": "blurb",
            "date_field": "issued_on",
        },
    )
    assert entries == [ApiEntry(
        title="Custom title",
        link="https://x.gov.in/n",
        summary="summary",
        published="2026-03-01",
    )]


def test_parse_json_feed_picks_first_list_when_no_path_set():
    payload = {"meta": {}, "items": _WORDPRESS_PAYLOAD}
    entries = parse_json_feed(payload)
    assert len(entries) == 2


def test_parse_json_feed_skips_entries_without_link_or_title():
    payload = [{"unrelated": "value"}, _WORDPRESS_PAYLOAD[0]]
    entries = parse_json_feed(payload)
    assert len(entries) == 1


def test_parse_json_feed_empty_input():
    assert parse_json_feed(None) == []
    assert parse_json_feed({}) == []
    assert parse_json_feed("not a json object") == []


# ── PR P1 follow-up: PDF adapter ────────────────────────────────────────────


from app.scraping.fetcher import fetch_pdf, parse_pdf_bytes


def test_parse_pdf_bytes_empty_input():
    assert parse_pdf_bytes(b"") == ""
    assert parse_pdf_bytes(None) == ""


def test_parse_pdf_bytes_malformed_input_returns_empty():
    # Not a real PDF — pypdf raises; helper returns "" rather than propagating.
    assert parse_pdf_bytes(b"not a pdf") == ""


def test_fetch_pdf_returns_empty_url_error():
    result = fetch_pdf("")
    assert result.ok is False
    assert result.error == "empty_url"


def test_fetch_pdf_returns_empty_pdf_when_text_extraction_yields_nothing(monkeypatch):
    """A scanned PDF / image-only PDF extracts to empty string. fetch_pdf
    surfaces that as ok=False / error='empty_pdf' so the runner bumps
    typed source-failure detail instead of queueing a blank row."""
    class _Resp:
        status_code = 200
        content = b"%PDF-1.7\nfake\n%%EOF"
        text = ""
        url = "https://example.gov.in/bulletin.pdf"
        headers = {"content-type": "application/pdf"}
        def raise_for_status(self): pass

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", lambda *a, **k: _Resp())
    monkeypatch.setattr("app.scraping.fetcher.parse_pdf_bytes", lambda raw: "")
    result = fetch_pdf("https://example.gov.in/bulletin.pdf")
    assert result.ok is False
    assert result.error == "empty_pdf"
    assert result.content_hash and len(result.content_hash) == 64


def test_fetch_pdf_returns_extracted_text_on_success(monkeypatch):
    class _Resp:
        status_code = 200
        content = b"%PDF-1.7\nfake\n%%EOF"
        text = ""
        url = "https://example.gov.in/bulletin.pdf"
        headers = {"content-type": "application/pdf", "etag": '"v1"'}
        def raise_for_status(self): pass

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", lambda *a, **k: _Resp())
    monkeypatch.setattr(
        "app.scraping.fetcher.parse_pdf_bytes",
        lambda raw: "Notification: SSC CGL 2026. Apply online by 2026-02-15.",
    )
    result = fetch_pdf("https://example.gov.in/bulletin.pdf")
    assert result.ok is True
    assert result.status_code == 200
    assert result.content_type == "application/pdf"
    assert result.etag == '"v1"'
    assert "SSC CGL 2026" in result.text


def test_fetch_pdf_propagates_http_status_error(monkeypatch):
    import httpx as _httpx

    class _Resp:
        status_code = 404
        content = b""
        text = ""
        url = "https://example.gov.in/missing.pdf"
        headers = {}
        def raise_for_status(self):
            raise _httpx.HTTPStatusError("404", request=None, response=self)

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", lambda *a, **k: _Resp())
    result = fetch_pdf("https://example.gov.in/missing.pdf")
    assert result.ok is False
    assert result.status_code == 404
    assert result.error == "http_404"


# ── Conditional fetch for RSS / JSON-API ────────────────────────────────────


def test_fetch_rss_returns_not_modified_on_304(monkeypatch):
    from app.scraping.fetcher import fetch_rss

    captured: dict = {}

    class _Resp:
        status_code = 304
        content = b""
        text = ""
        url = "https://example.gov.in/feed.xml"
        headers = {"etag": 'W/"abc"'}
        def raise_for_status(self):
            raise AssertionError("304 path must not raise_for_status")

    def _get(url, headers, timeout, follow_redirects):
        captured.update(headers)
        return _Resp()

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", _get)
    result, entries = fetch_rss(
        "https://example.gov.in/feed.xml",
        if_none_match='W/"abc"',
        if_modified_since="Wed, 01 Jan 2026 00:00:00 GMT",
    )
    assert result.ok is False
    assert result.status_code == 304
    assert result.error == "not_modified"
    assert entries == []
    assert captured["If-None-Match"] == 'W/"abc"'
    assert captured["If-Modified-Since"] == "Wed, 01 Jan 2026 00:00:00 GMT"


def test_fetch_api_returns_not_modified_on_304(monkeypatch):
    from app.scraping.fetcher import fetch_api

    captured: dict = {}

    class _Resp:
        status_code = 304
        content = b""
        text = ""
        url = "https://example.gov.in/api"
        headers = {"etag": 'W/"def"'}
        def raise_for_status(self):
            raise AssertionError("304 path must not raise_for_status")

    def _get(url, headers, timeout, follow_redirects):
        captured.update(headers)
        return _Resp()

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", _get)
    result, entries = fetch_api(
        "https://example.gov.in/api",
        if_none_match='W/"def"',
    )
    assert result.ok is False
    assert result.status_code == 304
    assert result.error == "not_modified"
    assert entries == []
    assert captured["If-None-Match"] == 'W/"def"'


# ── Conditional fetch for PDF bulletins ─────────────────────────────────────


def test_fetch_pdf_returns_not_modified_on_304(monkeypatch):
    from app.scraping.fetcher import fetch_pdf

    captured: dict = {}

    class _Resp:
        status_code = 304
        content = b""
        text = ""
        url = "https://example.gov.in/bulletin.pdf"
        headers = {"etag": 'W/"pdf-1"'}
        def raise_for_status(self):
            raise AssertionError("304 must not raise_for_status")

    def _get(url, headers, timeout, follow_redirects):
        captured.update(headers)
        return _Resp()

    monkeypatch.setattr("app.scraping.fetcher.httpx.get", _get)
    result = fetch_pdf(
        "https://example.gov.in/bulletin.pdf",
        if_none_match='W/"pdf-1"',
    )
    assert result.ok is False
    assert result.status_code == 304
    assert result.error == "not_modified"
    assert captured["If-None-Match"] == 'W/"pdf-1"'


# ── Sitemap adapter ─────────────────────────────────────────────────────────


from app.scraping.fetcher import SitemapEntry, parse_sitemap


_URLSET_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ssc.nic.in/cgl-2026</loc>
    <lastmod>2026-01-01</lastmod>
  </url>
  <url>
    <loc>https://ssc.nic.in/chsl-2026</loc>
  </url>
</urlset>
"""

_INDEX_SAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://ssc.nic.in/sitemap-recruitments.xml</loc>
    <lastmod>2026-02-01</lastmod>
  </sitemap>
</sitemapindex>
"""


def test_parse_sitemap_urlset():
    entries = parse_sitemap(_URLSET_SAMPLE)
    assert len(entries) == 2
    assert entries[0] == SitemapEntry(loc="https://ssc.nic.in/cgl-2026", lastmod="2026-01-01")
    assert entries[1] == SitemapEntry(loc="https://ssc.nic.in/chsl-2026", lastmod=None)


def test_parse_sitemap_index_returns_inner_locs():
    entries = parse_sitemap(_INDEX_SAMPLE)
    assert entries == [SitemapEntry(loc="https://ssc.nic.in/sitemap-recruitments.xml", lastmod="2026-02-01")]


def test_parse_sitemap_empty_or_malformed():
    assert parse_sitemap("") == []
    assert parse_sitemap(None) == []
    assert parse_sitemap("<urlset><not-valid") == []


# ── PDF splitter ────────────────────────────────────────────────────────────


from app.scraping.fetcher import split_pdf_text


def test_split_pdf_text_no_regex_returns_single_chunk():
    assert split_pdf_text("body", regex=None) == ["body"]
    assert split_pdf_text("body", regex="") == ["body"]


def test_split_pdf_text_empty_input_returns_empty_list():
    assert split_pdf_text("", regex=r"^\d+\.") == []


def test_split_pdf_text_splits_on_match_and_keeps_match_in_chunk():
    body = "Notification No. 12/2026\nDetails...\nNotification No. 13/2026\nMore details..."
    chunks = split_pdf_text(body, regex=r"^Notification No\.")
    assert len(chunks) == 2
    assert chunks[0].startswith("Notification No. 12/2026")
    assert chunks[1].startswith("Notification No. 13/2026")


def test_split_pdf_text_invalid_regex_returns_single_chunk():
    # ``[`` is an unterminated character class.
    chunks = split_pdf_text("any body text", regex="[")
    assert chunks == ["any body text"]


def test_split_pdf_text_no_matches_returns_single_chunk():
    chunks = split_pdf_text("plain text without any boundary marker", regex=r"^\d+\.")
    assert chunks == ["plain text without any boundary marker"]
