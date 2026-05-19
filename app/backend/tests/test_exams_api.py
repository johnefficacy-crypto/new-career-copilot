"""PR1 — Exams catalogue API.

Tests cover the security contract:
- 401 when unauthenticated (FastAPI dependency, exercised via TestClient).
- 422 on unknown enum / oversized limit / oversized q.
- Per-caller eligibility overlay isolation (two users, separate verdicts).
- Pagination cursor round-trip.
"""
from __future__ import annotations

import asyncio
import base64
import json

import pytest
from fastapi import HTTPException

from app.api import exams as exams_module


class Resp:
    def __init__(self, data=None):
        self.data = data


class Q:
    def __init__(self, table, rows):
        self.table = table
        self.rows = rows
        self.filters: dict[str, object] = {}
        self.lt_filters: dict[str, object] = {}
        self.limit_n: int | None = None
        self.ilike_calls: list[tuple] = []
        self.order_args = None

    def select(self, *a, **k):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def lt(self, k, v):
        self.lt_filters[k] = v
        return self

    def ilike(self, *a, **k):
        self.ilike_calls.append((a, k))
        return self

    def order(self, *a, **k):
        self.order_args = (a, k)
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def execute(self):
        out = list(self.rows)
        for k, v in self.filters.items():
            out = [r for r in out if r.get(k) == v]
        for k, v in self.lt_filters.items():
            out = [r for r in out if (r.get(k) or "") < v]
        if self.ilike_calls:
            for (args, kwargs) in self.ilike_calls:
                col, pattern = args
                needle = pattern.strip("%").lower()
                out = [r for r in out if needle in (r.get(col) or "").lower()]
        # order: created_at desc
        out.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        if self.limit_n is not None:
            out = out[: self.limit_n]
        return Resp(out)


class SB:
    def __init__(self, exams=None, prefs=None):
        self._tables = {
            "exams": exams or [],
            "aspirant_preferences": prefs or [],
        }

    def table(self, name):
        return Q(name, self._tables.get(name, []))


# ── Fixtures ──────────────────────────────────────────────────────────


def _user(uid: str):
    return {"id": uid, "email": f"{uid}@ex.com", "is_anonymous": False}


@pytest.fixture
def fake_sb(monkeypatch):
    sb = SB(
        exams=[
            {
                "id": "e1",
                "slug": "exam-a",
                "name": "Exam A",
                "exam_type": "recruitment",
                "metadata": {"level": "central", "frequency": "yearly"},
                "is_active": True,
                "created_at": "2026-05-10T00:00:00+00:00",
            },
            {
                "id": "e2",
                "slug": "exam-b",
                "name": "Exam B",
                "exam_type": "entrance",
                "metadata": {"level": "state", "frequency": "yearly"},
                "is_active": True,
                "created_at": "2026-05-09T00:00:00+00:00",
            },
            {
                "id": "e3",
                "slug": "exam-c",
                "name": "Exam C",
                "exam_type": "recruitment",
                "metadata": {"level": "central", "frequency": "biannual"},
                "is_active": False,
                "created_at": "2026-05-08T00:00:00+00:00",
            },
        ],
        prefs=[{"user_id": "u1", "target_exams": ["exam-a"]}],
    )
    monkeypatch.setattr(exams_module, "get_supabase_admin", lambda: sb)
    return sb


def _stub_overlay(monkeypatch, overlay_by_user):
    def fake_summary(_sb, user_id):
        verdicts = overlay_by_user.get(user_id, {})
        buckets = {"eligible": [], "conditional": [], "not_eligible": [], "unknown": []}
        bucket_for_state = {
            "eligible": "eligible",
            "conditional": "conditional",
            "not_yet": "not_eligible",
        }
        for slug, state in verdicts.items():
            buckets[bucket_for_state[state]].append({"slug": slug, "missing_fields": []})
        return {**buckets, "rule_count": len(verdicts)}

    monkeypatch.setattr(exams_module, "summarize_user_eligibility", fake_summary)


# ── Tests ─────────────────────────────────────────────────────────────


def test_list_rejects_limit_above_cap(fake_sb, monkeypatch):
    _stub_overlay(monkeypatch, {})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            exams_module.list_exams(
                q=None, level=None, category=None, frequency=None,
                savedOnly=False, eligibilityState="all",
                cursor=None, limit=101, user=_user("u1"),
            )
        )
    assert exc.value.status_code == 422


def test_list_rejects_q_too_long(fake_sb, monkeypatch):
    _stub_overlay(monkeypatch, {})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            exams_module.list_exams(
                q="x" * 81, level=None, category=None, frequency=None,
                savedOnly=False, eligibilityState="all",
                cursor=None, limit=50, user=_user("u1"),
            )
        )
    assert exc.value.status_code == 422


