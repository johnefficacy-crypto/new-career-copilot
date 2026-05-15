"""Orchestrator for the Recruitment Verification Gateway (PR plan §0.2).

Owns the staged pipeline that runs after a ``scrape_queue`` row is
inserted or after an admin re-runs the resolver. PR2 wires the *resolver*
stage; PR3 adds consensus and PR4 eligibility complexity. Each later PR
appends a stage hook to this module.

Public API:

    run_gateway_for_queue_item(queue_item_id, *, trigger_reason)
    run_resolver_stage(report_id)
    enqueue_or_run_gateway_after_scrape_queue_insert(queue_item_id)

Execution mode (sync vs async_queue) is controlled by
``verification_policy.GATEWAY_EXECUTION_MODE``. PR2 defaults to ``sync``;
no auto-detection.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from supabase import Client

from .consensus_engine import (
    collect_observations,
    compare_observations,
)
from .eligibility_complexity import detect_complexity
from .official_resolver import (
    ResolverCandidate,
    ResolverResult,
    run_resolver_waterfall,
    write_resolution_attempts,
)
from .verification_policy import GATEWAY_EXECUTION_MODE
from .verification_reports import (
    get_active_report,
    get_or_create_verification_report_for_queue,
    set_resolver_state,
    update_lifecycle_status,
    write_complexity_signals,
    write_conflicts,
)


logger = logging.getLogger(__name__)


@dataclass
class GatewayResult:
    """Outcome of one orchestrator invocation.

    Tests and admin re-run endpoints inspect this — the row in DB is
    the source of truth, but the result struct is convenient for
    "what changed in this run" assertions.
    """

    report_id: str | None
    classification_outcome: str       # 'created' | 'noop'
    resolver_status: str | None
    resolver_method: str | None
    resolver_confidence: float | None
    suggested_count: int = 0


# ── Stage 1: classify (PR1) ───────────────────────────────────────────


def _ensure_report_for_queue(
    supabase: Client,
    queue_item: dict[str, Any],
    *,
    source: dict[str, Any] | None,
) -> tuple[dict[str, Any], str]:
    return get_or_create_verification_report_for_queue(supabase, queue_item, source=source)


# ── Stage 2: resolver (PR2) ───────────────────────────────────────────


def _fetch_queue_item(supabase: Client, queue_item_id: str) -> dict[str, Any] | None:
    rows = (
        supabase.table("scrape_queue")
        .select("id, source_url, source_name, extracted_data, recruitment_id")
        .eq("id", queue_item_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _fetch_source_for_url(supabase: Client, source_url: str | None) -> dict[str, Any] | None:
    """Look up the source_registry row that owns a scrape URL.

    Best-effort match on host. We don't need a perfect join — the
    resolver only uses the row's optional ``official_url`` /
    ``sitemap_url`` / ``career_page_url`` fields, and a miss simply
    means L4/L5 skip.
    """
    if not source_url:
        return None
    try:
        rows = (
            supabase.table("source_registry")
            .select("id, official_url, sitemap_url, rss_url, career_page_url, org_type, trust_tier")
            .limit(200)
            .execute()
            .data
            or []
        )
    except Exception:  # noqa: BLE001
        logger.exception("orchestrator.source_lookup_failed url=%s", source_url)
        return None
    from urllib.parse import urlparse
    target_host = urlparse(source_url).netloc.lower()
    for r in rows:
        official = r.get("official_url") or ""
        if not official:
            continue
        if urlparse(official).netloc.lower() == target_host:
            return r
    return None


def run_resolver_stage(
    supabase: Client,
    report_id: str,
    *,
    queue_item: dict[str, Any] | None = None,
    source: dict[str, Any] | None = None,
) -> GatewayResult:
    """Run the resolver waterfall for an existing report and persist state.

    ``queue_item`` / ``source`` may be passed for tests; in production
    the orchestrator looks them up off ``report.scrape_queue_id``.
    """
    report = _fetch_report(supabase, report_id)
    if report is None:
        raise LookupError(f"verification_report {report_id} not found")

    if queue_item is None and report.get("scrape_queue_id"):
        queue_item = _fetch_queue_item(supabase, report["scrape_queue_id"])
    extracted = (queue_item or {}).get("extracted_data") or {}
    if source is None and queue_item is not None:
        source = _fetch_source_for_url(supabase, queue_item.get("source_url"))

    waterfall = run_resolver_waterfall(
        supabase,
        extracted_data=extracted,
        source=source,
        organization_name=extracted.get("organization_name"),
        notification_number=extracted.get("notification_number"),
        title=extracted.get("title") or extracted.get("name"),
        year=extracted.get("year"),
    )

    _persist_resolver_outcome(
        supabase,
        report=report,
        queue_item=queue_item,
        source=source,
        result=waterfall,
    )

    return GatewayResult(
        report_id=report_id,
        classification_outcome="noop",
        resolver_status=waterfall.status,
        resolver_method=waterfall.chosen.method if waterfall.chosen else None,
        resolver_confidence=waterfall.chosen.confidence if waterfall.chosen else None,
        suggested_count=len(waterfall.suggested),
    )


def _persist_resolver_outcome(
    supabase: Client,
    *,
    report: dict[str, Any],
    queue_item: dict[str, Any] | None,
    source: dict[str, Any] | None,
    result: ResolverResult,
) -> None:
    """Write the resolver outcome onto the report + audit table."""
    set_resolver_state(
        supabase,
        report["id"],
        status=result.status,
        method=result.chosen.method if result.chosen else None,
        confidence=result.chosen.confidence if result.chosen else None,
        suggested_urls=[_candidate_to_dict(c) for c in result.suggested],
        recommended_action=result.recommended_action,
    )
    if result.attempts:
        write_resolution_attempts(
            supabase,
            verification_report_id=report["id"],
            scrape_queue_id=report.get("scrape_queue_id"),
            source_id=(source or {}).get("id"),
            attempts=result.attempts,
        )


# ── Stage 3: consensus (PR3) ──────────────────────────────────────────


def _fetch_peer_queue_items(
    supabase: Client,
    *,
    primary_queue_item: dict[str, Any],
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Find other open queue items that likely describe the same recruitment.

    Identity key: (organization_name, notification_number) when both
    present. Falls back to no peers — better to short-circuit consensus
    than match too broadly and produce spurious conflicts.
    """
    extracted = primary_queue_item.get("extracted_data") or {}
    org = (extracted.get("organization_name") or "").strip().lower()
    notif = (extracted.get("notification_number") or "").strip().lower()
    if not org or not notif:
        return []
    try:
        rows = (
            supabase.table("scrape_queue")
            .select("id, source_url, source_name, extracted_data")
            .limit(200)
            .execute()
            .data
            or []
        )
    except Exception:  # noqa: BLE001
        logger.exception("orchestrator.consensus_peer_lookup_failed")
        return []
    peers: list[dict[str, Any]] = []
    for r in rows:
        if r.get("id") == primary_queue_item.get("id"):
            continue
        ext = r.get("extracted_data") or {}
        if (ext.get("organization_name") or "").strip().lower() != org:
            continue
        if (ext.get("notification_number") or "").strip().lower() != notif:
            continue
        peers.append(r)
        if len(peers) >= limit:
            break
    return peers


