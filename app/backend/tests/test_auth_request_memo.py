"""Regression test for the per-request auth memoisation in core.auth.

`get_current_user` is wired as a FastAPI dependency; multiple
sub-dependencies in one request used to fire ``auth.get_user`` once per
dependency. The fix memoises the resolved user on ``request.state`` so a
single request that fans out to ≥2 protected dependencies hits Supabase
exactly once.
"""
from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import get_current_user, require_permission


class _FakeUser:
    def __init__(self, uid: str = "u-1", email: str = "u@example.com"):
        self.id = uid
        self.email = email
        self.user_metadata = {"name": "U"}
        self.app_metadata = {"role": "super_admin", "permissions": ["x.do"]}
        self.created_at = "2026-01-01T00:00:00Z"


class _FakeAuth:
    def __init__(self, user, calls):
        self._user = user
        self._calls = calls

    def get_user(self, _token):
        self._calls.append("auth.get_user")

        class _R:
            user = self._user
        return _R()


class _FakeAdmin:
    def __init__(self, user, calls):
        self.auth = _FakeAuth(user, calls)


def _build_app(calls: list[str]):
    fake = _FakeAdmin(_FakeUser(), calls)
    auth_module.get_supabase_admin = lambda: fake  # type: ignore[assignment]

    app = FastAPI()

    @app.get("/probe")
    def probe(
        user_a: dict = Depends(get_current_user),
        user_b: dict = Depends(require_permission("x.do")),
    ) -> dict:
        # Two distinct protected dependencies in one request.
        return {"a": user_a.get("id"), "b": user_b.get("id")}

    return app


def test_single_request_hits_supabase_get_user_once():
    calls: list[str] = []
    client = TestClient(_build_app(calls))
    r = client.get("/probe", headers={"Authorization": "Bearer abc"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["a"] == "u-1" and body["b"] == "u-1"
    # Two dependencies, one Supabase call.
    assert calls == ["auth.get_user"], calls


def test_separate_requests_with_different_tokens_each_validate():
    # Two distinct tokens must each be validated against Supabase. The
    # cross-request cache is keyed per-token, so it cannot conflate.
    calls: list[str] = []
    auth_module.invalidate_token("tok-a")
    auth_module.invalidate_token("tok-b")
    client = TestClient(_build_app(calls))
    client.get("/probe", headers={"Authorization": "Bearer tok-a"})
    client.get("/probe", headers={"Authorization": "Bearer tok-b"})
    assert calls == ["auth.get_user", "auth.get_user"], calls
