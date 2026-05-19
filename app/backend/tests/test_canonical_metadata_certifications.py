"""Schema-drift / read-only behaviour for /api/metadata/certifications.

This pins the regression: the endpoint must not silently emit
``{items: []}`` when Supabase rejects the select with a missing-column
error. The canonical ``_safe`` now logs a structured WARNING with the
missing column name, and the select no longer asks for columns that
don't exist on the table.
"""
from __future__ import annotations

import asyncio
import logging

import pytest

from app.api import canonical


# ── In-memory stub mirroring the real ``certifications`` columns ──────


class _Exec:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, name, db, raise_on_select=None):
        self.name = name
        self.db = db
        self.filters = {}
        self._raise_on_select = raise_on_select
        self._selected_columns: str | None = None

    def select(self, columns, *_a, **_k):
        self._selected_columns = columns
        if self._raise_on_select is not None:
            raise self._raise_on_select
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def execute(self):
        rows = [r for r in self.db.get(self.name, []) if all(r.get(k) == v for k, v in self.filters.items())]
        return _Exec(rows)


class _SB:
    def __init__(self, raise_on_select=None, recorder: list | None = None):
        # Schema mirror: only the five baseline columns exist on this
        # table (id, name, issuing_body, is_active, created_at). The
        # legacy select asked for five additional columns and 42703'd —
        # the stub raises 42703 if any of those is requested.
        self.db = {
            "certifications": [
                {
                    "id": "c1",
                    "name": "GATE",
                    "issuing_body": "IIT",
                    "is_active": True,
                    "created_at": "2026-01-01T00:00:00Z",
                },
                {
                    "id": "c2",
                    "name": "GMAT",
                    "issuing_body": "GMAC",
                    "is_active": True,
                    "created_at": "2026-01-01T00:00:00Z",
                },
            ],
        }
        self._raise_on_select = raise_on_select
        self._recorder = recorder

    def table(self, name):
        q = _Q(name, self.db, raise_on_select=self._raise_on_select)
        if self._recorder is not None:
            self._recorder.append(q)
        return q


# ── Tests ──────────────────────────────────────────────────────────────


def test_endpoint_returns_only_baseline_columns(monkeypatch):
    recorder: list[_Q] = []
    sb = _SB(recorder=recorder)
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    out = asyncio.run(canonical.metadata_certifications())

    assert len(recorder) == 1, "endpoint must issue exactly one select"
    selected = recorder[0]._selected_columns or ""
    # None of the dropped columns may be reintroduced without first
    # adding them to the table via a migration.
    for col in ("aliases", "exam_families", "sectors", "qualification_levels", "certification_type"):
        assert col not in selected, f"select must not reference {col!r} (no DB column)"
    assert out["items"][0]["name"] == "GATE"
    assert out["items"][0]["issuer"] == "IIT"


def test_endpoint_logs_warning_with_missing_column_on_drift(monkeypatch, caplog):
    # Simulate a future regression where someone adds back a missing
    # column. The endpoint must NOT silently return [] without surfacing
    # the missing column name to the log.
    drift = RuntimeError(
        '{"code":"42703","message":"column certifications.aliases does not exist"}'
    )
    sb = _SB(raise_on_select=drift)
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    caplog.set_level(logging.WARNING, logger="career_copilot.canonical")
    out = asyncio.run(canonical.metadata_certifications())

    # Read-only endpoint: still returns the default (empty list) so the
    # UI does not 500, but emits a WARNING with the column name so the
    # gap is visible in ops dashboards.
    assert out == {"items": []}
    messages = [r.getMessage() for r in caplog.records]
    assert any("missing=certifications.aliases" in m for m in messages)
    assert any("schema drift" in m.lower() or "code=column_missing" in m for m in messages)