def run_consensus_stage(
    supabase: Client,
    report_id: str,
    *,
    queue_item: dict[str, Any] | None = None,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the consensus engine for a single report.

    Behaviour:

    * Loads peer queue items by identity (org + notification_number).
    * Compares the consensus fields across the primary + peers.
    * Writes conflicts (if any) onto the report's jsonb column.
    * Transitions the lifecycle: ``classified → consensus_pending`` first
      (always), then ``consensus_pending → conflict`` if conflicts exist.
    * On no conflicts: transitions back ``consensus_pending → classified``.
    """
    report = _fetch_report(supabase, report_id)
    if report is None:
        raise LookupError(f"verification_report {report_id} not found")
    if queue_item is None and report.get("scrape_queue_id"):
        queue_item = _fetch_queue_item(supabase, report["scrape_queue_id"])
    if queue_item is None:
        # Recruitment-only reports (PR7 soft backfill) have no peer-queue
        # signal yet; consensus is a no-op until PR5's canonical-edit
        # hook brings their peers into scope.
        return {"status": "skipped_no_queue", "report_id": report_id}

    # Move into consensus_pending first; if we're already there (re-run),
    # update_lifecycle_status no-ops on same-state.
    if report.get("lifecycle_status") == "classified":
        update_lifecycle_status(supabase, report_id, "consensus_pending")

    peers = _fetch_peer_queue_items(supabase, primary_queue_item=queue_item)
    observations = collect_observations(
        primary_queue_item=queue_item,
        primary_source=source,
        peer_queue_items=peers,
    )
    result = compare_observations(observations)

    conflicts_payload = [
        {
            "conflict_id": c.conflict_id,
            "conflict_key": c.conflict_key,
            "field_path": c.field_path,
            "values": c.values,
            "status": "open",
        }
        for c in result.conflicts
    ]
    if conflicts_payload:
        write_conflicts(
            supabase, report_id,
            conflicts=conflicts_payload,
            lifecycle_status="conflict",
            recommended_action="resolve_conflict",
        )
    else:
        # No conflicts — clear any stale list and exit consensus_pending.
        write_conflicts(
            supabase, report_id,
            conflicts=[],
            lifecycle_status="classified",
        )

    return {
        "status": "conflict" if conflicts_payload else "clean",
        "report_id": report_id,
        "conflict_count": len(conflicts_payload),
        "peer_count": len(peers),
    }


# ── Stage 4: eligibility complexity (PR4) ─────────────────────────────


def run_eligibility_complexity_stage(
    supabase: Client,
    report_id: str,
    *,
    queue_item: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the complexity detector + persist signals on the report.

    The detector is pure (no DB). The adapter that decides whether a
    detected signal is *unrepresented* in canonical rules lives in
    :mod:`app.eligibility.complexity_contract` and is consumed by the
    publish/promotion gate, not here.

    Lifecycle behaviour:

    * Any signal detected → ``complexity_detected`` + recommended_action
      mapped to ``block_publish`` when a publish_blocker or
      promotion_blocker flag is present.
    * No signals → leave lifecycle as-is; clear any prior risk_flags
      list so a re-run after admin corrections doesn't keep stale flags.
    """
    report = _fetch_report(supabase, report_id)
    if report is None:
        raise LookupError(f"verification_report {report_id} not found")
    if queue_item is None and report.get("scrape_queue_id"):
        queue_item = _fetch_queue_item(supabase, report["scrape_queue_id"])
    extracted = (queue_item or {}).get("extracted_data") or {}

    signals = detect_complexity(extracted)
    payload = [
        {
            "flag": s.flag,
            "field_key": s.field_key,
            "source_field_path": s.source_field_path,
            "blocking_level": s.blocking_level,
            "evidence_summary_key": s.evidence_summary_key,
        }
        for s in signals
    ]

    if not signals:
        write_complexity_signals(supabase, report_id, signals=[])
        return {"status": "no_complexity", "report_id": report_id, "signal_count": 0}

    has_hard_blocker = any(
        s.blocking_level in {"promotion_blocker", "publish_blocker"}
        for s in signals
    )
    write_complexity_signals(
        supabase, report_id,
        signals=payload,
        lifecycle_status="complexity_detected",
        recommended_action="block_publish" if has_hard_blocker else None,
    )
    return {
        "status": "complexity_detected",
        "report_id": report_id,
        "signal_count": len(signals),
        "has_hard_blocker": has_hard_blocker,
    }


def _candidate_to_dict(c: ResolverCandidate) -> dict[str, Any]:
    return {
        "url": c.url,
        "url_type": c.url_type,
        "method": c.method,
        "confidence": c.confidence,
        "source_id": c.source_id,
        "host": c.host,
        "evidence_summary_key": c.evidence_summary_key,
    }


def _fetch_report(supabase: Client, report_id: str) -> dict[str, Any] | None:
    rows = (
        supabase.table("recruitment_verification_reports")
        .select("*")
        .eq("id", report_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


# ── End-to-end entry points ───────────────────────────────────────────


def run_gateway_for_queue_item(
    supabase: Client,
    queue_item_id: str,
    *,
    trigger_reason: str | None = None,
) -> GatewayResult:
    """Run every implemented stage for one queue item.

    PR2 stages: classify (PR1) + resolver. PR3+ append more.

    ``trigger_reason`` is accepted for forward-compat but PR1's queue
    path infers it from active-report presence — pass-through here is
    harmless.
    """
    queue_item = _fetch_queue_item(supabase, queue_item_id)
    if queue_item is None:
        raise LookupError(f"scrape_queue {queue_item_id} not found")
    source = _fetch_source_for_url(supabase, queue_item.get("source_url"))

    report, outcome = _ensure_report_for_queue(supabase, queue_item, source=source)

    # Resolver only runs on a fresh report (or one whose source hash
    # changed). A noop classification means the active report's
    # source_snapshot_hash is unchanged; running the resolver again on
    # the same payload would only repeat the previous attempt rows.
    # Admins can force a re-run via the API endpoint, which routes to
    # :func:`run_resolver_stage` directly.
    if outcome == "noop":
        return GatewayResult(
            report_id=report["id"],
            classification_outcome="noop",
            resolver_status=report.get("official_resolution_status"),
            resolver_method=report.get("official_resolution_method"),
            resolver_confidence=report.get("official_resolution_confidence"),
            suggested_count=len(report.get("suggested_official_urls") or []),
        )

    stage_result = run_resolver_stage(
        supabase, report["id"],
        queue_item=queue_item, source=source,
    )
    # Stitch the classification outcome from this call onto the resolver
    # result. ``run_resolver_stage`` always says ``"noop"`` because by
    # itself it's invoked on an existing report; the queue entry-point
    # is the one that knows whether classification just minted a row.
    stage_result.classification_outcome = outcome

    # PR3: chain into consensus stage.
    # Guard: Tier A with unresolved resolver state skips consensus —
    # no point comparing values when we don't have an official anchor.
    is_tier_a = report.get("criticality_tier") == "A_HIGH_STAKES"
    if is_tier_a and stage_result.resolver_status in (None, "not_attempted", "unresolved"):
        return stage_result
    try:
        run_consensus_stage(
            supabase, report["id"],
            queue_item=queue_item, source=source,
        )
    except Exception:  # noqa: BLE001
        # Plan §4 error handling: never raise out of the consensus
        # stage. Lifecycle stays at consensus_pending; admin sees
        # request_admin_review as the recommended action.
        logger.exception(
            "orchestrator.consensus_stage_failed report_id=%s",
            report["id"],
        )

    # PR4: complexity detection runs regardless of consensus outcome.
    # An open conflict doesn't suppress complexity flagging — the two
    # blockers are orthogonal: an admin can resolve a conflict in one
    # field while the recruitment still has an unrepresented domicile
    # rule.
    try:
        run_eligibility_complexity_stage(
            supabase, report["id"], queue_item=queue_item,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "orchestrator.complexity_stage_failed report_id=%s",
            report["id"],
        )
    return stage_result


def enqueue_or_run_gateway_after_scrape_queue_insert(
    supabase: Client,
    queue_item_id: str,
) -> GatewayResult | None:
    """Hook the scrape_queue insert flow calls.

    Behaviour is gated by ``GATEWAY_EXECUTION_MODE``:

    * ``sync`` (PR2 default) — runs the gateway inline.
    * ``async_queue`` — would enqueue a job and return ``None``. PR2
      does not ship the queue worker; setting this mode is a no-op
      that callers can rely on once the worker lands.
    """
    if GATEWAY_EXECUTION_MODE == "async_queue":
        logger.info(
            "gateway.async_mode_skipped_inline_run queue_item_id=%s",
            queue_item_id,
        )
        return None
    return run_gateway_for_queue_item(supabase, queue_item_id)


__all__ = [
    "GatewayResult",
    "enqueue_or_run_gateway_after_scrape_queue_insert",
    "run_consensus_stage",
    "run_eligibility_complexity_stage",
    "run_gateway_for_queue_item",
    "run_resolver_stage",
]
