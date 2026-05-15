"""Official-source resolver for aggregator-discovered detail pages.

The scraping audit's P0 architectural gap: aggregators (Free Job Alert,
Sarkari Naukri, etc.) are *discovery* sources. Their detail pages
paraphrase the actual notification, link to coaching PDFs, and serve
ad-injected HTML. The runner used to extract directly from those pages
and mark the queue row ``official_source_resolved=False`` for admin
review.

The resolver tries to upgrade an aggregator detail page to a real
official source URL **before** extraction. Two signals, in order:

1. Outbound anchors in the detail HTML pointing at a government domain
   (``.gov.in`` / ``.nic.in`` / ``.ac.in`` for educational bodies /
   ``.edu.in``). The longest path-deep anchor wins, since
   ``ssc.nic.in/recruitment/2026-cgl.pdf`` is more specific than the
   site's homepage.
2. If the source registry row carries an ``official_url`` host that
   matches any outbound anchor's host, prefer that anchor regardless of
   path depth.

Returns ``ResolverResult(official_url, host, reason)`` or ``None`` when
no official link is recoverable from the page. ``None`` means the
runner falls back to the existing aggregator-extraction path with
``official_source_resolved=False`` — i.e. the current behaviour stays as
a strict subset of the new flow.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urldefrag, urljoin, urlparse

from .sources import ScrapeSource


_ANCHOR_RE = re.compile(
    r"<a\b[^>]*?href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")

_OFFICIAL_TLDS: tuple[str, ...] = (".gov.in", ".nic.in", ".ac.in", ".edu.in")
_OFFICIAL_HINT_TLDS: tuple[str, ...] = (".gov", ".gov.bd", ".gov.lk")
_BAD_SCHEMES = ("mailto:", "tel:", "javascript:")


@dataclass
class ResolverResult:
    official_url: str
    host: str
    reason: str  # "registry_host_match" | "gov_anchor"
    matched_anchor_text: str | None = None


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _looks_official(host: str) -> bool:
    return any(host.endswith(tld) for tld in (*_OFFICIAL_TLDS, *_OFFICIAL_HINT_TLDS))


def _strip_label(label_html: str) -> str:
    cleaned = _TAG_RE.sub(" ", label_html or "")
    return re.sub(r"\s+", " ", html.unescape(cleaned)).strip()


def _path_depth(url: str) -> int:
    return len([p for p in urlparse(url).path.split("/") if p])


def _iter_anchors(detail_html: str, base_url: str) -> Iterable[tuple[str, str]]:
    for href, label_html in _ANCHOR_RE.findall(detail_html or ""):
        href = html.unescape(href or "").strip()
        if not href or href.lower().startswith(_BAD_SCHEMES):
            continue
        absolute = urldefrag(urljoin(base_url, href))[0]
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        yield absolute, _strip_label(label_html)


def resolve_official_source(
    detail_html: str | None,
    detail_url: str,
    source: ScrapeSource,
) -> ResolverResult | None:
    """Pick the official-source URL referenced by an aggregator detail page.

    Returns ``None`` when no candidate is found (caller falls back to
    extracting from the aggregator page with
    ``official_source_resolved=False``).
    """
    if not detail_html:
        return None

    registry_host = _host(source.official_url or "")
    gov_anchors: list[tuple[str, str, str]] = []  # (url, host, label)
    registry_match: tuple[str, str, str] | None = None

    for absolute, label in _iter_anchors(detail_html, detail_url):
        anchor_host = _host(absolute)
        if not anchor_host:
            continue
        if registry_host and anchor_host == registry_host:
            registry_match = (absolute, anchor_host, label)
            break
        if _looks_official(anchor_host):
            gov_anchors.append((absolute, anchor_host, label))

    if registry_match:
        url, host, label = registry_match
        return ResolverResult(
            official_url=url,
            host=host,
            reason="registry_host_match",
            matched_anchor_text=label or None,
        )

    if not gov_anchors:
        return None

    # Pick the deepest-path anchor: a specific notice PDF beats the
    # organisation's homepage.
    best = max(gov_anchors, key=lambda item: _path_depth(item[0]))
    url, host, label = best
    return ResolverResult(
        official_url=url,
        host=host,
        reason="gov_anchor",
        matched_anchor_text=label or None,
    )


# ─── Resolver registry ──────────────────────────────────────────────────────
#
# Generic gov-anchor heuristic gets us a long way, but some aggregator
# layouts hide the official URL in a Wordpress-style "Apply Online"
# button rendered as a non-anchor element, or in a sidebar widget whose
# href is the official site's homepage. Per-source resolvers slot into
# this registry. The runner walks them in order and stops at the first
# match. The generic heuristic stays as the final fallback.

ResolverCallable = "Callable[[str | None, str, ScrapeSource], ResolverResult | None]"


from typing import Callable  # noqa: E402  (kept near the registry it serves)


def _wordpress_apply_online_resolver(
    detail_html: str | None,
    detail_url: str,
    source: ScrapeSource,
) -> ResolverResult | None:
    """WordPress-style aggregators (Free Job Alert, Sarkari Result clones)
    almost always wrap the official application link in an anchor whose
    visible text is some variant of "Apply Online" / "Official Notice" /
    "Notification PDF". We look for those labels first; if they point at
    a government host we return immediately.
    """
    if not detail_html:
        return None
    label_hints = (
        "apply online",
        "apply here",
        "official notice",
        "official notification",
        "notification pdf",
        "download notification",
        "official website",
    )
    for absolute, label in _iter_anchors(detail_html, detail_url):
        label_lower = label.lower()
        if not any(hint in label_lower for hint in label_hints):
            continue
        host = _host(absolute)
        if not host:
            continue
        if _looks_official(host):
            return ResolverResult(
                official_url=absolute,
                host=host,
                reason="wordpress_apply_button",
                matched_anchor_text=label or None,
            )
    return None


# Insert source-specific resolvers above the generic fallback. Order is
# significant: more specific patterns first.
RESOLVER_REGISTRY: list[Callable[[str | None, str, ScrapeSource], ResolverResult | None]] = [
    _wordpress_apply_online_resolver,
    resolve_official_source,
]


def resolve_with_registry(
    detail_html: str | None,
    detail_url: str,
    source: ScrapeSource,
    *,
    registry: list[Callable[[str | None, str, ScrapeSource], ResolverResult | None]] | None = None,
) -> ResolverResult | None:
    """Walk the resolver chain and return the first match.

    Tests can pass a custom ``registry`` to assert ordering / fallback.
    """
    chain = registry if registry is not None else RESOLVER_REGISTRY
    for fn in chain:
        result = fn(detail_html, detail_url, source)
        if result is not None:
            return result
    return None
