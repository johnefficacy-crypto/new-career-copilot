"""Personal-library OCR job wiring (PR3).

This module is the *control surface* for OCR — schema, state machine,
and enqueue paths. There is intentionally no OCR engine code here.
PR3's contract is:

* If ``LIBRARY_OCR_ENGINE`` is ``'none'`` (default), every freshly-
  enqueued job is finalized synchronously to ``status='skipped'`` with
  ``error_message='ocr_engine_disabled'``.
* Otherwise the job is left at ``status='pending'`` for PR4's engine
  worker to claim.

The partial unique index ``library_ocr_jobs_active_unique_idx``
(migration 114) makes "one active job per item" a hard DB-level
guarantee, so race conditions between auto-enqueue and a manual retry
collapse to one row; the second writer reads the existing job back.

State machine (enforced in this module, not via DB triggers):

    pending → queued → running → succeeded | failed
    pending | queued | running → cancelled
    {succeeded, failed, skipped, cancelled} = terminal

Re-running a manual request on a terminal job creates a fresh row; the
old one is preserved for audit and history.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.config import get_settings

logger = logging.getLogger("career_copilot.library.ocr")


TABLE = "library_ocr_jobs"

ACTIVE_STATUSES: tuple[str, ...] = ("pending", "queued", "running")
TERMINAL_STATUSES: tuple[str, ...] = ("succeeded", "failed", "skipped", "cancelled")
ALL_STATUSES: tuple[str, ...] = ACTIVE_STATUSES + TERMINAL_STATUSES

ALLOWED_TRIGGERS: tuple[str, ...] = (
    "auto_likely_needs_ocr",
    "manual_request",
    "retry",
)

OCR_ENGINE_DISABLED_REASON = "ocr_engine_disabled"


class OcrJobError(Exception):
    """Service-layer error with a stable ``code`` the API maps to HTTP."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class OcrJobConflict(OcrJobError):
    """An active job already exists for this item. ``existing`` holds the row."""

    def __init__(self, message: str, *, existing: dict):
        super().__init__("ocr_active_job_exists", message, status_code=409)
        self.existing = existing


# ── helpers ───────────────────────────────────────────────────────────────


def _is_uuid(value: Any) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _select_active_job(sb, item_id: str) -> dict | None:
    """Return the newest active OCR job for ``item_id``, or ``None``."""
    rows = (
        sb.table(TABLE)
        .select("*")
        .eq("item_id", item_id)
        .in_("status", list(ACTIVE_STATUSES))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _select_latest_job(sb, item_id: str) -> dict | None:
    rows = (
        sb.table(TABLE)
        .select("*")
        .eq("item_id", item_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _finalize_skipped(sb, job_id: str) -> dict:
    """Synchronously transition pending → skipped for engine='none'."""
    now = _now_iso()
    updated = (
        sb.table(TABLE)
        .update(
            {
                "status": "skipped",
                "started_at": now,
                "finished_at": now,
                "error_message": OCR_ENGINE_DISABLED_REASON,
            }
        )
        .eq("id", job_id)
        .execute()
        .data
        or []
    )
    return updated[0] if updated else {}


def _engine_is_disabled() -> bool:
    return (get_settings().LIBRARY_OCR_ENGINE or "none").lower() == "none"


# ── public surface ────────────────────────────────────────────────────────


def enqueue_ocr_job(
    sb,
    *,
    item_id: str,
    user_id: str,
    trigger_reason: str,
) -> tuple[dict, bool]:
    """Insert a new OCR job for an item, or return the existing active one.

    Returns ``(job, enqueued)`` where ``enqueued`` is ``True`` when a new
    row was written. With ``LIBRARY_OCR_ENGINE='none'`` the newly inserted
    job is immediately transitioned to ``skipped`` and the skipped row is
    returned.

    Hard contract: callers are expected to have already verified that
    ``user_id`` actually owns ``item_id`` (RLS would block a non-owner
    insert via authenticated context, but service-role bypasses RLS so
    we never want this called without an explicit ownership check).
    """
    if not _is_uuid(item_id):
        raise OcrJobError("invalid_item_id", "Invalid item_id", status_code=400)
    if not _is_uuid(user_id):
        raise OcrJobError("invalid_user_id", "Invalid user_id", status_code=400)
    if trigger_reason not in ALLOWED_TRIGGERS:
        raise OcrJobError(
            "invalid_trigger_reason",
            f"trigger_reason must be one of {ALLOWED_TRIGGERS}",
            status_code=400,
        )

    existing = _select_active_job(sb, item_id)
    if existing is not None:
        raise OcrJobConflict(
            "an OCR job is already pending/queued/running for this item",
            existing=existing,
        )

    engine = get_settings().LIBRARY_OCR_ENGINE or "none"
    payload = {
        "item_id": item_id,
        "user_id": user_id,
        "status": "pending",
        "engine": engine,
        "trigger_reason": trigger_reason,
        "pages_processed": 0,
    }

    try:
        inserted = sb.table(TABLE).insert(payload).execute().data or []
    except Exception as exc:  # noqa: BLE001
        # Most likely cause: the partial unique index fired because
        # another concurrent caller raced in. Re-read and treat their
        # row as the canonical one rather than throwing.
        logger.info("ocr enqueue raced: %s", exc)
        raced = _select_active_job(sb, item_id)
        if raced is not None:
            raise OcrJobConflict(
                "an OCR job is already pending/queued/running for this item",
                existing=raced,
            ) from exc
        raise OcrJobError("ocr_enqueue_failed", str(exc), status_code=500) from exc

    if not inserted:
        # supabase-py returns ``[]`` rather than raising when RETURNING is
        # suppressed by an active RLS policy or a duplicate-key conflict.
        raced = _select_active_job(sb, item_id)
        if raced is not None:
            raise OcrJobConflict(
                "an OCR job is already pending/queued/running for this item",
                existing=raced,
            )
        raise OcrJobError(
            "ocr_enqueue_failed", "insert returned no rows", status_code=500
        )

    job = inserted[0]

    if _engine_is_disabled():
        finalized = _finalize_skipped(sb, job["id"])
        return (finalized or job), True

    return job, True


def auto_enqueue_from_text_extract(
    sb, *, item_id: str, user_id: str
) -> dict | None:
    """Called by the text-extract service after a successful run when
    ``metrics.likely_needs_ocr`` is truthy. Idempotent: if an active job
    already exists for the item, the existing row is returned instead.
    Returns ``None`` if engine is enabled but for any reason no job was
    created (preserves caller's "best-effort, never block extraction"
    contract).
    """
    try:
        job, _ = enqueue_ocr_job(
            sb,
            item_id=item_id,
            user_id=user_id,
            trigger_reason="auto_likely_needs_ocr",
        )
        return job
    except OcrJobConflict as exc:
        return exc.existing
    except OcrJobError as exc:
        logger.warning(
            "auto OCR enqueue failed for item %s: %s (%s)",
            item_id, exc.code, exc.message,
        )
        return None


def get_latest_job_for_item(sb, item_id: str, *, user_id: str) -> dict | None:
    """Owner-scoped latest-job lookup."""
    if not _is_uuid(item_id):
        raise OcrJobError("invalid_item_id", "Invalid item_id", status_code=400)
    rows = (
        sb.table(TABLE)
        .select("*")
        .eq("item_id", item_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def get_job_by_id(sb, job_id: str, *, user_id: str) -> dict | None:
    if not _is_uuid(job_id):
        raise OcrJobError("invalid_job_id", "Invalid job_id", status_code=400)
    rows = (
        sb.table(TABLE)
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None
