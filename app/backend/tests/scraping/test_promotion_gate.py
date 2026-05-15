"""Unit tests for `app.scraping.promotion_gate.evaluate_promotion_gate`.

The gate is the single source of truth for what can promote into canonical
recruitments/posts. Tests pin the safety contract (HIGH_RISK_FIELDS must be
verified, official source must be resolved, evidence-table outage opens
the gate with a warning, and post-scoped fields need per-post evidence).
"""
from __future__ import annotations

from app.scraping.promotion_gate import (
    HIGH_RISK_FIELDS,
    POST_SCOPED_FIELDS,
    RECRUITMENT_LEVEL_FIELDS,
    evaluate_promotion_gate,
)


class _Exec:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, rows, raise_on_select=False):
        self._rows = rows
        self._raise = raise_on_select

    def select(self, *_a, **_k):
        if self._raise:
            raise RuntimeError("relation does not exist")
        return self

    def eq(self, _k, _v):
        return self

    def execute(self):
        return _Exec(self._rows)


class _SB:
    def __init__(self, evidence_rows=None, raise_on_select=False):
        self._rows = evidence_rows or []
        self._raise = raise_on_select

    def table(self, _name):
        return _Q(self._rows, self._raise)


def test_requires_domicile_is_in_high_risk_fields():
    # Domicile is a legal eligibility rule: false positives block all-India
    # candidates, false negatives let domicile-only postings publish
    # without enforcement. Must always be admin-verified.
    assert "requires_domicile" in HIGH_RISK_FIELDS


def test_gate_blocks_when_only_requires_domicile_is_unverified():
    # Every other high-risk field is verified; only `requires_domicile` is
    # missing. Gate must still block, with that one field surfaced.
    rows = [
        {"field_name": "apply_end_date", "reviewer_status": "verified"},
        {"field_name": "official_notification_url", "reviewer_status": "verified"},
        {"field_name": "official_apply_url", "reviewer_status": "verified"},
        {"field_name": "organization_name", "reviewer_status": "verified"},
        {"field_name": "total_vacancies", "reviewer_status": "verified"},
    ]
    result = evaluate_promotion_gate(
        _SB(rows),
        {"id": "queue-1", "official_source_resolved": True},
    )
    assert result.ok is False
    assert result.reason == "high_risk_fields_unverified"
    assert result.unverified_fields == ["requires_domicile"]


def test_gate_passes_when_requires_domicile_is_corrected():
    # `corrected` is an accepted reviewer status alongside `verified`.
    rows = [
        {"field_name": f, "reviewer_status": "verified"}
        for f in HIGH_RISK_FIELDS
        if f != "requires_domicile"
    ] + [
        {"field_name": "requires_domicile", "reviewer_status": "corrected"},
    ]
    result = evaluate_promotion_gate(
        _SB(rows),
        {"id": "queue-1", "official_source_resolved": True},
    )
    assert result.ok is True


def test_gate_passes_when_all_high_risk_fields_verified():
    rows = [{"field_name": f, "reviewer_status": "verified"} for f in HIGH_RISK_FIELDS]
    result = evaluate_promotion_gate(
        _SB(rows),
        {"id": "queue-1", "official_source_resolved": True},
    )
    assert result.ok is True


def test_gate_blocks_when_official_source_unresolved():
    result = evaluate_promotion_gate(
        _SB([]),
        {"id": "queue-1", "official_source_resolved": False},
    )
    assert result.ok is False
    assert result.reason == "unverified_official_source"


def test_gate_opens_with_warning_when_evidence_table_unavailable():
    # Older deployments without the evidence table must not block all
    # promotions — the admin single-item path has the same fallback.
    result = evaluate_promotion_gate(
        _SB(raise_on_select=True),
        {"id": "queue-1", "official_source_resolved": True},
    )
    assert result.ok is True
    assert "field_evidence_table_unavailable" in result.warnings


# ── Per-post evidence granularity for POST_SCOPED_FIELDS ────────────────────


def test_buckets_are_disjoint_and_union_is_high_risk():
    # Internal invariant: every field belongs to exactly one bucket.
    assert RECRUITMENT_LEVEL_FIELDS.isdisjoint(POST_SCOPED_FIELDS)
    assert RECRUITMENT_LEVEL_FIELDS | POST_SCOPED_FIELDS == HIGH_RISK_FIELDS


