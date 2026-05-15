"""Corrigendum detector (PR plan §6).

A *corrigendum* is an official addendum that changes a previously
published recruitment (most commonly: extended deadlines, vacancy
revisions, a re-published notification). The detector watches for two
distinct change signals:

* **Source hash drift** — the next scrape of the same URL produces a
  different ``source_snapshot_hash``. The page (or its PDF) has been
  re-issued.
* **Canonical drift** — an admin edited a critical field on the
  canonical recruitment row (apply_end_date moved, vacancies revised,
  notification PDF replaced). This is detected by re-hashing the
  recruitment + posts and comparing to the active report's
  ``canonical_snapshot_hash``.

Neither path fires for trivial changes — raw HTML, CSS, ad slots and
CDN wrappers are explicitly excluded by ``verification_hash`` (PR1).
That's the whole point of the normalised-snapshot contract.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from .verification_hash import (
    build_canonical_snapshot_hash,
    build_source_snapshot_hash,
)


logger = logging.getLogger(__name__)


@dataclass
class DriftDecision:
    """Outcome of one drift check.

    ``trigger_reason`` matches the gateway's enum so the corrigendum
    path can supersede the active report with the right audit value.
    """

    drifted: bool
    old_hash: str | None
    new_hash: str | None
    trigger_reason: str | None = None
    reason: str | None = None   # human-readable for logs / admin


def detect_source_drift(
    *,
    active_report: dict[str, Any] | None,
    new_extracted_data: dict[str, Any],
) -> DriftDecision:
    """Compare a freshly-scraped payload's hash to the active report's hash.

    Returns ``drifted=True`` only when the active report has a
    ``source_snapshot_hash`` AND it differs from the new one. A
    queue-only report with no source hash is treated as no-drift
    (the first scrape didn't have a baseline to compare to).
    """
    if active_report is None:
        return DriftDecision(drifted=False, old_hash=None, new_hash=None,
                             reason="no_active_report")
    old = active_report.get("source_snapshot_hash")
    new = build_source_snapshot_hash(new_extracted_data)
    if not old:
        return DriftDecision(drifted=False, old_hash=None, new_hash=new,
                             reason="no_baseline_hash")
    if old == new:
        return DriftDecision(drifted=False, old_hash=old, new_hash=new,
                             reason="hash_match")
    return DriftDecision(
        drifted=True,
        old_hash=old, new_hash=new,
        trigger_reason="source_hash_changed",
        reason="source_hash_drift",
    )


def detect_canonical_drift(
    *,
    active_report: dict[str, Any] | None,
    recruitment: dict[str, Any],
    posts: list[dict[str, Any]],
) -> DriftDecision:
    """Compare a canonical-side hash to the active report's hash.

    Used by the canonical-edit hook in :mod:`source_watch`. ``posts`` is
    required by :func:`build_canonical_snapshot_hash` — see PR1 §4.
    """
    if active_report is None:
        return DriftDecision(drifted=False, old_hash=None, new_hash=None,
                             reason="no_active_report")
    old = active_report.get("canonical_snapshot_hash")
    new = build_canonical_snapshot_hash(recruitment, posts)
    if not old:
        return DriftDecision(drifted=False, old_hash=None, new_hash=new,
                             reason="no_baseline_hash")
    if old == new:
        return DriftDecision(drifted=False, old_hash=old, new_hash=new,
                             reason="hash_match")
    return DriftDecision(
        drifted=True,
        old_hash=old, new_hash=new,
        trigger_reason="canonical_field_edited",
        reason="canonical_hash_drift",
    )


# ── Suppressions ──────────────────────────────────────────────────────
#
# Plan §6 spec — the following events do NOT fire staleness, even if
# they happen during a sweep. Centralised so the watcher and the
# canonical-edit hook agree.

SUPPRESSED_STALENESS_TRIGGERS: frozenset[str] = frozenset({
    "admin_override_added",
    "resolver_state_changed_after_admin_attach",
    "lifecycle_status_changed",
    "recommended_action_recomputed",
    "supersession_non_hash",
})


def staleness_suppressed(trigger: str) -> bool:
    """Return True when this trigger should NOT mark a report stale.

    The watcher passes events through this gate before deciding to
    write staleness state. Catches the most common false-positives
    (admin overrides, resolver re-runs after an admin attach, etc).
    """
    return trigger in SUPPRESSED_STALENESS_TRIGGERS


__all__ = [
    "DriftDecision",
    "SUPPRESSED_STALENESS_TRIGGERS",
    "detect_canonical_drift",
    "detect_source_drift",
    "staleness_suppressed",
]
