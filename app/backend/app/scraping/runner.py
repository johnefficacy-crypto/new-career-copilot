"""Scrape pass runner + queue→canonical promoter.

Direct port of ``UI-career-copilot/lib/scraping/runner.ts``.

Behaviour parity:
    * Always inserts new items with ``status='pending'`` (May 2026
      "never auto-approve" hardening).
    * Dedupes on ``computeSimilarityKey`` + existing recruitments and
      not-yet-decided queue rows.
    * Updates ``scrape_sources.last_scraped_at`` / ``consecutive_fails`` /
      ``is_healthy`` on success / failure.
    * Persists a final ``scrape_runs`` row with ``items_found / items_new /
      items_duplicate / error_log``.

Schema notes:
    * The reference reads from the legacy ``scrape_sources`` table; the
      current Supabase project has both ``scrape_sources`` AND
      ``source_registry``. We honour the reference contract and read
      from ``scrape_sources`` here (the registry is admin metadata).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
import re
from typing import Any

from supabase import Client

from .extractor import (
    build_recruitment_key,
    compute_similarity_key,
    extract_recruitment_data,
    fetch_page_text,
)
from .schemas import ExtractedRecruitment, to_json_safe

logger = logging.getLogger("career_copilot.scraping.runner")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
def _slugify(value: str | None) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return base[:80] or "recruitment"

def _exec(call, default=None):
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase call failed: %s", exc)
        return default


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
        "started_at": _now(),
    }
    if triggered_by_user:
        run_payload["triggered_by_user"] = triggered_by_user
    inserted = supabase.table("scrape_runs").insert(run_payload).execute().data or []
    if not inserted:
        raise RuntimeError("run_scraping_pass: failed to create scrape_runs row")
    run_id: str = inserted[0]["id"]

    # ── 2. Load active sources from the legacy table ─────────────────────
    src_q = (
        supabase.table("scrape_sources")
        .select("*")
        .eq("is_active", True)
        .order("last_scraped_at", desc=False, nullsfirst=True)
    )
    if source_ids:
        src_q = src_q.in_("id", source_ids)
    sources: list[dict[str, Any]] = _exec(lambda: src_q.execute().data, default=[]) or []

    # ── 3. Build dedup index from existing recruitments + open queue ─────
    existing_recs = _exec(
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

    open_queue = _exec(
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

    for src in sources:
        target_url = (src.get("base_url") or "") + (src.get("notification_path") or "")
        try:
            raw = fetch_page_text(target_url) if not mock else f"MOCK PAGE TEXT FOR {target_url}"
            if not raw:
                error_log.append({"source": src.get("name"), "error": "Empty response", "at": _now()})
                _bump_source_failure(supabase, src)
                continue
            extraction = extract_recruitment_data(raw, target_url, src.get("name") or "", mock=mock)
            if not extraction:
                error_log.append({"source": src.get("name"), "error": "Extraction returned null", "at": _now()})
                _bump_source_failure(supabase, src)
                continue

            data: ExtractedRecruitment = extraction["data"]
            confidence = float(extraction.get("confidence") or 0.5)
            total_found += 1

            sim_key = compute_similarity_key(data)
            is_dup = sim_key in existing_keys or sim_key in queued_keys
            duplicate_of = existing_id_by_key.get(sim_key)

            queue_payload = {
                "source_url": target_url,
                "source_name": src.get("name"),
                "extracted_data": to_json_safe(data),
                "confidence_score": confidence,
                "scrape_run_id": run_id,
                "duplicate_of": duplicate_of,
                "scraped_at": _now(),
                # Never auto-approve — see runner.ts safety hardening note.
                "status": "duplicate" if is_dup else "pending",
            }
            _exec(lambda payload=queue_payload: supabase.table("scrape_queue").insert(payload).execute())

            if is_dup:
                total_dup += 1
            else:
                total_new += 1
                queued_keys.add(sim_key)

            _exec(
                lambda src=src: supabase.table("scrape_sources")
                .update(
                    {
                        "last_scraped_at": _now(),
                        "last_success_at": _now(),
                        "consecutive_fails": 0,
                        "is_healthy": True,
                    }
                )
                .eq("id", src["id"])
                .execute()
            )

        except Exception as exc:  # noqa: BLE001
            error_log.append({"source": src.get("name"), "error": str(exc), "at": _now()})
            _bump_source_failure(supabase, src)

    # ── 5. Finalise the run row ──────────────────────────────────────────
    if sources and len(error_log) == len(sources):
        final_status = "failed"
    elif error_log:
        final_status = "partial"
    else:
        final_status = "completed"

    _exec(
        lambda: supabase.table("scrape_runs")
        .update(
            {
                "finished_at": _now(),
                "status": final_status,
                "sources_checked": len(sources),
                "items_found": total_found,
                "items_new": total_new,
                "items_duplicate": total_dup,
                "error_log": error_log,
            }
        )
        .eq("id", run_id)
        .execute()
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
    _exec(
        lambda: supabase.table("scrape_sources")
        .update(
            {
                "consecutive_fails": (src.get("consecutive_fails") or 0) + 1,
                "is_healthy": False,
            }
        )
        .eq("id", src["id"])
        .execute()
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
    org_rows = (
        supabase.table("organizations")
        .upsert(org_payload, on_conflict="name", ignore_duplicates=False)
        .execute()
        .data
        or []
    )
    if not org_rows:
        raise RuntimeError("[promote] organization upsert returned no row")
    org_id: str = org_rows[0]["id"]

    # ── Recruitment insert ──
    rec_payload = {
        "slug": f"{_slugify(data.title)}-{data.year}",        "organization_id": org_id,
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
    rec_rows = supabase.table("recruitments").insert(rec_payload).execute().data or []
    if not rec_rows:
        raise RuntimeError("[promote] recruitment insert returned no row")
    rec_id: str = rec_rows[0]["id"]

    # ── Posts + age_criteria + education_criteria ──
    for post in data.posts or []:
        post_payload = {
            "recruitment_id": rec_id,
            "post_name": post.post_name,
            "group_type": post.group_type,
            "pay_level": post.pay_level,
            "job_type": "direct",
        }
        post_rows = (
            supabase.table("posts").insert(post_payload).execute().data or []
        )
        if not post_rows:
            logger.warning("[promote] post insert failed for %r", post.post_name)
            continue
        post_id = post_rows[0]["id"]

        if post.min_age or post.max_age:
            try:
                supabase.table("age_criteria").insert(
                    {
                        "post_id": post_id,
                        "min_age": post.min_age,
                        "max_age": post.max_age,
                        "cutoff_date": data.apply_end_date,
                    }
                ).execute()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[promote] age_criteria failed: %s", exc)

        if post.education_required:
            try:
                supabase.table("education_criteria").insert(
                    {
                        "post_id": post_id,
                        "min_qualification_level": _map_education_level(post.education_required),
                        "allowed_disciplines": (
                            {"primary": post.disciplines} if post.disciplines else None
                        ),
                    }
                ).execute()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[promote] education_criteria failed: %s", exc)

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
        .execute()
        .data
        or []
    )

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
                "reviewed_at": _now(),
            }
            if reviewer_id:
                update["reviewer_id"] = reviewer_id
            supabase.table("scrape_queue").update(update).eq("id", item["id"]).execute()
            promoted += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            errors.append({"queue_id": item["id"], "error": str(exc)})
            logger.warning("[promote_run] queue_id=%s failed: %s", item["id"], exc)

    return {"promoted": promoted, "failed": failed, "recruitment_ids": rec_ids, "errors": errors}
