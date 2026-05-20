"""Tests for the dedup URL normaliser (Task 2)."""
from __future__ import annotations

import pytest

from app.scraping._url_normalize import normalize_url


def test_scheme_host_case_and_http_https_equivalence():
    assert normalize_url("http://Example.com/foo/") == normalize_url("https://example.com/foo")
    assert normalize_url("http://Example.com/foo/") == "https://example.com/foo"


def test_www_strip_and_query_sort_and_empty_drop():
    assert normalize_url("https://www.x.com/?b=2&a=1") == normalize_url("https://x.com/?a=1&b=2")
    # empty-valued params dropped
    assert normalize_url("https://x.com/p?a=1&c=") == "https://x.com/p?a=1"


def test_fragment_dropped():
    assert normalize_url("https://x.com/path#frag") == "https://x.com/path"


def test_root_trailing_slash_preserved():
    assert normalize_url("https://x.com/") == "https://x.com/"
    # non-root trailing slash trimmed
    assert normalize_url("https://x.com/a/") == "https://x.com/a"


def test_default_ports_stripped_nondefault_kept():
    assert normalize_url("http://x.com:80/p") == "https://x.com/p"
    assert normalize_url("https://x.com:443/p") == "https://x.com/p"
    assert normalize_url("https://x.com:8443/p") == "https://x.com:8443/p"


def test_percent_decoding():
    # %2F decodes to / (safe decode)
    assert normalize_url("https://x.com/a%2Fb") == "https://x.com/a/b"


def test_path_case_preserved():
    assert normalize_url("https://x.com/CamelCasePath") == "https://x.com/CamelCasePath"


@pytest.mark.parametrize("bad", [None, "", "   ", "not a url", "ftp://x.com/a", "mailto:a@b.com", 123])
def test_unparseable_returns_empty(bad):
    assert normalize_url(bad) == ""


def test_query_only_no_path():
    assert normalize_url("https://x.com?z=9&a=1") == "https://x.com?a=1&z=9"
