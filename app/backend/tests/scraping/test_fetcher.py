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