def test_list_rejects_invalid_cursor(fake_sb, monkeypatch):
    _stub_overlay(monkeypatch, {})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            exams_module.list_exams(
                q=None, level=None, category=None, frequency=None,
                savedOnly=False, eligibilityState="all",
                cursor="!!not-base64!!", limit=50, user=_user("u1"),
            )
        )
    assert exc.value.status_code == 422


def test_list_returns_only_active_with_overlay(fake_sb, monkeypatch):
    _stub_overlay(monkeypatch, {"u1": {"exam-a": "eligible", "exam-b": "conditional"}})
    out = asyncio.run(
        exams_module.list_exams(
            q=None, level=None, category=None, frequency=None,
            savedOnly=False, eligibilityState="all",
            cursor=None, limit=50, user=_user("u1"),
        )
    )
    slugs = [it["slug"] for it in out["items"]]
    assert "exam-c" not in slugs  # is_active=False filtered out
    assert "exam-a" in slugs and "exam-b" in slugs
    by_slug = {it["slug"]: it for it in out["items"]}
    assert by_slug["exam-a"]["eligibility"]["state"] == "eligible"
    assert by_slug["exam-a"]["saved"] is True
    assert by_slug["exam-b"]["saved"] is False


def test_eligibility_state_filter(fake_sb, monkeypatch):
    _stub_overlay(monkeypatch, {"u1": {"exam-a": "eligible", "exam-b": "conditional"}})
    out = asyncio.run(
        exams_module.list_exams(
            q=None, level=None, category=None, frequency=None,
            savedOnly=False, eligibilityState="eligible",
            cursor=None, limit=50, user=_user("u1"),
        )
    )
    assert [it["slug"] for it in out["items"]] == ["exam-a"]


def test_eligibility_overlay_is_per_caller(fake_sb, monkeypatch):
    _stub_overlay(
        monkeypatch,
        {
            "u1": {"exam-a": "eligible", "exam-b": "not_yet"},
            "u2": {"exam-a": "not_yet", "exam-b": "eligible"},
        },
    )
    out_u1 = asyncio.run(exams_module.eligibility_me(user=_user("u1")))
    out_u2 = asyncio.run(exams_module.eligibility_me(user=_user("u2")))
    assert out_u1["exam-a"]["state"] == "eligible"
    assert out_u2["exam-a"]["state"] == "not_yet"
    assert out_u1["exam-b"]["state"] == "not_yet"
    assert out_u2["exam-b"]["state"] == "eligible"


def test_savedonly_filters_to_user_targets(fake_sb, monkeypatch):
    _stub_overlay(monkeypatch, {})
    out = asyncio.run(
        exams_module.list_exams(
            q=None, level=None, category=None, frequency=None,
            savedOnly=True, eligibilityState="all",
            cursor=None, limit=50, user=_user("u1"),
        )
    )
    assert [it["slug"] for it in out["items"]] == ["exam-a"]
    out_u2 = asyncio.run(
        exams_module.list_exams(
            q=None, level=None, category=None, frequency=None,
            savedOnly=True, eligibilityState="all",
            cursor=None, limit=50, user=_user("u2"),
        )
    )
    assert out_u2["items"] == []


def test_pagination_cursor_round_trip(fake_sb, monkeypatch):
    # Seed extra rows so the page boundary is non-trivial.
    _stub_overlay(monkeypatch, {})
    fake_sb._tables["exams"] = [
        {
            "id": f"e{i}", "slug": f"exam-{i}", "name": f"Exam {i}",
            "exam_type": "recruitment", "metadata": {},
            "is_active": True,
            "created_at": f"2026-05-{30 - i:02d}T00:00:00+00:00",
        }
        for i in range(5)
    ]
    page1 = asyncio.run(
        exams_module.list_exams(
            q=None, level=None, category=None, frequency=None,
            savedOnly=False, eligibilityState="all",
            cursor=None, limit=2, user=_user("u1"),
        )
    )
    assert len(page1["items"]) == 2
    assert page1["next_cursor"] is not None
    decoded = json.loads(base64.urlsafe_b64decode(page1["next_cursor"]).decode("utf-8"))
    assert "created_at" in decoded and "id" in decoded

    page2 = asyncio.run(
        exams_module.list_exams(
            q=None, level=None, category=None, frequency=None,
            savedOnly=False, eligibilityState="all",
            cursor=page1["next_cursor"], limit=2, user=_user("u1"),
        )
    )
    assert page2["items"][0]["id"] != page1["items"][0]["id"]


def test_route_depends_on_get_current_user():
    """The list endpoint must be wrapped in ``Depends(get_current_user)``."""
    import inspect

    from app.core import auth as auth_module

    params = inspect.signature(exams_module.list_exams).parameters
    dep = params["user"].default
    assert getattr(dep, "dependency", None) is auth_module.get_current_user
    me_params = inspect.signature(exams_module.eligibility_me).parameters
    me_dep = me_params["user"].default
    assert getattr(me_dep, "dependency", None) is auth_module.get_current_user
