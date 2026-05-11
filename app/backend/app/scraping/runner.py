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

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from .extractor import (
    PROMPT_VERSION,
    build_recruitment_key,
    compute_similarity_key,
    extract_recruitment_data,
    fetch_page_html,
    fetch_page_text,
)
from .dedup import fuzzy_duplicate
from .normalizer import normalize_recruitment
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



# ════════════════════════════════════════════════════════════════════════════
#  Scrape pass
# ════════════════════════════════════════════════════════════════════════════


def run_scraping_pass(
    supabase: Client,
    *,
    triggered_by: str = "manual",
    triggered_by_user: str | None = None,
    source_ids: list[str] | None = None,
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

    # ── 2. Load active sources from the legacy table ─────────────────────
    src_q = (
        supabase.table("source_registry")
        .select("*")
        .eq("is_active", True)
        .order("last_scraped_at", desc=False, nullsfirst=True)
    )
    if source_ids:
        src_q = src_q.in_("id", source_ids)
    sources: list[dict[str, Any]] = execute_or_default("source_registry.active.read", lambda: src_q.execute().data, []) or []

    # ── 3. Build dedup index from existing recruitments + open queue ─────
    existing_recs = execute_or_default("recruitments.read_for_dedupe",
        lambda: supabase.table("recruitments")
        .select("id, name, year, organizations(name)")
        .execute()
        .data,
        default=[],
    ) or []

    existing_keys: set[str] = set()
    existing_id_by_key: dict[str, str] = {}
    for r in existing_recs:
        org = r.get("organizations")
        if isinstance(org, list):
            org = org[0] if org else None
        org_name = (org or {}).get("name") or ""
        key = build_recruitment_key(org_name, r.get("year"), r.get("name") or "")
        existing_keys.add(key)
        existing_id_by_key[key] = r["id"]

    open_queue = execute_or_default("scrape_queue.read_open_for_dedupe",
        lambda: supabase.table("scrape_queue")
        .select("extracted_data, status")
        .not_.in_("status", ["rejected", "duplicate"])
        .execute()
        .data,
        default=[],
    ) or []

    queued_keys: set[str] = set()
    for item in open_queue:
        d = item.get("extracted_data")
        if isinstance(d, dict) and isinstance(d.get("organization_name"), str):
            try:
                queued_keys.add(compute_similarity_key(ExtractedRecruitment(**d)))
            except Exception:
                pass

    # ── 4. Process each source ───────────────────────────────────────────
    total_found = 0
    total_new = 0
    total_dup = 0
    error_log: list[dict[str, Any]] = []

    def queue_extraction(src: dict[str, Any], source_name: str, item_url: str, raw: str) -> bool:
        nonlocal total_found, total_new, total_dup
        extraction = extract_recruitment_data(raw, item_url, source_name, mock=mock)
        if not extraction:
            error_log.append({"source": source_name, "url": item_url, "error": "Extraction returned null", "at": utc_now_iso()})
            return False

        data: ExtractedRecruitment = extraction["data"]
        confidence = float(extraction.get("confidence") or 0.5)
        total_found += 1

        sim_key = compute_similarity_key(data)
        fuzzy_dup = any(fuzzy_duplicate(data.title, (r.get("name") or "")) for r in existing_recs)
        is_dup = sim_key in existing_keys or sim_key in queued_keys or fuzzy_dup
        duplicate_of = existing_id_by_key.get(sim_key)
        duplicate_reason = "similarity_key" if (sim_key in existing_keys or sim_key in queued_keys) else ("fuzzy_match" if fuzzy_dup else None)
        normalized = normalize_recruitment(data)
        extracted_payload = to_json_safe(data)
        extracted_payload["_meta"] = {
            "prompt_version": PROMPT_VERSION,
            "data_quality_score": normalized.data_quality_score,
            "warnings": normalized.warnings,
            "normalized_fields": normalized.normalized_fields,
            "duplicate_reason": duplicate_reason,
            "source_registry_id": src.get("id"),
            "source_type": src.get("source_type"),
        }

        queue_payload = {
            "source_url": item_url,
            "source_name": source_name,
            "source_id": src.get("id"),
            "extracted_data": extracted_payload,
            "confidence_score": confidence,
            "scrape_run_id": run_id,
            "duplicate_of": duplicate_of,
            "scraped_at": utc_now_iso(),
            "status": "duplicate" if is_dup else "pending",
            "official_source_resolved": not bool(src.get("requires_official_confirmation")),
            "evidence_required": bool(src.get("requires_official_confirmation")),
            "extraction_status": "ok",
        }
        logger.info("scrape.queue_insert run_id=%s source_id=%s source_name=%s target_url=%s extraction_status=%s confidence_score=%.2f data_quality_score=%.2f duplicate_status=%s",
                    run_id, src.get("id"), source_name, item_url, "ok", confidence, normalized.data_quality_score, queue_payload["status"])
        execute_or_raise("scrape_queue.insert", lambda payload=queue_payload: supabase.table("scrape_queue").insert(payload).execute())

        if is_dup:
            total_dup += 1
        else:
            total_new += 1
            queued_keys.add(sim_key)
        return True

    for src in sources:
        source = normalize_source_registry(src)
        target_url = source.target_url
        try:
            if is_aggregator_source(src):
                if mock:
                    detail_urls = mock_aggregator_detail_urls(source, count=min(3, aggregator_max_items(src)))
                else:
                    listing_html = fetch_page_html(target_url)
                    if not listing_html:
                        error_log.append({"source": source.name, "url": target_url, "error": "Empty listing response", "at": utc_now_iso()})
                        _bump_source_failure(supabase, src)
                        continue
                    detail_urls = discover_aggregator_detail_urls(listing_html, target_url, max_items=aggregator_max_items(src))
                if not detail_urls:
                    error_log.append({"source": source.name, "url": target_url, "error": "No detail links discovered", "at": utc_now_iso()})
                    _bump_source_failure(supabase, src)
                    continue
                found_before = total_found
                for detail_url in detail_urls:
                    raw = fetch_page_text(detail_url) if not mock else f"MOCK DETAIL PAGE TEXT FOR {detail_url}"
                    if not raw:
                        error_log.append({"source": source.name, "url": detail_url, "error": "Empty response", "at": utc_now_iso()})
                        continue
                    queue_extraction(src, source.name, detail_url, raw)
                if total_found == found_before:
                    _bump_source_failure(supabase, src)
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
                        }
                    )
                    .eq("id", src["id"])
                    .execute(),
                    None,
                )
                continue
            raw = fetch_page_text(target_url) if not mock else f"MOCK PAGE TEXT FOR {target_url}"
            if not raw:
                error_log.append({"source": source.name, "error": "Empty response", "at": utc_now_iso()})
                _bump_source_failure(supabase, src)
                continue
            extraction = extract_recruitment_data(raw, target_url, source.name, mock=mock)
            if not extraction:
                error_log.append({"source": source.name, "error": "Extraction returned null", "at": utc_now_iso()})
                _bump_source_failure(supabase, src)
                continue

            data: ExtractedRecruitment = extraction["data"]
            confidence = float(extraction.get("confidence") or 0.5)
            total_found += 1

            sim_key = compute_similarity_key(data)
            fuzzy_dup = any(fuzzy_duplicate(data.title, (r.get("name") or "")) for r in existing_recs)
            is_dup = sim_key in existing_keys or sim_key in queued_keys or fuzzy_dup
            duplicate_of = existing_id_by_key.get(sim_key)
            duplicate_reason = "similarity_key" if (sim_key in existing_keys or sim_key in queued_keys) else ("fuzzy_match" if fuzzy_dup else None)
            normalized = normalize_recruitment(data)
            extracted_payload = to_json_safe(data)
            extracted_payload["_meta"] = {
                "prompt_version": PROMPT_VERSION,
                "data_quality_score": normalized.data_quality_score,
                "warnings": normalized.warnings,
                "normalized_fields": normalized.normalized_fields,
                "duplicate_reason": duplicate_reason,
            }

            queue_payload = {
                "source_url": target_url,
                "source_name": source.name,
                "source_id": source.id or None,
                "extracted_data": extracted_payload,
                "confidence_score": confidence,
                "scrape_run_id": run_id,
                "duplicate_of": duplicate_of,
                "scraped_at": utc_now_iso(),
                # Never auto-approve — see runner.ts safety hardening note.
                "status": "duplicate" if is_dup else "pending",
            }
            logger.info("scrape.queue_insert run_id=%s source_id=%s source_name=%s target_url=%s extraction_status=%s confidence_score=%.2f data_quality_score=%.2f duplicate_status=%s",
                        run_id, source.id, source.name, target_url, "ok", confidence, normalized.data_quality_score, queue_payload["status"])
            execute_or_raise("scrape_queue.insert", lambda payload=queue_payload: supabase.table("scrape_queue").insert(payload).execute())

            if is_dup:
                total_dup += 1
            else:
                total_new += 1
                queued_keys.add(sim_key)

            execute_or_default(
                "source_registry.mark_success",
                lambda src=src: supabase.table("source_registry")
                .update(
                    {
                        "last_scraped_at": utc_now_iso(),
                        "last_success_at": utc_now_iso(),
                        "consecutive_fails": 0,
                        "last_error": None,
                    }
                )
                .eq("id", src["id"])
                .execute(),
                None,
            )

        except Exception as exc:  # noqa: BLE001
            error_log.append({"source": source.name, "error": str(exc), "at": utc_now_iso()})
            _bump_source_failure(supabase, src)

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


