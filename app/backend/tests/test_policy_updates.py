"""PR3 — Policy updates feed.

Tests the published-only gate, limit clamp, future-timestamp clamp,
linked-exam visibility, and rate-limit behaviour.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api import policy_updates as policy_module
from app.core import rate_limit


class Resp:
    def __init__(self, data):
        self.data = data


class Q:
    def __init__(self, rows):
        self.rows = rows
        self.filters: dict = {}
        self.in_filters: dict = {}
        self.gt_filters: dict = {}
        self.limit_n: int | None = None

    def select(self, *a, **k):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def in_(self, k, v):
        self.in_filters[k] = list(v)
        return self

    def gt(self, k, v):
        self.gt_filters[k] = v
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def execute(self):
        out = list(self.rows)
        for k, v in self.filters.items():
            out = [r for r in out if r.get(k) == v]
        for k, v in self.in_filters.items():
            out = [r for r in out if r.get(k) in v]
        for k, v in self.gt_filters.items():
            out = [r for r in out if (r.get(k) or "") > v]
        out.sort(key=lambda r: r.get("published_at") or "", reverse=True)
        if self.limit_n is not None:
            out = out[: self.limit_n]
        return Resp(out)


class SB:
    def __init__(self, *, policy_rows=None, exam_rows=None):
        self._tables = {
            "exam_policy_updates": policy_rows or [],
            "exams": exam_rows or [],
        }

    def table(self, name):
        return Q(self._tables.get(name, []))


def _user(uid="u1"):
    return {"id": uid, "is_anonymous": False}


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    rate_limit.reset()
    rate_limit.configure("policy_updates.read", per_minute=60)
    yield
    rate_limit.reset()


@pytest.fixture
def base_sb(monkeypatch):
    sb = SB(
        policy_rows=[
            {
                "id": "p1", "exam_id": "exam-ok", "exam_cycle_id": None,
                "update_type": "date_change", "title": "Window opens",
                "summary": "...", "source_url": "https://example.gov.in/p1",
                "source_type": "official", "publish_status": "published",
                "published_at": "2026-05-10T00:00:00+00:00",
                "effective_from": "2026-06-01",
                "created_at": "2026-05-09T00:00:00+00:00",
                "updated_at": "2026-05-09T00:00:00+00:00",
            },
            {
                "id": "p2", "exam_id": "exam-ok", "exam_cycle_id": None,
                "update_type": "pattern_change", "title": "Pattern revised",
                "summary": "...", "source_url": "https://example.gov.in/p2",
                "source_type": "official", "publish_status": "draft",
                "published_at": "2026-05-11T00:00:00+00:00",
                "effective_from": None,
                "created_at": "2026-05-09T00:00:00+00:00",
                "updated_at": "2026-05-09T00:00:00+00:00",
            },
            {
                "id": "p3", "exam_id": "exam-hidden", "exam_cycle_id": None,
                "update_type": "vacancy_change", "title": "Vacancy bump",
                "summary": "...", "source_url": "https://example.gov.in/p3",
                "source_type": "official", "publish_status": "published",
                "published_at": "2026-05-12T00:00:00+00:00",
                "effective_from": None,
                "created_at": "2026-05-09T00:00:00+00:00",
                "updated_at": "2026-05-09T00:00:00+00:00",
            },
        ],
        exam_rows=[
            {"id": "exam-ok", "is_active": True},
            {"id": "exam-hidden", "is_active": False},
        ],
    )
    monkeypatch.setattr(policy_module, "get_supabase_admin", lambda: sb)
    return sb


def test_limit_above_cap_rejected(base_sb):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            policy_module.list_policy_updates(
                sinceClientTs=None, limit=11, user=_user()
            )
        )
    assert exc.value.status_code == 422


def test_only_published_rows_returned(base_sb):
    out = asyncio.run(
        policy_module.list_policy_updates(
            sinceClientTs=None, limit=10, user=_user()
        )
    )
    # p2 is draft → excluded; p3 is published but its exam is inactive → excluded.
    ids = [it["id"] for it in out["items"]]
    assert ids == ["p1"]


def test_future_timestamp_clamps_to_now(base_sb):
    """Future sinceClientTs must not error and must not bypass the gt filter.

    After clamping to now, the gt(published_at, now) filter naturally
    returns no rows since no policy row is in the future. The clamp's
    job is to keep the request from 422-ing or returning a stale page.
    """
    future = datetime.now(timezone.utc) + timedelta(days=365)
    out = asyncio.run(
        policy_module.list_policy_updates(
            sinceClientTs=future, limit=10, user=_user()
        )
    )
    assert out == {"items": [], "next_cursor": None}


def test_route_requires_auth():
    import inspect

    from app.core import auth

    dep = inspect.signature(policy_module.list_policy_updates).parameters["user"].default
    assert getattr(dep, "dependency", None) is auth.get_current_user


def test_rate_limit_fires_after_quota(base_sb):
    rate_limit.configure("policy_updates.read", per_minute=2, burst=2)
    # First 2 calls succeed.
    for _ in range(2):
        asyncio.run(
            policy_module.list_policy_updates(
                sinceClientTs=None, limit=10, user=_user("rate-u")
            )
        )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            policy_module.list_policy_updates(
                sinceClientTs=None, limit=10, user=_user("rate-u")
            )
        )
    assert exc.value.status_code == 429


def test_rate_limit_isolated_per_user(base_sb):
    rate_limit.configure("policy_updates.read", per_minute=2, burst=2)
    for _ in range(2):
        asyncio.run(
            policy_module.list_policy_updates(
                sinceClientTs=None, limit=10, user=_user("user-a")
            )
        )
    # user-b is unaffected.
    asyncio.run(
        policy_module.list_policy_updates(
            sinceClientTs=None, limit=10, user=_user("user-b")
        )
    )
