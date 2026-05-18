"""Document text-extract service (PR2).

Synchronous extraction of per-page text from PDFs stored under
`document_assets`. Runs inline from `POST /library/items/{id}/process-text`;
no worker, no scheduler. `complete-upload` only enqueues. Empty pages here
are *not* a failure — PR3's OCR pass uses `metrics.likely_needs_ocr` as the
trigger.

Atomicity:
- Job claim uses an `UPDATE … WHERE id = ? AND status IN ('queued','failed')`
  filter; the row update is atomic at the SQL layer, so a second concurrent
  claim returns zero rows and the caller surfaces a 409.
- The delete-old + insert-new page replace happens in a single Postgres
  function (`public.replace_document_pages`, migration 113) so partial-write
  failures cannot leave stale pages.

Re-verifies ownership before reading the object even though
`/process-text` already checked — defense in depth.
"""
from __future__ import annotations

import logging
import time
from typing import Any
from uuid import UUID

# Imported here (not from .fetcher at call site) so tests can patch
# `app.library.text_extract.parse_pdf_pages` without poking the source module.
from app.scraping.fetcher import parse_pdf_pages
from app.api.library import _try_download_bytes
from app.core.config import get_settings

logger = logging.getLogger("career_copilot.library.text_extract")


# ── Module constants ─────────────────────────────────────────────────────

PARSER_ENGINE = "pypdf"
PARSER_VERSION = "app-library-text-extract-v1"
MAX_EXTRACT_PAGES = 500
EXTRACT_TIMEOUT_SECONDS = 30
JOB_TYPE = "text_extract"


# ── Errors ───────────────────────────────────────────────────────────────


