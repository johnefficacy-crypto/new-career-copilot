"""Personal-library PDF text extraction (PR2).

Runs synchronously inside the request handler — there is no worker. The
flow is:

1. `enqueue_text_extract_job(sb, document_id)` is called either at
   `complete-upload` time (for PDFs) or lazily from
   `POST /library/items/{id}/process-text`.  Idempotent: returns the
   existing queued/running job when one exists.
2. `run_text_extract_job(sb, job_id, user_id=...)` atomically claims the
   queued/failed job, downloads the PDF from storage, extracts page text
   via `parse_pdf_pages`, swaps the page rows in one transaction
   (`replace_document_pages` RPC), and flips the parent doc's
   `status` from `processing` → `processed` / `failed`.

Hard rules
----------
* Service re-verifies ownership (defense in depth — API already checks).
* Single active text_extract job per document is enforced by a partial
  unique index (migration 113); we still treat any conflict as 409.
* Page rows are written transactionally via the `replace_document_pages`
  RPC so a parser crash mid-batch never leaves a half-populated table.
* Hard wall-clock cap (`EXTRACT_TIMEOUT_SECONDS`) and page cap
  (`MAX_EXTRACT_PAGES`) — both bounded in-process, no threads, no signals.
"""
from __future__ import annotations

import io
import logging
import time
from typing import Any

from fastapi import HTTPException

from app.core.config import get_settings
from app.scraping.fetcher import parse_pdf_pages  # noqa: F401  patch target

logger = logging.getLogger("career_copilot.library.text_extract")

PARSER_ENGINE = "pypdf"
PARSER_VERSION = "app-library-text-extract-v1"
MAX_EXTRACT_PAGES = 500
EXTRACT_TIMEOUT_SECONDS = 30


# ─── Storage download (reuses the PR1 helper, but unwraps the None case) ─────


