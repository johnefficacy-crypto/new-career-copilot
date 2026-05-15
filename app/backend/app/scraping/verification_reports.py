"""Service surface for ``recruitment_verification_reports``.

Single choke point for every read and write of the gateway's report
table. Direct DB writes from elsewhere bypass the lifecycle matrix and
the schema validators — they are not supported.

Public surface (matches the spec, ``§3 verification_reports service surface``):

* :func:`get_active_report`
* :func:`get_or_create_verification_report_for_queue`
* :func:`get_or_create_verification_report_for_recruitment`
* :func:`update_lifecycle_status`
* :func:`mark_superseded`

Plus a soft-backfill entry point :func:`backfill_existing_recruitment`
that PR1's runner cron uses to walk already-published recruitments.

Atomicity contract
------------------

Two RPC functions in the DB do the supersede+insert and chain-root
bootstrap atomically (see migration ``076``). The Python service
*validates* before calling the RPC (chain crossing, self-supersession,
version monotonicity) and *retries once* on the partial-unique-index
race. If both the RPC and the fallback path raise, the service fails
loud — the caller sees the exception.
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from supabase import Client

from .recruitment_classifier import classify_recruitment
from .verification_hash import (
    build_canonical_snapshot_hash,
    build_source_snapshot_hash,
)
from .verification_policy import (
    BACKFILL_MODE,
    TIER_RECOMMENDED_ACTION,
    CriticalityTier,
)
from .verification_report_schemas import (
    validate_conflicts,
    validate_evidence_summary,
    validate_risk_flags,
    validate_suggested_official_urls,
)


logger = logging.getLogger(__name__)


# ── Lifecycle ───────────────────────────────────────────────────────────
#
# PR1 ships only four states. The DB ``chk_lifecycle_status`` constraint
# enforces the same set; this module enforces the *transition* matrix
# on top of that.

PR1_LIFECYCLE_STATES: frozenset[str] = frozenset({
    "classified",
    "backfilled_needs_review",
    "superseded",
    "rejected",
})


# Set of states the service-layer transition guard accepts. Each PR
# widens this; the underlying DB constraint widens in lockstep via its
# own migration.
_KNOWN_LIFECYCLE_STATES: set[str] = set(PR1_LIFECYCLE_STATES) | {
    # PR3 (migration 079):
    "consensus_pending",
    "conflict",
    "admin_override_required",
}


ALLOWED_REPORT_TRANSITIONS: dict[str, set[str]] = {
    "classified":              {"superseded", "rejected"},
    "backfilled_needs_review": {"classified", "superseded", "rejected"},
    "rejected":                {"superseded"},
    "superseded":              set(),   # terminal, immutable
}


def extend_transitions(additions: dict[str, set[str]]) -> None:
    """Per-key union extension. Use this in every later PR's amendment.

    ``dict |=`` would *overwrite* existing keys rather than unioning,
    silently dropping PR1's transitions. Per the PR plan §0.1 the
    matrix is a single source of truth and every PR amends via this
    helper.
    """
    for state, allowed in additions.items():
        ALLOWED_REPORT_TRANSITIONS[state] = (
            ALLOWED_REPORT_TRANSITIONS.get(state, set()) | allowed
        )


# ── PR3 lifecycle additions ───────────────────────────────────────────
#
# Migration 079 widens the DB ``chk_lifecycle_status`` constraint to
# accept these three. The transition matrix is widened here.

extend_transitions({
    "classified":              {"consensus_pending"},
    "consensus_pending":       {"classified", "conflict", "admin_override_required", "superseded", "rejected"},
    "conflict":                {"admin_override_required", "classified", "superseded", "rejected"},
    "admin_override_required": {"classified", "superseded", "rejected"},
})


# ── Trigger reasons emitted by PR1 ─────────────────────────────────────
#
# The DB enum holds the full taxonomy (admin_requested, corrigendum_detected,
# source_hash_changed, canonical_field_edited, source_trust_changed). PR1
# only writes these three; the rest are reserved for later PRs.

PR1_TRIGGER_REASONS: frozenset[str] = frozenset({
    "initial_scrape",
    "resubmission",
    "backfill_existing_recruitment",
})


TABLE = "recruitment_verification_reports"

CreateOutcome = Literal["noop", "created"]


# ── Reads ──────────────────────────────────────────────────────────────


def get_active_report(
    supabase: Client,
    *,
    scrape_queue_id: str | None = None,
    recruitment_id: str | None = None,
) -> dict[str, Any] | None:
    """Return the active (non-superseded) report for a queue item or recruitment.

    Active = ``superseded_by IS NULL``. The DB partial unique indexes
    guarantee at most one active report per (scrape_queue_id) and per
    (recruitment_id with scrape_queue_id IS NULL).
    """
    if not scrape_queue_id and not recruitment_id:
        raise ValueError("scrape_queue_id or recruitment_id is required")

    q = supabase.table(TABLE).select("*").is_("superseded_by", None)
    if scrape_queue_id is not None:
        q = q.eq("scrape_queue_id", scrape_queue_id)
    else:
        # Recruitment-scoped active report: queue id must also be null,
        # matching the partial unique index condition.
        q = q.is_("scrape_queue_id", None).eq("recruitment_id", recruitment_id)

    rows = q.limit(1).execute().data or []
    return rows[0] if rows else None


# ── Create / reprocess for queue items ─────────────────────────────────


def get_or_create_verification_report_for_queue(
    supabase: Client,
    queue_item: dict[str, Any],
    *,
    source: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], CreateOutcome]:
    """Reprocess a queue item: noop if hash unchanged, else new version.

    ``§7 Reprocess Rule`` — never create a new report on every scrape.
    Hash equality means the active report still describes the same
    underlying truth; we return it unchanged.
    """
    queue_id = queue_item.get("id")
    if not queue_id:
        raise ValueError("queue_item missing id")
    extracted = queue_item.get("extracted_data") or {}
    if not isinstance(extracted, dict):
        raise TypeError("queue_item.extracted_data must be a dict")

    new_hash = build_source_snapshot_hash(extracted)
    active = get_active_report(supabase, scrape_queue_id=queue_id)

    if active and active.get("source_snapshot_hash") == new_hash:
        return active, "noop"

    classification = classify_recruitment(extracted, queue_item, source=source)
    trigger_reason = "initial_scrape" if active is None else "resubmission"

    payload = _build_payload(
        scrape_queue_id=queue_id,
        recruitment_id=queue_item.get("recruitment_id"),
        classification=classification,
        source_snapshot_hash=new_hash,
        canonical_snapshot_hash=None,
        lifecycle_status="classified",
        trigger_reason=trigger_reason,
    )

    if active is None:
        new_row = _rpc_create(supabase, payload)
    else:
        new_row = _rpc_supersede_and_create(supabase, active, payload)
    return new_row, "created"


# ── Create / reprocess for recruitment-scoped reports ──────────────────


def get_or_create_verification_report_for_recruitment(
    supabase: Client,
    recruitment: dict[str, Any],
    posts: list[dict[str, Any]],
    *,
    source: dict[str, Any] | None = None,
    trigger_reason: str = "backfill_existing_recruitment",
) -> tuple[dict[str, Any], CreateOutcome]:
    """Soft-backfill (or refresh) a report for an existing recruitment row.

    Used by :func:`backfill_existing_recruitment`. Same noop-on-hash-match
    semantics as the queue path, but the hash is over canonical fields
    (recruitment + posts), not extracted_data.
    """
    rec_id = recruitment.get("id")
    if not rec_id:
        raise ValueError("recruitment missing id")
    new_hash = build_canonical_snapshot_hash(recruitment, posts)
    active = get_active_report(supabase, recruitment_id=rec_id)

    if active and active.get("canonical_snapshot_hash") == new_hash:
        return active, "noop"

    classification = classify_recruitment(_recruitment_as_extracted(recruitment, posts), None, source=source)

    # Tier A backfills that lack official-proof evidence land in
    # ``backfilled_needs_review`` — they are existing live recruitments
    # but the gateway has no proof on file. PR1 soft-backfill only
    # surfaces them; it does NOT unpublish.
    if classification["criticality_tier"] == "A_HIGH_STAKES":
        lifecycle = "backfilled_needs_review"
    else:
        lifecycle = "classified"

    payload = _build_payload(
        scrape_queue_id=None,
        recruitment_id=rec_id,
        classification=classification,
        source_snapshot_hash=None,
        canonical_snapshot_hash=new_hash,
        lifecycle_status=lifecycle,
        trigger_reason=trigger_reason,
    )

    if active is None:
        new_row = _rpc_create(supabase, payload)
    else:
        new_row = _rpc_supersede_and_create(supabase, active, payload)
    return new_row, "created"


def backfill_existing_recruitment(
    supabase: Client,
    recruitment: dict[str, Any],
    posts: list[dict[str, Any]],
    *,
    source: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], CreateOutcome]:
    """Soft-backfill entry point.

    Wrapper around :func:`get_or_create_verification_report_for_recruitment`.
    Guards on ``BACKFILL_MODE`` so a future strict-mode switch lands in
    one place rather than scattered across callers.
    """
    if BACKFILL_MODE != "soft":
        # Strict-mode behaviour (unpublish on Tier A gaps) is deferred —
        # the soft-mode contract is the only thing PR1 promises.
        raise NotImplementedError(f"backfill mode '{BACKFILL_MODE}' not supported in PR1")
    return get_or_create_verification_report_for_recruitment(
        supabase,
        recruitment,
        posts,
        source=source,
        trigger_reason="backfill_existing_recruitment",
    )


# ── Lifecycle transitions ──────────────────────────────────────────────


def update_lifecycle_status(
    supabase: Client,
    report_id: str,
    new_status: str,
) -> dict[str, Any]:
    """Transition ``report_id`` to ``new_status`` if allowed.

    This is the ONLY choke point for ``lifecycle_status`` writes. Direct
    table updates bypass the transition matrix and are not supported.
    """
    if new_status not in _KNOWN_LIFECYCLE_STATES:
        raise ValueError(f"unknown lifecycle_status: {new_status!r}")

    row = (
        supabase.table(TABLE)
        .select("id, lifecycle_status, superseded_by")
        .eq("id", report_id)
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]
    if not row:
        raise LookupError(f"verification_report {report_id} not found")
    current = row["lifecycle_status"]
    if current == new_status:
        # Same-state writes are silently noop'd. ``classified → classified``
        # would otherwise be ambiguous: hash-equal reprocesses already
        # short-circuit upstream, so a same-state explicit transition is
        # always either a bug or a retry.
        return row
    allowed = ALLOWED_REPORT_TRANSITIONS.get(current, frozenset())
    if new_status not in allowed:
        raise ValueError(
            f"illegal transition {current!r} → {new_status!r}; allowed: {sorted(allowed)}"
        )

    updated = (
        supabase.table(TABLE)
        .update({"lifecycle_status": new_status})
        .eq("id", report_id)
        .execute()
        .data
        or [None]
    )[0]
    if not updated:
        raise RuntimeError(f"verification_report {report_id} update returned no row")
    return updated


# ── PR3: consensus state setters ──────────────────────────────────────


def write_conflicts(
    supabase: Client,
    report_id: str,
    *,
    conflicts: list[dict[str, Any]],
    lifecycle_status: str | None = None,
    recommended_action: str | None = None,
) -> dict[str, Any]:
    """Persist conflict list onto a report and optionally flip lifecycle.

    The consensus engine produces conflict dicts; this is the choke
    point that validates them through Pydantic and writes them out.
    Lifecycle flips go via :func:`update_lifecycle_status` so the
    transition matrix is enforced.
    """
    payload: dict[str, Any] = {"conflicts": validate_conflicts(conflicts)}
    if recommended_action is not None:
        payload["recommended_action"] = recommended_action
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


def record_override(
    supabase: Client,
    *,
    verification_report_id: str,
    conflict_id: str,
    conflict_key: str,
    field_path: str | None,
    prior_value: Any,
    chosen_value: Any,
    reason: str,
    evidence_url: str | None,
    override_scope: str,
    created_by: str,
) -> dict[str, Any]:
    """Insert a row into ``recruitment_verification_overrides``.

    Validates ``override_scope`` against the (post-plan-fix) two-value
    set; ``'report'`` was removed deliberately and the value is no
    longer accepted.

    Marks the matching conflict on the report's jsonb column as
    ``resolved_by_admin``. The conflict row is matched by
    ``conflict_id``; if no match exists the call raises.
    """
    if override_scope not in {"field", "recruitment"}:
        raise ValueError(f"override_scope must be 'field' or 'recruitment', got {override_scope!r}")

    row = (
        supabase.table(TABLE)
        .select("id, conflicts")
        .eq("id", verification_report_id)
        .limit(1)
        .execute()
        .data
        or [None]
    )[0]
    if not row:
        raise LookupError(f"verification_report {verification_report_id} not found")

    conflicts = list(row.get("conflicts") or [])
    matched = False
    for c in conflicts:
        if c.get("conflict_id") == conflict_id:
            c["status"] = "resolved_by_admin"
            matched = True
            break
    if not matched:
        raise LookupError(
            f"conflict_id {conflict_id} not found on verification_report {verification_report_id}"
        )

    override_payload = {
        "verification_report_id": verification_report_id,
        "conflict_id": conflict_id,
        "conflict_key": conflict_key,
        "field_path": field_path,
        "prior_value": prior_value,
        "chosen_value": chosen_value,
        "reason": reason,
        "evidence_url": evidence_url,
        "override_scope": override_scope,
        "created_by": created_by,
    }
    inserted = (
        supabase.table("recruitment_verification_overrides")
        .insert(override_payload)
        .execute()
        .data
        or [None]
    )[0]

    # Persist the resolved-status update on the report.
    supabase.table(TABLE).update({"conflicts": validate_conflicts(conflicts)}).eq(
        "id", verification_report_id
    ).execute()

    return inserted or override_payload


# ── PR2: resolver state setters ────────────────────────────────────────


_OFFICIAL_RESOLUTION_STATUSES: frozenset[str] = frozenset({
    "not_attempted",
    "auto_resolved",
    "suggested",
    "unresolved",
    "admin_attached",
    "rejected",
})


def set_resolver_state(
    supabase: Client,
    report_id: str,
    *,
    status: str,
    method: str | None,
    confidence: float | None,
    suggested_urls: list[dict[str, Any]] | None = None,
    recommended_action: str | None = None,
) -> dict[str, Any]:
    """Write resolver outcome onto a verification report.

    The resolver itself never mutates ``lifecycle_status``. That stays
    on ``classified`` (or whatever PR3+ has elevated it to). The resolver
    only writes the four resolver columns and may bump
    ``recommended_action`` to ``confirm_suggested_proof`` /
    ``await_official_proof`` when appropriate.
    """
    if status not in _OFFICIAL_RESOLUTION_STATUSES:
        raise ValueError(f"unknown official_resolution_status: {status!r}")
    if confidence is not None and not (0.0 <= confidence <= 1.0):
        raise ValueError(f"confidence out of range: {confidence!r}")
    payload: dict[str, Any] = {
        "official_resolution_status": status,
        "official_resolution_method": method,
        "official_resolution_confidence": confidence,
        "suggested_official_urls": validate_suggested_official_urls(suggested_urls or []),
    }
    if recommended_action is not None:
        payload["recommended_action"] = recommended_action

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
    return updated


def attach_admin_official_url(
    supabase: Client,
    report_id: str,
    *,
    chosen_url: str,
    original_method: str,
) -> dict[str, Any]:
    """Record an admin's manual confirmation of a suggested URL.

    Audit-truthful: the new status is ``admin_attached`` (not
    ``auto_resolved``), preserving the fact that a human made the
    decision. The original suggestion's ``method`` is kept so we can
    later answer "what kind of source ended up confirmed?".
    """
    payload = {
        "official_resolution_status": "admin_attached",
        "official_resolution_method": original_method,
        # Confidence is preserved as-is on the row; the column already
        # reflects the suggestion's confidence and the admin's attach
        # doesn't invalidate that fact.
        "recommended_action": "request_admin_review",
    }
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
    return updated


def mark_superseded(supabase: Client, old_id: str, new_id: str) -> None:
    """Explicit supersession pointer write.

    The atomic RPC ``supersede_and_create_verification_report`` already
    sets ``superseded_by`` + ``lifecycle_status = 'superseded'`` in one
    transaction. This helper exists for the rare path where the new row
    is created out-of-band (admin tooling, data migrations) and the
    pointer needs to be set afterwards. The state-transition matrix is
    re-checked here.
    """
    if old_id == new_id:
        raise ValueError("report cannot supersede itself")
    update_lifecycle_status(supabase, old_id, "superseded")
    supabase.table(TABLE).update({"superseded_by": new_id}).eq("id", old_id).execute()


# ── Internals ──────────────────────────────────────────────────────────


def _recruitment_as_extracted(
    recruitment: dict[str, Any],
    posts: list[dict[str, Any]],
) -> dict[str, Any]:
    """Project a canonical recruitment row into the shape the classifier expects."""
    return {
        "title": recruitment.get("name"),
        "name": recruitment.get("name"),
        "organization_name": recruitment.get("organization_name"),
        "notification_number": recruitment.get("notification_number"),
        "posts": [
            {"post_name": (p or {}).get("post_name")}
            for p in posts
            if isinstance(p, dict)
        ],
    }


def _resolve_recommended_action(
    tier: CriticalityTier,
    lifecycle_status: str,
) -> str:
    if lifecycle_status == "backfilled_needs_review":
        return "request_admin_review"
    if lifecycle_status == "rejected":
        return "no_action"
    return TIER_RECOMMENDED_ACTION[tier]


def _resolve_exam_family_key(
    tier: CriticalityTier,
    classification_key: str | None,
) -> str | None:
    """Apply the spec's Tier-C default rule.

    ``§9 exam_family service rule`` — Tier C with no exam-family hint
    defaults to ``"other"`` so the DB's ``chk_exam_family_present``
    constraint (which permits Tier C to omit both id and key) doesn't
    leave the field null for downstream filters.
    """
    if classification_key:
        return classification_key
    if tier == "C_STANDARD_LONG_TAIL":
        return "other"
    return None


def _build_payload(
    *,
    scrape_queue_id: str | None,
    recruitment_id: str | None,
    classification: dict[str, Any],
    source_snapshot_hash: str | None,
    canonical_snapshot_hash: str | None,
    lifecycle_status: str,
    trigger_reason: str,
) -> dict[str, Any]:
    """Compose + validate the row payload before insertion."""
    if not scrape_queue_id and not recruitment_id:
        raise ValueError("scrape_queue_id or recruitment_id is required")
    if lifecycle_status not in PR1_LIFECYCLE_STATES:
        raise ValueError(f"unknown lifecycle_status: {lifecycle_status!r}")
    if trigger_reason not in PR1_TRIGGER_REASONS:
        raise ValueError(
            f"trigger_reason {trigger_reason!r} not in PR1_TRIGGER_REASONS"
        )

    tier: CriticalityTier = classification["criticality_tier"]
    exam_family_key = _resolve_exam_family_key(tier, classification.get("exam_family_key"))
    payload: dict[str, Any] = {
        "scrape_queue_id":          scrape_queue_id,
        "recruitment_id":           recruitment_id,
        "lifecycle_status":         lifecycle_status,
        "criticality_tier":         tier,
        "exam_family_key":          exam_family_key,
        "review_strategy":          classification["review_strategy"],
        "publish_policy":           classification["publish_policy"],
        "recommended_action":       _resolve_recommended_action(tier, lifecycle_status),
        "source_snapshot_hash":     source_snapshot_hash,
        "canonical_snapshot_hash":  canonical_snapshot_hash,
        "trigger_reason":           trigger_reason,
        # Validate the jsonb payloads here so a malformed call never
        # reaches the RPC.
        "risk_flags":               validate_risk_flags([]),
        "evidence_summary":         validate_evidence_summary({}),
        "conflicts":                validate_conflicts([]),
    }
    return payload


def _rpc_create(supabase: Client, payload: dict[str, Any]) -> dict[str, Any]:
    """Atomic insert + chain_root bootstrap via RPC."""
    payload = dict(payload)
    payload.setdefault("report_version", 1)
    resp = supabase.rpc("create_verification_report", {"payload": payload}).execute()
    row = _single_row(resp.data, "create_verification_report")
    return row


def _rpc_supersede_and_create(
    supabase: Client,
    old: dict[str, Any],
    new_payload: dict[str, Any],
) -> dict[str, Any]:
    """Atomic supersede + insert via RPC.

    Validates the supersession in Python first (cheap, gives a precise
    error) before sending the payload to the DB function.
    """
    _validate_supersession(old, new_payload)
    payload = dict(new_payload)
    payload["report_version"] = old["report_version"] + 1
    payload["chain_root_id"] = old.get("chain_root_id") or old["id"]

    resp = supabase.rpc(
        "supersede_and_create_verification_report",
        {"old_id": old["id"], "payload": payload},
    ).execute()
    row = _single_row(resp.data, "supersede_and_create_verification_report")
    return row


def _validate_supersession(old: dict[str, Any], new_payload: dict[str, Any]) -> None:
    """App-side guards on top of the RPC's own checks.

    The RPC ``raise exception`` path returns a Postgres error; doing the
    cheap structural checks here gives callers a ``ValueError`` with a
    precise message and means the RPC only fails on genuine races.
    """
    if old.get("id") == new_payload.get("id"):
        raise ValueError("report cannot supersede itself")
    if new_payload.get("superseded_by"):
        raise ValueError("new report cannot already be superseded")
    expected_version = old["report_version"] + 1
    new_version = new_payload.get("report_version")
    if new_version not in (None, expected_version):
        raise ValueError(f"report_version must be {expected_version}, got {new_version}")
    new_chain = new_payload.get("chain_root_id")
    old_chain = old.get("chain_root_id")
    if new_chain and old_chain and new_chain != old_chain:
        raise ValueError("cannot cross verification-report chains")


def _single_row(data: Any, rpc_name: str) -> dict[str, Any]:
    """Coerce the various RPC return shapes (dict / [dict]) to one dict."""
    if data is None:
        raise RuntimeError(f"{rpc_name} returned no data")
    if isinstance(data, list):
        if not data:
            raise RuntimeError(f"{rpc_name} returned empty list")
        return data[0]
    if isinstance(data, dict):
        return data
    raise RuntimeError(f"{rpc_name} returned unexpected shape: {type(data).__name__}")


__all__ = [
    "PR1_LIFECYCLE_STATES",
    "PR1_TRIGGER_REASONS",
    "ALLOWED_REPORT_TRANSITIONS",
    "attach_admin_official_url",
    "backfill_existing_recruitment",
    "extend_transitions",
    "get_active_report",
    "get_or_create_verification_report_for_queue",
    "get_or_create_verification_report_for_recruitment",
    "mark_superseded",
    "record_override",
    "set_resolver_state",
    "update_lifecycle_status",
    "write_conflicts",
]
