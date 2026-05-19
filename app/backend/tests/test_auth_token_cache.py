"""Cross-request token cache in app.core.auth.

Dashboard boot fires 5+ protected requests in parallel. Each used to
issue its own Supabase auth/v1/user round-trip. The TTL cache here
collapses identical-token requests to one Supabase call within the
TTL window, without weakening the auth contract: invalid tokens are
still 401 and are NEVER cached.
"""
from __future__ import annotations

import time

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import get_current_user, invalidate_token


class _FakeUser:
    def __init__(self, uid: str = "u-1", email: str = "u@example.com"):
        self.id = uid
        self.email = email
        self.user_metadata = {"name": "U"}
        self.app_metadata = {"role": "user", "permissions": []}
        self.created_at = "2026-01-01T00:00:00Z"


class _FakeAuth:
    def __init__(self, user, calls, fail: bool = False):
        self._user = user
        self._calls = calls
        self._fail = fail

    def get_user(self, _token):
        self._calls.append("auth.get_user")
        if self._fail:
            raise RuntimeError("invalid")

        class _R:
            user = self._user
        return _R()


class _FakeAdmin:
    def __init__(self, user, calls, fail: bool = False):
        self.auth = _FakeAuth(user, calls, fail=fail)


def _build_app(calls: list[str], fail: bool = False):
    fake = _FakeAdmin(_FakeUser(), calls, fail=fail)
    auth_module.get_supabase_admin = lambda: fake  # type: ignore[assignment]

    app = FastAPI()

    @app.get("/me")
    def me(user: dict = Depends(get_current_user)) -> dict:
        return {"id": user.get("id")}

    return app


def _reset_cache():
    with auth_module._token_cache_lock:
        auth_module._token_cache.clear()


def test_same_token_across_requests_hits_supabase_once():
    _reset_cache()
    calls: list[str] = []
    client = TestClient(_build_app(calls))
    r1 = client.get("/me", headers={"Authorization": "Bearer tok-same"})
    r2 = client.get("/me", headers={"Authorization": "Bearer tok-same"})
    assert r1.status_code == 200 and r2.status_code == 200
    # Second request must come from the cross-request cache.
    assert calls == ["auth.get_user"], calls


def test_ttl_expiry_revalidates():
    _reset_cache()
    calls: list[str] = []
    # Squash the TTL window so the test can prove expiry.
    original_ttl = auth_module._token_cache.ttl
    auth_module._token_cache.expire()
    try:
        auth_module._token_cache = auth_module.TTLCache(
            maxsize=auth_module._TOKEN_CACHE_MAXSIZE, ttl=0.05
        )
        client = TestClient(_build_app(calls))
        client.get("/me", headers={"Authorization": "Bearer tok-ttl"})
        time.sleep(0.12)
        client.get("/me", headers={"Authorization": "Bearer tok-ttl"})
    finally:
        auth_module._token_cache = auth_module.TTLCache(
            maxsize=auth_module._TOKEN_CACHE_MAXSIZE, ttl=original_ttl
        )
    assert calls == ["auth.get_user", "auth.get_user"], calls


def test_invalid_token_returns_401_and_is_not_cached():
    _reset_cache()
    calls: list[str] = []
    client = TestClient(_build_app(calls, fail=True))
    r1 = client.get("/me", headers={"Authorization": "Bearer tok-bad"})
    r2 = client.get("/me", headers={"Authorization": "Bearer tok-bad"})
    assert r1.status_code == 401 and r2.status_code == 401
    # Both requests must have hit Supabase. Nothing got cached.
    assert calls == ["auth.get_user", "auth.get_user"], calls


def test_invalidate_token_evicts_cache_entry():
    _reset_cache()
    calls: list[str] = []
    client = TestClient(_build_app(calls))
    client.get("/me", headers={"Authorization": "Bearer tok-revoke"})
    # First call cached. Invalidate, then expect a fresh Supabase hit.
    invalidate_token("tok-revoke")
    client.get("/me", headers={"Authorization": "Bearer tok-revoke"})
    assert calls == ["auth.get_user", "auth.get_user"], calls


def test_supabase_returns_no_user_raises_401_and_is_not_cached():
    _reset_cache()
    calls: list[str] = []

    class _NoUserAuth:
        def get_user(self, _token):
            calls.append("auth.get_user")

            class _R:
                user = None
            return _R()

    class _NoUserAdmin:
        auth = _NoUserAuth()

    auth_module.get_supabase_admin = lambda: _NoUserAdmin()  # type: ignore[assignment]

    app = FastAPI()

    @app.get("/me")
    def me(user: dict = Depends(get_current_user)) -> dict:
        return {"id": user.get("id")}

    client = TestClient(app)
    r1 = client.get("/me", headers={"Authorization": "Bearer tok-empty"})
    r2 = client.get("/me", headers={"Authorization": "Bearer tok-empty"})
    assert r1.status_code == 401 and r2.status_code == 401
    assert calls == ["auth.get_user", "auth.get_user"], calls
