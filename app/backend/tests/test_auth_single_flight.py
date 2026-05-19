"""Per-token single-flight in app.core.auth.

Without the lock, N concurrent first-callers with the same bearer each
race the cache-miss check and issue their own ``auth/v1/user`` round-trip.
Evidence in production logs: 3× GET /auth/v1/user in 67ms for a single
dashboard boot. The per-token ``threading.Lock`` collapses them onto one.
"""
from __future__ import annotations

import threading
import time

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import get_current_user


class _FakeUser:
    def __init__(self, uid="u-1"):
        self.id = uid
        self.email = "u@example.com"
        self.user_metadata = {"name": "U"}
        self.app_metadata = {"role": "user", "permissions": []}
        self.created_at = "2026-01-01T00:00:00Z"


def _reset_state():
    with auth_module._token_cache_lock:
        auth_module._token_cache.clear()
    with auth_module._token_flight_guard:
        auth_module._token_flight_locks.clear()


def _build_app(call_recorder, *, sleep_inside_supabase=0.0, fail=False):
    class _Auth:
        def get_user(self, _token):
            if sleep_inside_supabase:
                time.sleep(sleep_inside_supabase)
            call_recorder.append("auth.get_user")
            if fail:
                raise RuntimeError("invalid token")

            class _R:
                user = _FakeUser()

            return _R()

    class _Admin:
        auth = _Auth()

    auth_module.get_supabase_admin = lambda: _Admin()  # type: ignore[assignment]

    app = FastAPI()

    @app.get("/me")
    def me(user: dict = Depends(get_current_user)) -> dict:
        return {"id": user.get("id")}

    return app


def test_concurrent_same_token_hits_supabase_once():
    """Three parallel requests, same bearer ⇒ exactly one Supabase call."""
    _reset_state()
    calls: list[str] = []
    # Sleep inside the supabase shim widens the race window so threads 2
    # and 3 are guaranteed to be blocked on the per-token lock by the
    # time the leader finishes.
    app = _build_app(calls, sleep_inside_supabase=0.08)
    client = TestClient(app)

    results: list[int] = []

    def hit():
        r = client.get("/me", headers={"Authorization": "Bearer tok-race"})
        results.append(r.status_code)

    threads = [threading.Thread(target=hit) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert sorted(results) == [200, 200, 200], results
    assert calls == ["auth.get_user"], (
        f"Single-flight failed: expected 1 Supabase call, got {len(calls)}"
    )


def test_different_tokens_are_not_serialised():
    """5 distinct bearers ⇒ 5 distinct Supabase calls (the lock keys per-token)."""
    _reset_state()
    calls: list[str] = []
    app = _build_app(calls)
    client = TestClient(app)

    for i in range(5):
        r = client.get("/me", headers={"Authorization": f"Bearer tok-{i}"})
        assert r.status_code == 200
    assert len(calls) == 5, f"Expected one Supabase call per token; got {len(calls)}"


def test_invalid_token_releases_flight_lock_and_is_not_cached():
    """A 401 path must drop the per-token lock so the next retry runs cleanly."""
    _reset_state()
    calls: list[str] = []
    app = _build_app(calls, fail=True)
    client = TestClient(app)

    r1 = client.get("/me", headers={"Authorization": "Bearer bad"})
    r2 = client.get("/me", headers={"Authorization": "Bearer bad"})
    assert r1.status_code == 401 and r2.status_code == 401
    # Both requests must have hit Supabase: invalid tokens are never
    # cached, and the lock must not pin the second caller into a stale
    # failed result.
    assert calls == ["auth.get_user", "auth.get_user"]
    # The lock dict must be empty after the failed paths cleaned up so
    # the cache + lock state can never grow under DoS / brute-force.
    with auth_module._token_flight_guard:
        assert auth_module._token_flight_locks == {}


def test_cache_hit_skips_flight_lock():
    """After the cache warms, subsequent requests must not even acquire the lock."""
    _reset_state()
    calls: list[str] = []
    app = _build_app(calls)
    client = TestClient(app)

    client.get("/me", headers={"Authorization": "Bearer tok-warm"})
    # First call populates cache. Second goes through the cross-request
    # cache path before the lock dance.
    client.get("/me", headers={"Authorization": "Bearer tok-warm"})
    client.get("/me", headers={"Authorization": "Bearer tok-warm"})
    assert calls == ["auth.get_user"]
    # The lock dict is released after the first success.
    with auth_module._token_flight_guard:
        assert auth_module._token_flight_locks == {}
