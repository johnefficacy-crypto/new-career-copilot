"""Unit tests for `app.scraping.promotion_gate.evaluate_promotion_gate`.

The gate is the single source of truth for what can promote into canonical
recruitments/posts. Tests pin the safety contract (HIGH_RISK_FIELDS must be
verified, official source must be resolved, evidence-table outage opens
the gate with a warning).
"""
from __future__ import annotations

from app.scraping.promotion_gate import HIGH_RISK_FIELDS, evaluate_promotion_gate


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
