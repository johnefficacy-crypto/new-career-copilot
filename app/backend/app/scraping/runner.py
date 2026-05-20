"""Scrape pass runner + queue→canonical promoter.

Direct port of ``UI-career-copilot/lib/scraping/runner.ts``.

Behaviour parity:
    * Always inserts new items with ``status='pending'`` (May 2026
      "never auto-approve" hardening).
    * Dedupes on ``computeSimilarityKey`` + existing recruitments and
      not-yet-decided queue rows.
    * Updates ``source_registry.last_scraped_at`` / ``last_success_at`` /
      ``consecutive_fails`` on success / failure.
    * Persists a final ``scrape_runs`` row with ``items_found / items_new /
      items_duplicate / error_log``.

Schema notes:
    * ``source_registry`` is the canonical runtime/admin source table.
      ``scrape_sources`` is legacy adapter storage and is not read here.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from .extractor import (
    PROMPT_VERSION,
    canonical_key_invalid,
    compute_similarity_key,
    extract_recruitment_data,
    fetch_page_html,
    fetch_page_text,
)
from .fetcher import FetchResult, fetch, strip_html
from .dedup import find_duplicate, normalize_url as _norm_url_for_dedup
from .normalizer import normalize_recruitment
from .promotion_gate import evaluate_promotion_gate
from .resolver import ResolverResult, resolve_with_registry
from .sources import normalize_source_registry
from .aggregator import (
    aggregator_max_items,
    discover_aggregator_detail_urls,
    is_aggregator_source,
    mock_aggregator_detail_urls,
)
from app.common.strings import slugify
from app.common.time import utc_now_iso
from app.core.errors import PromotionError
from app.db.utils import execute_or_default, execute_or_raise

from .schemas import ExtractedRecruitment, VerifiedRecruitmentForPromotion, to_json_safe

logger = logging.getLogger("career_copilot.scraping.runner")


class DuplicatePromotionError(PromotionError):
    def __init__(self, *, existing_recruitment_id: str, slug: str):
        super().__init__("Recruitment already exists")
        self.existing_recruitment_id = existing_recruitment_id
        self.slug = slug


class OpenConflictPromotionError(PromotionError):
    """Raised when a queue item has unresolved consensus conflicts.

    Carries the list of conflicting ``field_key`` values so the API
    layer can surface them through the same ``unverified_fields``
    contract the frontend already reads via ``getApiUnverifiedFields``.
    """

    def __init__(self, *, queue_id: str | None, field_keys: list[str]):
        super().__init__("Unresolved consensus conflicts block promotion")
        self.queue_id = queue_id
        self.field_keys = list(field_keys)


def _open_conflict_field_keys(supabase: Client, queue_id: str | None) -> list[str]:
    """Return field_key list for any open conflicts on ``queue_id``.

    Silently returns empty when the table is missing (older deploys
    that have not run migration 087 yet) so the runner stays
    forward-compatible.
    """
    if not queue_id:
        return []
    try:
        rows = (
            supabase.table("recruitment_verification_conflicts")
            .select("field_key, status")
            .eq("queue_id", queue_id)
            .eq("status", "open")
            .execute()
            .data
            or []
        )
    except Exception:
        return []
    return sorted({(r.get("field_key") or "") for r in rows if r.get("field_key")})


def _document_type_for_url(url: str) -> str:
    lower = (url or "").split("?", 1)[0].lower()
    if lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith(".json"):
        return "json"
    if lower.endswith(".rss") or lower.endswith(".xml"):
        return "rss"
    return "html"

def _ensure_notification_document(
    supabase: Client,
    *,
    source_id: str | None,
    scrape_run_id: str,
    source_url: str,
    raw_text: str,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    content_hash = hashlib.sha256((raw_text or source_url or "").encode("utf-8")).hexdigest()

    existing = (
        supabase.table("notification_documents")
        .select("id")
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return existing[0]["id"]

    payload = {
        "source_id": source_id,
        "scrape_run_id": scrape_run_id,
        "source_url": source_url,
        "final_url": source_url,
        "file_url": source_url,
        "document_type": _document_type_for_url(source_url),
        "content_hash": content_hash,
        "raw_text": raw_text,
        "metadata": metadata or {},
    }

    try:
        rows = supabase.table("notification_documents").insert(payload).execute().data or []
        return rows[0].get("id") if rows else None
    except Exception as exc:
        msg = str(exc)
        if "23505" in msg or "uq_notification_documents_hash" in msg:
            rows = (
                supabase.table("notification_documents")
                .select("id")
                .eq("content_hash", content_hash)
                .limit(1)
                .execute()
                .data
                or []
            )
            return rows[0].get("id") if rows else None

        logger.exception(
            "notification_documents insert failed source_id=%s scrape_run_id=%s source_url=%s content_hash=%s error=%s",
            source_id,
            scrape_run_id,
            source_url,
            content_hash,
            exc,
        )
        return None


# ─── Lifecycle event persistence ──────────────────────────────────────────


def _reconcile_lifecycle_events(
    supabase: Client,
    *,
    recruitment_id: str,
    source_id: str | None,
    official_url: str | None,
) -> int:
    """Stamp newly-promoted ``recruitment_id`` onto unattached lifecycle
    events that very likely belong to this recruitment.

    Matching rule: ``recruitment_events`` row must have
    ``recruitment_id IS NULL``, the same ``source_id``, and a
    ``payload.discovered_url`` whose host matches the promoted
    recruitment's ``official_notification_url`` host. Without a
    matching host we leave the event alone — better to keep an
    unattached event than to mis-stamp.

    Returns the count of rows updated. Errors are logged and swallowed
    (the promotion itself already succeeded — we don't want
    reconciliation failures to bubble up).
    """
    if not recruitment_id or not source_id:
        return 0
    target_host = ""
    try:
        from urllib.parse import urlparse
        target_host = (urlparse(official_url or "").hostname or "").lower().removeprefix("www.")
    except Exception:
        return 0
    if not target_host:
        return 0

    try:
        rows = (
            supabase.table("recruitment_events")
            .select("id, payload")
            .is_("recruitment_id", "null")
            .eq("source_id", source_id)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("reconcile_lifecycle_events lookup failed: %s", exc)
        return 0

    stamped = 0
    for row in rows:
        payload = row.get("payload") or {}
        discovered_url = payload.get("discovered_url") if isinstance(payload, dict) else None
        if not isinstance(discovered_url, str) or not discovered_url:
            continue
        try:
            from urllib.parse import urlparse as _u
            row_host = (_u(discovered_url).hostname or "").lower().removeprefix("www.")
        except Exception:
            continue
        if row_host != target_host:
            continue
        try:
            supabase.table("recruitment_events").update(
                {"recruitment_id": recruitment_id}
            ).eq("id", row["id"]).execute()
            stamped += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "recruitment_events reconcile update failed id=%s error=%s",
                row.get("id"), exc,
            )
    if stamped:
        logger.info(
            "scrape.reconcile_lifecycle_events recruitment_id=%s source_id=%s host=%s stamped=%s",
            recruitment_id, source_id, target_host, stamped,
        )
    return stamped


def _record_lifecycle_event(
    supabase: Client,
    *,
    source_id: str | None,
    listing_id: str | None,
    event_type: str,
    url: str,
    label: str,
) -> None:
    """Insert a ``recruitment_events`` row for a discovered lifecycle link.

    ``recruitment_id`` is left null — migration 042 relaxed the FK so we
    can persist events for recruitments we haven't canonicalised yet.
    The ``payload`` carries enough provenance for admin to reconcile the
    event with a canonical row later. Best-effort: a missing or older
    table just logs a warning.
    """
    if not source_id or not event_type or not url:
        return
    payload = {
        "discovered_url": url,
        "discovered_label": label or None,
    }
    try:
        supabase.table("recruitment_events").insert(
            {
                "recruitment_id": None,
                "event_type": event_type,
                "source_id": source_id,
                "aggregator_listing_id": listing_id,
                "payload": payload,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "recruitment_events insert failed event_type=%s url=%s error=%s",
            event_type, url, exc,
        )


# ─── RSS adapter pass ─────────────────────────────────────────────────────


def _run_rss_pass(
    supabase: Client,
    *,
    src: dict[str, Any],
    source: Any,
    run_id: str,
    target_url: str,
    run_limit: int,
    queue_extraction: Any,
    error_log: list[dict[str, Any]],
    mock: bool,
) -> bool:
    """Fetch + parse an RSS / Atom feed and queue each entry as a
    candidate detail. Returns ``True`` if at least one entry was queued.

    Each entry is classified via :func:`aggregator.classify_aggregator_link`;
    lifecycle events (admit cards, results, corrigenda) are skipped so a
    feed of mixed events doesn't pollute the recruitment queue. Resolver
    is run against the entry's summary when present and against the
    entry link's HTML body when fetched.
    """
    from .aggregator import classify_aggregator_link
    from .fetcher import fetch_rss

    if mock:
        # Mock mode: synthesise three entries from the source URL.
        entries = [
            type("E", (), {
                "title": f"{source.name} mock {i}",
                "link": f"{target_url.rstrip('/')}/mock-rss-{i}/",
                "summary": f"Mock RSS body for entry {i}",
                "published": None,
            })()
            for i in range(1, 4)
        ]
    else:
        prior_etag = src.get("last_listing_etag")
        prior_modified = src.get("last_listing_modified")
        result, entries = fetch_rss(
            target_url,
            if_none_match=prior_etag,
            if_modified_since=prior_modified,
        )
        if not result.ok and result.error == "not_modified":
            logger.info(
                "rss.feed_unchanged source_id=%s url=%s",
                src.get("id"), target_url,
            )
            return True
        if result.ok and (result.etag or result.last_modified):
            # Remember caching headers for the next pass.
            execute_or_default(
                "source_registry.update_listing_headers",
                lambda src=src, etag=result.etag, mod=result.last_modified:
                    supabase.table("source_registry").update({
                        "last_listing_etag": etag,
                        "last_listing_modified": mod,
                    }).eq("id", src["id"]).execute(),
                None,
            )
        if not result.ok or not entries:
            error_log.append({
                "source": source.name,
                "url": target_url,
                "error": result.error or "empty_feed",
                "at": utc_now_iso(),
            })
            return False

    queued_any = False
    entries = entries[:run_limit]
    for entry in entries:
        link = (entry.link or "").strip()
        title = (entry.title or "").strip()
        if not link:
            # Skip entries with no canonical link — we can't link the
            # extracted row back to a real document.
            continue
        event_type = classify_aggregator_link(title, link)
        if event_type != "new_recruitment":
            logger.info(
                "rss.lifecycle_skipped source_id=%s url=%s event=%s",
                src.get("id"), link, event_type,
            )
            _record_lifecycle_event(
                supabase,
                source_id=src.get("id"),
                listing_id=None,
                event_type=event_type,
                url=link,
                label=title,
            )
            continue

        listing_id = _upsert_aggregator_listing(
            supabase,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            detail_url=link,
            label=title,
            event_type=event_type,
        )
        _record_listing_observation(
            supabase,
            listing_id=listing_id,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            observed_url=link,
            observed_label=title,
            content_hash=None,
        )

        # Try to upgrade the entry link to an official source. In mock
        # mode there's no real HTML to inspect, so we just queue the
        # entry's summary as the raw text.
        resolver_result = None
        item_url = link
        if mock:
            raw_text = entry.summary or f"{title}\n\n{link}"
        else:
            outcome = _fetch_detail_conditional(supabase, link)
            if outcome.skipped:
                logger.info(
                    "rss.detail_unchanged source_id=%s url=%s",
                    src.get("id"), link,
                )
                continue
            detail_html = outcome.detail_html
            if outcome.error or not detail_html:
                raw_text = entry.summary or title
            else:
                raw_text = outcome.raw_text
                resolver_result = resolve_with_registry(detail_html, link, source)
                if resolver_result:
                    official_html = fetch_page_html(resolver_result.official_url)
                    if official_html:
                        item_url = resolver_result.official_url
                        raw_text = strip_html(official_html)
                        _mark_listing_status(
                            supabase, listing_id,
                            "official_source_found",
                            official_source_url=resolver_result.official_url,
                        )
                    else:
                        resolver_result = None
                        _mark_listing_status(supabase, listing_id, "needs_official_source")
                else:
                    _mark_listing_status(supabase, listing_id, "needs_official_source")

        if queue_extraction(
            src, source.name, item_url, raw_text,
            listing_id=listing_id, resolver_result=resolver_result,
        ):
            queued_any = True
    return queued_any


# ─── PDF adapter pass ─────────────────────────────────────────────────────


# ─── Sitemap adapter pass ────────────────────────────────────────────────


def _run_sitemap_pass(
    supabase: Client,
    *,
    src: dict[str, Any],
    source: Any,
    run_id: str,
    target_url: str,
    run_limit: int,
    queue_extraction: Any,
    error_log: list[dict[str, Any]],
    mock: bool,
) -> bool:
    """Fetch a sitemap.xml and queue each ``<url>`` entry as a candidate
    detail. Mirrors the RSS / API path: lifecycle classification skips
    non-recruitment URLs, the resolver runs against each entry's HTML,
    queue_extraction is called with the resolver-confirmed URL when
    available.

    Sitemaps don't carry titles, so the lifecycle classifier only sees
    the URL. That's enough to skip obvious admit-card / result paths
    while still queuing recruitment-shaped paths.
    """
    from .aggregator import classify_aggregator_link
    from .fetcher import fetch_sitemap_recursive

    if mock:
        entries = [
            type("E", (), {
                "loc": f"{target_url.rstrip('/')}/mock-sitemap-{i}/",
                "lastmod": None,
            })()
            for i in range(1, 4)
        ]
    else:
        prior_etag = src.get("last_listing_etag")
        prior_modified = src.get("last_listing_modified")
        # fetch_sitemap_recursive flattens sitemapindex children up to
        # max_depth and returns only leaf <url> entries, plus the root
        # FetchResult so we keep conditional-fetch bookkeeping.
        result, entries = fetch_sitemap_recursive(
            target_url,
            if_none_match=prior_etag,
            if_modified_since=prior_modified,
        )
        if not result.ok and result.error == "not_modified":
            logger.info(
                "sitemap.unchanged source_id=%s url=%s",
                src.get("id"), target_url,
            )
            return True
        if result.ok and (result.etag or result.last_modified):
            execute_or_default(
                "source_registry.update_listing_headers",
                lambda src=src, etag=result.etag, mod=result.last_modified:
                    supabase.table("source_registry").update({
                        "last_listing_etag": etag,
                        "last_listing_modified": mod,
                    }).eq("id", src["id"]).execute(),
                None,
            )
        if not result.ok or not entries:
            error_log.append({
                "source": source.name,
                "url": target_url,
                "error": result.error or "empty_sitemap",
                "at": utc_now_iso(),
            })
            return False

    queued_any = False
    entries = entries[:run_limit]
    for entry in entries:
        link = (entry.loc or "").strip()
        if not link:
            continue
        # Sitemap entries have no label. Pass an empty title so
        # classify_aggregator_link relies on URL hints only.
        event_type = classify_aggregator_link("", link)
        if event_type != "new_recruitment":
            logger.info(
                "sitemap.lifecycle_skipped source_id=%s url=%s event=%s",
                src.get("id"), link, event_type,
            )
            _record_lifecycle_event(
                supabase,
                source_id=src.get("id"),
                listing_id=None,
                event_type=event_type,
                url=link,
                label="",
            )
            continue

        listing_id = _upsert_aggregator_listing(
            supabase,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            detail_url=link,
            label="",
            event_type=event_type,
        )
        _record_listing_observation(
            supabase,
            listing_id=listing_id,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            observed_url=link,
            observed_label="",
            content_hash=None,
        )

        resolver_result = None
        item_url = link
        if mock:
            raw_text = f"MOCK SITEMAP DETAIL FOR {link}"
        else:
            outcome = _fetch_detail_conditional(supabase, link, lastmod_hint=getattr(entry, "lastmod", None))
            if outcome.skipped:
                logger.info(
                    "sitemap.detail_unchanged source_id=%s url=%s",
                    src.get("id"), link,
                )
                continue
            if outcome.error or not outcome.detail_html:
                error_log.append({"source": source.name, "url": link, "error": outcome.error or "Empty detail response", "at": utc_now_iso()})
                continue
            detail_html = outcome.detail_html
            raw_text = outcome.raw_text
            resolver_result = resolve_with_registry(detail_html, link, source)
            if resolver_result:
                official_html = fetch_page_html(resolver_result.official_url)
                if official_html:
                    item_url = resolver_result.official_url
                    raw_text = strip_html(official_html)
                    _mark_listing_status(
                        supabase, listing_id,
                        "official_source_found",
                        official_source_url=resolver_result.official_url,
                    )
                else:
                    resolver_result = None
                    _mark_listing_status(supabase, listing_id, "needs_official_source")
            else:
                _mark_listing_status(supabase, listing_id, "needs_official_source")

        if queue_extraction(
            src, source.name, item_url, raw_text,
            listing_id=listing_id, resolver_result=resolver_result,
        ):
            queued_any = True
    return queued_any


def _run_pdf_pass(
    supabase: Client,
    *,
    src: dict[str, Any],
    source: Any,
    run_id: str,
    target_url: str,
    queue_extraction: Any,
    error_log: list[dict[str, Any]],
    mock: bool,
) -> bool:
    """Fetch a PDF bulletin, extract its text, and queue it as a single
    recruitment candidate.

    Most government PDF bulletins describe one recruitment notification
    end-to-end (eligibility, dates, vacancies). The pass treats the PDF
    as a single "detail page": fetch + extract text once, run resolver
    against the PDF URL itself (no anchors to follow), queue the
    extracted body.

    Multi-recruitment bulletins (e.g. monthly state-PSC roundups) need
    source-specific splitter logic that lives in a future per-source
    resolver; this default keeps the safer one-PDF-one-recruitment
    contract.
    """
    from .fetcher import fetch_pdf, parse_pdf_pages, split_pdf_text

    adapter_config = source.adapter_config if isinstance(source.adapter_config, dict) else {}
    split_per_page = bool(adapter_config.get("split_per_page"))
    split_regex = adapter_config.get("split_regex") or None

    pdf_raw_bytes: bytes | None = None
    if mock:
        raw_text = f"MOCK PDF BULLETIN BODY FOR {target_url}"
    else:
        prior_etag = src.get("last_listing_etag")
        prior_modified = src.get("last_listing_modified")
        result = fetch_pdf(
            target_url,
            if_none_match=prior_etag,
            if_modified_since=prior_modified,
        )
        if not result.ok and result.error == "not_modified":
            logger.info(
                "pdf.bulletin_unchanged source_id=%s url=%s",
                src.get("id"), target_url,
            )
            return True
        if result.ok and (result.etag or result.last_modified):
            execute_or_default(
                "source_registry.update_listing_headers",
                lambda src=src, etag=result.etag, mod=result.last_modified:
                    supabase.table("source_registry").update({
                        "last_listing_etag": etag,
                        "last_listing_modified": mod,
                    }).eq("id", src["id"]).execute(),
                None,
            )
        if not result.ok or not result.text:
            # Distinguish a transport failure (retry-worthy) from a PDF
            # that downloaded fine but yielded no extractable text — the
            # latter is almost always a scanned / image-only bulletin
            # that needs OCR or manual transcription, not a retry. The
            # admin source-diagnostics view keys off this distinction.
            fetched_ok = result.status_code == 200 or (
                result.ok is False and result.error == "empty_pdf"
            )
            if fetched_ok and result.error == "empty_pdf":
                error_log.append({
                    "source": source.name,
                    "url": target_url,
                    "error": "pdf_no_extractable_text",
                    "error_message": (
                        "PDF downloaded but no text could be extracted — "
                        "likely a scanned/image-only bulletin. Needs OCR "
                        "or manual transcription; retrying will not help."
                    ),
                    "needs_manual_review": True,
                    "at": utc_now_iso(),
                })
            else:
                error_log.append({
                    "source": source.name,
                    "url": target_url,
                    "error": result.error or "empty_pdf",
                    "at": utc_now_iso(),
                })
            return False
        raw_text = result.text
        pdf_raw_bytes = result.raw_bytes

    # Decide chunks. Default: one chunk = the whole PDF (existing
    # one-PDF-one-notification contract). Multi-recruitment bulletins
    # opt in via adapter_config.split_per_page or .split_regex.
    chunks: list[str]
    if mock:
        chunks = [raw_text]
    elif split_per_page:
        pages = parse_pdf_pages(pdf_raw_bytes) if pdf_raw_bytes else [raw_text]
        chunks = pages or [raw_text]
    elif split_regex:
        chunks = split_pdf_text(raw_text, regex=split_regex)
    else:
        chunks = [raw_text]

    queued_any = False
    for index, chunk in enumerate(chunks):
        chunk_text = (chunk or "").strip()
        if not chunk_text:
            continue
        # When the PDF was split, give each chunk its own listing URL
        # by suffixing the chunk index. Single-chunk PDFs keep the
        # original URL so existing pipelines see no behaviour change.
        chunk_url = target_url if len(chunks) == 1 else f"{target_url}#chunk-{index + 1}"
        chunk_label = source.name if len(chunks) == 1 else f"{source.name} (chunk {index + 1}/{len(chunks)})"
        listing_id = _upsert_aggregator_listing(
            supabase,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            detail_url=chunk_url,
            label=chunk_label,
            event_type="new_recruitment",
        )
        _record_listing_observation(
            supabase,
            listing_id=listing_id,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            observed_url=chunk_url,
            observed_label=chunk_label,
            content_hash=None,
        )
        if queue_extraction(
            src, source.name, chunk_url, chunk_text,
            listing_id=listing_id, resolver_result=None,
        ):
            queued_any = True
    return queued_any


# ─── JSON-API adapter pass ────────────────────────────────────────────────


def _run_api_pass(
    supabase: Client,
    *,
    src: dict[str, Any],
    source: Any,
    run_id: str,
    target_url: str,
    run_limit: int,
    queue_extraction: Any,
    error_log: list[dict[str, Any]],
    mock: bool,
) -> bool:
    """Fetch a JSON endpoint and queue each entry as a candidate detail.

    Field mapping comes from ``source.adapter_config`` (entries_path,
    title_field, link_field, summary_field, date_field). Same lifecycle
    classification / resolver flow as the RSS adapter — entries without
    a link are dropped, lifecycle events are skipped, and resolver-found
    official URLs replace the entry link before extraction.
    """
    from .aggregator import classify_aggregator_link
    from .fetcher import fetch_api_paginated

    if mock:
        entries = [
            type("E", (), {
                "title": f"{source.name} api mock {i}",
                "link": f"{target_url.rstrip('/')}/mock-api-{i}/",
                "summary": f"Mock API body for entry {i}",
                "published": None,
            })()
            for i in range(1, 4)
        ]
    else:
        prior_etag = src.get("last_listing_etag")
        prior_modified = src.get("last_listing_modified")
        # fetch_api_paginated walks page/offset/cursor pagination when
        # adapter_config["pagination"] is set; otherwise it's a single
        # fetch_api call. Conditional headers apply to the first page.
        result, entries = fetch_api_paginated(
            target_url,
            adapter_config=source.adapter_config,
            if_none_match=prior_etag,
            if_modified_since=prior_modified,
        )
        if not result.ok and result.error == "not_modified":
            logger.info(
                "api.feed_unchanged source_id=%s url=%s",
                src.get("id"), target_url,
            )
            return True
        if result.ok and (result.etag or result.last_modified):
            execute_or_default(
                "source_registry.update_listing_headers",
                lambda src=src, etag=result.etag, mod=result.last_modified:
                    supabase.table("source_registry").update({
                        "last_listing_etag": etag,
                        "last_listing_modified": mod,
                    }).eq("id", src["id"]).execute(),
                None,
            )
        if not result.ok or not entries:
            error_log.append({
                "source": source.name,
                "url": target_url,
                "error": result.error or "empty_api_response",
                "at": utc_now_iso(),
            })
            return False

    queued_any = False
    entries = entries[:run_limit]
    for entry in entries:
        link = (entry.link or "").strip()
        title = (entry.title or "").strip()
        if not link:
            continue
        event_type = classify_aggregator_link(title, link)
        if event_type != "new_recruitment":
            logger.info(
                "api.lifecycle_skipped source_id=%s url=%s event=%s",
                src.get("id"), link, event_type,
            )
            _record_lifecycle_event(
                supabase,
                source_id=src.get("id"),
                listing_id=None,
                event_type=event_type,
                url=link,
                label=title,
            )
            continue

        listing_id = _upsert_aggregator_listing(
            supabase,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            detail_url=link,
            label=title,
            event_type=event_type,
        )
        _record_listing_observation(
            supabase,
            listing_id=listing_id,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            observed_url=link,
            observed_label=title,
            content_hash=None,
        )

        resolver_result = None
        item_url = link
        if mock:
            raw_text = entry.summary or f"{title}\n\n{link}"
        else:
            outcome = _fetch_detail_conditional(supabase, link)
            if outcome.skipped:
                logger.info(
                    "api.detail_unchanged source_id=%s url=%s",
                    src.get("id"), link,
                )
                continue
            detail_html = outcome.detail_html
            if outcome.error or not detail_html:
                raw_text = entry.summary or title
            else:
                raw_text = outcome.raw_text
                resolver_result = resolve_with_registry(detail_html, link, source)
                if resolver_result:
                    official_html = fetch_page_html(resolver_result.official_url)
                    if official_html:
                        item_url = resolver_result.official_url
                        raw_text = strip_html(official_html)
                        _mark_listing_status(
                            supabase, listing_id,
                            "official_source_found",
                            official_source_url=resolver_result.official_url,
                        )
                    else:
                        resolver_result = None
                        _mark_listing_status(supabase, listing_id, "needs_official_source")
                else:
                    _mark_listing_status(supabase, listing_id, "needs_official_source")

        if queue_extraction(
            src, source.name, item_url, raw_text,
            listing_id=listing_id, resolver_result=resolver_result,
        ):
            queued_any = True
    return queued_any


# ─── Change-detection helper ──────────────────────────────────────────────


@dataclass
class _DetailFetchOutcome:
    """Result of a feed-adapter detail fetch.

    * ``skipped`` is True when the server returned 304 — caller should
      record an observation but skip extraction.
    * ``raw_text`` / ``detail_html`` are the stripped body and the raw
      HTML for the resolver, both populated on successful 200.
    * ``error`` carries the typed FetchResult.error when the fetch
      failed for a reason other than 304 (caller logs to error_log).
    """
    skipped: bool = False
    raw_text: str = ""
    detail_html: str = ""
    error: str | None = None


def _fetch_detail_conditional(
    supabase: Client,
    link: str,
    *,
    lastmod_hint: str | None = None,
) -> _DetailFetchOutcome:
    """Detail-page fetch with ETag / Last-Modified short-circuit.

    Looks up prior caching headers from notification_documents for
    ``link``. When prior headers exist (or the caller passes a
    ``lastmod_hint``, e.g. from a sitemap entry's ``<lastmod>``) we
    use the structured ``fetch()`` with conditional headers; on 304 we
    return ``skipped=True`` so the runner can record an observation
    without re-extracting. Without prior headers, falls back to the
    legacy ``fetch_page_html(link)`` path so existing tests and call
    sites that monkeypatch ``fetch_page_html`` keep working.
    """
    prior = _lookup_prior_document_headers(supabase, link)
    prior_etag = prior.get("etag")
    prior_modified = prior.get("last_modified") or lastmod_hint

    if not prior_etag and not prior_modified:
        detail_html = fetch_page_html(link)
        if not detail_html:
            return _DetailFetchOutcome(error="empty_response")
        return _DetailFetchOutcome(raw_text=strip_html(detail_html), detail_html=detail_html)

    result = fetch(
        link,
        adapter_type="html",
        if_none_match=prior_etag,
        if_modified_since=prior_modified,
    )
    if not result.ok and result.error == "not_modified":
        return _DetailFetchOutcome(skipped=True)
    if not result.ok or not result.text:
        return _DetailFetchOutcome(error=result.error or "empty_response")
    raw_text = result.text
    try:
        detail_html = (result.raw_bytes or b"").decode("utf-8", errors="replace") or result.text
    except Exception:
        detail_html = result.text
    return _DetailFetchOutcome(raw_text=raw_text, detail_html=detail_html)


def _lookup_prior_document_headers(
    supabase: Client,
    source_url: str,
) -> dict[str, str | None]:
    """Return the most recent ``etag`` / ``last_modified`` we have on
    record for ``source_url``.

    Used by the runner to send conditional fetch headers so unchanged
    pages return 304 and skip extraction. Returns an empty-ish dict
    when nothing is on file or the lookup fails — callers must tolerate
    missing values (the fetcher just skips the conditional header).
    """
    if not source_url:
        return {"etag": None, "last_modified": None}
    try:
        rows = (
            supabase.table("notification_documents")
            .select("etag, last_modified")
            .eq("source_url", source_url)
            .order("fetched_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return {"etag": None, "last_modified": None}
        return {
            "etag": rows[0].get("etag"),
            "last_modified": rows[0].get("last_modified"),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "notification_documents lookup for change-detection failed url=%s error=%s",
            source_url, exc,
        )
        return {"etag": None, "last_modified": None}


# ─── Aggregator candidate layer helpers ────────────────────────────────────


def _listing_hash(source_id: str | None, detail_url: str) -> str:
    return hashlib.sha256(f"{source_id or ''}|{detail_url}".encode("utf-8")).hexdigest()


def _upsert_aggregator_listing(
    supabase: Client,
    *,
    source_id: str | None,
    scrape_run_id: str,
    detail_url: str,
    label: str,
    event_type: str,
) -> str | None:
    """Insert-or-touch an ``aggregator_listings`` row for a detail URL.

    Returns the listing id on success or ``None`` if the table is
    unavailable (older deployments before migration 038). The runner
    treats a ``None`` listing id as "candidate layer not active" and
    keeps writing the queue row directly.
    """
    if not source_id:
        return None
    listing_hash = _listing_hash(source_id, detail_url)
    try:
        existing = (
            supabase.table("aggregator_listings")
            .select("id")
            .eq("source_id", source_id)
            .eq("listing_hash", listing_hash)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            listing_id = existing[0]["id"]
            supabase.table("aggregator_listings").update(
                {
                    "last_seen_at": utc_now_iso(),
                    "scrape_run_id": scrape_run_id,
                    "event_type": event_type,
                }
            ).eq("id", listing_id).execute()
            return listing_id

        rows = (
            supabase.table("aggregator_listings")
            .insert(
                {
                    "source_id": source_id,
                    "scrape_run_id": scrape_run_id,
                    "listing_url": detail_url,
                    "listing_title": label or detail_url,
                    "listing_hash": listing_hash,
                    "event_type": event_type,
                    "status": "discovered",
                }
            )
            .execute()
            .data
            or []
        )
        return rows[0].get("id") if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "aggregator_listings unavailable source_id=%s detail_url=%s error=%s",
            source_id, detail_url, exc,
        )
        return None


def _record_listing_observation(
    supabase: Client,
    *,
    listing_id: str | None,
    source_id: str | None,
    scrape_run_id: str,
    observed_url: str,
    observed_label: str,
    content_hash: str | None,
) -> None:
    if not listing_id or not source_id:
        return
    try:
        supabase.table("listing_observations").insert(
            {
                "listing_id": listing_id,
                "source_id": source_id,
                "scrape_run_id": scrape_run_id,
                "observed_url": observed_url,
                "observed_label": observed_label or None,
                "content_hash": content_hash,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "listing_observations insert failed listing_id=%s error=%s",
            listing_id, exc,
        )


def _upsert_recruitment_candidate(
    supabase: Client,
    *,
    canonical_key: str,
    title_hint: str | None,
    organization_hint: str | None,
    year_hint: int | None,
    new_status: str,
) -> str | None:
    """Insert-or-touch a ``recruitment_candidates`` row keyed by canonical_key.

    Returns the candidate id, or ``None`` if the table is unavailable.
    ``new_status`` is applied on insert and only on update when it
    represents a stricter step in the lifecycle than the existing one
    (we never downgrade a candidate's status here).
    """
    try:
        existing = (
            supabase.table("recruitment_candidates")
            .select("id, status")
            .eq("canonical_key", canonical_key)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            candidate_id = existing[0]["id"]
            payload: dict[str, Any] = {"updated_at": utc_now_iso()}
            if _candidate_status_rank(new_status) > _candidate_status_rank(
                existing[0].get("status") or "unverified"
            ):
                payload["status"] = new_status
            supabase.table("recruitment_candidates").update(payload).eq(
                "id", candidate_id
            ).execute()
            return candidate_id

        rows = (
            supabase.table("recruitment_candidates")
            .insert(
                {
                    "canonical_key": canonical_key,
                    "title_hint": title_hint,
                    "organization_hint": organization_hint,
                    "year_hint": year_hint,
                    "status": new_status,
                }
            )
            .execute()
            .data
            or []
        )
        return rows[0].get("id") if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "recruitment_candidates unavailable canonical_key=%s error=%s",
            canonical_key, exc,
        )
        return None


_CANDIDATE_STATUS_ORDER = (
    "unverified",
    "aggregator_confirmed",
    "official_notification_found",
    "extraction_pending",
    "extraction_complete",
    "needs_review",
    "verified",
    "promoted",
    "rejected",
)


def _candidate_status_rank(status: str) -> int:
    try:
        return _CANDIDATE_STATUS_ORDER.index(status)
    except ValueError:
        return -1


def _record_candidate_observation(
    supabase: Client,
    *,
    candidate_id: str | None,
    listing_id: str | None,
    source_id: str | None,
    scrape_queue_id: str | None,
    confidence_score: float | None,
    payload: dict[str, Any],
) -> None:
    if not candidate_id or not source_id:
        return
    try:
        supabase.table("candidate_observations").insert(
            {
                "candidate_id": candidate_id,
                "listing_id": listing_id,
                "source_id": source_id,
                "scrape_queue_id": scrape_queue_id,
                "confidence_score": confidence_score,
                "payload": payload,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "candidate_observations insert failed candidate_id=%s error=%s",
            candidate_id, exc,
        )


def _mark_listing_status(
    supabase: Client,
    listing_id: str | None,
    status: str,
    *,
    official_source_url: str | None = None,
) -> None:
    if not listing_id:
        return
    payload: dict[str, Any] = {"status": status, "updated_at": utc_now_iso()}
    if official_source_url is not None:
        payload["official_source_url"] = official_source_url
    try:
        supabase.table("aggregator_listings").update(payload).eq("id", listing_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "aggregator_listings status update failed listing_id=%s status=%s error=%s",
            listing_id, status, exc,
        )


# ════════════════════════════════════════════════════════════════════════════
#  Scrape pass
# ════════════════════════════════════════════════════════════════════════════


def run_scraping_pass(
    supabase: Client,
    *,
    triggered_by: str = "manual",
    triggered_by_user: str | None = None,
    source_ids: list[str] | None = None,
    limit: int = 25,
    mock: bool | None = None,
) -> dict[str, Any]:
    """Run a single scrape pass over active sources.

    Returns the summary dict + new run id. Does not raise on per-source
    errors (those are recorded in ``scrape_runs.error_log``).
    """
    # ── 1. Create the run row ─────────────────────────────────────────────
    run_payload = {
        "status": "running",
        "triggered_by": triggered_by,
        "started_at": utc_now_iso(),
    }
    if triggered_by_user:
        run_payload["triggered_by_user"] = triggered_by_user
    inserted = execute_or_raise("scrape_runs.create", lambda: supabase.table("scrape_runs").insert(run_payload).execute()).data or []
    if not inserted:
        raise RuntimeError("run_scraping_pass: failed to create scrape_runs row")
    run_id: str = inserted[0]["id"]

    # ── 2. Load active sources from source_registry ──────────────────────
    # Source registry and dedupe index reads are CRITICAL: silent empties
    # would make a Supabase outage look like "no sources" or "no
    # duplicates", which would then promote duplicate-able items as new.
    # On any failure here we finalize the run as failed and re-raise.
    src_q = (
        supabase.table("source_registry")
        .select("*")
        .eq("is_active", True)
        .order("last_scraped_at", desc=False, nullsfirst=True)
    )
    if source_ids:
        src_q = src_q.in_("id", source_ids)
    try:
        sources: list[dict[str, Any]] = (
            execute_or_raise("source_registry.active.read", lambda: src_q.execute()).data or []
        )
    except Exception as exc:
        _finalize_run_failed(supabase, run_id, "source_registry_read_failed", exc)
        raise

    # ── 3. Build dedup index from existing recruitments + open queue ─────
    try:
        existing_recs = (
            execute_or_raise(
                "recruitments.read_for_dedupe",
                lambda: supabase.table("recruitments")
                .select("id, name, year, organizations(name), official_notification_url, official_apply_url, notification_number")
                .execute(),
            ).data
            or []
        )
    except Exception as exc:
        _finalize_run_failed(supabase, run_id, "recruitments_dedupe_read_failed", exc)
        raise

    try:
        open_queue = (
            execute_or_raise(
                "scrape_queue.read_open_for_dedupe",
                lambda: supabase.table("scrape_queue")
                .select("id, extracted_data, status")
                .not_.in_("status", ["rejected", "duplicate"])
                .execute(),
            ).data
            or []
        )
    except Exception as exc:
        _finalize_run_failed(supabase, run_id, "scrape_queue_dedupe_read_failed", exc)
        raise

    queued_id_by_key: dict[str, str] = {}
    for item in open_queue:
        d = item.get("extracted_data")
        if isinstance(d, dict) and isinstance(d.get("organization_name"), str):
            try:
                key = compute_similarity_key(ExtractedRecruitment(**d))
            except Exception:
                continue
            queued_id_by_key.setdefault(key, item.get("id"))

    # ── 4. Process each source ───────────────────────────────────────────
    total_found = 0
    total_new = 0
    total_dup = 0
    error_log: list[dict[str, Any]] = []
    run_limit = max(1, min(int(limit or 25), 100))

    def queue_extraction(
        src: dict[str, Any],
        source_name: str,
        item_url: str,
        raw: str,
        *,
        listing_id: str | None = None,
        resolver_result: ResolverResult | None = None,
    ) -> str | None:
        """Run extraction → dedup → queue insert. Returns inserted queue id or None on failure."""
        nonlocal total_found, total_new, total_dup

        # ── Pre-LLM URL dedup ──────────────────────────────────────────────
        # extract_recruitment_data is an Anthropic call. If we already have
        # a canonical recruitment with this exact URL there is no value in
        # spending a model token on it — short-circuit before extraction.
        # Title/org-similarity dedup still happens post-extraction; this
        # only catches the URL-exact case, which is the cheapest and most
        # common false-positive in re-scrape passes.
        norm_item_url = _norm_url_for_dedup(item_url)
        if norm_item_url:
            for r in existing_recs:
                rec_urls = {
                    _norm_url_for_dedup(r.get("official_notification_url")),
                    _norm_url_for_dedup(r.get("official_apply_url")),
                } - {""}
                if norm_item_url in rec_urls:
                    total_found += 1
                    total_dup += 1
                    logger.info(
                        "scrape.pre_llm_duplicate run_id=%s source_id=%s url=%s recruitment_id=%s",
                        run_id, src.get("id"), item_url, r.get("id"),
                    )
                    return None

        extraction = extract_recruitment_data(raw, item_url, source_name, mock=mock)
        if not extraction:
            error_log.append({"source": source_name, "url": item_url, "error": "Extraction returned null", "at": utc_now_iso()})
            return None

        data: ExtractedRecruitment = extraction["data"]
        confidence = float(extraction.get("confidence") or 0.5)
        total_found += 1

        # ── Task 5: low-confidence gate ────────────────────────────────────
        # A reviewer would discard this row anyway. Skip the scrape_queue
        # insert (and all downstream document / candidate / draft writes),
        # record it for triage, and bump the per-source strike counter —
        # which auto-disables a source that keeps producing low-confidence
        # output so we stop paying for LLM calls on it.
        if confidence < _min_confidence_to_queue():
            try:
                low_quality = normalize_recruitment(data).data_quality_score
            except Exception:  # noqa: BLE001 - quality is best-effort here
                low_quality = None
            _record_low_confidence_and_maybe_disable(
                supabase,
                run_id=run_id,
                src=src,
                source_url=item_url,
                confidence=confidence,
                data_quality_score=low_quality,
                extracted_data=to_json_safe(data),
            )
            return None
        # A confident extraction clears the source's low-confidence streak.
        _reset_low_confidence_strikes(src.get("id"))

        sim_key = compute_similarity_key(data)
        # Canonical-identity sanity. RawExtractedRecruitment is permissive,
        # so a low-quality extraction can produce e.g. ``"-0-"`` (empty
        # org + null year + empty title). Every other low-quality
        # extraction would collapse to the same sim_key and false-match
        # via the queued-similarity-key signal, polluting both the
        # ``recruitment_candidates`` table and the queue's dedup view.
        # Detect the collapse and (a) swap in a per-row unique sentinel
        # so find_duplicate can't false-match, (b) skip the canonical
        # candidate upsert later. The queue row is still inserted and
        # marked needs_review so an admin can fill the gaps.
        # Task 6: full validator — flags trailing/leading dash, double
        # dash, and wrong segment count, not just the all-empty ``-0-``
        # collapse. An invalid key is excluded from dedup keying below.
        canonical_collapsed = canonical_key_invalid(sim_key)
        sim_key_for_dedup = sim_key if not canonical_collapsed else f"__incomplete_{uuid.uuid4().hex}"
        decision = find_duplicate(
            data.model_dump(),
            sim_key=sim_key_for_dedup,
            existing_recruitments=existing_recs,
            queued=queued_id_by_key,
        )
        normalized = normalize_recruitment(data)
        extracted_payload = to_json_safe(data)
        extracted_payload["_meta"] = {
            "prompt_version": PROMPT_VERSION,
            "warnings": normalized.warnings,
            "normalized_fields": normalized.normalized_fields,
            "duplicate_reason": decision.reason,
            "duplicate_score": decision.score,
            "duplicate_matched_fields": decision.matched_fields,
            "source_registry_id": src.get("id"),
            "source_type": src.get("source_type"),
            "aggregator_listing_id": listing_id,
            "resolver_reason": resolver_result.reason if resolver_result else None,
            "resolver_host": resolver_result.host if resolver_result else None,
            "canonical_key_invalid": canonical_collapsed,
        }
        extraction_provider = extraction.get("provider") or ("mock" if extraction.get("is_mock") else "anthropic")
        document_id = _ensure_notification_document(
            supabase,
            source_id=src.get("id"),
            scrape_run_id=run_id,
            source_url=item_url,
            raw_text=raw,
            metadata={
                "source_name": source_name,
                "source_type": src.get("source_type"),
                "prompt_version": PROMPT_VERSION,
                "mock": bool(mock),
                "aggregator_listing_id": listing_id,
                "resolver_host": resolver_result.host if resolver_result else None,
            },
        )

        # Resolver upgrades aggregator-derived rows: when the runner has
        # already substituted the official URL for ``item_url``, the queue
        # row is treated as evidence-grade and the trust gate flips on.
        if resolver_result is not None:
            official_source_resolved = True
            official_source_host = resolver_result.host
            evidence_required = False
        else:
            official_source_resolved = not bool(src.get("requires_official_confirmation"))
            official_source_host = None
            evidence_required = bool(src.get("requires_official_confirmation"))

        # ``extraction_status`` distinguishes a technically successful
        # model call from one whose output is admin-usable. A collapsed
        # canonical key (missing org/title/year) or a data_quality_score
        # below the review threshold means the row needs a human pass
        # before any downstream consumer treats it as "extraction
        # completed". This separates transport success from semantic
        # success in the admin queue and dashboards.
        is_low_quality = normalized.data_quality_score < 0.30
        extraction_status = (
            "needs_review" if (canonical_collapsed or is_low_quality) else "ok"
        )
        queue_payload = {
            "source_url": item_url,
            "source_name": source_name,
            "source_id": src.get("id"),
            "extracted_data": extracted_payload,
            "confidence_score": confidence,
            "data_quality_score": normalized.data_quality_score,
            "scrape_run_id": run_id,
            "duplicate_of": decision.duplicate_queue_id,
            "duplicate_recruitment_id": decision.duplicate_recruitment_id,
            "scraped_at": utc_now_iso(),
            # Never auto-approve — see runner.ts safety hardening note.
            "status": "duplicate" if decision.is_duplicate else "pending",
            "official_source_resolved": official_source_resolved,
            "official_source_host": official_source_host,
            "evidence_required": evidence_required,
            "extraction_status": extraction_status,
            "notification_document_id": document_id,
            "extraction_provider": extraction_provider,
            "extraction_prompt_version": PROMPT_VERSION,
        }
        logger.info(
            "scrape.queue_insert run_id=%s source_id=%s source_name=%s target_url=%s extraction_status=%s confidence_score=%.2f data_quality_score=%.2f duplicate_status=%s duplicate_reason=%s resolver=%s canonical_key_invalid=%s",
            run_id, src.get("id"), source_name, item_url, extraction_status,
            confidence, normalized.data_quality_score, queue_payload["status"], decision.reason,
            resolver_result.reason if resolver_result else None,
            canonical_collapsed,
        )
        inserted = execute_or_raise(
            "scrape_queue.insert",
            lambda payload=queue_payload: supabase.table("scrape_queue").insert(payload).execute(),
        ).data or []
        inserted_id = inserted[0].get("id") if inserted else None

        # Scraper-driven source_registry drafts: for every official URL
        # the extractor pulled (notification/apply/pdf), surface the host
        # as a needs_review draft if it isn't already registered. Admins
        # see the new draft in the resolver dropdown immediately and can
        # promote it to verified via /admin/sources/{id}/verify. The
        # helper is idempotent — registered hosts are no-ops.
        try:
            from .source_drafts import extract_candidate_hosts, upsert_draft_sources

            extracted_payload = queue_payload.get("extracted_data") or {}
            host_candidates = extract_candidate_hosts(extracted_payload)
            if host_candidates and not decision.is_duplicate:
                drafts = upsert_draft_sources(
                    supabase,
                    host_candidates,
                    queue_id=inserted_id,
                )
                if drafts.get("created"):
                    logger.info(
                        "scrape.source_drafts_created run_id=%s queue_id=%s hosts=%s",
                        run_id, inserted_id,
                        [r.get("source_name") for r in drafts["created"]],
                    )
        except Exception as exc:  # noqa: BLE001
            # Draft creation is best-effort; never let it kill the run.
            logger.warning(
                "scrape.source_drafts_failed run_id=%s queue_id=%s err=%s",
                run_id, inserted_id, exc,
            )

        if decision.is_duplicate:
            total_dup += 1
        else:
            total_new += 1
            # Only register a valid canonical key in the run-local map.
            # Registering a ``-0-`` collapse here would cause every
            # subsequent incomplete extraction in the same run to
            # false-dup against this row.
            if inserted_id and not canonical_collapsed:
                queued_id_by_key.setdefault(sim_key, inserted_id)

        if canonical_collapsed:
            # Skip the canonical candidate merge entirely. The queue row
            # is still inserted (extraction_status=needs_review) so an
            # admin can fill in the missing identity fields, after which
            # a follow-up pass can build a real candidate row.
            logger.info(
                "scrape.canonical_key_invalid run_id=%s source_id=%s url=%s sim_key=%s "
                "title=%r organization=%r year=%r data_quality_score=%.2f",
                run_id, src.get("id"), item_url, sim_key,
                data.title, data.organization_name, data.year,
                normalized.data_quality_score,
            )
            return inserted_id

        # Candidate merge: tie this queue row to a canonical candidate keyed
        # by ``recruitment_key(org, year, title)``. Future PRs upgrade the
        # candidate status as it moves through review/promotion.
        candidate_status = (
            "official_notification_found"
            if resolver_result is not None
            else "aggregator_confirmed"
        )
        candidate_id = _upsert_recruitment_candidate(
            supabase,
            canonical_key=sim_key,
            title_hint=data.title,
            organization_hint=data.organization_name,
            year_hint=data.year,
            new_status=candidate_status,
        )
        _record_candidate_observation(
            supabase,
            candidate_id=candidate_id,
            listing_id=listing_id,
            source_id=src.get("id"),
            scrape_queue_id=inserted_id,
            confidence_score=confidence,
            payload={
                "duplicate_status": queue_payload["status"],
                "duplicate_reason": decision.reason,
                "resolver_reason": resolver_result.reason if resolver_result else None,
                "resolver_host": resolver_result.host if resolver_result else None,
                "data_quality_score": normalized.data_quality_score,
            },
        )
        return inserted_id

    # Task 1: fold the end-of-source claim release into the success PATCH.
    # Previously a normal run did TWO source_registry PATCHes per source
    # ~100ms apart — ``mark_success`` then a separate ``currently_scraping_at``
    # clear in the ``finally``. ``_mark_source_success`` now clears the claim
    # in the same PATCH and records the id so the ``finally`` skips the
    # redundant second write. Failure-path PATCHes (``_bump_source_failure``
    # + the finally release) stay independent and may still fire.
    released_source_ids: set[str] = set()

    def _mark_source_success(
        src_row: dict[str, Any], *, op: str = "source_registry.mark_success"
    ) -> None:
        sid = src_row.get("id")
        execute_or_default(
            op,
            lambda: supabase.table("source_registry").update({
                "last_scraped_at": utc_now_iso(),
                "last_success_at": utc_now_iso(),
                "consecutive_fails": 0,
                "last_error": None,
                "last_error_class": None,
                "last_error_message": None,
                "last_error_at": None,
                "last_error_http_status": None,
                "last_error_url": None,
                # Release the per-source scrape claim in the SAME PATCH.
                "currently_scraping_at": None,
            }).eq("id", sid).execute(),
            None,
        )
        if sid:
            released_source_ids.add(sid)

    for src in sources:
        source = normalize_source_registry(src)
        # Per-source concurrency claim. A worker that can't take the
        # lock skips the source for this run; the holding worker will
        # process it. Stale claims (older than 15 min) are taken over.
        if not _try_claim_source(supabase, src):
            error_log.append({
                "source": source.name,
                "error": "concurrent_lock_held",
                "at": utc_now_iso(),
            })
            continue
        try:
            target_url = source.primary_fetch_url()
            if not target_url:
                logger.warning(
                    "scrape.source_config_invalid source_id=%s source_name=%s adapter_type=%s reason=no_fetch_url",
                    src.get("id"), source.name, source.adapter_type,
                )
                error_log.append({
                    "source": source.name,
                    "error": "source_config_invalid",
                    "reason": "no_fetch_url",
                    "adapter_type": source.adapter_type,
                    "at": utc_now_iso(),
                })
                _bump_source_failure(
                    supabase, src,
                    error_class="source_config_invalid",
                    error_message=f"no_fetch_url for adapter_type={source.adapter_type or 'html'}",
                )
                continue
            if source.adapter_type and source.adapter_type.lower() == "rss":
                try:
                    if not _run_rss_pass(
                        supabase,
                        src=src,
                        source=source,
                        run_id=run_id,
                        target_url=target_url,
                        run_limit=run_limit,
                        queue_extraction=queue_extraction,
                        error_log=error_log,
                        mock=mock,
                    ):
                        _bump_source_failure(
                            supabase, src,
                            error_class="empty_feed",
                            error_message="rss adapter returned no entries",
                            attempted_url=target_url,
                        )
                        continue
                    _mark_source_success(src)
                except Exception as exc:  # noqa: BLE001
                    error_class, error_message = _classify_exception(exc)
                    error_log.append({"source": source.name, "error": error_class, "error_message": error_message, "at": utc_now_iso()})
                    _bump_source_failure(
                        supabase, src,
                        error_class=error_class,
                        error_message=error_message,
                        attempted_url=target_url,
                    )
                continue

            if source.adapter_type and source.adapter_type.lower() == "api":
                try:
                    if not _run_api_pass(
                        supabase,
                        src=src,
                        source=source,
                        run_id=run_id,
                        target_url=target_url,
                        run_limit=run_limit,
                        queue_extraction=queue_extraction,
                        error_log=error_log,
                        mock=mock,
                    ):
                        _bump_source_failure(
                            supabase, src,
                            error_class="empty_api_response",
                            error_message="api adapter returned no entries",
                            attempted_url=target_url,
                        )
                        continue
                    _mark_source_success(src)
                except Exception as exc:  # noqa: BLE001
                    error_class, error_message = _classify_exception(exc)
                    error_log.append({"source": source.name, "error": error_class, "error_message": error_message, "at": utc_now_iso()})
                    _bump_source_failure(
                        supabase, src,
                        error_class=error_class,
                        error_message=error_message,
                        attempted_url=target_url,
                    )
                continue

            if source.adapter_type and source.adapter_type.lower() == "sitemap":
                try:
                    if not _run_sitemap_pass(
                        supabase,
                        src=src,
                        source=source,
                        run_id=run_id,
                        target_url=target_url,
                        run_limit=run_limit,
                        queue_extraction=queue_extraction,
                        error_log=error_log,
                        mock=mock,
                    ):
                        _bump_source_failure(
                            supabase, src,
                            error_class="empty_sitemap",
                            error_message="sitemap adapter returned no entries",
                            attempted_url=target_url,
                        )
                        continue
                    _mark_source_success(src)
                except Exception as exc:  # noqa: BLE001
                    error_class, error_message = _classify_exception(exc)
                    error_log.append({"source": source.name, "error": error_class, "error_message": error_message, "at": utc_now_iso()})
                    _bump_source_failure(
                        supabase, src,
                        error_class=error_class,
                        error_message=error_message,
                        attempted_url=target_url,
                    )
                continue

            if source.adapter_type and source.adapter_type.lower() == "pdf":
                try:
                    if not _run_pdf_pass(
                        supabase,
                        src=src,
                        source=source,
                        run_id=run_id,
                        target_url=target_url,
                        queue_extraction=queue_extraction,
                        error_log=error_log,
                        mock=mock,
                    ):
                        # _run_pdf_pass appended a typed entry to error_log;
                        # mirror its class onto the source so the admin
                        # source view shows "needs manual review" rather
                        # than a generic empty_pdf for scanned bulletins.
                        last_entry = error_log[-1] if error_log else {}
                        pdf_error_class = last_entry.get("error") or "empty_pdf"
                        _bump_source_failure(
                            supabase, src,
                            error_class=pdf_error_class,
                            error_message=last_entry.get("error_message")
                            or "pdf adapter returned no extractable text",
                            attempted_url=target_url,
                        )
                        continue
                    _mark_source_success(src)
                except Exception as exc:  # noqa: BLE001
                    error_class, error_message = _classify_exception(exc)
                    error_log.append({"source": source.name, "error": error_class, "error_message": error_message, "at": utc_now_iso()})
                    _bump_source_failure(
                        supabase, src,
                        error_class=error_class,
                        error_message=error_message,
                        attempted_url=target_url,
                    )
                continue
            try:
                if is_aggregator_source(src):
                    source_limit = min(run_limit, aggregator_max_items(src))
                    adapter_config = src.get("adapter_config") if isinstance(src.get("adapter_config"), dict) else {}
                    if mock:
                        detail_urls = mock_aggregator_detail_urls(source, count=min(3, source_limit))
                    else:
                        # Conditional listing fetch: when we have caching
                        # headers on file from a prior pass, send them and
                        # short-circuit on 304. Discovery (and the rest of
                        # the aggregator path) skips entirely for unchanged
                        # listings. Migration 044 added the storage columns.
                        prior_etag = src.get("last_listing_etag")
                        prior_modified = src.get("last_listing_modified")
                        if prior_etag or prior_modified:
                            listing_result = fetch(
                                target_url,
                                adapter_type="html",
                                if_none_match=prior_etag,
                                if_modified_since=prior_modified,
                            )
                            if not listing_result.ok and listing_result.error == "not_modified":
                                logger.info(
                                    "scrape.listing_unchanged source_id=%s source_name=%s url=%s",
                                    src.get("id"), source.name, target_url,
                                )
                                _mark_source_success(
                                    src, op="source_registry.mark_success_unchanged"
                                )
                                continue
                            if not listing_result.ok or not listing_result.text:
                                error_log.append({"source": source.name, "url": target_url, "error": listing_result.error or "empty_listing_response", "at": utc_now_iso()})
                                _bump_source_failure(
                                    supabase, src,
                                    error_class=listing_result.error or "empty_listing_response",
                                    error_message="aggregator listing fetch returned no HTML",
                                    http_status=listing_result.status_code,
                                    attempted_url=target_url,
                                )
                                continue
                            # Reconstruct HTML from raw_bytes for downstream
                            # discovery (which walks anchors). FetchResult.text
                            # is already stripped.
                            try:
                                listing_html = (listing_result.raw_bytes or b"").decode("utf-8", errors="replace") or listing_result.text
                            except Exception:
                                listing_html = listing_result.text
                            # Remember the new caching headers for the next pass.
                            execute_or_default(
                                "source_registry.update_listing_headers",
                                lambda src=src, etag=listing_result.etag, mod=listing_result.last_modified:
                                    supabase.table("source_registry").update({
                                        "last_listing_etag": etag,
                                        "last_listing_modified": mod,
                                    }).eq("id", src["id"]).execute(),
                                None,
                            )
                        else:
                            listing_html = fetch_page_html(target_url)
                            if not listing_html:
                                error_log.append({"source": source.name, "url": target_url, "error": "Empty listing response", "at": utc_now_iso()})
                                _bump_source_failure(
                                    supabase, src,
                                    error_class="empty_listing_response",
                                    error_message="aggregator listing fetch returned no HTML",
                                    attempted_url=target_url,
                                )
                                continue
                        discovery = discover_aggregator_detail_urls(
                            listing_html,
                            target_url,
                            max_items=source_limit,
                            include_patterns=adapter_config.get("include_patterns") or None,
                            exclude_patterns=adapter_config.get("exclude_patterns") or None,
                            allowed_domains=adapter_config.get("allowed_domains") or None,
                        )
                        detail_urls = discovery.urls
                        discovery_stats = discovery.stats
                        logger.info(
                            "aggregator.discovery source_id=%s source_name=%s discovered=%s filtered_include=%s filtered_exclude=%s filtered_domain=%s lifecycle_skipped=%s",
                            src.get("id"),
                            source.name,
                            discovery_stats.get("discovered", len(detail_urls)),
                            discovery_stats.get("include", 0),
                            discovery_stats.get("exclude", 0),
                            discovery_stats.get("domain", 0),
                            discovery_stats.get("lifecycle_skipped", 0),
                        )
                        # Persist non-recruitment links (admit_card / result /
                        # corrigendum / ...) as recruitment_events. Events
                        # land unattached (recruitment_id NULL) when no
                        # canonical row exists yet — admin reconciles later.
                        for evt_link in discovery.lifecycle_links:
                            _record_lifecycle_event(
                                supabase,
                                source_id=src.get("id"),
                                listing_id=None,
                                event_type=evt_link.event_type,
                                url=evt_link.url,
                                label=evt_link.label,
                            )
                    if not detail_urls:
                        error_log.append({"source": source.name, "url": target_url, "error": "No detail links discovered", "at": utc_now_iso()})
                        _bump_source_failure(
                            supabase, src,
                            error_class="no_detail_links",
                            error_message="aggregator listing had no recruitment detail links",
                            attempted_url=target_url,
                        )
                        continue
                    found_before = total_found
                    # Build a uniform list of (url, label, event_type) tuples
                    # regardless of mock vs live so the rest of the loop stays
                    # branch-free.
                    if mock:
                        detail_entries: list[tuple[str, str, str]] = [
                            (u, "", "new_recruitment") for u in detail_urls
                        ]
                    else:
                        detail_entries = [
                            (link.url, link.label, link.event_type) for link in discovery.links
                        ]

                    for detail_url, label, event_type in detail_entries:
                        if mock:
                            detail_html = None
                            raw_text = f"MOCK DETAIL PAGE TEXT FOR {detail_url}"
                        else:
                            # Change detection: only use the conditional
                            # ``fetch()`` path when we already have ETag /
                            # Last-Modified on file for this URL. Without
                            # prior headers we fall back to the legacy
                            # ``fetch_page_html()`` so existing call sites
                            # and test monkeypatches keep working.
                            prior = _lookup_prior_document_headers(supabase, detail_url)
                            if prior.get("etag") or prior.get("last_modified"):
                                result = fetch(
                                    detail_url,
                                    adapter_type="html",
                                    if_none_match=prior.get("etag"),
                                    if_modified_since=prior.get("last_modified"),
                                )
                                if not result.ok and result.error == "not_modified":
                                    logger.info(
                                        "scrape.detail_unchanged source_id=%s detail_url=%s",
                                        src.get("id"), detail_url,
                                    )
                                    listing_id_unchanged = _upsert_aggregator_listing(
                                        supabase,
                                        source_id=src.get("id"),
                                        scrape_run_id=run_id,
                                        detail_url=detail_url,
                                        label=label,
                                        event_type=event_type,
                                    )
                                    _record_listing_observation(
                                        supabase,
                                        listing_id=listing_id_unchanged,
                                        source_id=src.get("id"),
                                        scrape_run_id=run_id,
                                        observed_url=detail_url,
                                        observed_label=label,
                                        content_hash=None,
                                    )
                                    continue
                                if not result.ok or not result.text:
                                    error_log.append({"source": source.name, "url": detail_url, "error": result.error or "Empty response", "at": utc_now_iso()})
                                    continue
                                raw_text = result.text
                                try:
                                    detail_html = (result.raw_bytes or b"").decode("utf-8", errors="replace")
                                except Exception:
                                    detail_html = result.text
                            else:
                                detail_html = fetch_page_html(detail_url)
                                if not detail_html:
                                    error_log.append({"source": source.name, "url": detail_url, "error": "Empty response", "at": utc_now_iso()})
                                    continue
                                raw_text = strip_html(detail_html)

                        listing_id = _upsert_aggregator_listing(
                            supabase,
                            source_id=src.get("id"),
                            scrape_run_id=run_id,
                            detail_url=detail_url,
                            label=label,
                            event_type=event_type,
                        )
                        _record_listing_observation(
                            supabase,
                            listing_id=listing_id,
                            source_id=src.get("id"),
                            scrape_run_id=run_id,
                            observed_url=detail_url,
                            observed_label=label,
                            content_hash=None,
                        )

                        # Try to upgrade the aggregator detail page to an
                        # official source. When the resolver finds a real
                        # ``.gov.in`` / registry-host anchor we fetch *that*
                        # and pass its body to the extractor; aggregator
                        # paraphrasing never becomes canonical truth.
                        resolver_result: ResolverResult | None = None
                        item_url = detail_url
                        raw_for_extraction = raw_text
                        if not mock and detail_html:
                            resolver_result = resolve_with_registry(detail_html, detail_url, source)
                            if resolver_result:
                                official_html = fetch_page_html(resolver_result.official_url)
                                if official_html:
                                    item_url = resolver_result.official_url
                                    raw_for_extraction = strip_html(official_html)
                                    _mark_listing_status(
                                        supabase, listing_id,
                                        "official_source_found",
                                        official_source_url=resolver_result.official_url,
                                    )
                                else:
                                    # Resolver pointed at an unreachable URL;
                                    # fall back to the aggregator body but
                                    # record that we tried.
                                    resolver_result = None
                                    _mark_listing_status(supabase, listing_id, "needs_official_source")
                            else:
                                _mark_listing_status(supabase, listing_id, "needs_official_source")

                        queue_extraction(
                            src,
                            source.name,
                            item_url,
                            raw_for_extraction,
                            listing_id=listing_id,
                            resolver_result=resolver_result,
                        )
                    if total_found == found_before:
                        _bump_source_failure(
                            supabase, src,
                            error_class="no_items_extracted",
                            error_message="every aggregator detail fetch returned empty or unextractable",
                            attempted_url=target_url,
                        )
                        continue
                else:
                    raw = fetch_page_text(target_url) if not mock else f"MOCK PAGE TEXT FOR {target_url}"
                    if not raw:
                        error_log.append({"source": source.name, "error": "Empty response", "at": utc_now_iso()})
                        _bump_source_failure(
                            supabase, src,
                            error_class="empty_response",
                            error_message="direct source fetch returned no body",
                            attempted_url=target_url,
                        )
                        continue
                    if not queue_extraction(src, source.name, target_url, raw):
                        _bump_source_failure(
                            supabase, src,
                            error_class="extraction_failed",
                            error_message="extractor returned null for fetched body",
                            attempted_url=target_url,
                        )
                        continue

                _mark_source_success(src)

            except Exception as exc:  # noqa: BLE001
                error_class, error_message = _classify_exception(exc)
                error_log.append({
                    "source": source.name,
                    "error": error_class,
                    "error_message": error_message,
                    "at": utc_now_iso(),
                })
                _bump_source_failure(
                    supabase, src,
                    error_class=error_class,
                    error_message=error_message,
                    attempted_url=target_url,
                )

        finally:
            # Success already cleared currently_scraping_at inside the
            # single mark_success PATCH (Task 1). Only the failure / no-op
            # paths need the standalone release here.
            if src.get("id") not in released_source_ids:
                _release_source_claim(supabase, src)

    # ── 5. Finalise the run row ──────────────────────────────────────────
    if sources and len(error_log) == len(sources):
        final_status = "failed"
    elif error_log:
        final_status = "partial"
    else:
        final_status = "completed"

    execute_or_raise(
        "scrape_runs.finalize",
        lambda: supabase.table("scrape_runs")
        .update(
            {
                "finished_at": utc_now_iso(),
                "status": final_status,
                "sources_checked": len(sources),
                "items_found": total_found,
                "items_new": total_new,
                "items_duplicate": total_dup,
                "error_log": error_log,
            }
        )
        .eq("id", run_id)
        .execute(),
    )

    return {
        "run_id": run_id,
        "status": final_status,
        "sources_checked": len(sources),
        "items_found": total_found,
        "items_new": total_new,
        "items_duplicate": total_dup,
        "errors": error_log,
    }


# ─── Per-source concurrency lock ──────────────────────────────────────────


# Stale-claim threshold. A claim older than this is treated as crashed
# and can be re-claimed by a fresh worker. 15 minutes covers the
# slowest realistic single-source pass (PDF bulletin + extraction).
_CLAIM_STALE_AFTER_SECONDS = 15 * 60


def _try_claim_source(supabase: Client, src: dict[str, Any]) -> bool:
    """Take an in-flight lock on ``source_registry.currently_scraping_at``.

    Returns ``True`` when the worker won the claim. Returns ``False``
    when another worker holds a fresh claim — caller skips this source
    for the run. A claim older than ``_CLAIM_STALE_AFTER_SECONDS`` is
    treated as crashed and gets overwritten.

    Primary path: the ``claim_source_for_scrape(uuid, integer)`` Postgres
    function added by migration 085. ``UPDATE … WHERE … RETURNING``
    guarantees that two concurrent callers always see exactly one
    success between them — no read-then-update race.

    Fallback: when the RPC is unavailable (older deploy / schema cache
    miss) we use the previous read-then-update path so behaviour stays
    identical pre-migration. Lock-infrastructure failures (DB
    unreachable) still return ``True`` rather than blocking the pass.
    """
    src_id = src.get("id")
    if not src_id:
        return False

    # Try the atomic RPC first.
    try:
        rpc_response = supabase.rpc(
            "claim_source_for_scrape",
            {"p_source_id": src_id, "p_stale_seconds": _CLAIM_STALE_AFTER_SECONDS},
        ).execute()
        claimed = rpc_response.data
        # Some clients return [True]/[False]; normalise.
        if isinstance(claimed, list) and claimed:
            claimed = claimed[0]
        if isinstance(claimed, bool):
            if not claimed:
                logger.info("scrape.source_locked source_id=%s reason=rpc_returned_false", src_id)
            return claimed
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if "claim_source_for_scrape" in msg and ("does not exist" in msg or "not found" in msg):
            logger.info("claim_source_for_scrape RPC unavailable; using read-then-update fallback")
        elif "pgrst202" in msg or "42883" in msg:
            logger.info("claim_source_for_scrape RPC unavailable; using read-then-update fallback")
        else:
            logger.warning("claim_source_for_scrape RPC failed; using read-then-update fallback: %s", exc)

    # Read-then-update fallback (older deploys without migration 085).
    try:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=_CLAIM_STALE_AFTER_SECONDS)).isoformat()
        rows = (
            supabase.table("source_registry")
            .select("id, currently_scraping_at")
            .eq("id", src_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return False
        held_at = rows[0].get("currently_scraping_at")
        if held_at and held_at > cutoff:
            logger.info("scrape.source_locked source_id=%s held_since=%s", src_id, held_at)
            return False
        supabase.table("source_registry").update(
            {"currently_scraping_at": utc_now_iso()}
        ).eq("id", src_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("source claim failed source_id=%s error=%s -- proceeding without lock", src_id, exc)
        return True


def _release_source_claim(supabase: Client, src: dict[str, Any]) -> None:
    """Clear ``currently_scraping_at``. Called from a finally block."""
    src_id = src.get("id")
    if not src_id:
        return
    try:
        supabase.table("source_registry").update(
            {"currently_scraping_at": None}
        ).eq("id", src_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("source claim release failed source_id=%s error=%s", src_id, exc)


def _bump_source_failure(
    supabase: Client,
    src: dict[str, Any],
    *,
    error_class: str = "scrape_failed",
    error_message: str | None = None,
    http_status: int | None = None,
    attempted_url: str | None = None,
) -> None:
    """Record a structured source-health failure.

    Migration 037 added ``last_error_class``, ``last_error_message``,
    ``last_error_at``, ``last_error_http_status``, and ``last_error_url``
    so admins can see *why* a source is degrading instead of just that
    it is. ``last_error`` keeps a short human-readable summary for
    back-compat with existing dashboards. ``last_scraped_at`` is updated
    on failure too — previously the column only moved on success, so a
    source that had been failing for hours still looked "recent".
    """
    now = utc_now_iso()
    summary = error_class
    if error_message:
        summary = f"{error_class}: {error_message[:200]}"
    update: dict[str, Any] = {
        "consecutive_fails": (src.get("consecutive_fails") or 0) + 1,
        "last_error": summary,
        "last_error_class": error_class,
        "last_error_message": error_message,
        "last_error_at": now,
        "last_error_http_status": http_status,
        "last_error_url": attempted_url,
        "last_scraped_at": now,
    }
    execute_or_default(
        "source_registry.bump_failure",
        lambda: supabase.table("source_registry")
        .update(update)
        .eq("id", src["id"])
        .execute(),
        None,
    )


# ── Task 5: low-confidence gate + per-source circuit breaker ───────────
# A reviewer discards near-zero-confidence extractions anyway, so there is
# no value in spending a scrape_queue row (and the downstream document /
# candidate / draft writes) on them. The per-source strike counter then
# auto-disables a source that keeps producing low-confidence output, so we
# stop paying for LLM calls on a structurally-broken source.
#
# Defaults are overridable via env. Strikes are in-memory (per-process);
# durable persistence is a documented follow-up.
MIN_CONFIDENCE_TO_QUEUE = 0.20
LOW_CONFIDENCE_STRIKE_LIMIT = 3
_low_confidence_strikes: dict[str, int] = {}


def _min_confidence_to_queue() -> float:
    raw = os.getenv("MIN_CONFIDENCE_TO_QUEUE")
    if raw is not None:
        try:
            return float(raw)
        except ValueError:
            pass
    return MIN_CONFIDENCE_TO_QUEUE


def _low_confidence_strike_limit() -> int:
    raw = os.getenv("LOW_CONFIDENCE_STRIKE_LIMIT")
    if raw is not None:
        try:
            return int(raw)
        except ValueError:
            pass
    return LOW_CONFIDENCE_STRIKE_LIMIT


def _reset_low_confidence_strikes(source_id: str | None) -> None:
    if source_id:
        _low_confidence_strikes.pop(source_id, None)


def _record_low_confidence_and_maybe_disable(
    supabase: Client,
    *,
    run_id: str,
    src: dict[str, Any],
    source_url: str,
    confidence: float,
    data_quality_score: float | None,
    extracted_data: dict[str, Any],
) -> None:
    """Persist a skipped low-confidence extraction and bump the strike count.

    ``low_quality_extractions`` does not exist yet (flagged as a follow-up
    migration); when the insert fails we fall back to a structured WARNING
    and still skip the scrape_queue insert. After
    ``LOW_CONFIDENCE_STRIKE_LIMIT`` consecutive low-confidence runs the
    source is auto-disabled so future runs don't even claim it (the
    is_active=False filter excludes it from the next source load).
    """
    src_id = src.get("id")
    row = {
        "run_id": run_id,
        "source_id": src_id,
        "source_url": source_url,
        "confidence_score": confidence,
        "data_quality_score": data_quality_score,
        "extracted_data": extracted_data,
        "created_at": utc_now_iso(),
    }
    try:
        supabase.table("low_quality_extractions").insert(row).execute()
    except Exception as exc:  # noqa: BLE001 - table may not exist yet
        logger.warning(
            "scrape.low_confidence_skipped run_id=%s source_id=%s url=%s "
            "confidence=%.2f data_quality=%s reason=below_min_threshold "
            "low_quality_extractions_unavailable=%s",
            run_id, src_id, source_url, confidence, data_quality_score, exc,
        )

    if not src_id:
        return
    strikes = _low_confidence_strikes.get(src_id, 0) + 1
    _low_confidence_strikes[src_id] = strikes
    if strikes >= _low_confidence_strike_limit():
        logger.warning(
            "scrape.source_auto_disabled source_id=%s strikes=%d reason=low_confidence",
            src_id, strikes,
        )
        execute_or_default(
            "source_registry.auto_disable_low_confidence",
            lambda: supabase.table("source_registry").update({
                "is_active": False,
                "verification_status": "auto_disabled_low_confidence",
            }).eq("id", src_id).execute(),
            None,
        )
        _low_confidence_strikes.pop(src_id, None)


def _classify_exception(exc: BaseException) -> tuple[str, str]:
    """Return a ``(error_class, error_message)`` pair from an exception."""
    cls = type(exc).__name__
    msg = str(exc) or cls
    return cls, msg


def _finalize_run_failed(
    supabase: Client,
    run_id: str,
    reason: str,
    exc: BaseException,
) -> None:
    """Mark the scrape_runs row as failed before re-raising a critical read error.

    Without this, a Supabase outage during source/dedupe reads would leave
    the run row stuck in ``status='running'`` forever and the original
    error would never make it into ``error_log``.
    """
    error_class, error_message = _classify_exception(exc)
    logger.error(
        "scrape.run.critical_read_failed run_id=%s reason=%s error_class=%s error=%s",
        run_id, reason, error_class, error_message,
    )
    payload = {
        "finished_at": utc_now_iso(),
        "status": "failed",
        "error_log": [{
            "error": reason,
            "error_class": error_class,
            "error_message": error_message,
            "at": utc_now_iso(),
        }],
    }
    execute_or_default(
        "scrape_runs.finalize_failed",
        lambda: supabase.table("scrape_runs").update(payload).eq("id", run_id).execute(),
        None,
    )


# ════════════════════════════════════════════════════════════════════════════
#  Promote queue item → canonical recruitments
# ════════════════════════════════════════════════════════════════════════════


def _derive_status(start: str | None, end: str | None) -> str:
    today = datetime.now(timezone.utc).date()
    try:
        s = datetime.fromisoformat(start).date() if start else None
    except Exception:
        s = None
    try:
        e = datetime.fromisoformat(end).date() if end else None
    except Exception:
        e = None
    if e and e < today:
        return "closed"
    if s and s > today:
        return "upcoming"
    if s and s <= today:
        return "open"
    return "upcoming"


_EDU_KEYWORD_TO_LEVEL: list[tuple[tuple[str, ...], str]] = [
    (("phd", "doctorate"), "phd"),
    (("postgraduate", "post graduate", "master"), "postgraduate"),
    (("graduate", "bachelor", "degree"), "graduate"),
    (("diploma",), "diploma"),
    (("12", "xii", "senior secondary", "intermediate"), "12th"),
    (("10", " x ", "matriculation", "secondary"), "10th"),
]


def _map_education_level(raw: str | None) -> str | None:
    """Map a free-text education requirement to a canonical level.

    Returns ``None`` when the text can't be classified — the caller
    must NOT substitute a default. Defaulting unclassified text to
    ``"graduate"`` (the old behaviour) wrongly excluded 10th / 12th /
    diploma candidates from eligibility. An unclassified post keeps its
    ``raw_requirement_text`` so a mapper / reviewer can resolve it later.
    """
    s = (raw or "").lower()
    if not s.strip():
        return None
    for keywords, level in _EDU_KEYWORD_TO_LEVEL:
        for k in keywords:
            if k in s:
                return level
    return None


def _find_or_create_organization(
    supabase: Client,
    *,
    name: str,
    org_type: str | None,
    state: str | None = None,
    operation: str = "organizations",
) -> str:
    clean_name = (name or "").strip()
    if not clean_name:
        raise PromotionError("[promote] organization name is required")

    org_rows = execute_or_raise(
        f"{operation}.select",
        lambda: supabase.table("organizations")
        .select("id")
        .eq("name", clean_name)
        .limit(1)
        .execute(),
    ).data or []
    if org_rows:
        return org_rows[0]["id"]

    org_payload = {"name": clean_name, "type": org_type}
    if state:
        org_payload["state"] = state
    inserted = execute_or_raise(
        f"{operation}.insert",
        lambda: supabase.table("organizations").insert(org_payload).execute(),
    ).data or []
    if not inserted:
        raise RuntimeError(f"[promote] organization insert returned no row for {clean_name}")
    return inserted[0]["id"]


def _persist_post_vacancies(
    supabase: Client,
    *,
    post: Any,
    post_id: str,
    created: list[tuple[str, str]],
) -> None:
    """Write per-post vacancies into ``vacancy_reservations``.

    Two cases:
      * ``post.category_vacancies`` is a dict ({"UR": 50, "SC": 15, ...}) →
        one row per key, with ``vertical_category`` set.
      * Only ``post.vacancies`` is a plain integer → one unreserved row
        with ``vertical_category=NULL``.

    A post with neither writes no rows. Each inserted row id is recorded
    in ``created`` so the compensation path can roll it back.
    """
    category_map = getattr(post, "category_vacancies", None)
    if isinstance(category_map, dict) and category_map:
        for category, count in category_map.items():
            if not isinstance(count, int) or count < 0:
                continue
            rows = execute_or_raise(
                "vacancy_reservations.insert",
                lambda category=category, count=count, post_id=post_id: supabase.table(
                    "vacancy_reservations"
                )
                .insert(
                    {
                        "post_id": post_id,
                        "vertical_category": category,
                        "vacancy_count": count,
                    }
                )
                .execute(),
            ).data or []
            if rows:
                created.append(("vacancy_reservations", rows[0]["id"]))
        return

    total = getattr(post, "vacancies", None)
    if isinstance(total, int) and total > 0:
        rows = execute_or_raise(
            "vacancy_reservations.insert",
            lambda total=total, post_id=post_id: supabase.table("vacancy_reservations")
            .insert(
                {
                    "post_id": post_id,
                    "vertical_category": None,
                    "vacancy_count": total,
                }
            )
            .execute(),
        ).data or []
        if rows:
            created.append(("vacancy_reservations", rows[0]["id"]))


def _persist_post_exam_pattern(
    supabase: Client,
    *,
    post: Any,
    post_id: str,
    created: list[tuple[str, str]],
) -> None:
    """Write ``post.exam_pattern`` into the canonical ``exam_patterns`` table.

    Each item should be a dict like ``{"section": str, "questions": int,
    "marks": int, "duration_minutes": int, "negative_marking": str | None}``.
    Empty / non-list values are no-ops.
    """
    pattern = getattr(post, "exam_pattern", None)
    if not isinstance(pattern, list):
        return
    for sort_order, stage in enumerate(pattern):
        if not isinstance(stage, dict):
            continue
        section = stage.get("section") or stage.get("section_name") or ""
        payload: dict[str, Any] = {
            "post_id": post_id,
            "stage_name": str(stage.get("stage_name") or section or "stage"),
            "section_name": (str(section) if section else None),
            "question_count": stage.get("questions") if isinstance(stage.get("questions"), int) else None,
            "marks": stage.get("marks") if isinstance(stage.get("marks"), int) else None,
            "duration_minutes": stage.get("duration_minutes") if isinstance(stage.get("duration_minutes"), int) else None,
            "negative_marking": (str(stage.get("negative_marking")) if stage.get("negative_marking") is not None else None),
            "sort_order": sort_order,
        }
        rows = execute_or_raise(
            "exam_patterns.insert",
            lambda payload=payload: supabase.table("exam_patterns").insert(payload).execute(),
        ).data or []
        if rows:
            created.append(("exam_patterns", rows[0]["id"]))


def _persist_post_skill_tests(
    supabase: Client,
    *,
    post: Any,
    post_id: str,
    created: list[tuple[str, str]],
) -> None:
    """Write ``post.skill_tests`` into ``skill_tests``.

    Items: ``{"type": str, "wpm": int | None, "duration_minutes": int | None}``.
    """
    tests = getattr(post, "skill_tests", None)
    if not isinstance(tests, list):
        return
    for test in tests:
        if not isinstance(test, dict):
            continue
        test_type = test.get("type") or test.get("test_type")
        if not test_type:
            continue
        wpm = test.get("wpm") or test.get("speed_requirement")
        payload: dict[str, Any] = {
            "post_id": post_id,
            "test_type": str(test_type),
            "speed_requirement": (str(wpm) if wpm is not None else None),
            "duration_minutes": test.get("duration_minutes") if isinstance(test.get("duration_minutes"), int) else None,
            "evaluation_formula": test.get("evaluation_formula"),
        }
        rows = execute_or_raise(
            "skill_tests.insert",
            lambda payload=payload: supabase.table("skill_tests").insert(payload).execute(),
        ).data or []
        if rows:
            created.append(("skill_tests", rows[0]["id"]))


def _persist_post_fees(
    supabase: Client,
    *,
    post: Any,
    post_id: str,
    created: list[tuple[str, str]],
) -> None:
    """Write ``post.fees`` (dict category → amount, plus optional
    ``currency`` key) into the canonical ``post_fees`` table.

    One row per non-currency key with a numeric value. Negative or
    non-numeric amounts are skipped silently.
    """
    fees = getattr(post, "fees", None)
    if not isinstance(fees, dict):
        return
    currency = str(fees.get("currency") or "INR")
    for category, amount in fees.items():
        if category == "currency":
            continue
        if not isinstance(amount, (int, float)) or amount < 0:
            continue
        payload: dict[str, Any] = {
            "post_id": post_id,
            "category": str(category),
            "amount": amount,
            "currency": currency,
        }
        rows = execute_or_raise(
            "post_fees.insert",
            lambda payload=payload: supabase.table("post_fees").insert(payload).execute(),
        ).data or []
        if rows:
            created.append(("post_fees", rows[0]["id"]))


def _persist_post_selection_process(
    supabase: Client,
    *,
    post: Any,
    post_id: str,
    created: list[tuple[str, str]],
) -> None:
    """Write ``post.selection_process`` (ordered list of stage labels)
    into ``post_selection_stages``. Order is preserved via sort_order.
    Non-string / empty entries are skipped.
    """
    stages = getattr(post, "selection_process", None)
    if not isinstance(stages, list):
        return
    for sort_order, stage in enumerate(stages):
        label = str(stage).strip() if stage is not None else ""
        if not label:
            continue
        payload: dict[str, Any] = {
            "post_id": post_id,
            "stage_label": label,
            "sort_order": sort_order,
        }
        rows = execute_or_raise(
            "post_selection_stages.insert",
            lambda payload=payload: supabase.table("post_selection_stages").insert(payload).execute(),
        ).data or []
        if rows:
            created.append(("post_selection_stages", rows[0]["id"]))


def _persist_post_age_relaxation(
    supabase: Client,
    *,
    post: Any,
    post_id: str,
    created: list[tuple[str, str]],
) -> None:
    """Write ``post.age_relaxation`` (dict of category → years) into
    ``age_relaxation_rules``. One row per category. Non-dict values are
    no-ops; non-integer year values are skipped.
    """
    relax = getattr(post, "age_relaxation", None)
    if not isinstance(relax, dict):
        return
    for category, years in relax.items():
        if not isinstance(years, int) or years < 0:
            continue
        payload: dict[str, Any] = {
            "post_id": post_id,
            "reservation_category": str(category),
            "additional_years": years,
        }
        rows = execute_or_raise(
            "age_relaxation_rules.insert",
            lambda payload=payload: supabase.table("age_relaxation_rules").insert(payload).execute(),
        ).data or []
        if rows:
            created.append(("age_relaxation_rules", rows[0]["id"]))


def _compensate_promotion(
    supabase: Client,
    created: list[tuple[str, str]],
    *,
    reason: str,
) -> None:
    """Delete rows inserted during a failed promotion, in reverse FK order.

    Promotion writes organizations, recruitments, units, posts, age_criteria,
    and education_criteria through separate calls. We can't run them in one
    DB transaction without an RPC, so on partial failure we walk back the
    list of rows we definitely created on this call and delete them. Only
    rows recorded in ``created`` are touched — organizations are reused
    across recruitments and are never touched here.
    """
    if not created:
        return
    for table, row_id in reversed(created):
        try:
            supabase.table(table).delete().eq("id", row_id).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[promote] compensation delete failed table=%s id=%s reason=%s error=%s",
                table, row_id, reason, exc,
            )


def _build_promotion_rpc_payload(
    data: VerifiedRecruitmentForPromotion,
    *,
    source_id: str | None,
    slug: str,
) -> dict[str, Any]:
    """Pack an :class:`ExtractedRecruitment` into the JSON shape that
    migration 040's ``promote_recruitment`` RPC accepts.

    The RPC is dumb on purpose: every field is taken verbatim. The
    Python side does the qualification-level mapping (so the regex
    keyword table stays in one place) and the ``derived_status``
    computation (so we don't duplicate timezone math in SQL).
    """
    posts: list[dict[str, Any]] = []
    for post in data.posts or []:
        posts.append({
            "post_name": post.post_name,
            "group_type": post.group_type,
            "pay_level": post.pay_level,
            "vacancies": post.vacancies,
            "category_vacancies": post.category_vacancies,
            "min_age": post.min_age,
            "max_age": post.max_age,
            "age_cutoff_date": post.age_cutoff_date,
            "education_required": post.education_required,
            "raw_requirement_text": post.raw_requirement_text,
            "disciplines": post.disciplines,
            "education_level": _map_education_level(post.education_required),
            "unit_code": post.unit_code,
            "unit_name": post.unit_name,
            "unit_location_state": post.unit_location_state,
            "unit_location_city": post.unit_location_city,
            "language_requirements": post.language_requirements or [],
            "exam_pattern": post.exam_pattern,
            "skill_tests": post.skill_tests,
            "age_relaxation": post.age_relaxation,
            "fees": post.fees,
            "selection_process": post.selection_process,
            "job_location": post.job_location,
            "certificates": post.certificates,
            "source_evidence": post.source_evidence,
        })
    return {
        "slug": slug,
        "title": data.title,
        "organization_name": data.organization_name,
        "org_type": data.org_type,
        "year": data.year,
        "notification_number": data.notification_number,
        "notification_date": data.notification_date,
        "apply_start_date": data.apply_start_date,
        "apply_end_date": data.apply_end_date,
        "derived_status": _derive_status(data.apply_start_date, data.apply_end_date),
        "total_vacancies": data.total_vacancies,
        "official_notification_url": data.official_notification_url,
        "official_apply_url": data.official_apply_url,
        "source_pdf_url": data.source_pdf_url,
        "source_id": source_id,
        "posts": posts,
    }


def _is_rpc_missing_error(exc: BaseException) -> bool:
    """Best-effort check for "function promote_recruitment does not exist".

    Older deploys without migration 040 raise PGRST 404 / 42883. We
    don't want to misclassify other errors as "RPC missing" or we'd
    silently mask real failures, so the check is intentionally narrow:
    the message must mention the function name or a known missing-RPC
    SQLSTATE / PostgREST code.
    """
    msg = str(exc).lower()
    if "promote_recruitment" in msg and ("does not exist" in msg or "not found" in msg):
        return True
    if "pgrst202" in msg or "42883" in msg:
        # PGRST202: function not in schema cache. 42883: undefined_function.
        return True
    return False


def _is_duplicate_slug_rpc_error(exc: BaseException) -> tuple[bool, str | None]:
    """The RPC raises SQLSTATE 23P01 on duplicate slug. Recover the
    existing recruitment id from the message when possible so the
    caller can build a ``DuplicatePromotionError`` that points at it.
    """
    msg = str(exc)
    if "23P01" not in msg and "duplicate slug" not in msg.lower():
        return False, None
    match = re.search(r"existing=([0-9a-f-]{36})", msg)
    return True, (match.group(1) if match else None)


def _enqueue_recompute_fanout(supabase: Client, recruitment_id: str) -> int:
    """Fan an eligibility recompute out to every onboarded user after a
    recruitment is promoted.

    The recompute queue + worker are *user*-keyed — ``run_eligibility_for_user``
    recomputes a whole user, not one recruitment — so a newly promoted
    recruitment would otherwise never be matched against any user until
    that user independently triggered a recompute (a profile edit).
    Promotion therefore enqueues one ``pending`` row per onboarded user.

    Bounded: users who already have a ``pending`` row are skipped, so a
    run that promotes many recruitments converges on roughly one row per
    user (the worker's full-user recompute picks up every new
    recruitment in one pass anyway). Best-effort — a failure here is
    logged but never fails the promotion; the recruitment is already
    written.
    """
    try:
        users = (
            supabase.table("profiles")
            .select("id")
            .eq("onboarding_completed", True)
            .execute()
            .data
            or []
        )
        user_ids = [u["id"] for u in users if u.get("id")]
        if not user_ids:
            return 0
        existing = (
            supabase.table("eligibility_recompute_queue")
            .select("user_id")
            .eq("status", "pending")
            .execute()
            .data
            or []
        )
        already = {r.get("user_id") for r in existing}
        now = utc_now_iso()
        rows = [
            {
                "user_id": uid,
                "reason": "recruitment.promoted",
                "status": "pending",
                "queued_at": now,
                "metadata": {"recruitment_id": recruitment_id},
                "attempt_count": 0,
            }
            for uid in user_ids
            if uid not in already
        ]
        if not rows:
            return 0
        inserted = 0
        for i in range(0, len(rows), 500):  # chunked: bound the request size
            chunk = rows[i : i + 500]
            execute_or_default(
                "eligibility_recompute_queue.fanout_insert",
                lambda chunk=chunk: supabase.table("eligibility_recompute_queue").insert(chunk).execute(),
                None,
            )
            inserted += len(chunk)
        logger.info(
            "[promote] recompute fan-out recruitment_id=%s onboarded_users=%s enqueued=%s",
            recruitment_id, len(user_ids), inserted,
        )
        return inserted
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "[promote] recompute fan-out failed recruitment_id=%s: %s",
            recruitment_id, exc,
        )
        return 0


def promote_to_recruitments(
    data: VerifiedRecruitmentForPromotion,
    supabase: Client,
    *,
    source_id: str | None = None,
    queue_id: str | None = None,
) -> str:
    """Promote a queue item into the canonical schema atomically.

    Primary path: the ``promote_recruitment`` Postgres function added by
    migration 040. Every insert (organizations find-or-create,
    recruitments, recruitment_units, posts, vacancy_reservations,
    age_criteria, education_criteria) runs inside a single Postgres
    transaction — partial failure can't leave orphans.

    Fallback path (kept verbatim): if the RPC is unavailable (older
    deploy, schema cache miss, etc.) we drop back to the Python+
    compensation pattern introduced in PR #121. Behaviour stays a
    strict subset of the RPC path.
    """
    open_conflict_fields = _open_conflict_field_keys(supabase, queue_id)
    if open_conflict_fields:
        raise OpenConflictPromotionError(
            queue_id=queue_id,
            field_keys=open_conflict_fields,
        )

    slug = compute_promotion_slug(data)
    rpc_payload = _build_promotion_rpc_payload(data, source_id=source_id, slug=slug)
    try:
        rpc_response = supabase.rpc("promote_recruitment", {"payload": rpc_payload}).execute()
        rec_id = rpc_response.data
        # Some clients return ``[uuid]`` or ``[{column: uuid}]``. Normalise.
        if isinstance(rec_id, list) and rec_id:
            head = rec_id[0]
            rec_id = head["recruitment_id"] if isinstance(head, dict) and "recruitment_id" in head else head
        if isinstance(rec_id, str) and rec_id:
            _reconcile_lifecycle_events(
                supabase,
                recruitment_id=rec_id,
                source_id=source_id,
                official_url=data.official_notification_url,
            )
            _enqueue_recompute_fanout(supabase, rec_id)
            return rec_id
    except DuplicatePromotionError:
        raise
    except Exception as exc:  # noqa: BLE001
        is_dup, existing_id = _is_duplicate_slug_rpc_error(exc)
        if is_dup:
            raise DuplicatePromotionError(
                existing_recruitment_id=existing_id or "",
                slug=slug,
            ) from exc
        if _is_rpc_missing_error(exc):
            logger.warning(
                "promote_recruitment RPC unavailable; using compensation-path fallback: %s",
                exc,
            )
        else:
            logger.warning(
                "promote_recruitment RPC failed; falling back to compensation path: %s",
                exc,
            )

    rec_id = _promote_to_recruitments_compensation(data, supabase, source_id=source_id, slug=slug)
    _reconcile_lifecycle_events(
        supabase,
        recruitment_id=rec_id,
        source_id=source_id,
        official_url=data.official_notification_url,
    )
    _enqueue_recompute_fanout(supabase, rec_id)
    return rec_id


def _promote_to_recruitments_compensation(
    data: VerifiedRecruitmentForPromotion,
    supabase: Client,
    *,
    source_id: str | None = None,
    slug: str | None = None,
) -> str:
    """Compensation-pattern promotion path. Used as the fallback when
    the ``promote_recruitment`` RPC is unavailable or fails for a
    non-duplicate reason. Same FK-aware rollback as PRs #121 / #127.
    """
    if slug is None:
        slug = compute_promotion_slug(data)
    # ── Organisation find/create ──
    org_id = _find_or_create_organization(
        supabase,
        name=data.organization_name,
        org_type=data.org_type,
    )

    # ── Recruitment insert ──
    slug = compute_promotion_slug(data)
    existing = execute_or_raise(
        "recruitments.read_duplicate_slug",
        lambda: supabase.table("recruitments").select("id,slug").eq("slug", slug).limit(1).execute(),
    ).data or []
    if existing:
        raise DuplicatePromotionError(existing_recruitment_id=existing[0]["id"], slug=slug)
    rec_payload = {
        "slug": slug,
        "organization_id": org_id,
        "name": data.title,
        "year": data.year,
        "notification_number": data.notification_number,
        "notification_date": data.notification_date,
        "apply_start_date": data.apply_start_date,
        "apply_end_date": data.apply_end_date,
        "status": _derive_status(data.apply_start_date, data.apply_end_date),
        "publish_status": "needs_review",  # newly promoted — admin still gates it
        "total_vacancies": data.total_vacancies,
        "official_notification_url": data.official_notification_url,
        "official_apply_url": data.official_apply_url,
        "source_pdf_url": data.source_pdf_url,
    }
    if source_id:
        rec_payload["source_id"] = source_id
    rec_rows = execute_or_raise("recruitments.insert", lambda: supabase.table("recruitments").insert(rec_payload).execute()).data or []
    if not rec_rows:
        raise RuntimeError("[promote] recruitment insert returned no row")
    rec_id: str = rec_rows[0]["id"]

    created: list[tuple[str, str]] = [("recruitments", rec_id)]

    try:
        # ── Posts + age_criteria + education_criteria ──
        unit_ids: dict[tuple[str | None, str | None, str | None, str | None], str] = {}
        for post in data.posts or []:
            unit_id = None
            if post.unit_name or post.unit_code:
                unit_key = (
                    post.unit_code,
                    post.unit_name,
                    post.unit_location_state,
                    post.unit_location_city,
                )
                unit_id = unit_ids.get(unit_key)
                if unit_id is None:
                    unit_org_id = org_id
                    if post.unit_name and post.unit_name != data.organization_name:
                        unit_org_id = _find_or_create_organization(
                            supabase,
                            name=post.unit_name,
                            org_type=data.org_type,
                            state=post.unit_location_state,
                            operation="organizations.unit",
                        )
                    unit_rows = execute_or_raise(
                        "recruitment_units.insert",
                        lambda post=post, unit_org_id=unit_org_id: supabase.table("recruitment_units")
                        .insert(
                            {
                                "recruitment_id": rec_id,
                                "organization_id": unit_org_id,
                                "unit_code": post.unit_code,
                                "unit_name": post.unit_name,
                                "location_state": post.unit_location_state,
                                "location_city": post.unit_location_city,
                            }
                        )
                        .execute(),
                    ).data or []
                    if not unit_rows:
                        raise PromotionError(f"unit insert returned no row for recruitment={rec_id}")
                    unit_id = unit_rows[0]["id"]
                    unit_ids[unit_key] = unit_id
                    created.append(("recruitment_units", unit_id))
            post_payload = {
                "recruitment_id": rec_id,
                "post_name": post.post_name,
                "group_type": post.group_type,
                "pay_level": post.pay_level,
                "job_type": "direct",
                "recruitment_unit_id": unit_id,
                "language_requirements": post.language_requirements or [],
                # Reaches here only after the promotion gate verified the
                # extracted value; default false is the safe choice when the
                # extractor saw no domicile statement.
                "requires_domicile": bool(post.requires_domicile),
                # Rich post fields (migration 058) — kept in lockstep with
                # the RPC path so the compensation fallback isn't lossy.
                "job_location": post.job_location,
                "certificates": post.certificates,
                "source_evidence": post.source_evidence,
            }
            post_rows = execute_or_raise("posts.insert", lambda: supabase.table("posts").insert(post_payload).execute()).data or []
            if not post_rows:
                raise PromotionError(f"post insert returned no row for recruitment={rec_id}")
            post_id = post_rows[0]["id"]
            created.append(("posts", post_id))

            # Persist per-post vacancies into the canonical
            # ``vacancy_reservations`` table. Single totals land as one
            # unreserved row; category-wise vacancies expand into one row
            # per vertical category (UR/SC/ST/OBC/EWS).
            _persist_post_vacancies(supabase, post=post, post_id=post_id, created=created)

            if post.min_age or post.max_age:
                # Indian notices often specify a separate "age as on" date;
                # fall back to apply_end_date only when the extractor didn't
                # find one.
                cutoff = post.age_cutoff_date or data.apply_end_date
                age_rows = execute_or_raise(
                    "age_criteria.insert",
                    lambda post=post, post_id=post_id, cutoff=cutoff: supabase.table("age_criteria").insert(
                        {
                            "post_id": post_id,
                            "min_age": post.min_age,
                            "max_age": post.max_age,
                            "cutoff_date": cutoff,
                        }
                    ).execute(),
                ).data or []
                if age_rows:
                    created.append(("age_criteria", age_rows[0]["id"]))

            if post.education_required or post.raw_requirement_text:
                edu_payload: dict[str, Any] = {
                    "post_id": post_id,
                    "min_qualification_level": _map_education_level(post.education_required),
                    "allowed_disciplines": (
                        {"primary": post.disciplines} if post.disciplines else None
                    ),
                }
                raw_text = post.raw_requirement_text or post.education_required
                if raw_text:
                    edu_payload["raw_requirement_text"] = raw_text
                edu_rows = execute_or_raise(
                    "education_criteria.insert",
                    lambda payload=edu_payload: supabase.table("education_criteria").insert(payload).execute(),
                ).data or []
                if edu_rows:
                    created.append(("education_criteria", edu_rows[0]["id"]))

            _persist_post_exam_pattern(supabase, post=post, post_id=post_id, created=created)
            _persist_post_skill_tests(supabase, post=post, post_id=post_id, created=created)
            _persist_post_age_relaxation(supabase, post=post, post_id=post_id, created=created)
            _persist_post_fees(supabase, post=post, post_id=post_id, created=created)
            _persist_post_selection_process(supabase, post=post, post_id=post_id, created=created)
    except Exception:
        _compensate_promotion(supabase, created, reason="post_insert_failed")
        raise

    return rec_id


def compute_promotion_slug(data: VerifiedRecruitmentForPromotion) -> str:
    return f"{slugify(data.title)}-{data.year}"


def promote_run(
    run_id: str,
    supabase: Client,
    *,
    reviewer_id: str | None = None,
) -> dict[str, Any]:
    """Promote every ``status='pending'`` queue item from a run.

    Returns ``{promoted, failed, recruitment_ids, errors}``. Each successful
    item's queue row is marked ``status='approved'`` with reviewer_id. Each
    failed item is left ``status='pending'`` (the caller can retry).
    """
    queued = (
        supabase.table("scrape_queue")
        .select(
            "id, source_id, extracted_data, status, official_source_resolved, "
            "official_source_host, extraction_status, notification_document_id, "
            "evidence_required"
        )
        .eq("scrape_run_id", run_id)
        .eq("status", "pending")
        .execute()).data or []

    promoted = 0
    failed = 0
    skipped = 0
    rec_ids: list[str] = []
    errors: list[dict[str, Any]] = []

    for item in queued:
        queue_id = item["id"]
        d = item.get("extracted_data")
        if not isinstance(d, dict):
            failed += 1
            errors.append({"queue_id": queue_id, "error": "extracted_data not a dict"})
            continue

        gate = evaluate_promotion_gate(supabase, item)
        if not gate.ok:
            skipped += 1
            errors.append({
                "queue_id": queue_id,
                "error": "gate_blocked",
                "reason": gate.reason,
                "unverified_fields": gate.unverified_fields,
            })
            logger.info(
                "[promote_run] queue_id=%s gate_blocked reason=%s unverified=%s",
                queue_id, gate.reason, gate.unverified_fields,
            )
            continue

        try:
            # Strict shape: structurally-incomplete rows fail here with a
            # clear ValidationError instead of half-writing a recruitment.
            extracted = VerifiedRecruitmentForPromotion(**d)
            rec_id = promote_to_recruitments(
                extracted,
                supabase,
                source_id=item.get("source_id"),
                queue_id=queue_id,
            )
            rec_ids.append(rec_id)
            update = {
                "status": "approved",
                "reviewed_at": utc_now_iso(),
                "promoted_recruitment_id": rec_id,
            }
            if reviewer_id:
                update["reviewer_id"] = reviewer_id
            execute_or_raise(
                "scrape_queue.promote_status_update",
                lambda update=update, qid=queue_id: supabase.table("scrape_queue").update(update).eq("id", qid).execute(),
            )
            promoted += 1
        except OpenConflictPromotionError as exc:
            skipped += 1
            errors.append({
                "queue_id": queue_id,
                "error": "open_conflicts",
                "reason": "consensus_conflicts_open",
                "unverified_fields": exc.field_keys,
            })
            logger.info(
                "[promote_run] queue_id=%s skipped: open consensus conflicts on %s",
                queue_id, exc.field_keys,
            )
        except Exception as exc:  # noqa: BLE001
            failed += 1
            errors.append({"queue_id": queue_id, "error": str(exc)})
            logger.warning("[promote_run] queue_id=%s failed: %s", queue_id, exc)

    return {
        "promoted": promoted,
        "failed": failed,
        "skipped": skipped,
        "recruitment_ids": rec_ids,
        "errors": errors,
    }