def test_requires_domicile_is_post_scoped():
    # Pinning the audit's decision: domicile is per-post, not per-queue.
    assert "requires_domicile" in POST_SCOPED_FIELDS
    assert "requires_domicile" not in RECRUITMENT_LEVEL_FIELDS


def _multi_post_queue_item() -> dict:
    """A queue item with two posts. Used by the per-post tests below."""
    return {
        "id": "queue-1",
        "official_source_resolved": True,
        "extracted_data": {
            "posts": [
                {"post_name": "State Inspector"},
                {"post_name": "Junior Assistant"},
            ],
        },
    }


def _all_recruitment_level_verified() -> list[dict]:
    return [
        {"field_name": f, "reviewer_status": "verified", "entity_type": None, "entity_key": None}
        for f in RECRUITMENT_LEVEL_FIELDS
    ]


def test_multi_post_gate_blocks_when_only_one_post_has_domicile_evidence():
    # Two posts in the payload, only one has a verified per-post evidence
    # row for `requires_domicile`. Gate must block.
    rows = _all_recruitment_level_verified() + [
        {
            "field_name": "requires_domicile",
            "entity_type": "post",
            "entity_key": "state inspector",
            "reviewer_status": "verified",
        },
        # No row for "junior assistant"
    ]
    result = evaluate_promotion_gate(_SB(rows), _multi_post_queue_item())
    assert result.ok is False
    assert result.reason == "high_risk_fields_unverified"
    assert result.unverified_fields == ["requires_domicile"]


def test_multi_post_gate_passes_when_every_post_has_domicile_evidence():
    rows = _all_recruitment_level_verified() + [
        {
            "field_name": "requires_domicile",
            "entity_type": "post",
            "entity_key": "state inspector",
            "reviewer_status": "verified",
        },
        {
            "field_name": "requires_domicile",
            "entity_type": "post",
            "entity_key": "junior assistant",
            "reviewer_status": "corrected",
        },
    ]
    result = evaluate_promotion_gate(_SB(rows), _multi_post_queue_item())
    assert result.ok is True


def test_multi_post_gate_rejects_queue_level_evidence_for_post_scoped_field():
    # A queue-level (no entity_key) evidence row must NOT satisfy a post-
    # scoped field when the payload actually has multiple posts. This is
    # exactly the bug the audit flagged — one verified row used to cover
    # all posts even though the canonical value can differ per post.
    rows = _all_recruitment_level_verified() + [
        {
            "field_name": "requires_domicile",
            "entity_type": None,
            "entity_key": None,
            "reviewer_status": "verified",
        },
    ]
    result = evaluate_promotion_gate(_SB(rows), _multi_post_queue_item())
    assert result.ok is False
    assert result.unverified_fields == ["requires_domicile"]


def test_multi_post_gate_is_case_insensitive_on_post_name():
    # Reviewers may type the post name in different casing than the
    # extracted payload. `entity_key` matching is case-insensitive.
    rows = _all_recruitment_level_verified() + [
        {
            "field_name": "requires_domicile",
            "entity_type": "post",
            "entity_key": "STATE INSPECTOR",
            "reviewer_status": "verified",
        },
        {
            "field_name": "requires_domicile",
            "entity_type": "post",
            "entity_key": "Junior Assistant",
            "reviewer_status": "verified",
        },
    ]
    result = evaluate_promotion_gate(_SB(rows), _multi_post_queue_item())
    assert result.ok is True


def test_single_post_gate_falls_back_to_queue_level_evidence():
    # If the queue payload doesn't carry a posts list, the per-post check
    # has nothing to enforce. Fall back to the recruitment-level rule
    # (any verified row passes) so we don't block legitimate items.
    rows = _all_recruitment_level_verified() + [
        {
            "field_name": "requires_domicile",
            "entity_type": None,
            "entity_key": None,
            "reviewer_status": "verified",
        },
    ]
    result = evaluate_promotion_gate(
        _SB(rows),
        {"id": "queue-1", "official_source_resolved": True, "extracted_data": {}},
    )
    assert result.ok is True


def test_multi_post_gate_ignores_evidence_for_unknown_post_key():
    # A stale evidence row for a post name that's no longer in the
    # payload must not count toward verification.
    rows = _all_recruitment_level_verified() + [
        {
            "field_name": "requires_domicile",
            "entity_type": "post",
            "entity_key": "old post name no longer present",
            "reviewer_status": "verified",
        },
    ]
    result = evaluate_promotion_gate(_SB(rows), _multi_post_queue_item())
    assert result.ok is False
    assert result.unverified_fields == ["requires_domicile"]
