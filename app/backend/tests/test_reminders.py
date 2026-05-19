"""PR4 — Reminders CRUD security contract.

Covers:
- Cross-user reads/writes/deletes are blocked (404, not 403, so existence
  doesn't leak).
- System-source rows reject user mutations (403).
- Invalid date (past due_at) -> 422 on create.
- Delete unknown -> 404.
- Auth required (route dependency check).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import reminders as rem_module
from app.core import rate_limit


class Resp:
    def __init__(self, data):
        self.data = data


class Q:
    def __init__(self, store, table):
        self.store = store
        self.table_name = table
        self.filters: dict = {}
        self.lt_filters: dict = {}
        self.gte_filters: dict = {}
        self.is_null = set()
        self.limit_n: int | None = None
        self.payload: dict | None = None
        self.op = "select"

    def select(self, *a, **k):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def is_(self, k, v):
        if v == "null":
            self.is_null.add(k)
        return self

    def gte(self, k, v):
        self.gte_filters[k] = v
        return self

    def lt(self, k, v):
        self.lt_filters[k] = v
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def execute(self):
        rows = self.store.tables.get(self.table_name, [])
        if self.op == "insert":
            row = dict(self.payload)
            row.setdefault("id", f"r-{len(rows)+1}")
            row.setdefault("created_at", "2026-05-19T00:00:00+00:00")
            row.setdefault("updated_at", "2026-05-19T00:00:00+00:00")
            row.setdefault("dismissed_at", None)
            rows.append(row)
            return Resp([row])
        if self.op == "update":
            updated = []
            for r in rows:
                if all(r.get(k) == v for k, v in self.filters.items()):
                    r.update(self.payload or {})
                    updated.append(r)
            return Resp(updated)
        if self.op == "delete":
            kept = [
                r for r in rows
                if not all(r.get(k) == v for k, v in self.filters.items())
            ]
            self.store.tables[self.table_name] = kept
            return Resp([])
        # select
        out = list(rows)
        for k, v in self.filters.items():
            out = [r for r in out if r.get(k) == v]
        for k in self.is_null:
            out = [r for r in out if r.get(k) is None]
        for k, v in self.gte_filters.items():
            out = [r for r in out if (r.get(k) or "") >= v]
        for k, v in self.lt_filters.items():
            out = [r for r in out if (r.get(k) or "") < v]
        if self.limit_n is not None:
            out = out[: self.limit_n]
        return Resp(out)


class SB:
    def __init__(self, **seed):
        self.tables: dict[str, list[dict]] = {"reminders": []}
        for k, v in seed.items():
            self.tables[k] = v

    def table(self, name):
        return Q(self, name)


def _user(uid="u1"):
    return {"id": uid, "is_anonymous": False}


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    rate_limit.reset()
    rate_limit.configure("reminders.write", per_minute=30)
    yield
    rate_limit.reset()


@pytest.fixture
def sb(monkeypatch):
    fake = SB(reminders=[
        {
            "id": "rem-a-user", "user_id": "user-a",
            "title": "A's", "due_at": "2030-01-01T00:00:00+00:00",
            "reminder_type": "general", "source": "user",
            "dismissed_at": None,
            "created_at": "2026-05-10T00:00:00+00:00",
            "updated_at": "2026-05-10T00:00:00+00:00",
        },
        {
            "id": "rem-sys", "user_id": "user-a",
            "title": "Deadline", "due_at": "2030-02-01T00:00:00+00:00",
            "reminder_type": "deadline", "source": "system",
            "dismissed_at": None,
            "created_at": "2026-05-09T00:00:00+00:00",
            "updated_at": "2026-05-09T00:00:00+00:00",
        },
    ])
    monkeypatch.setattr(rem_module, "get_supabase_admin", lambda: fake)
    return fake


def _future():
    return datetime.now(timezone.utc) + timedelta(days=7)


def _past():
    return datetime.now(timezone.utc) - timedelta(days=1)


def test_cross_user_read_blocked(sb):
    out = asyncio.run(rem_module.list_reminders(cursor=None, limit=50, user=_user("user-b")))
    assert out["items"] == []


def test_cross_user_update_blocked(sb):
    body = rem_module.ReminderIn(title="hacked", due_at=_future(), reminder_type="general")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            rem_module.update_reminder("rem-a-user", body, user=_user("user-b"))
        )
    assert exc.value.status_code == 404


def test_cross_user_delete_blocked(sb):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rem_module.delete_reminder("rem-a-user", user=_user("user-b")))
    assert exc.value.status_code == 404


def test_system_row_update_by_owner_forbidden(sb):
    body = rem_module.ReminderIn(title="x", due_at=_future(), reminder_type="general")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rem_module.update_reminder("rem-sys", body, user=_user("user-a")))
    assert exc.value.status_code == 403


def test_system_row_delete_by_owner_forbidden(sb):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rem_module.delete_reminder("rem-sys", user=_user("user-a")))
    assert exc.value.status_code == 403


def test_past_due_at_rejected(sb):
    body = rem_module.ReminderIn(title="late", due_at=_past(), reminder_type="general")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rem_module.create_reminder(body, user=_user("user-a")))
    assert exc.value.status_code == 422


def test_unknown_id_delete_returns_404(sb):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rem_module.delete_reminder("no-such-id", user=_user("user-a")))
    assert exc.value.status_code == 404


def test_invalid_reminder_type_rejected_by_pydantic():
    with pytest.raises(ValidationError):
        rem_module.ReminderIn(
            title="x", due_at=_future(), reminder_type="not-a-thing"
        )


def test_create_then_list_round_trip(sb):
    body = rem_module.ReminderIn(title="study", due_at=_future(), reminder_type="study")
    created = asyncio.run(rem_module.create_reminder(body, user=_user("user-a")))
    assert created["source"] == "user"
    out = asyncio.run(
        rem_module.list_reminders(cursor=None, limit=50, user=_user("user-a"))
    )
    titles = [it["title"] for it in out["items"]]
    assert "study" in titles


def test_routes_require_auth():
    import inspect

    from app.core import auth

    # Reads use the standard required dep.
    for fn in (rem_module.upcoming, rem_module.list_reminders):
        dep = inspect.signature(fn).parameters["user"].default
        assert getattr(dep, "dependency", None) is auth.get_current_user
    # Writes must use the permanent-identity dep (rejects anonymous users).
    for fn in (rem_module.create_reminder, rem_module.update_reminder, rem_module.delete_reminder):
        dep = inspect.signature(fn).parameters["user"].default
        assert getattr(dep, "dependency", None) is auth.get_current_user_required_permanent


def test_rate_limit_fires_on_writes(sb):
    rate_limit.configure("reminders.write", per_minute=2, burst=2)
    body = rem_module.ReminderIn(title="x", due_at=_future(), reminder_type="general")
    asyncio.run(rem_module.create_reminder(body, user=_user("rl-u")))
    asyncio.run(rem_module.create_reminder(body, user=_user("rl-u")))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(rem_module.create_reminder(body, user=_user("rl-u")))
    assert exc.value.status_code == 429
