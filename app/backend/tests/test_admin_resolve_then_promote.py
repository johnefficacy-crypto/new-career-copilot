"""Regression: resolving an official source flips the promotion gate.

After an admin attaches a verified official source to a queue item, the
``official_source_resolved`` promotion gate must stop blocking. The item
may still be blocked on other reasons (unverified high-risk fields); this
test asserts ONLY that the official-source gate flipped — it does not
assert the item became fully promotable.

The resolve endpoint behaviour and ``evaluate_promotion_gate`` logic are
unchanged by this PR; this test pins the contract the UX work depends on.
"""
from __future__ import annotations

import pytest

from app.api import admin_scrape
from app.scraping.promotion_gate import evaluate_promotion_gate


# ── Minimal Supabase fake (mirrors test_admin_operations_console) ──────


class _R:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Q:
    def __init__(self, table, state):
        self.table = table
        self.state = state
        self._filter = {}
        self._payload = None

    def select(self, *a, **k):
        return self

    def eq(self, k, v):
        self._filter[k] = v
        return self

    def limit(self, *a, **k):
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def insert(self, payload):
        self._payload = payload
        return self

    def execute(self):
        if self.table == "scrape_queue":
            rows = [
                r for r in self.state.get("queue", [])
                if r.get("id") == self._filter.get("id", r.get("id"))
            ]
            if self._payload and rows:
                rows[0].update(self._payload)
            return _R(rows)
        if self.table == "source_registry":
            rows = [
                s for s in self.state.get("sources", [])
                if s.get("id") == self._filter.get("id", s.get("id"))
            ]
            return _R(rows)
        if self.table == "admin_audit_logs":
            self.state.setdefault("audits", []).append(self._payload)
            return _R([{}])
        if self.table == "extracted_field_evidence":
            qid = self._filter.get("scrape_queue_id")
            rows = [
                r for r in self.state.get("evidence", [])
                if r.get("scrape_queue_id") == qid
            ]
            return _R(rows)
        return _R([])


class _SB:
    def __init__(self, state):
        self.state = state

    def table(self, name):
        return _Q(name, self.state)


def _admin():
    return {"id": "admin-1", "email": "a@x", "role": "admin"}


def _verified_source():
    return {
        "id": "src-1",
        "source_name": "Gov source",
        "source_type": "official_html",
        "is_verified": True,
        "discovery_only": False,
        "is_active": True,
        "official_url": "https://gov.in",
    }


def _resolve_body():
    return admin_scrape.ResolveOfficialSourceBody(
        source_id="src-1",
        official_notification_url="https://gov.in/notif",
        official_apply_url="https://gov.in/apply",
        source_pdf_url=None,
        notes="verified by admin",
    )


def test_resolve_official_source_then_gate_no_longer_blocks_on_source(monkeypatch):
    state = {
        "queue": [{
            "id": "q1",
            "source_id": None,
            "official_source_resolved": False,
            "evidence_required": True,
            "extracted_data": {"title": "Some recruitment"},
            "status": "pending",
        }],
        "sources": [_verified_source()],
        "audits": [],
        "evidence": [],  # no field evidence yet → still blocked on fields
    }
    sb = _SB(state)
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: sb)

    # 1. Resolve official source → 200 + row mutations + audit.
    result = admin_scrape.resolve_official_source_for_queue_item(
        "q1", _resolve_body(), admin=_admin(),
    )
    assert result["ok"] is True
    assert result["official_source_resolved"] is True

    row = state["queue"][0]
    assert row["official_source_resolved"] is True
    assert row["evidence_required"] is False
    assert row["source_id"] == "src-1"
    assert any(
        a.get("action") == "scrape.queue.resolve_official_source"
        for a in state["audits"]
    )

    # 2. Gate must NOT block on the official-source reason anymore.
    gate = evaluate_promotion_gate(sb, row)
    assert gate.reason != "unverified_official_source"


def test_gate_blocks_on_source_before_resolve():
    # Baseline: an unresolved official source is the blocking reason.
    state = {"queue": [], "sources": [], "evidence": []}
    sb = _SB(state)
    item = {"id": "q1", "official_source_resolved": False, "extracted_data": {}}
    gate = evaluate_promotion_gate(sb, item)
    assert gate.ok is False
    assert gate.reason == "unverified_official_source"


def test_resolve_rejects_unverified_source(monkeypatch):
    state = {
        "queue": [{"id": "q1", "official_source_resolved": False, "extracted_data": {}, "status": "pending"}],
        "sources": [{**_verified_source(), "is_verified": False}],
        "audits": [],
    }
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(state))
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        admin_scrape.resolve_official_source_for_queue_item("q1", _resolve_body(), admin=_admin())
    assert exc.value.status_code == 409
    # Gate was never flipped.
    assert state["queue"][0]["official_source_resolved"] is False
