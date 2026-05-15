from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
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


# ─── Lifecycle event classification ────────────────────────────────────────
#
# Aggregator listings mix new recruitment announcements with admit cards,
# results, corrigenda, and date extensions. The runner needs to skip the
# non-recruitment ones rather than route them through the recruitment
# extractor — that's how "admit_card" links used to get queued as recruitments.

_LIFECYCLE_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("admit_card", ("admit-card", "admit card", "hall ticket", "hall-ticket", "call letter")),
    ("result", ("result", "score card", "score-card", "merit list", "merit-list", "final selection")),
    ("answer_key", ("answer key", "answer-key")),
    ("corrigendum", ("corrigendum", "addendum", "errata")),
    ("date_extended", ("date extended", "date-extended", "extension of last date", "last date extended", "deadline extended")),
    ("syllabus", ("syllabus", "exam pattern", "exam-pattern")),
    ("interview_schedule", ("interview schedule", "interview-schedule", "interview date")),
    ("notification_revised", ("revised notification", "revised vacancy")),
)


def classify_aggregator_link(label: str | None, url: str | None) -> str:
    """Return a lifecycle event type for a discovered aggregator link.

    Returns ``"new_recruitment"`` when no lifecycle marker is present so
    the caller still routes the link through extraction. Lifecycle events
    flow into ``recruitment_events`` rather than ``scrape_queue`` once a
    follow-up PR wires that up.
    """
    haystack = f"{(label or '').lower()} {(url or '').lower()}"
    for event_type, patterns in _LIFECYCLE_PATTERNS:
        for needle in patterns:
            if needle in haystack:
                return event_type
    return "new_recruitment"


def is_aggregator_source(row: dict[str, Any]) -> bool:
    """Decide whether a source should run the discovery (listing→detail) path.

    The decision is parsing-only: ``source_type='aggregator'``,
    ``discovery_only=True``, or a category that includes "aggregator".

    ``requires_official_confirmation`` used to live here too, but that
    flag is a *trust* policy (do queue rows need verified evidence
    before promotion?), not a parsing policy. PR 1 routed the trust
    decision through the promotion gate; this PR keeps the parsing
    decision pure so an official source that happens to require
    confirmation isn't accidentally crawled like an aggregator.
    """
    source_type = str(row.get("source_type") or "").lower()
    category = str(row.get("category") or "").lower()
    return bool(
        source_type == "aggregator"
        or row.get("discovery_only") is True
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
    base = (source.primary_fetch_url() or "").rstrip("/") or "mock://aggregator"
    return [f"{base}/mock-recruitment-{idx + 1}/" for idx in range(count)]


@dataclass
class DiscoveredLink:
    url: str
    label: str
    event_type: str  # see ``classify_aggregator_link``


@dataclass
class DiscoveryResult:
    """Structured return shape for aggregator listing discovery.

    Replaces the previous pattern of mutating a function attribute
    (``discover_aggregator_detail_urls.last_stats``), which was unsafe
    under concurrent scrapes and awkward to test.
    """
    urls: list[str] = field(default_factory=list)
    links: list[DiscoveredLink] = field(default_factory=list)
    # Lifecycle events (admit_card / result / corrigendum / ...) that the
    # caller filtered out of ``links``. Surfacing them here lets the
    # runner persist them into ``recruitment_events`` instead of just
    # dropping them on the floor.
    lifecycle_links: list[DiscoveredLink] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=lambda: {
        "discovered": 0, "domain": 0, "include": 0, "exclude": 0, "lifecycle_skipped": 0,
    })


def discover_aggregator_detail_urls(
    html_text: str,
    base_url: str,
    *,
    max_items: int = 25,
    include_patterns: list[str] | None = None,
    exclude_patterns: list[str] | None = None,
    allowed_domains: list[str] | None = None,
    skip_lifecycle_events: bool = True,
) -> DiscoveryResult:
    """Walk an aggregator listing and return the recruitment-detail links.

    ``skip_lifecycle_events`` filters out admit_card / result /
    corrigendum / date_extended / etc. links so they don't get routed
    through the recruitment extractor. The classification is attached to
    every returned link (including ``new_recruitment``) so a future
    follow-up can persist lifecycle events into ``recruitment_events``.
    """
    base_host = _host(base_url)
    include = _normalise_patterns(include_patterns)
    exclude = _normalise_patterns(exclude_patterns)
    allowed = {_normalise_host(x) for x in (allowed_domains or []) if _normalise_host(x)}
    seen: set[str] = set()
    result = DiscoveryResult()

    for href, label_html in _ANCHOR_RE.findall(html_text or ""):
        href = html.unescape(href or "").strip()
        if not href or href.lower().startswith(_BAD_SCHEMES):
            continue
        absolute = urldefrag(urljoin(base_url, href))[0]
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        # Cloudflare's scrape-shield rewrites some links into
        # ``/cdn-cgi/content?...`` (and ``/cdn-cgi/l/email-protection``)
        # decoys that resolve to the same content but with an unstable,
        # opaque URL. Queueing those breaks evidence traceability,
        # poisons URL-based dedup, and makes admin re-fetch impossible.
        # Drop them at discovery — the real anchor for the same notice
        # is almost always present elsewhere on the listing.
        if parsed.path.startswith("/cdn-cgi/"):
            result.stats["cloudflare_filtered"] = result.stats.get("cloudflare_filtered", 0) + 1
            continue
        target_host = _host(absolute)
        if allowed:
            if target_host not in allowed:
                result.stats["domain"] += 1
                continue
        elif base_host and target_host != base_host:
            result.stats["domain"] += 1
            continue

        label = _clean_label(label_html)
        haystack = f"{absolute} {label}".lower()

        # Lifecycle classification runs before the detail/listing heuristics
        # so non-recruitment events (admit_card, result, corrigendum, ...)
        # land in lifecycle_skipped instead of being silently dropped by the
        # generic include filter.
        event_type = classify_aggregator_link(label, absolute)
        if skip_lifecycle_events and event_type != "new_recruitment":
            result.stats["lifecycle_skipped"] += 1
            # Retain the link so the runner can persist a
            # ``recruitment_events`` row instead of losing the signal.
            result.lifecycle_links.append(
                DiscoveredLink(url=absolute, label=label, event_type=event_type)
            )
            continue

        if include:
            if not _matches_any(haystack, include):
                result.stats["include"] += 1
                continue
        elif not _looks_like_detail(absolute, label) and event_type == "new_recruitment":
            result.stats["include"] += 1
            continue
        if exclude and _matches_any(haystack, exclude):
            result.stats["exclude"] += 1
            continue
        if absolute in seen:
            continue

        seen.add(absolute)
        result.urls.append(absolute)
        result.links.append(DiscoveredLink(url=absolute, label=label, event_type=event_type))
        if len(result.urls) >= max_items:
            break

    result.stats["discovered"] = len(result.urls)
    return result


def _clean_label(label_html: str) -> str:
    text = _TAG_RE.sub(" ", label_html or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip().lower()


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _normalise_host(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    return _host(raw)


def _normalise_patterns(patterns: list[str] | None) -> list[str]:
    return [str(p).strip().lower() for p in (patterns or []) if str(p).strip()]


def _matches_any(value: str, patterns: list[str]) -> bool:
    return any(pattern in value for pattern in patterns)


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
