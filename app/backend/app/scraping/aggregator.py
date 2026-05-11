from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse

from .sources import ScrapeSource


_ANCHOR_RE = re.compile(r"<a\b[^>]*?href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_DETAIL_HINTS = (
    "recruitment",
    "vacancy",
    "apply-online",
    "online-form",
    "notification",
    "jobs",
)
_LISTING_HINTS = (
    "government-jobs",
    "state-government-jobs",
    "bank-jobs",
    "railway-jobs",
    "engineering-jobs",
    "teaching-faculty-jobs",
    "police-defence-jobs",
    "exam-results",
    "eligibility",
    "syllabus",
    "exam-pattern",
    "admit-card",
)
_BAD_SCHEMES = ("mailto:", "tel:", "javascript:")


def is_aggregator_source(row: dict[str, Any]) -> bool:
    source_type = str(row.get("source_type") or "").lower()
    category = str(row.get("category") or "").lower()
    return bool(
        source_type == "aggregator"
        or row.get("discovery_only") is True
        or row.get("requires_official_confirmation") is True
        or "aggregator" in category
    )


def aggregator_max_items(row: dict[str, Any], default: int = 25) -> int:
    parser_config = row.get("parser_config") if isinstance(row.get("parser_config"), dict) else {}
    scrape_config = row.get("scrape_config") if isinstance(row.get("scrape_config"), dict) else {}
    value = (
        scrape_config.get("max_items_per_run")
        or parser_config.get("max_items")
        or parser_config.get("max_detail_pages")
        or default
    )
    try:
        return max(1, min(int(value), 100))
    except Exception:
        return default


def mock_aggregator_detail_urls(source: ScrapeSource, count: int = 3) -> list[str]:
    base = source.target_url.rstrip("/") or "mock://aggregator"
    return [f"{base}/mock-recruitment-{idx + 1}/" for idx in range(count)]


def discover_aggregator_detail_urls(html_text: str, base_url: str, *, max_items: int = 25) -> list[str]:
    base_host = _host(base_url)
    seen: set[str] = set()
    urls: list[str] = []

    for href, label_html in _ANCHOR_RE.findall(html_text or ""):
        href = html.unescape(href or "").strip()
        if not href or href.lower().startswith(_BAD_SCHEMES):
            continue
        absolute = urldefrag(urljoin(base_url, href))[0]
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        if base_host and _host(absolute) != base_host:
            continue

        label = _clean_label(label_html)
        if not _looks_like_detail(absolute, label):
            continue
        if absolute in seen:
            continue

        seen.add(absolute)
        urls.append(absolute)
        if len(urls) >= max_items:
            break

    return urls


def _clean_label(label_html: str) -> str:
    text = _TAG_RE.sub(" ", label_html or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip().lower()


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _looks_like_detail(url: str, label: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path.lower().strip("/")
    if not path or path in {"government-jobs", "sarkari-naukri", "sarkarijob"}:
        return False
    if any(hint in path for hint in _LISTING_HINTS) and not any(hint in path for hint in {"recruitment", "vacancy"}):
        return False

    haystack = f"{path} {label}".lower()
    if not any(hint in haystack for hint in _DETAIL_HINTS):
        return False
    if len(label) < 4 and not any(hint in path for hint in _DETAIL_HINTS):
        return False
    return True