def _download_object(sb, bucket: str, path: str) -> bytes:
    """Fetch the object or raise. The PR1 `_try_download_bytes` helper
    swallows storage errors and returns ``None``; for extraction we cannot
    proceed without bytes, so we re-raise as a typed error."""
    try:
        data = sb.storage.from_(bucket).download(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("text-extract storage download failed for %s/%s: %s", bucket, path, exc)
        raise _ExtractError("download_failed", f"storage download failed: {exc}") from exc
    if data is None:
        raise _ExtractError("storage_object_missing", "storage returned no bytes")
    return bytes(data)


# ─── Internal error type ─────────────────────────────────────────────────────


class _ExtractError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ExtractConflict(Exception):
    """Raised when another process already claimed the job (or no such
    queued job exists). API layer maps this to HTTP 409."""


# ─── Job lifecycle ───────────────────────────────────────────────────────────


def _select_active_job(sb, document_id: str) -> dict | None:
    rows = (
        sb.table("document_processing_jobs")
        .select("*")
        .eq("document_id", document_id)
        .eq("job_type", "text_extract")
        .in_("status", ["queued", "running"])
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def enqueue_text_extract_job(sb, document_id: str) -> dict[str, Any]:
    """Insert a queued text_extract job for the document, or return the
    existing active job if one is already queued/running.

    Returns ``{"job": <row>, "enqueued": bool}``.

    Concurrent callers can both see "no active job" and both attempt the
    insert; the partial unique index in migration 113 then raises a
    unique-violation on the losing side. We catch that and re-query so
    the loser sees the winner's row instead of bubbling a 500.
    """
    existing = _select_active_job(sb, document_id)
    if existing:
        return {"job": existing, "enqueued": False}

    payload = {
        "document_id": document_id,
        "job_type": "text_extract",
        "status": "queued",
        "attempt_count": 0,
        "parser_engine": PARSER_ENGINE,
        "parser_version": PARSER_VERSION,
        "metrics": {},
    }
    try:
        inserted = sb.table("document_processing_jobs").insert(payload).execute().data or []
    except Exception as exc:  # noqa: BLE001
        # supabase-py surfaces the unique-violation as APIError; rather
        # than couple to that import, refetch and only re-raise if the
        # losing-race assumption is wrong.
        raced = _select_active_job(sb, document_id)
        if raced is not None:
            return {"job": raced, "enqueued": False}
        logger.exception("text-extract enqueue failed for doc=%s", document_id)
        raise _ExtractError("enqueue_failed", str(exc)) from exc
    if not inserted:
        raise _ExtractError("enqueue_failed", "could not enqueue text_extract job")
    return {"job": inserted[0], "enqueued": True}


def _claim_job(sb, job_id: str) -> dict | None:
    """Atomic claim. Translates to:
       UPDATE document_processing_jobs
          SET status='running', started_at=now(), attempt_count = attempt_count + 1
        WHERE id = $1 AND status IN ('queued','failed')
       RETURNING *;
    via PostgREST. Returns ``None`` if no row matched (someone else won
    the race, or the job is already running/succeeded)."""
    # PostgREST does not expose `attempt_count = attempt_count + 1`
    # arithmetic, so we read first to get the current attempt, then
    # perform a conditional update keyed on (id, status). The status
    # predicate makes the increment race-safe — only one writer can win
    # the transition out of 'queued'/'failed'.
    current = (
        sb.table("document_processing_jobs")
        .select("attempt_count")
        .eq("id", job_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not current:
        return None
    next_attempt = int(current[0].get("attempt_count") or 0) + 1
    claimed = (
        sb.table("document_processing_jobs")
        .update({
            "status": "running",
            "attempt_count": next_attempt,
            "started_at": _now_iso(),
        })
        .eq("id", job_id)
        .in_("status", ["queued", "failed"])
        .execute()
        .data
        or []
    )
    return claimed[0] if claimed else None


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


# ─── Page extraction ─────────────────────────────────────────────────────────


def _count_pdf_pages(raw_bytes: bytes) -> int:
    """Cheap raw page count; doesn't extract text. Used so we can compute
    `empty_page_count = page_count - extracted_page_count` even when the
    text-only parser drops empty pages."""
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:  # noqa: BLE001
        return 0
    try:
        return len(PdfReader(io.BytesIO(raw_bytes)).pages)
    except Exception as exc:  # noqa: BLE001
        logger.warning("text-extract pdf open failed: %s", exc)
        return 0


def _extract_with_deadline(raw_bytes: bytes, deadline: float) -> tuple[list[str], bool]:
    """Returns ``(pages_text, timed_out)``.

    Real PDFs: iterate ``PdfReader.pages`` directly so the wall-clock
    deadline is checked **between every page of the parse itself**, not
    just after parsing finishes. A pathological page that blocks
    `extract_text()` can still exceed the budget by one page's worth of
    work; that's the limit of what's possible without threads/signals
    (which the spec forbids).

    Fallback: if ``PdfReader`` cannot open the bytes (typical for test
    fixtures that monkeypatch ``parse_pdf_pages``), defer to the
    patched helper. The single-shot call may exceed the deadline, but
    we still record ``timed_out`` so the caller can mark the job failed.
    """
    timed_out = False
    pages: list[str] = []

    try:
        from pypdf import PdfReader  # type: ignore
        reader = PdfReader(io.BytesIO(raw_bytes))
        page_iter = reader.pages
    except Exception:  # noqa: BLE001
        # Fallback to the documented entrypoint. Tests patch this name.
        out = parse_pdf_pages(raw_bytes) or []
        return list(out), time.monotonic() > deadline

    for page in page_iter:
        if time.monotonic() > deadline:
            timed_out = True
            break
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("text-extract pdf page extract failed: %s", exc)
            text = ""
        pages.append(text)
    # Final guard: catch the case where the last page itself blew the budget.
    if not timed_out and time.monotonic() > deadline:
        timed_out = True
    return pages, timed_out


def _build_page_rows(
    pages: list[str],
    *,
    deadline: float,
    page_cap: int,
) -> tuple[list[dict[str, Any]], bool, bool]:
    """Build the JSONB payload for `replace_document_pages`. Stops at
    ``page_cap`` (sets ``truncated=True``) or when the wall-clock deadline
    is exceeded (sets ``timed_out=True``). Returns ``(rows, truncated,
    timed_out)``."""
    rows: list[dict[str, Any]] = []
    truncated = False
    timed_out = False
    for idx, text in enumerate(pages, start=1):
        if idx > page_cap:
            truncated = True
            break
        if time.monotonic() > deadline:
            timed_out = True
            break
        cleaned = (text or "").strip()
        char_count = len(cleaned)
        if char_count == 0:
            # ``parse_pdf_pages`` strips empties, but if a patched test
            # parser returns whitespace-only strings, treat them as empty
            # rows (status=='empty', char_count=0).
            rows.append({
                "page_number": idx,
                "text_content": "",
                "char_count": 0,
                "extraction_status": "empty",
                "metadata": {},
            })
        else:
            rows.append({
                "page_number": idx,
                "text_content": cleaned,
                "char_count": char_count,
                "extraction_status": "extracted",
                "metadata": {},
            })
    return rows, truncated, timed_out


def _write_pages(sb, document_id: str, rows: list[dict[str, Any]]) -> None:
    """Single-transaction page swap via the SQL function defined in
    migration 113. The RPC deletes prior rows for the document and
    inserts the new set in one transaction."""
    sb.rpc(
        "replace_document_pages",
        {
            "p_document_id": document_id,
            "p_parser_engine": PARSER_ENGINE,
            "p_parser_version": PARSER_VERSION,
            "p_pages": rows,
        },
    ).execute()


def _update_job(sb, job_id: str, patch: dict[str, Any]) -> None:
    sb.table("document_processing_jobs").update(patch).eq("id", job_id).execute()


def _update_doc(sb, document_id: str, status: str) -> None:
    sb.table("document_assets").update({"status": status}).eq("id", document_id).execute()


def _fail(sb, *, job_id: str, document_id: str, code: str, message: str,
          metrics: dict | None = None) -> None:
    _update_job(sb, job_id, {
        "status": "failed",
        "finished_at": _now_iso(),
        "error_code": code,
        "error_message": message,
        "metrics": metrics or {},
    })
    _update_doc(sb, document_id, "failed")


# ─── Public API ──────────────────────────────────────────────────────────────


def run_text_extract_job(sb, job_id: str, *, user_id: str) -> dict[str, Any]:
    """Claim and execute a queued/failed text_extract job. Returns the
    final job + document rows. Raises ``ExtractConflict`` if another
    runner already claimed it."""
    claimed = _claim_job(sb, job_id)
    if not claimed:
        raise ExtractConflict("job is already running or not claimable")

    document_id = claimed["document_id"]

    # Re-verify ownership at the service layer (defense in depth: the
    # API already checks, but service callers must not assume that).
    doc_rows = (
        sb.table("document_assets")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not doc_rows:
        _fail(sb, job_id=job_id, document_id=document_id,
              code="document_missing", message="document_assets row missing")
        raise _ExtractError("document_missing", "document not found")
    doc = doc_rows[0]
    if doc.get("owner_user_id") != user_id:
        _fail(sb, job_id=job_id, document_id=document_id,
              code="ownership_mismatch", message="document not owned by caller")
        raise _ExtractError("ownership_mismatch", "ownership check failed")
    if doc.get("mime_type") != "application/pdf":
        _fail(sb, job_id=job_id, document_id=document_id,
              code="unsupported_mime", message=f"mime_type={doc.get('mime_type')}")
        raise _ExtractError("unsupported_mime", "only PDFs are supported")
    if doc.get("status") == "archived":
        _fail(sb, job_id=job_id, document_id=document_id,
              code="archived", message="document is archived")
        raise _ExtractError("archived", "document is archived")

    # Size recheck (defends against the row being updated post-upload).
    max_bytes = get_settings().LIBRARY_MAX_UPLOAD_MB * 1024 * 1024
    if (doc.get("file_size_bytes") or 0) > max_bytes:
        _fail(sb, job_id=job_id, document_id=document_id,
              code="file_too_large_for_extract",
              message=f"file_size_bytes={doc.get('file_size_bytes')} exceeds cap")
        raise _ExtractError("file_too_large_for_extract", "file too large for extraction")

    _update_doc(sb, document_id, "processing")

    t0 = time.monotonic()
    deadline = t0 + EXTRACT_TIMEOUT_SECONDS
    try:
        raw_bytes = _download_object(sb, doc["storage_bucket"], doc["storage_path"])
    except _ExtractError as exc:
        _fail(sb, job_id=job_id, document_id=document_id,
              code=exc.code, message=exc.message,
              metrics={"duration_ms": int((time.monotonic() - t0) * 1000)})
        raise

    bytes_processed = len(raw_bytes)

    try:
        page_count = _count_pdf_pages(raw_bytes)
        pages, parse_timed_out = _extract_with_deadline(raw_bytes, deadline)
    except Exception as exc:  # noqa: BLE001  defensive: pypdf can raise
        logger.exception("text-extract parser crashed")
        _fail(sb, job_id=job_id, document_id=document_id,
              code="parser_crash", message=str(exc),
              metrics={
                  "duration_ms": int((time.monotonic() - t0) * 1000),
                  "bytes_processed": bytes_processed,
              })
        raise _ExtractError("parser_crash", str(exc)) from exc

    rows, truncated, build_timed_out = _build_page_rows(
        pages, deadline=deadline, page_cap=MAX_EXTRACT_PAGES,
    )
    timed_out = parse_timed_out or build_timed_out

    # Even on timeout we persist what we got so the user sees partial pages.
    try:
        _write_pages(sb, document_id, rows)
    except Exception as exc:  # noqa: BLE001
        logger.exception("text-extract page write failed")
        _fail(sb, job_id=job_id, document_id=document_id,
              code="page_write_failed", message=str(exc),
              metrics={
                  "duration_ms": int((time.monotonic() - t0) * 1000),
                  "bytes_processed": bytes_processed,
                  "page_count": page_count,
              })
        raise _ExtractError("page_write_failed", str(exc)) from exc

    stored_page_count = len(rows)
    extracted_page_count = sum(1 for r in rows if r["extraction_status"] == "extracted")
    empty_page_count = max(page_count - extracted_page_count, 0) if page_count else (
        sum(1 for r in rows if r["extraction_status"] == "empty")
    )
    char_count = sum(int(r.get("char_count") or 0) for r in rows)
    duration_ms = int((time.monotonic() - t0) * 1000)
    likely_needs_ocr = bool(page_count > 0 and (empty_page_count / page_count) >= 0.5)

    metrics = {
        "page_count": page_count,
        "stored_page_count": stored_page_count,
        "extracted_page_count": extracted_page_count,
        "empty_page_count": empty_page_count,
        "char_count": char_count,
        "bytes_processed": bytes_processed,
        "duration_ms": duration_ms,
        "likely_needs_ocr": likely_needs_ocr,
        "truncated": truncated,
        "page_cap": MAX_EXTRACT_PAGES,
        "timed_out": timed_out,
    }

    if timed_out:
        # Partial success: pages stored, but the job is marked failed so
        # the caller can decide to retry. Doc goes to failed too.
        _update_job(sb, job_id, {
            "status": "failed",
            "finished_at": _now_iso(),
            "error_code": "extract_timeout",
            "error_message": f"exceeded {EXTRACT_TIMEOUT_SECONDS}s wall-clock cap",
            "metrics": metrics,
        })
        _update_doc(sb, document_id, "failed")
    else:
        _update_job(sb, job_id, {
            "status": "succeeded",
            "finished_at": _now_iso(),
            "metrics": metrics,
        })
        _update_doc(sb, document_id, "processed")
        # PR3: if pypdf produced mostly-empty pages, hand the item off to
        # the OCR control surface. Best-effort: a failure here must never
        # rewrite the text-extract outcome above. The OCR module's
        # `auto_enqueue_from_text_extract` swallows ocr-side errors and
        # returns ``None``; we still wrap in a try/except for paranoia.
        if likely_needs_ocr and user_id is not None:
            try:
                from app.library.ocr import auto_enqueue_from_text_extract

                auto_enqueue_from_text_extract(sb, item_id=document_id, user_id=user_id)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "ocr auto-enqueue raised after text-extract success: %s", exc
                )

    final_job = (
        sb.table("document_processing_jobs")
        .select("*")
        .eq("id", job_id)
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]
    final_doc = (
        sb.table("document_assets")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]
    return {"job": final_job, "document": final_doc}


def run_text_extract_for_document(sb, document_id: str, *, user_id: str) -> dict[str, Any]:
    """Find the latest queued/failed text_extract job for the document
    (or lazily enqueue one if no active job exists), then delegate to
    ``run_text_extract_job``. This handles PR1-era uploads that never
    had a job auto-enqueued."""
    active = (
        sb.table("document_processing_jobs")
        .select("*")
        .eq("document_id", document_id)
        .eq("job_type", "text_extract")
        .in_("status", ["queued", "running"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if active:
        job = active[0]
        if job.get("status") == "running":
            raise ExtractConflict("a text_extract job is already running")
    else:
        job = enqueue_text_extract_job(sb, document_id)["job"]
    return run_text_extract_job(sb, job["id"], user_id=user_id)


# ─── HTTPException translation (used by API layer) ───────────────────────────


def extract_error_to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, ExtractConflict):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, _ExtractError):
        return HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message})
    return HTTPException(status_code=500, detail="text extraction failed")