class TextExtractError(Exception):
    """Service-layer error. Carries a stable `code` the API maps to HTTP."""

    def __init__(self, code: str, message: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _is_uuid(value: Any) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


# ── Job lifecycle ────────────────────────────────────────────────────────


def _existing_active_job(sb, document_id: str) -> dict | None:
    """Return the youngest queued/running job for the doc, or None."""
    rows = (
        sb.table("document_processing_jobs")
        .select("*")
        .eq("document_id", document_id)
        .eq("job_type", JOB_TYPE)
        .in_("status", ["queued", "running"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _latest_job(sb, document_id: str, statuses: list[str] | None = None) -> dict | None:
    q = (
        sb.table("document_processing_jobs")
        .select("*")
        .eq("document_id", document_id)
        .eq("job_type", JOB_TYPE)
    )
    if statuses:
        q = q.in_("status", statuses)
    rows = q.order("created_at", desc=True).limit(1).execute().data or []
    return rows[0] if rows else None


def enqueue_text_extract_job(sb, document_id: str) -> dict:
    """Insert a queued text-extract job. Idempotent: if an active job
    already exists for this document, that row is returned instead.

    Returns ``{"job": {...}, "enqueued": bool}``.
    """
    if not _is_uuid(document_id):
        raise TextExtractError("invalid_document_id", "Invalid document_id", 400)

    existing = _existing_active_job(sb, document_id)
    if existing:
        return {"job": existing, "enqueued": False}

    payload = {
        "document_id": document_id,
        "job_type": JOB_TYPE,
        "status": "queued",
        "attempt_count": 0,
        "metrics": {},
    }
    try:
        inserted = sb.table("document_processing_jobs").insert(payload).execute().data
    except Exception as exc:  # noqa: BLE001
        # Unique-index violation (uq_document_processing_jobs_active_text_extract):
        # someone enqueued concurrently. Read back and return their row.
        logger.info("text_extract enqueue raced: %s", exc)
        existing = _existing_active_job(sb, document_id)
        if existing:
            return {"job": existing, "enqueued": False}
        raise TextExtractError("enqueue_failed", str(exc), 500) from exc

    if not inserted:
        existing = _existing_active_job(sb, document_id)
        if existing:
            return {"job": existing, "enqueued": False}
        raise TextExtractError("enqueue_failed", "insert returned no rows", 500)
    return {"job": inserted[0], "enqueued": True}


def _atomic_claim_job(sb, job_id: str) -> dict | None:
    """Move a queued/failed job to `running` and return the row, or None if
    another worker already claimed it.

    Race story: two workers each read the row pre-claim and compute the
    same `attempt_count + 1`; both issue an UPDATE filtered on
    `status IN ('queued','failed')`. The first UPDATE flips status to
    `running` so the second matches zero rows and returns ``None``. The
    initial read is a hint; the conditional UPDATE is the authoritative
    serialiser.
    """
    rows = (
        sb.table("document_processing_jobs")
        .select("attempt_count")
        .eq("id", job_id)
        .in_("status", ["queued", "failed"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    next_attempt = (rows[0].get("attempt_count") or 0) + 1

    updated = (
        sb.table("document_processing_jobs")
        .update(
            {
                "status": "running",
                "started_at": "now()",
                "attempt_count": next_attempt,
            }
        )
        .eq("id", job_id)
        .in_("status", ["queued", "failed"])
        .execute()
        .data
        or []
    )
    if not updated:
        return None
    return updated[0]


def _mark_document(sb, document_id: str, status: str, **extra: Any) -> None:
    patch: dict[str, Any] = {"status": status}
    patch.update(extra)
    sb.table("document_assets").update(patch).eq("id", document_id).execute()


def _finish_job(
    sb,
    job_id: str,
    *,
    status: str,
    metrics: dict,
    error_code: str | None = None,
    error_message: str | None = None,
) -> dict:
    patch: dict[str, Any] = {
        "status": status,
        "finished_at": "now()",
        "metrics": metrics,
    }
    if error_code is not None:
        patch["error_code"] = error_code
    if error_message is not None:
        patch["error_message"] = error_message
    updated = (
        sb.table("document_processing_jobs")
        .update(patch)
        .eq("id", job_id)
        .execute()
        .data
        or []
    )
    return updated[0] if updated else {"id": job_id, **patch}


def _load_document(sb, document_id: str) -> dict:
    rows = (
        sb.table("document_assets")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise TextExtractError("document_not_found", "Document not found", 404)
    return rows[0]


def _empty_metrics() -> dict[str, Any]:
    return {
        "page_count": 0,
        "stored_page_count": 0,
        "extracted_page_count": 0,
        "empty_page_count": 0,
        "char_count": 0,
        "bytes_processed": 0,
        "duration_ms": 0,
        "likely_needs_ocr": False,
        "truncated": False,
        "page_cap": MAX_EXTRACT_PAGES,
        "timed_out": False,
    }


def _replace_pages(sb, document_id: str, pages: list[dict]) -> None:
    """Atomic delete+insert via Postgres function (migration 113)."""
    sb.rpc(
        "replace_document_pages",
        {
            "p_document_id": document_id,
            "p_pages": pages,
            "p_parser_engine": PARSER_ENGINE,
            "p_parser_version": PARSER_VERSION,
        },
    ).execute()


def run_text_extract_job(sb, job_id: str, *, user_id: str) -> dict:
    """Claim a job and run it. Returns the finished job row + document row.

    Raises ``TextExtractError(code='conflict', 409)`` if the job is already
    running or has succeeded — callers map this to HTTP 409.
    """
    if not _is_uuid(job_id):
        raise TextExtractError("invalid_job_id", "Invalid job_id", 400)

    claimed = _atomic_claim_job(sb, job_id)
    if not claimed:
        raise TextExtractError(
            "conflict",
            "Job is not in a claimable state (running, succeeded, or missing).",
            409,
        )

    document_id = claimed["document_id"]
    document = _load_document(sb, document_id)

    # Defense-in-depth ownership check — even though the API gated us.
    if document.get("owner_user_id") != user_id:
        _finish_job(
            sb,
            job_id,
            status="failed",
            metrics=_empty_metrics(),
            error_code="forbidden",
            error_message="Caller does not own this document",
        )
        raise TextExtractError("forbidden", "Caller does not own this document", 403)

    _mark_document(sb, document_id, "processing")

    max_bytes = get_settings().LIBRARY_MAX_UPLOAD_MB * 1024 * 1024
    size_bytes = document.get("file_size_bytes") or 0
    if size_bytes and size_bytes > max_bytes:
        _mark_document(sb, document_id, "failed")
        finished = _finish_job(
            sb,
            job_id,
            status="failed",
            metrics={**_empty_metrics(), "bytes_processed": 0},
            error_code="file_too_large_for_extract",
            error_message=f"file_size_bytes={size_bytes} exceeds {max_bytes}",
        )
        return {"job": finished, "document": _load_document(sb, document_id)}

    bucket = document.get("storage_bucket") or get_settings().LIBRARY_STORAGE_BUCKET
    path = document.get("storage_path") or ""

    t_start = time.monotonic()
    raw_bytes = _try_download_bytes(bucket, path)
    if raw_bytes is None:
        _mark_document(sb, document_id, "failed")
        finished = _finish_job(
            sb,
            job_id,
            status="failed",
            metrics={**_empty_metrics(), "duration_ms": int((time.monotonic() - t_start) * 1000)},
            error_code="storage_read_failed",
            error_message=f"Could not read object {bucket}/{path}",
        )
        return {"job": finished, "document": _load_document(sb, document_id)}

    bytes_processed = len(raw_bytes)

    try:
        page_texts = parse_pdf_pages(raw_bytes)
    except Exception as exc:  # noqa: BLE001
        _mark_document(sb, document_id, "failed")
        finished = _finish_job(
            sb,
            job_id,
            status="failed",
            metrics={
                **_empty_metrics(),
                "bytes_processed": bytes_processed,
                "duration_ms": int((time.monotonic() - t_start) * 1000),
            },
            error_code="parser_crash",
            error_message=str(exc),
        )
        return {"job": finished, "document": _load_document(sb, document_id)}

    pages: list[dict] = []
    extracted_count = 0
    empty_count = 0
    char_total = 0
    timed_out = False
    truncated = False

    iterator = enumerate(page_texts, start=1)
    for idx, text in iterator:
        # Hard page cap — first N kept, rest dropped with truncated=true.
        if idx > MAX_EXTRACT_PAGES:
            truncated = True
            break

        # Wall-clock guard checked between pages. We never preempt mid-page.
        if time.monotonic() - t_start > EXTRACT_TIMEOUT_SECONDS:
            timed_out = True
            break

        text = text or ""
        char_count = len(text)
        if char_count > 0:
            pages.append(
                {
                    "page_number": idx,
                    "text_content": text,
                    "char_count": char_count,
                    "extraction_status": "extracted",
                    "metadata": {},
                }
            )
            extracted_count += 1
            char_total += char_count
        else:
            pages.append(
                {
                    "page_number": idx,
                    "text_content": "",
                    "char_count": 0,
                    "extraction_status": "empty",
                    "metadata": {},
                }
            )
            empty_count += 1

    duration_ms = int((time.monotonic() - t_start) * 1000)
    total_pages_seen = len(page_texts)
    stored_pages = len(pages)

    # Whether we should hint OCR: at least one page seen, and ≥50% empty.
    likely_needs_ocr = (
        total_pages_seen > 0
        and stored_pages > 0
        and (empty_count / stored_pages) >= 0.5
    )

    metrics = {
        "page_count": total_pages_seen,
        "stored_page_count": stored_pages,
        "extracted_page_count": extracted_count,
        "empty_page_count": empty_count,
        "char_count": char_total,
        "bytes_processed": bytes_processed,
        "duration_ms": duration_ms,
        "likely_needs_ocr": likely_needs_ocr,
        "truncated": truncated,
        "page_cap": MAX_EXTRACT_PAGES,
        "timed_out": timed_out,
    }

    # Even on timeout we persist whatever we did extract — the work isn't
    # wasted, but the job is marked failed so callers can decide to retry.
    try:
        _replace_pages(sb, document_id, pages)
    except Exception as exc:  # noqa: BLE001
        _mark_document(sb, document_id, "failed")
        finished = _finish_job(
            sb,
            job_id,
            status="failed",
            metrics=metrics,
            error_code="pages_write_failed",
            error_message=str(exc),
        )
        return {"job": finished, "document": _load_document(sb, document_id)}

    if timed_out:
        _mark_document(
            sb, document_id, "failed", page_count=total_pages_seen or None
        )
        finished = _finish_job(
            sb,
            job_id,
            status="failed",
            metrics=metrics,
            error_code="timed_out",
            error_message=f"Extraction exceeded {EXTRACT_TIMEOUT_SECONDS}s wall-clock",
        )
        return {"job": finished, "document": _load_document(sb, document_id)}

    _mark_document(sb, document_id, "processed", page_count=total_pages_seen or None)
    finished = _finish_job(sb, job_id, status="succeeded", metrics=metrics)
    return {"job": finished, "document": _load_document(sb, document_id)}


def run_text_extract_for_document(sb, document_id: str, *, user_id: str) -> dict:
    """Find or create a text-extract job for ``document_id`` and run it.

    Handles PR1-era uploads that predate auto-enqueue on `complete-upload`.
    """
    if not _is_uuid(document_id):
        raise TextExtractError("invalid_document_id", "Invalid document_id", 400)

    # Prefer an existing claimable job (queued / failed). If only succeeded
    # / running rows exist, lazily enqueue a fresh job for re-run.
    claimable = _latest_job(sb, document_id, statuses=["queued", "failed"])
    if claimable is None:
        # If a job is currently `running` we hand back 409 so the caller
        # cannot double-process.
        running = _latest_job(sb, document_id, statuses=["running"])
        if running:
            raise TextExtractError(
                "conflict", "A text-extract job is already running.", 409
            )
        enq = enqueue_text_extract_job(sb, document_id)
        claimable = enq["job"]

    return run_text_extract_job(sb, claimable["id"], user_id=user_id)
