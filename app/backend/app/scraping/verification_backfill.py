"""Soft backfill driver for the Recruitment Verification Gateway.

Walks already-published canonical recruitments and emits one verification
report per recruitment via :func:`verification_reports.backfill_existing_recruitment`.

Three contracts the plan pins explicitly (PR plan §2):

* **Enum compatibility** — PR7 ships before PR2/PR3/PR5. It may emit only
  PR1 enum values:

      trigger_reason   = 'backfill_existing_recruitment'
      lifecycle_status ∈ {'classified', 'backfilled_needs_review'}
      recommended_action ∈ {'request_admin_review', 'promote_eligible', 'no_action'}

  No ``confirm_suggested_proof`` / ``resolve_conflict`` / ``await_corrigendum``.

* **Soft mode** — nothing is unpublished, no published item is blocked.
  Reports are written for visibility only. Strict mode (auto-unpublish on
  Tier A gaps) is deferred.

* **Re-run rule** — re-running the backfill for the same recruitment is
  a noop when the ``canonical_snapshot_hash`` is unchanged. Hash drift
  creates a new report version atomically via the supersede RPC.

The driver doesn't take supabase as a global — every call accepts an
explicit client so tests can pass a fake. Slow remote work (resolver
calls, etc.) is NOT in this module; this is the *backfill* layer.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable

from supabase import Client

from .verification_reports import backfill_existing_recruitment


logger = logging.getLogger(__name__)


# A defensive ceiling so a single backfill pass on a misconfigured prod
# never tries to load 500k recruitments in one query. Real callers paginate.
DEFAULT_PAGE_SIZE = 200


@dataclass
class BackfillStats:
    """Aggregate outcome of a backfill pass.

    Counters are append-only across one driver invocation; the script
    entry point prints them at the end so an operator can spot the
    "everything was a noop" case (good — nothing changed) versus the
    "lots of new Tier A needs-review reports" case (action required).
    """

    total_seen: int = 0
    created: int = 0
    noop: int = 0
    tier_a_needs_review: int = 0
    skipped_missing_id: int = 0
    errors: int = 0
    error_ids: list[str] = field(default_factory=list)

    def merge(self, other: "BackfillStats") -> None:
        self.total_seen += other.total_seen
        self.created += other.created
        self.noop += other.noop
        self.tier_a_needs_review += other.tier_a_needs_review
        self.skipped_missing_id += other.skipped_missing_id
        self.errors += other.errors
        self.error_ids.extend(other.error_ids)


def _fetch_posts(supabase: Client, recruitment_id: str) -> list[dict[str, Any]]:
    """Load the canonical posts for a recruitment.

    Defensive against ``posts`` being empty — the backfill snapshot hash
    still computes off ``recruitment + []`` and writes a noop-eligible
    report. (The canonical hash helper requires the posts argument
    explicitly per spec §4; empty list is valid, missing argument is not.)
    """
    try:
        rows = (
            supabase.table("posts")
            .select("id, recruitment_id, post_name, post_code")
            .eq("recruitment_id", recruitment_id)
            .execute()
            .data
            or []
        )
    except Exception:  # noqa: BLE001
        logger.exception("backfill.posts_fetch_failed recruitment_id=%s", recruitment_id)
        return []
    return rows


def backfill_recruitment(
    supabase: Client,
    recruitment: dict[str, Any],
    *,
    source: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str]:
    """Backfill a single recruitment row.

    Returns ``(report, outcome)`` where outcome is ``"created" | "noop" |
    "skipped" | "error"``. ``report`` is the report row on
    created/noop, and ``None`` on skipped/error.
    """
    rec_id = recruitment.get("id")
    if not rec_id:
        return None, "skipped"

    posts = _fetch_posts(supabase, rec_id)
    try:
        report, raw_outcome = backfill_existing_recruitment(
            supabase, recruitment, posts, source=source
        )
    except Exception:  # noqa: BLE001
        logger.exception("backfill.recruitment_failed recruitment_id=%s", rec_id)
        return None, "error"

    # Plan §2: PR7 may only emit the PR1 enum subset. Defensive guard;
    # the service module already restricts emission, but if a future
    # change accidentally widens the set this is the canary that fires.
    if report.get("trigger_reason") != "backfill_existing_recruitment":
        logger.error(
            "backfill.bad_trigger_reason recruitment_id=%s got=%r",
            rec_id, report.get("trigger_reason"),
        )
        return None, "error"
    if report.get("lifecycle_status") not in {"classified", "backfilled_needs_review"}:
        logger.error(
            "backfill.bad_lifecycle_status recruitment_id=%s got=%r",
            rec_id, report.get("lifecycle_status"),
        )
        return None, "error"

    return report, raw_outcome


def iter_published_recruitments(
    supabase: Client,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Iterable[dict[str, Any]]:
    """Yield published recruitments in chunks ordered by id ASC.

    Cursor pagination on ``id`` so a long-running backfill can resume
    after a transient failure without skipping rows (offset-based
    pagination would shift if rows are inserted mid-pass).
    """
    last_id: str | None = None
    while True:
        q = (
            supabase.table("recruitments")
            .select("id, name, organization_id, apply_start_date, apply_end_date, total_vacancies, notification_date, year, publish_status, status")
            .eq("publish_status", "published")
            .order("id")
            .limit(page_size)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        rows = q.execute().data or []
        if not rows:
            return
        for row in rows:
            yield row
            last_id = row["id"]
        if len(rows) < page_size:
            return


def run_backfill(
    supabase: Client,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
    max_recruitments: int | None = None,
) -> BackfillStats:
    """Run a soft backfill pass over every published recruitment.

    Arguments:
      page_size: cursor batch size; defaults to a conservative 200.
      max_recruitments: optional safety cap — useful for a smoke-test
        run on prod. ``None`` means "no cap".

    Returns the aggregated :class:`BackfillStats`.
    """
    stats = BackfillStats()
    for recruitment in iter_published_recruitments(supabase, page_size=page_size):
        if max_recruitments is not None and stats.total_seen >= max_recruitments:
            break
        stats.total_seen += 1
        report, outcome = backfill_recruitment(supabase, recruitment)
        if outcome == "created":
            stats.created += 1
            if report and report.get("lifecycle_status") == "backfilled_needs_review":
                stats.tier_a_needs_review += 1
        elif outcome == "noop":
            stats.noop += 1
        elif outcome == "skipped":
            stats.skipped_missing_id += 1
        else:  # error
            stats.errors += 1
            rec_id = recruitment.get("id")
            if rec_id:
                stats.error_ids.append(rec_id)
    logger.info(
        "backfill.complete seen=%d created=%d noop=%d needs_review=%d skipped=%d errors=%d",
        stats.total_seen, stats.created, stats.noop,
        stats.tier_a_needs_review, stats.skipped_missing_id, stats.errors,
    )
    return stats


__all__ = [
    "BackfillStats",
    "backfill_recruitment",
    "iter_published_recruitments",
    "run_backfill",
]
