"""Typed runtime view of ``source_registry`` rows.

Background — the original ``ScrapeSource`` collapsed every URL on a
``source_registry`` row into one ``base_url`` and one ``notification_path``.
That hid the difference between an aggregator's listing page, an official
source's notification page, an RSS feed, an API endpoint, and a PDF bulletin.
The fetch path then had to guess; it usually guessed wrong on non-HTML
adapters.

This module replaces the lossy adapter with a typed dataclass that mirrors
the columns added by migrations 022 (``official_url``, ``notification_url``,
``rss_url``, ``api_url``, ``pdf_bulletin_url``, ``adapter_type``) and 028
(``source_type`` policy). ``primary_fetch_url`` selects the right URL for
the source's adapter so the runner never has to inspect raw rows.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin


_AGGREGATOR_SOURCE_TYPES = frozenset({"aggregator"})


@dataclass
class ScrapeSource:
    id: str
    name: str

    crawl_url: str | None = None
    official_url: str | None = None
    notification_url: str | None = None
    rss_url: str | None = None
    api_url: str | None = None
    pdf_bulletin_url: str | None = None

    source_type: str | None = None
    adapter_type: str | None = None

    is_official_source: bool = False
    discovery_only: bool = False
    requires_official_confirmation: bool = False

    adapter_config: dict[str, Any] = field(default_factory=dict)
    scrape_config: dict[str, Any] = field(default_factory=dict)
    parser_config: dict[str, Any] = field(default_factory=dict)

    def primary_fetch_url(self) -> str | None:
        """Pick the URL the runner should fetch for this source.

        Returns ``None`` when no usable URL is configured for the adapter —
        the runner treats that as ``source_config_invalid`` rather than
        attempting a silent empty fetch.
        """
        adapter = (self.adapter_type or "").lower()
        if adapter == "rss":
            return self.rss_url or None
        if adapter == "api":
            return self.api_url or None
        if adapter == "pdf":
            return self.pdf_bulletin_url or None

        # HTML / aggregator path. Aggregators advertise their listing page
        # under ``crawl_url`` (legacy ``source_url``); the discovery layer
        # then walks that to find detail pages. Direct/official sources put
        # the actual notice at ``notification_url``.
        if self.discovery_only or (self.source_type or "").lower() in _AGGREGATOR_SOURCE_TYPES:
            return self.crawl_url or self.notification_url or self.official_url or None
        return self.notification_url or self.crawl_url or self.official_url or None

    @property
    def target_url(self) -> str:
        """Back-compat alias for callers that don't yet handle ``None``.

        New code should use ``primary_fetch_url()`` directly and route the
        ``None`` case through ``source_config_invalid`` logging.
        """
        return self.primary_fetch_url() or ""

    @property
    def is_aggregator(self) -> bool:
        return self.discovery_only or (self.source_type or "").lower() in _AGGREGATOR_SOURCE_TYPES


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_bool(value: Any) -> bool:
    return bool(value) if value is not None else False


def _as_str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    return raw or None


def normalize_source_registry(row: dict[str, Any]) -> ScrapeSource:
    """Build a :class:`ScrapeSource` from a ``source_registry`` row.

    Reads every typed URL column added by migration 022 and the policy
    flags added by migrations 022 / 028, so the runtime never has to fall
    back to a single ``base_url`` heuristic.
    """
    return ScrapeSource(
        id=str(row.get("id") or ""),
        name=str(row.get("source_name") or row.get("name") or row.get("source_url") or ""),
        crawl_url=_as_str_or_none(row.get("crawl_url") or row.get("source_url") or row.get("base_url")),
        official_url=_as_str_or_none(row.get("official_url")),
        notification_url=_as_str_or_none(row.get("notification_url")),
        rss_url=_as_str_or_none(row.get("rss_url")),
        api_url=_as_str_or_none(row.get("api_url")),
        pdf_bulletin_url=_as_str_or_none(row.get("pdf_bulletin_url")),
        source_type=_as_str_or_none(row.get("source_type")),
        adapter_type=_as_str_or_none(row.get("adapter_type")),
        is_official_source=_as_bool(row.get("is_official_source")),
        discovery_only=_as_bool(row.get("discovery_only")),
        requires_official_confirmation=_as_bool(row.get("requires_official_confirmation")),
        adapter_config=_as_dict(row.get("adapter_config")),
        scrape_config=_as_dict(row.get("scrape_config")),
        parser_config=_as_dict(row.get("parser_config")),
    )


def normalize_legacy_source(row: dict[str, Any]) -> ScrapeSource:
    """Adapter for the deprecated ``scrape_sources`` table.

    Kept for tests and any one-off importer that still reads the legacy
    table. Runtime callers should use :func:`normalize_source_registry`.
    """
    base = str(row.get("base_url") or "")
    path = str(row.get("notification_path") or "")
    crawl_url: str | None
    if path:
        crawl_url = urljoin(base, path) if base else path
    else:
        crawl_url = base or None
    return ScrapeSource(
        id=str(row.get("id") or ""),
        name=str(row.get("name") or ""),
        crawl_url=crawl_url,
    )
