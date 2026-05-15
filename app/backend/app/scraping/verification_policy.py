"""Per-tier policy for the Recruitment Verification Gateway.

Pure data module. No DB, no I/O. The classifier picks a tier; this module
maps each tier to a policy bundle that downstream components consult:

* ``official_source_required`` / ``official_source_preferred`` — whether
  the official-proof resolver result is a hard requirement before
  promotion (Tier A) or a soft preference (Tier B/C).
* ``aggregator_canonical_truth_allowed`` — always ``False``. An
  aggregator can *surface* a recruitment, never *be* the canonical truth.
* ``human_verification_required`` — Tier A only. Even with full evidence
  the gate insists on a human verifier.
* ``auto_publish_allowed`` — ``False`` across the board for PR1; the
  promotion path is always a manual admin decision.

PR1 only consumes ``review_strategy``, ``publish_policy`` and the
``BACKFILL_MODE`` constant. The other flags are read by PR2+ resolver,
PR3 consensus and PR4 complexity work; they're declared here so the
single-tier definition stays in one place.
"""
from __future__ import annotations

from typing import Literal, TypedDict


CriticalityTier = Literal[
    "A_HIGH_STAKES",
    "B_TECHNICAL_CONDITIONAL",
    "C_STANDARD_LONG_TAIL",
]


class TierPolicy(TypedDict, total=False):
    official_source_required: bool
    official_source_preferred: bool
    aggregator_discovery_allowed: bool
    aggregator_canonical_truth_allowed: bool
    multi_source_consensus_required: bool
    conditional_rule_review_required: bool
    human_verification_required: bool
    human_review_if_risk_flags: bool
    admin_review_only_if_quality_low: bool
    auto_publish_allowed: bool
    eligibility_rule_evidence_required: bool
    review_strategy: str
    publish_policy: str


TIER_POLICIES: dict[CriticalityTier, TierPolicy] = {
    "A_HIGH_STAKES": {
        "official_source_required": True,
        "aggregator_discovery_allowed": True,
        "aggregator_canonical_truth_allowed": False,
        "multi_source_consensus_required": True,
        "human_verification_required": True,
        "auto_publish_allowed": False,
        "eligibility_rule_evidence_required": True,
        "review_strategy": "strict_official_multi_source",
        "publish_policy": "manual_verified_only",
    },
    "B_TECHNICAL_CONDITIONAL": {
        "official_source_preferred": True,
        "aggregator_discovery_allowed": True,
        "aggregator_canonical_truth_allowed": False,
        "conditional_rule_review_required": True,
        "human_review_if_risk_flags": True,
        "auto_publish_allowed": False,
        "review_strategy": "conditional_rule_review",
        "publish_policy": "manual_verified_only",
    },
    "C_STANDARD_LONG_TAIL": {
        "official_source_preferred": True,
        "aggregator_discovery_allowed": True,
        "aggregator_canonical_truth_allowed": False,
        "multi_source_consensus_required": False,
        "admin_review_only_if_quality_low": True,
        "auto_publish_allowed": False,
        "review_strategy": "standard_validate_verify_publish",
        "publish_policy": "manual_verified_only",
    },
}


# PR1 ships soft backfill: a report is written for existing recruitments
# but nothing is unpublished and currently-published items aren't blocked.
# Strict mode (unpublish + block) is a later PR.
BACKFILL_MODE: Literal["soft", "strict"] = "soft"


# ── PR2 additions ────────────────────────────────────────────────────────

# Execution mode for the orchestrator (PR plan §0.3).
# ``sync``        — `verification_gateway` runs inline after scrape_queue insert.
# ``async_queue`` — orchestrator enqueues a job and returns immediately.
# No auto-detection — the flag is explicit. PR2 defaults to ``sync``.
GATEWAY_EXECUTION_MODE: Literal["sync", "async_queue"] = "sync"


# Official-source resolver confidence bands (PR plan §3).
#
#   ≥ 0.85       → status = 'auto_resolved'
#   0.60 – 0.85  → status = 'suggested', recommended_action = 'confirm_suggested_proof'
#   < 0.60       → status = 'unresolved', recommended_action = 'await_official_proof'
OFFICIAL_RESOLUTION_THRESHOLDS: dict[str, float] = {
    "auto_resolve": 0.85,
    "suggest_for_admin": 0.60,
    "manual_required": 0.0,
}


# Cooldown / rate limit for the admin "re-run resolver" endpoint (PR plan §3).
# Per-report cooldown prevents one admin from hammering the same row;
# the per-admin-per-hour ceiling stops a stuck script from running all
# day. The orchestrator reads these — no separate config file.
RESOLVER_RERUN_LIMITS: dict[str, int] = {
    "per_report_cooldown_seconds": 300,   # 5 min
    "per_admin_per_hour": 60,
}


# ── PR5: Corrigendum / staleness ─────────────────────────────────────
#
# Poll cadence and batch-throttle thresholds for the watcher. Tier A is
# checked daily, Tier B every three days, Tier C weekly. The per-run
# ceilings stop a misconfigured cron from sweeping every source/report
# in one pass.

CORRIGENDUM_WATCH_LIMITS: dict[str, int] = {
    "tier_a_interval_hours": 24,
    "tier_b_interval_hours": 72,
    "tier_c_interval_hours": 168,
    "max_sources_per_run": 100,
    "max_reports_per_run": 300,
    # When a single source flips this many reports in one pass, the
    # remainder are deferred to a batch acknowledgment rather than
    # producing N independent admin cards.
    "mass_change_batch_limit": 25,
}


# Canonical recruitment fields that should fire the staleness hook when
# an admin edits them via the admin_trust endpoint. The list matches
# the consensus engine's CONSENSUS_FIELDS subset that's stored directly
# on ``recruitments`` (post_names lives on the ``posts`` table, so it's
# not editable from the recruitment-level path).
CRITICAL_RECRUITMENT_FIELDS: frozenset[str] = frozenset({
    "name",
    "organization_id",
    "apply_start_date",
    "apply_end_date",
    "notification_date",
    "total_vacancies",
    "year",
    "official_notification_url",
    "official_apply_url",
})


# Recommended-action default for each tier. Used by ``verification_reports``
# when a fresh report is created and the resolver/consensus stages haven't
# run yet. Tier C may shortcut to ``promote_eligible`` when data quality is
# clean, but the gateway service decides that — this map is the *default*.
TIER_RECOMMENDED_ACTION: dict[CriticalityTier, str] = {
    "A_HIGH_STAKES": "request_admin_review",
    "B_TECHNICAL_CONDITIONAL": "request_admin_review",
    "C_STANDARD_LONG_TAIL": "request_admin_review",
}


def policy_for_tier(tier: CriticalityTier) -> TierPolicy:
    """Return a copy of the policy bundle for ``tier``.

    Returns a fresh dict so callers can't mutate the module-level table.
    """
    return dict(TIER_POLICIES[tier])
