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
import re
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from .extractor import (
    PROMPT_VERSION,
    compute_similarity_key,
    extract_recruitment_data,
    fetch_page_html,
    fetch_page_text,
)
from .fetcher import FetchResult, fetch, strip_html
from .dedup import find_duplicate
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

from .schemas import ExtractedRecruitment, to_json_safe

logger = logging.getLogger("career_copilot.scraping.runner")


class DuplicatePromotionError(PromotionError):
    def __init__(self, *, existing_recruitment_id: str, slug: str):
        super().__init__("Recruitment already exists")
        self.existing_recruitment_id = existing_recruitment_id
        self.slug = slug


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


# ─── Change-detection helper ──────────────────────────────────────────────


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
                .select("id, name, year, organizations(name), official_notification_url, official_apply_url")
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
        extraction = extract_recruitment_data(raw, item_url, source_name, mock=mock)
        if not extraction:
            error_log.append({"source": source_name, "url": item_url, "error": "Extraction returned null", "at": utc_now_iso()})
            return None

        data: ExtractedRecruitment = extraction["data"]
        confidence = float(extraction.get("confidence") or 0.5)
        total_found += 1

        sim_key = compute_similarity_key(data)
        decision = find_duplicate(
            data.model_dump(),
            sim_key=sim_key,
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
            "extraction_status": "ok",
            "notification_document_id": document_id,
            "extraction_provider": extraction_provider,
            "extraction_prompt_version": PROMPT_VERSION,
        }
        logger.info(
            "scrape.queue_insert run_id=%s source_id=%s source_name=%s target_url=%s extraction_status=%s confidence_score=%.2f data_quality_score=%.2f duplicate_status=%s duplicate_reason=%s resolver=%s",
            run_id, src.get("id"), source_name, item_url, "ok",
            confidence, normalized.data_quality_score, queue_payload["status"], decision.reason,
            resolver_result.reason if resolver_result else None,
        )
        inserted = execute_or_raise(
            "scrape_queue.insert",
            lambda payload=queue_payload: supabase.table("scrape_queue").insert(payload).execute(),
        ).data or []
        inserted_id = inserted[0].get("id") if inserted else None

        if decision.is_duplicate:
            total_dup += 1
        else:
            total_new += 1
            if inserted_id:
                queued_id_by_key.setdefault(sim_key, inserted_id)

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

    for src in sources:
        source = normalize_source_registry(src)
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
        if source.adapter_type and source.adapter_type.lower() in {"rss", "api", "pdf"}:
            logger.info(
                "scrape.adapter_not_implemented source_id=%s source_name=%s adapter_type=%s",
                src.get("id"), source.name, source.adapter_type,
            )
            error_log.append({
                "source": source.name,
                "url": target_url,
                "error": "adapter_not_implemented",
                "adapter_type": source.adapter_type,
                "at": utc_now_iso(),
            })
            _bump_source_failure(
                supabase, src,
                error_class="adapter_not_implemented",
                error_message=f"adapter_type={source.adapter_type} not yet supported",
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

            execute_or_default(
                "source_registry.mark_success",
                lambda src=src: supabase.table("source_registry")
                .update(
                    {
                        "last_scraped_at": utc_now_iso(),
                        "last_success_at": utc_now_iso(),
                        "consecutive_fails": 0,
                        "last_error": None,
                        "last_error_class": None,
                        "last_error_message": None,
                        "last_error_at": None,
                        "last_error_http_status": None,
                        "last_error_url": None,
                    }
                )
                .eq("id", src["id"])
                .execute(),
                None,
            )

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


def _map_education_level(raw: str | None) -> str:
    s = (raw or "").lower()
    for keywords, level in _EDU_KEYWORD_TO_LEVEL:
        for k in keywords:
            if k in s:
                return level
    return "graduate"


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
    data: ExtractedRecruitment,
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
        })
    return {
        "slug": slug,
        "title": data.title,
        "organization_name": data.organization_name,
        "org_type": data.org_type,
        "year": data.year,
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


def promote_to_recruitments(
    data: ExtractedRecruitment,
    supabase: Client,
    *,
    source_id: str | None = None,
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

    return _promote_to_recruitments_compensation(data, supabase, source_id=source_id, slug=slug)


def _promote_to_recruitments_compensation(
    data: ExtractedRecruitment,
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
    except Exception:
        _compensate_promotion(supabase, created, reason="post_insert_failed")
        raise

    return rec_id


def compute_promotion_slug(data: ExtractedRecruitment) -> str:
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
            extracted = ExtractedRecruitment(**d)
            rec_id = promote_to_recruitments(extracted, supabase, source_id=item.get("source_id"))
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