def _bump_source_failure(supabase: Client, src: dict[str, Any]) -> None:
    execute_or_default(
        "source_registry.bump_failure",
        lambda: supabase.table("source_registry")
        .update(
            {
                "consecutive_fails": (src.get("consecutive_fails") or 0) + 1,
                "last_error": "scrape_failed",
            }
        )
        .eq("id", src["id"])
        .execute(),
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


def promote_to_recruitments(
    data: ExtractedRecruitment,
    supabase: Client,
) -> str:
    """Write a queue item into the canonical schema. Raises on any insert failure.

    Returns the new ``recruitments.id``. The caller should update the
    queue row's ``status='approved'`` only after this returns successfully
    (mirrors the May 2026 hardening: never mark approved on partial failure).
    """
    # ── Organisation upsert (on_conflict='name') ──
    org_payload = {"name": data.organization_name, "type": data.org_type}
    org_rows = execute_or_raise("organizations.upsert", lambda: supabase.table("organizations")
        .upsert(org_payload, on_conflict="name", ignore_duplicates=False)
        .execute()).data or []
    if not org_rows:
        raise RuntimeError("[promote] organization upsert returned no row")
    org_id: str = org_rows[0]["id"]

    # ── Recruitment insert ──
    rec_payload = {
        "slug": f"{slugify(data.title)}-{data.year}",
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
        "source_pdf_url": data.source_pdf_url,
    }
    rec_rows = execute_or_raise("recruitments.insert", lambda: supabase.table("recruitments").insert(rec_payload).execute()).data or []
    if not rec_rows:
        raise RuntimeError("[promote] recruitment insert returned no row")
    rec_id: str = rec_rows[0]["id"]

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
                    unit_org_rows = execute_or_raise(
                        "organizations.upsert_unit",
                        lambda post=post: supabase.table("organizations")
                        .upsert(
                            {
                                "name": post.unit_name,
                                "type": data.org_type,
                                "state": post.unit_location_state,
                            },
                            on_conflict="name",
                            ignore_duplicates=False,
                        )
                        .execute(),
                    ).data or []
                    if unit_org_rows:
                        unit_org_id = unit_org_rows[0]["id"]
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

        if post.min_age or post.max_age:
            execute_or_raise("age_criteria.insert", lambda: supabase.table("age_criteria").insert(
                    {
                        "post_id": post_id,
                        "min_age": post.min_age,
                        "max_age": post.max_age,
                        "cutoff_date": data.apply_end_date,
                    }
                ).execute())

        if post.education_required:
            execute_or_raise("education_criteria.insert", lambda: supabase.table("education_criteria").insert(
                    {
                        "post_id": post_id,
                        "min_qualification_level": _map_education_level(post.education_required),
                        "allowed_disciplines": (
                            {"primary": post.disciplines} if post.disciplines else None
                        ),
                    }
                ).execute())

    return rec_id


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
        .select("id, extracted_data, status")
        .eq("scrape_run_id", run_id)
        .eq("status", "pending")
        .execute()).data or []

    promoted = 0
    failed = 0
    rec_ids: list[str] = []
    errors: list[dict[str, str]] = []

    for item in queued:
        d = item.get("extracted_data")
        if not isinstance(d, dict):
            failed += 1
            errors.append({"queue_id": item["id"], "error": "extracted_data not a dict"})
            continue
        try:
            extracted = ExtractedRecruitment(**d)
            rec_id = promote_to_recruitments(extracted, supabase)
            rec_ids.append(rec_id)
            update = {
                "status": "approved",
                "reviewed_at": utc_now_iso(),
            }
            if reviewer_id:
                update["reviewer_id"] = reviewer_id
            execute_or_raise(
                "scrape_queue.promote_status_update",
                lambda: supabase.table("scrape_queue").update(update).eq("id", item["id"]).execute(),
            )
            promoted += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            errors.append({"queue_id": item["id"], "error": str(exc)})
            logger.warning("[promote_run] queue_id=%s failed: %s", item["id"], exc)

    return {"promoted": promoted, "failed": failed, "recruitment_ids": rec_ids, "errors": errors}
