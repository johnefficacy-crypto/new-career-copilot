"""Retry-on-transient-disconnect for admin scrape read endpoints.

Supabase's HTTP/2 pooler occasionally drops a connection mid-request,
surfacing as ``httpx.RemoteProtocolError`` / ``httpx.ConnectError``. The
GET read endpoints (``list_scrape_runs`` / ``_list_sources``) retry once
via ``_execute_with_retry``; writes are never wrapped.
"""
from __future__ import annotations

import pytest
from httpx import ConnectError, RemoteProtocolError

from app.api import admin_scrape


class _R:
    def __init__(self, data):
        self.data = data


class _Builder:
    """PostgREST-style chainable builder whose ``execute`` raises a
    scripted sequence of exceptions before finally returning rows.

    ``errors`` is a list of exceptions to raise on successive execute()
    calls; once exhausted it returns ``_R(rows)``. ``calls`` counts how
    many times execute() was invoked so tests can assert retry counts.
    """

    def __init__(self, *, errors=None, rows=None):
        self._errors = list(errors or [])
        self._rows = rows if rows is not None else []
        self.calls = 0

    # Chain methods are no-ops returning self (matches supabase-py).
    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def execute(self):
        self.calls += 1
        if self._errors:
            raise self._errors.pop(0)
        return _R(self._rows)


class _SB:
    """Supabase stub returning a pre-seeded builder per table name."""

    def __init__(self, builder):
        self._builder = builder

    def table(self, _name):
        return self._builder


def _admin():
    return {"id": "admin-1", "email": "a@x", "role": "admin"}


# ── _execute_with_retry unit behaviour ────────────────────────────────


def test_retry_succeeds_on_second_attempt(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    builder = _Builder(errors=[RemoteProtocolError("server disconnected")], rows=[{"id": "x"}])
    res = admin_scrape._execute_with_retry(builder, op="unit")
    assert res.data == [{"id": "x"}]
    assert builder.calls == 2  # failed once, retried once, succeeded


def test_retry_gives_up_after_one_retry(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    builder = _Builder(errors=[RemoteProtocolError("a"), RemoteProtocolError("b")])
    with pytest.raises(RemoteProtocolError):
        admin_scrape._execute_with_retry(builder, op="unit")
    assert builder.calls == 2  # original + exactly one retry, no infinite loop


def test_connect_error_is_also_retried(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    builder = _Builder(errors=[ConnectError("refused")], rows=[{"id": "y"}])
    res = admin_scrape._execute_with_retry(builder, op="unit")
    assert res.data == [{"id": "y"}]
    assert builder.calls == 2


def test_non_transient_error_not_retried(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    builder = _Builder(errors=[ValueError("schema drift")])
    with pytest.raises(ValueError):
        admin_scrape._execute_with_retry(builder, op="unit")
    assert builder.calls == 1  # raised immediately, no retry


# ── Endpoint integration ──────────────────────────────────────────────


def test_list_scrape_runs_retries_then_returns_rows(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    run_row = {
        "id": "run-1", "triggered_by": "admin", "started_at": "2026-05-20T00:00:00Z",
        "finished_at": None, "status": "completed", "items_found": 3,
        "items_new": 2, "items_duplicate": 1, "error_log": [], "sources_checked": 1,
    }
    builder = _Builder(errors=[RemoteProtocolError("disconnect")], rows=[run_row])
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(builder))

    out = admin_scrape.list_scrape_runs(limit=30, _admin=_admin())
    assert [i["id"] for i in out["items"]] == ["run-1"]
    assert builder.calls == 2


def test_list_sources_retries_then_returns_rows(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    src_row = {
        "id": "src-1", "source_name": "Gov", "source_url": "https://gov.in",
        "source_type": "official_html", "tier": "A", "is_active": True,
    }
    builder = _Builder(errors=[RemoteProtocolError("disconnect")], rows=[src_row])
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(builder))

    out = admin_scrape.admin_sources(_admin=_admin())
    assert len(out["items"]) == 1
    assert builder.calls == 2


def test_list_scrape_runs_surfaces_error_after_retry(monkeypatch):
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)
    builder = _Builder(errors=[RemoteProtocolError("a"), RemoteProtocolError("b")])
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(builder))
    with pytest.raises(RemoteProtocolError):
        admin_scrape.list_scrape_runs(limit=30, _admin=_admin())
    assert builder.calls == 2


def test_write_endpoint_does_not_use_retry_wrapper(monkeypatch):
    """A write path (reject) must NOT be retried — its builder execute()
    is called exactly once even when it raises a transient error.

    This pins the contract that ``_execute_with_retry`` is on read paths
    only; if someone later wraps a write builder, the call count climbs
    and this test fails.
    """
    monkeypatch.setattr(admin_scrape.time, "sleep", lambda *_: None)

    class _RejectBuilder(_Builder):
        def update(self, *a, **k):
            return self

        def insert(self, *a, **k):
            return self

    builder = _RejectBuilder(errors=[RemoteProtocolError("disconnect")])
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: _SB(builder))

    # Drive the reject endpoint; it should raise on the first (and only)
    # execute() without a retry. We don't assert the exception type beyond
    # "it propagated" — the point is call count == 1 (writes aren't retried).
    with pytest.raises(Exception):
        admin_scrape.reject_queue_item(
            "11111111-1111-1111-1111-111111111111",
            {"notes": "x"},
            admin=_admin(),
        )
    assert builder.calls == 1
