"""Promotion gate for scrape_queue → recruitments.

Single source of truth for the high-risk-field verification policy. Both the
admin single-item promotion endpoint and the batch ``promote_run`` flow use
the same evaluator so the safety contract cannot drift.

Two granularities of high-risk fields:

* **Recruitment-level** (``RECRUITMENT_LEVEL_FIELDS``): one verified
  ``extracted_field_evidence`` row per field per queue item is enough.
  Examples: ``apply_end_date``, ``official_notification_url``,
  ``total_vacancies``. These don't vary by post.
* **Post-scoped** (``POST_SCOPED_FIELDS``): need a verified evidence row
  with ``entity_type='post'`` and ``entity_key`` matching each post's
  identifier. Reviewers can have a different verdict per post. Example:
  ``requires_domicile`` (post #135).

A field can only belong to one bucket. ``HIGH_RISK_FIELDS`` is exposed as
the union for callers that don't care about granularity.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from supabase import Client


RECRUITMENT_LEVEL_FIELDS: frozenset[str] = frozenset({
    "apply_end_date",
    "official_notification_url",
    "official_apply_url",
    "organization_name",
    "total_vacancies",
})

# Post-scoped high-risk fields: reviewers must verify each post individually
# because the canonical value can differ per post (e.g. a recruitment with
# one state-domicile post and one all-India post).
POST_SCOPED_FIELDS: frozenset[str] = frozenset({
    "requires_domicile",
})

HIGH_RISK_FIELDS: frozenset[str] = RECRUITMENT_LEVEL_FIELDS | POST_SCOPED_FIELDS


_VERIFIED_STATUSES = frozenset({"verified", "corrected"})


# Normalizer warnings that represent a hard data contradiction — promoting
# them would write self-inconsistent canonical rows (e.g. an apply window
# that closes before it opens). These block promotion. Missing-field and
# advisory warnings (``missing_*``, ``posts_missing_eligibility``,
# ``year_date_mismatch``) are NOT here: they're surfaced for review but
# don't make the data internally contradictory.
BLOCKING_NORMALIZER_WARNINGS: frozenset[str] = frozenset({
    "date_order_invalid",
    "notification_after_apply_end",
    "age_range_invalid",
    "vacancy_sum_mismatch",
})


def _blocking_contradictions(queue_item: dict[str, Any]) -> list[str]:
    """Re-run the normalizer on the queue item's current extracted_data
    and return any blocking contradiction warnings.

    Re-running (rather than trusting the frozen ``extracted_data._meta``
    warnings) means admin field corrections are reflected — a reviewer
    who fixes ``apply_end_date`` clears the ``date_order_invalid`` block.
    If the payload can't be constructed into the extraction shape the
    check is skipped; the strict promotion model catches that case.
    """
    extracted = queue_item.get("extracted_data")
    if not isinstance(extracted, dict):
        return []
    try:
        from .normalizer import normalize_recruitment
        from .schemas import ExtractedRecruitment

        normalized = normalize_recruitment(ExtractedRecruitment(**extracted))
    except Exception:  # noqa: BLE001
        return []
    return sorted(set(normalized.warnings) & BLOCKING_NORMALIZER_WARNINGS)


@dataclass
class GateResult:
    ok: bool
    reason: str | None = None
    unverified_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _post_identity_key(post: dict[str, Any]) -> str:
    """Stable identifier for a post within a queue payload.

    Posts in ``scrape_queue.extracted_data["posts"]`` don't have DB ids
    yet (those are minted on promotion). The reviewer's evidence row
    keys off ``post_name`` since that's what the admin sees in the
    review UI.
    """
    return (post.get("post_name") or "").strip().lower()


def evaluate_promotion_gate(supabase: Client, queue_item: dict[str, Any]) -> GateResult:
    """Decide whether a queue item is allowed to promote.

    * If ``official_source_resolved`` is explicitly False, fail with
      reason ``"unverified_official_source"``.
    * Otherwise read ``extracted_field_evidence`` for the queue id.
      Recruitment-level fields need any verified/corrected row.
      Post-scoped fields need a verified/corrected row with
      ``entity_type='post'`` and ``entity_key`` matching each post's
      ``post_name``.
    * If the evidence table is unavailable (older deployments / migration
      drift), emit a warning rather than failing — the admin single-item
      path has the same fallback.
    """
    queue_id = queue_item.get("id")

    # Dry-run (mock) output must never reach the canonical tables, even if a
    # status edit somehow let it past the status-based review filters. This is
    # a hard, non-overridable block — synthetic data has no promotion path.
    if queue_item.get("is_dry_run"):
        return GateResult(ok=False, reason="dry_run_not_promotable")

    if queue_item.get("official_source_resolved") is False:
        return GateResult(
            ok=False,
            reason="unverified_official_source",
            unverified_fields=[],
        )

    warnings: list[str] = []
    try:
        rows = (
            supabase.table("extracted_field_evidence")
            .select("field_name, entity_type, entity_key, reviewer_status")
            .eq("scrape_queue_id", queue_id)
            .execute()
            .data
            or []
        )
    except Exception:
        warnings.append("field_evidence_table_unavailable")
        return GateResult(ok=True, warnings=warnings)

    # Bucket evidence rows by field for the two checks below.
    by_field: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_field.setdefault(r.get("field_name") or "", []).append(r)

    missing: set[str] = set()

    # 1. Recruitment-level: any verified row for the field is enough.
    for f in RECRUITMENT_LEVEL_FIELDS:
        if not any(
            (r.get("reviewer_status") or "") in _VERIFIED_STATUSES
            for r in by_field.get(f, [])
        ):
            missing.add(f)

    # 2. Post-scoped: every post in the extracted payload needs its own
    #    verified row with entity_type='post' and entity_key=post_name.
    extracted = queue_item.get("extracted_data") or {}
    posts = extracted.get("posts") or []
    post_keys = sorted({_post_identity_key(p) for p in posts if _post_identity_key(p)})

    for f in POST_SCOPED_FIELDS:
        field_rows = by_field.get(f, [])
        if not posts:
            # Single-post / unknown-shape queue payload: fall back to the
            # recruitment-level rule (any verified row passes).
            if not any(
                (r.get("reviewer_status") or "") in _VERIFIED_STATUSES
                for r in field_rows
            ):
                missing.add(f)
            continue

        verified_post_keys = {
            (r.get("entity_key") or "").strip().lower()
            for r in field_rows
            if (r.get("reviewer_status") or "") in _VERIFIED_STATUSES
            and (r.get("entity_type") or "").lower() == "post"
        }
        if not all(pk in verified_post_keys for pk in post_keys):
            missing.add(f)

    if missing:
        return GateResult(
            ok=False,
            reason="high_risk_fields_unverified",
            unverified_fields=sorted(missing),
        )

    # Hard data contradictions block even when every high-risk field is
    # verified — a reviewer can verify the *value* of apply_end_date and
    # still leave it earlier than apply_start_date.
    contradictions = _blocking_contradictions(queue_item)
    if contradictions:
        return GateResult(
            ok=False,
            reason="data_contradictions",
            unverified_fields=contradictions,
        )

    return GateResult(ok=True, warnings=warnings)


# ── PR2: Gateway promotion gate stub ─────────────────────────────────
#
# The pre-existing :func:`evaluate_promotion_gate` enforces the
# high-risk-fields contract on a queue item. The *gateway* promotion
# gate is a separate concern: it gates promotion based on the
# verification report's resolver state.
#
# PR2 ships the *stub* version — Tier A blocks on unresolved/missing
# official proof; Tier B and C pass unconditionally. PR3 adds the
# consensus check; PR4 adds the eligibility-complexity check.
#
# Both gates run in sequence on the admin promotion path: a queue item
# must pass :func:`evaluate_promotion_gate` AND
# :func:`check_gateway_promotion`. They cover orthogonal risks and
# neither replaces the other.

@dataclass
class GatewayGateResult:
    """Outcome of the gateway promotion gate.

    Mirrors :class:`GateResult` shape so callers can fold both results
    into the same downstream "this is why we blocked" UI.
    """

    ok: bool
    reason_code: str | None = None
    message: str | None = None
    blocking_level: str | None = None  # 'promotion_blocker' | 'publish_blocker' | 'warning'
    tier: str | None = None


def check_gateway_promotion(report: dict[str, Any] | None) -> GatewayGateResult:
    """PR2 stub gateway promotion gate.

    Behaviour:

    * Tier A — blocks if no active verification report OR if
      ``official_resolution_status`` is null / ``not_attempted`` /
      ``unresolved``. ``admin_attached`` / ``auto_resolved`` pass.
    * Tier B / Tier C — pass unconditionally. PR3 adds consensus
      blockers, PR4 adds complexity blockers for Tier B.

    The reason codes here are stable contract surfaces; the admin UI
    matches on them to show the right blocker copy.
    """
    if report is None:
        return GatewayGateResult(
            ok=False,
            reason_code="gateway_not_ready",
            message="Verification report missing — gateway has not processed this item.",
            blocking_level="promotion_blocker",
        )

    tier = report.get("criticality_tier")
    if tier == "A_HIGH_STAKES":
        status = report.get("official_resolution_status")
        if status in (None, "not_attempted", "unresolved"):
            return GatewayGateResult(
                ok=False,
                reason_code="official_proof_missing",
                message="Tier A recruitment requires an official-source proof before promotion.",
                blocking_level="promotion_blocker",
                tier=tier,
            )
        # PR3 strengthening: Tier A also blocks on unresolved consensus
        # conflicts. ``resolved_by_admin`` and ``ignored`` pass.
        if _has_unresolved_conflict(report):
            return GatewayGateResult(
                ok=False,
                reason_code="consensus_conflict_unresolved",
                message="Tier A recruitment has an unresolved consensus conflict — admin override required.",
                blocking_level="promotion_blocker",
                tier=tier,
            )

    # PR4 strengthening: any tier with an unrepresented complexity
    # ``promotion_blocker`` flag is held back. The detector wrote the
    # signal to ``risk_flags`` and the complexity_contract adapter
    # decides representation; here we just inspect the gate's view.
    has_promotion_blocker = _has_complexity_blocker(report, level="promotion_blocker")
    if has_promotion_blocker:
        return GatewayGateResult(
            ok=False,
            reason_code="eligibility_rule_missing",
            message="An eligibility-complexity rule is detected but not yet represented as a canonical rule.",
            blocking_level="promotion_blocker",
            tier=tier,
        )
    return GatewayGateResult(ok=True, tier=tier)


def _has_complexity_blocker(report: dict[str, Any], *, level: str) -> bool:
    """Return True if a complexity flag at ``level`` is on ``risk_flags``.

    The publish gate elsewhere (``admin_trust.py``) checks
    ``publish_blocker``; the gateway promotion gate here only blocks on
    ``promotion_blocker``. Same shape, different threshold.
    """
    for flag in report.get("risk_flags") or []:
        if (flag or {}).get("blocking_level") == level:
            return True
    return False


def _has_unresolved_conflict(report: dict[str, Any]) -> bool:
    """Inlined consensus check.

    Avoids importing ``consensus_engine`` at module load so the gate's
    dependency surface stays flat.
    """
    for c in report.get("conflicts") or []:
        if (c or {}).get("status", "open") == "open":
            return True
    return False


def check_gateway_publish(report: dict[str, Any] | None) -> GatewayGateResult:
    """Publish-readiness gate (PR4).

    Stricter than :func:`check_gateway_promotion` — publish requires
    no ``publish_blocker`` complexity flag (in addition to all the
    promotion checks). Used by ``admin_trust.py``'s publish-readiness
    path so a recruitment can be promoted to draft but held back from
    publish until conditional rules are represented.
    """
    promotion = check_gateway_promotion(report)
    if not promotion.ok:
        return promotion
    if report is not None and _has_complexity_blocker(report, level="publish_blocker"):
        return GatewayGateResult(
            ok=False,
            reason_code="eligibility_rule_missing",
            message=(
                "Conditional eligibility rule detected but not yet represented as a canonical rule. "
                "Publish blocked; draft remains allowed."
            ),
            blocking_level="publish_blocker",
            tier=report.get("criticality_tier"),
        )
    return GatewayGateResult(ok=True, tier=promotion.tier)
