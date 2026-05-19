"""Staleness watcher + canonical-edit hook (PR plan §6).

Two entry points:

* :func:`on_recruitment_critical_field_edit` — called by admin_trust
  when an admin edits a critical field on a canonical recruitment. If
  the canonical snapshot hash drifts from the active report's stored
  hash, the report is superseded with ``trigger_reason='canonical_field_edited'``.
* :func:`run_source_watch_pass` — periodic sweep that compares the
  active reports' source hashes against fresh re-scrapes (caller
  supplies the fresh extracted data per queue item). Mass-corrigendum
  protection: when a single source flips more reports than
  ``mass_change_batch_limit`` (default 25), the remainder are deferred
  to a single :class:`reverification_batches` row that an admin
  acknowledges before processing.

The watcher itself never fetches remote pages. Live re-scraping is the
existing scraper's job; this module operates on the data the scraper
has already produced.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from supabase import Client

from .corrigendum_detector import (
    detect_canonical_drift,
    detect_source_drift,
    staleness_suppressed,
)
from .verification_hash import build_canonical_snapshot_hash
from .verification_policy import (
    CORRIGENDUM_WATCH_LIMITS,
    CRITICAL_RECRUITMENT_FIELDS,
)
from .verification_reports import (
    TABLE,
    get_active_report,
    update_lifecycle_status,
)


logger = logging.getLogger(__name__)


# ── Helpers — staleness-status writers ────────────────────────────────


def _set_staleness(
    supabase: Client,
    report_id: str,
    *,
    staleness_status: str,
    lifecycle_status: str | None = None,
    valid_until: str | None = None,
) -> dict[str, Any]:
    """Write staleness state onto a report.

    Lifecycle flips route through :func:`update_lifecycle_status` so the
    transition matrix is enforced. The staleness_status column is a
    flat write — there's no transition matrix on it, just the DB
    check-constraint.
    """
    payload: dict[str, Any] = {
        "staleness_status": staleness_status,
        "last_checked_at": "now()",
    }
    if valid_until is not None:
        payload["valid_until"] = valid_until
    # Strip the SQL-literal sentinel so the in-memory fake doesn't choke;
    # real Postgres callers use the timestamptz column default instead.
    payload.pop("last_checked_at", None)
    updated = (
        supabase.table(TABLE)
        .update(payload)
        .eq("id", report_id)
        .execute()
        .data
        or [None]
    )[0]
    if not updated:
        raise RuntimeError(f"verification_report {report_id} update returned no row")
    if lifecycle_status is not None:
        updated = update_lifecycle_status(supabase, report_id, lifecycle_status)
    return updated


# ── valid_until populator ─────────────────────────────────────────────


def compute_valid_until(extracted_or_canonical: dict[str, Any]) -> str | None:
    """Decide a report's ``valid_until`` from the snapshot.

    Plan §6: ``apply_end_date`` is the strongest signal; fall back to
    ``exam_start_date``; never guess. ``None`` means "no expiry on file".
    """
    for k in ("apply_end_date", "exam_start_date"):
        v = extracted_or_canonical.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


# ── Canonical edit hook ──────────────────────────────────────────────


def on_recruitment_critical_field_edit(
    supabase: Client,
    recruitment_id: str,
    *,
    changed_fields: set[str],
) -> dict[str, Any] | None:
    """Fire staleness when an admin edits a critical recruitment field.

    Only triggers when ``changed_fields & CRITICAL_RECRUITMENT_FIELDS``
    is non-empty AND the canonical hash actually drifts. An admin who
    edits a non-critical field (e.g. internal notes) doesn't poke the
    gateway.

    Returns the updated report row, or ``None`` if no active report
    exists or nothing drifted.
    """
    if not (changed_fields & CRITICAL_RECRUITMENT_FIELDS):
        return None

    active = get_active_report(supabase, recruitment_id=recruitment_id)
    if active is None:
        return None

    # Re-load the recruitment + posts to compute the fresh canonical hash.
    rec_rows = (
        supabase.table("recruitments")
        .select("*")
        .eq("id", recruitment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rec_rows:
        return None
    recruitment = rec_rows[0]
    posts = (
        supabase.table("posts")
        .select("*")
        .eq("recruitment_id", recruitment_id)
        .execute()
        .data
        or []
    )

    decision = detect_canonical_drift(
        active_report=active,
        recruitment=recruitment,
        posts=posts,
    )
    if not decision.drifted:
        return None

    return _set_staleness(
        supabase,
        active["id"],
        staleness_status="stale_canonical_changed",
        lifecycle_status="stale_canonical_changed",
        valid_until=compute_valid_until(recruitment),
    )


# ── Source watch pass ────────────────────────────────────────────────


@dataclass
class SourceWatchStats:
    """Aggregate outcome of one watch pass."""

    reports_checked: int = 0
    source_drift_marked: int = 0
    pending_batch: int = 0
    suppressed: int = 0
    batches_created: list[str] = field(default_factory=list)


@dataclass
class FreshScrape:
    """One queue/source observation passed into the watch driver."""

    report_id: str
    source_id: str | None
    extracted_data: dict[str, Any]


def run_source_watch_pass(
    supabase: Client,
    fresh_scrapes: list[FreshScrape],
    *,
    trigger: str = "source_hash_changed",
) -> SourceWatchStats:
    """Walk a batch of fresh re-scrapes and flag drifted reports stale.

    Mass-corrigendum protection (plan §6): when a single ``source_id``
    contributes more drift events than ``mass_change_batch_limit``,
    the first N reports are flipped to ``needs_reverification`` /
    ``stale_source_changed``; the rest go to
    ``staleness_status='pending_reverification_batch'`` and a
    :class:`reverification_batches` row is created. Admins acknowledge
    the batch before the remainder is processed.

    ``trigger`` is the *cause* the caller is passing through; if it's
    in :data:`corrigendum_detector.SUPPRESSED_STALENESS_TRIGGERS`, the
    whole pass exits early.
    """
    stats = SourceWatchStats()
    if staleness_suppressed(trigger):
        stats.suppressed = len(fresh_scrapes)
        return stats

    batch_limit = CORRIGENDUM_WATCH_LIMITS["mass_change_batch_limit"]
    per_source: dict[str | None, int] = {}
    per_source_pending: dict[str | None, list[str]] = {}

    for fresh in fresh_scrapes:
        stats.reports_checked += 1
        report_rows = (
            supabase.table(TABLE)
            .select("*")
            .eq("id", fresh.report_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not report_rows:
            continue
        report = report_rows[0]
        decision = detect_source_drift(
            active_report=report,
            new_extracted_data=fresh.extracted_data,
        )
        if not decision.drifted:
            continue

        marked = per_source.setdefault(fresh.source_id, 0)
        if marked < batch_limit:
            _set_staleness(
                supabase,
                report["id"],
                staleness_status="stale_source_changed",
                lifecycle_status="stale_source_changed",
                valid_until=compute_valid_until(fresh.extracted_data),
            )
            per_source[fresh.source_id] = marked + 1
            stats.source_drift_marked += 1
        else:
            _set_staleness(
                supabase,
                report["id"],
                staleness_status="pending_reverification_batch",
                # lifecycle stays where it was — pending_reverification_batch
                # is a staleness_status value, NOT a lifecycle state per
                # plan §6 acceptance.
                valid_until=compute_valid_until(fresh.extracted_data),
            )
            per_source_pending.setdefault(fresh.source_id, []).append(report["id"])
            stats.pending_batch += 1

    # Write one batch row per source that overflowed.
    for source_id, pending_ids in per_source_pending.items():
        promoted = per_source.get(source_id, 0)
        batch_payload = {
            "source_id": source_id,
            "trigger_reason": trigger,
            "total_reports_affected": promoted + len(pending_ids),
            "promoted_to_needs_reverification": promoted,
            "remaining_pending": len(pending_ids),
        }
        try:
            inserted = (
                supabase.table("reverification_batches")
                .insert(batch_payload)
                .execute()
                .data
                or []
            )
            if inserted:
                stats.batches_created.append(inserted[0].get("id") or "")
        except Exception:  # noqa: BLE001
            logger.exception(
                "source_watch.batch_insert_failed source_id=%s", source_id,
            )
    return stats


def acknowledge_batch(
    supabase: Client,
    batch_id: str,
    *,
    acknowledged_by: str,
    chunk_size: int = 25,
) -> int:
    """Promote ``pending_reverification_batch`` reports for a batch.

    The admin acknowledges → the service flips up to ``chunk_size``
    pending reports into ``needs_reverification`` in this call. Repeat
    invocations chew through the queue.
    """
    rows = (
        supabase.table("reverification_batches")
        .select("*")
        .eq("id", batch_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise LookupError(f"reverification_batch {batch_id} not found")
    batch = rows[0]
    source_id = batch.get("source_id")

    pending = (
        supabase.table(TABLE)
        .select("id")
        .eq("staleness_status", "pending_reverification_batch")
        .limit(chunk_size)
        .execute()
        .data
        or []
    )
    promoted = 0
    for r in pending:
        _set_staleness(
            supabase, r["id"],
            staleness_status="needs_reverification",
            lifecycle_status="needs_reverification",
        )
        promoted += 1

    # Update the batch row's counters + ack stamp.
    new_remaining = max(0, (batch.get("remaining_pending") or 0) - promoted)
    new_promoted = (batch.get("promoted_to_needs_reverification") or 0) + promoted
    update_payload: dict[str, Any] = {
        "remaining_pending": new_remaining,
        "promoted_to_needs_reverification": new_promoted,
    }
    if batch.get("acknowledged_at") is None:
        update_payload["acknowledged_by"] = acknowledged_by
        update_payload["acknowledged_at"] = "now()"
        update_payload.pop("acknowledged_at", None)   # fake-friendly
    supabase.table("reverification_batches").update(update_payload).eq("id", batch_id).execute()
    return promoted


__all__ = [
    "FreshScrape",
    "SourceWatchStats",
    "acknowledge_batch",
    "compute_valid_until",
    "on_recruitment_critical_field_edit",
    "run_source_watch_pass",
]
