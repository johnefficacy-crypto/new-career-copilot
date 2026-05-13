"""Promotion gate for scrape_queue → recruitments.

Single source of truth for the high-risk-field verification policy. Both the
admin single-item promotion endpoint and the batch ``promote_run`` flow use
the same evaluator so the safety contract cannot drift.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from supabase import Client


HIGH_RISK_FIELDS: frozenset[str] = frozenset({
    "apply_end_date",
    "official_notification_url",
    "official_apply_url",
    "organization_name",
    "total_vacancies",
})


@dataclass
class GateResult:
    ok: bool
    reason: str | None = None
    unverified_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def evaluate_promotion_gate(supabase: Client, queue_item: dict[str, Any]) -> GateResult:
    """Decide whether a queue item is allowed to promote.

    * If ``official_source_resolved`` is explicitly False, fail with
      reason ``"unverified_official_source"``.
    * Otherwise read ``extracted_field_evidence`` for the queue id and require
      every ``HIGH_RISK_FIELDS`` entry to be either ``verified`` or
      ``corrected``. If the evidence table is unavailable (older deployments
      / migration drift), emit a warning rather than failing — the admin
      single-item path has the same fallback.
    """
    queue_id = queue_item.get("id")

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
            .select("field_name, reviewer_status")
            .eq("scrape_queue_id", queue_id)
            .execute()
            .data
            or []
        )
    except Exception:
        warnings.append("field_evidence_table_unavailable")
        return GateResult(ok=True, warnings=warnings)

    reviewed = {r.get("field_name"): r.get("reviewer_status") for r in rows}
    missing = sorted(
        f for f in HIGH_RISK_FIELDS if reviewed.get(f) not in {"verified", "corrected"}
    )
    if missing:
        return GateResult(
            ok=False,
            reason="high_risk_fields_unverified",
            unverified_fields=missing,
        )
    return GateResult(ok=True, warnings=warnings)
