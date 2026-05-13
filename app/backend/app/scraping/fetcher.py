"""Network fetch boundary for the scraper.

Phase 4 of the scraper audit pulled the HTTP fetch primitives out of
``extractor.py`` so that:

* extraction stays focused on parsing/AI calls
* the runner can use a structured ``FetchResult`` (status, final URL,
  content hash, etc.) instead of just a bare string
* non-HTML adapters (RSS, JSON API, PDF) get a single dispatch point.
  Real implementations land in a follow-up PR; this module returns
  ``adapter_not_implemented`` for those so the runner logs a clear
  reason instead of silently passing the raw bytes to the HTML
  extractor.
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Final

import httpx


logger = logging.getLogger("career_copilot.scraping.fetcher")


_DEFAULT_HEADERS: Final[dict[str, str]] = {
    "User-Agent": "Mozilla/5.0 (compatible; CareerCopilot-Scraper/1.0; +https://careercopilot.in/bot)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}


@dataclass
class FetchResult:
    ok: bool
    url: str
    status_code: int | None = None
    final_url: str | None = None
    content_type: str | None = None
    etag: str | None = None
    last_modified: str | None = None
    content_hash: str | None = None
    text: str | None = None
    raw_bytes: bytes | None = None
    error: str | None = None


def fetch(
    url: str,
    *,
    adapter_type: str | None = None,
    timeout: float = 15.0,
    if_none_match: str | None = None,
    if_modified_since: str | None = None,
) -> FetchResult:
    """Fetch ``url`` and return a structured result.

    ``adapter_type`` routes to the right parser when supported.
    Non-HTML adapters still scaffold to ``adapter_not_implemented``.

    Conditional fetch: pass ``if_none_match`` (an ETag value) and/or
    ``if_modified_since`` (an HTTP-date string) to send the standard
    ``If-None-Match`` / ``If-Modified-Since`` request headers. When the
    server returns ``304 Not Modified`` the result is ``ok=False`` with
    ``error="not_modified"`` and ``status_code=304`` — the runner uses
    that to skip extraction for unchanged pages.
    """
    if not url:
        return FetchResult(ok=False, url="", error="empty_url")

    adapter = (adapter_type or "html").lower()
    if adapter in {"rss", "api", "pdf"}:
        return FetchResult(ok=False, url=url, error="adapter_not_implemented")

    return _fetch_html(
        url,
        timeout=timeout,
        if_none_match=if_none_match,
        if_modified_since=if_modified_since,
    )


def _fetch_html(
    url: str,
    *,
    timeout: float,
    if_none_match: str | None = None,
    if_modified_since: str | None = None,
) -> FetchResult:
    headers = dict(_DEFAULT_HEADERS)
    if if_none_match:
        headers["If-None-Match"] = if_none_match
    if if_modified_since:
        headers["If-Modified-Since"] = if_modified_since

    try:
        resp = httpx.get(url, headers=headers, timeout=timeout, follow_redirects=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[fetcher] request failed url=%s error=%s", url, exc)
        return FetchResult(ok=False, url=url, error=str(exc))

    # 304 Not Modified short-circuit: the server confirms our cached
    # copy is still current. Skip body parsing and let the runner reuse
    # the existing notification_documents row.
    if resp.status_code == 304:
        return FetchResult(
            ok=False,
            url=url,
            status_code=304,
            final_url=str(resp.url),
            etag=resp.headers.get("etag") or if_none_match,
            last_modified=resp.headers.get("last-modified") or if_modified_since,
            error="not_modified",
        )

    try:
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[fetcher] http error url=%s status=%s error=%s", url, resp.status_code, exc)
        return FetchResult(
            ok=False,
            url=url,
            status_code=resp.status_code,
            final_url=str(resp.url),
            error=f"http_{resp.status_code}",
        )

    raw_bytes = resp.content
    content_hash = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes else None
    text = _strip_html(resp.text) if resp.text else ""
    return FetchResult(
        ok=True,
        url=url,
        status_code=resp.status_code,
        final_url=str(resp.url),
        content_type=resp.headers.get("content-type"),
        etag=resp.headers.get("etag"),
        last_modified=resp.headers.get("last-modified"),
        content_hash=content_hash,
        text=text,
        raw_bytes=raw_bytes,
    )


def strip_html(html: str) -> str:
    """Public alias of the HTML→plain-text reducer used inside fetch().

    Exposed so callers that already have raw HTML in hand (the aggregator
    runner fetches HTML once for the resolver and reuses the stripped
    text for extraction) don't have to round-trip through ``fetch()``.
    """
    return _strip_html(html)


def _strip_html(html: str) -> str:
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
    )
    return re.sub(r"\s{2,}", " ", text).strip()


# ─── Backward-compatible thin wrappers ──────────────────────────────────────
#
# ``extractor.fetch_page_text`` and ``extractor.fetch_page_html`` are the
# previous public API. They live here now; ``extractor.py`` re-exports them
# so the existing callers keep working while we migrate the runner over to
# ``fetch()`` and ``FetchResult``.


def fetch_page_text(url: str, *, timeout: float = 15.0) -> str | None:
    result = _fetch_html(url, timeout=timeout)
    return result.text if result.ok else None


def fetch_page_html(url: str, *, timeout: float = 15.0) -> str | None:
    """Return the raw HTML body. Used by the aggregator listing discoverer."""
    if not url:
        return None
    try:
        resp = httpx.get(url, headers=_DEFAULT_HEADERS, timeout=timeout, follow_redirects=True)
        resp.raise_for_status()
        return resp.text
    except Exception as exc:  # noqa: BLE001
        logger.warning("[fetcher] failed %s: %s", url, exc)
        return None


# ─── RSS / Atom adapter ─────────────────────────────────────────────────────


@dataclass
class RssEntry:
    title: str
    link: str
    summary: str = ""
    published: str | None = None  # ISO-ish date string when parseable


def parse_rss_feed(xml_text: str | None) -> list[RssEntry]:
    """Parse an RSS 2.0 or Atom feed into a flat list of entries.

    Uses stdlib ``xml.etree`` so we don't pull in feedparser just for two
    feed shapes. Both ``<rss><channel><item>`` and ``<feed><entry>`` are
    accepted; namespaced Atom tags are stripped before tag-name compare.
    Malformed XML returns ``[]`` rather than raising — the runner treats
    that as an empty feed and bumps source failure.
    """
    if not xml_text:
        return []
    try:
        import xml.etree.ElementTree as ET  # local import keeps cold path cheap
        root = ET.fromstring(xml_text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[fetcher] rss parse failed: %s", exc)
        return []

    def _localname(tag: str) -> str:
        return tag.rsplit("}", 1)[-1] if "}" in tag else tag

    def _text_of(node, tag: str) -> str:
        for child in node:
            if _localname(child.tag) == tag:
                return (child.text or "").strip()
        return ""

    def _link_of(node) -> str:
        # RSS: <link>url</link>. Atom: <link href="url" rel="alternate"/>.
        for child in node:
            if _localname(child.tag) != "link":
                continue
            if child.text and child.text.strip():
                return child.text.strip()
            href = child.attrib.get("href")
            if href and child.attrib.get("rel", "alternate") == "alternate":
                return href.strip()
        return ""

    entries: list[RssEntry] = []
    # RSS 2.0
    for item in root.iter():
        if _localname(item.tag) not in {"item", "entry"}:
            continue
        title = _text_of(item, "title")
        link = _link_of(item)
        summary = _text_of(item, "description") or _text_of(item, "summary") or _text_of(item, "content")
        published = _text_of(item, "pubDate") or _text_of(item, "published") or _text_of(item, "updated") or None
        if not link and not title:
            continue
        entries.append(RssEntry(
            title=title,
            link=link,
            summary=summary,
            published=published or None,
        ))
    return entries


def fetch_rss(url: str, *, timeout: float = 15.0) -> tuple[FetchResult, list[RssEntry]]:
    """Fetch an RSS / Atom feed and return both the raw FetchResult and
    the parsed entries.

    The FetchResult's ``text`` is the raw XML body (not stripped) so
    callers that want the underlying document for hashing /
    notification_documents storage still get it. Entries come back as a
    list — empty when parsing fails.
    """
    if not url:
        return FetchResult(ok=False, url="", error="empty_url"), []

    try:
        resp = httpx.get(url, headers=_DEFAULT_HEADERS, timeout=timeout, follow_redirects=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[fetcher] rss request failed url=%s error=%s", url, exc)
        return FetchResult(ok=False, url=url, error=str(exc)), []

    try:
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[fetcher] rss http error url=%s status=%s error=%s", url, resp.status_code, exc)
        return FetchResult(
            ok=False,
            url=url,
            status_code=resp.status_code,
            final_url=str(resp.url),
            error=f"http_{resp.status_code}",
        ), []

    raw_bytes = resp.content
    content_hash = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes else None
    xml_text = resp.text or ""
    result = FetchResult(
        ok=True,
        url=url,
        status_code=resp.status_code,
        final_url=str(resp.url),
        content_type=resp.headers.get("content-type"),
        etag=resp.headers.get("etag"),
        last_modified=resp.headers.get("last-modified"),
        content_hash=content_hash,
        text=xml_text,
        raw_bytes=raw_bytes,
    )
    entries = parse_rss_feed(xml_text)
    return result, entries
