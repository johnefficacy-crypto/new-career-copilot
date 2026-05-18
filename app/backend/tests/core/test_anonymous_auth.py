"""Tests for the ``is_anonymous`` plumbing in core.auth.

The unified anonymous onboarding flow relies on a Supabase JWT carrying
``is_anonymous=true`` — the backend must surface that flag and reject
anonymous callers from endpoints that demand a permanent identity.
"""
from __future__ import annotations

import jwt
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import (
    get_current_user,
    get_current_user_required_permanent,
    require_permission,
)


def _encode(payload: dict) -> str:
    # Unsigned token — the test stub's get_user ignores the signature and
    # the dependency only decodes for unverified claims.
    return jwt.encode(payload, "", algorithm="HS256")


class _FakeUser:
    def __init__(self, uid: str, *, is_anonymous: bool):
        self.id = uid
        self.email = None if is_anonymous else "u@example.com"
        self.user_metadata = {}
        self.app_metadata = {"is_anonymous": is_anonymous} if is_anonymous else {}
        self.created_at = "2026-01-01T00:00:00Z"
        # Mirror the gotrue SDK's attribute on the object too, so the
        # serializer's fallback path is exercised.
        self.is_anonymous = is_anonymous


class _FakeAuth:
    def __init__(self, user):
        self._user = user

    def get_user(self, _token):
        class _R:
            user = self._user
        return _R()


class _FakeAdmin:
    def __init__(self, user):
        self.auth = _FakeAuth(user)


def _build_app(user_obj):
    auth_module.get_supabase_admin = lambda: _FakeAdmin(user_obj)  # type: ignore[assignment]
    app = FastAPI()

    @app.get("/probe")
    def probe(user: dict = Depends(get_current_user)) -> dict:
        return {"id": user["id"], "is_anonymous": user["is_anonymous"]}

    @app.get("/permanent")
    def permanent(user: dict = Depends(get_current_user_required_permanent)) -> dict:
        return {"id": user["id"]}

    @app.get("/admin")
    def admin(user: dict = Depends(require_permission("anything"))) -> dict:
        return {"id": user["id"]}

    return app


def test_anonymous_jwt_is_accepted_and_flag_exposed():
    app = _build_app(_FakeUser("anon-1", is_anonymous=True))
    token = _encode({"sub": "anon-1", "is_anonymous": True})
    client = TestClient(app)
    r = client.get("/probe", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": "anon-1", "is_anonymous": True}


def test_permanent_endpoint_rejects_anonymous():
    app = _build_app(_FakeUser("anon-2", is_anonymous=True))
    token = _encode({"sub": "anon-2", "is_anonymous": True})
    client = TestClient(app)
    r = client.get("/permanent", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text


def test_permanent_endpoint_accepts_real_user():
    app = _build_app(_FakeUser("real-1", is_anonymous=False))
    token = _encode({"sub": "real-1"})
    client = TestClient(app)
    r = client.get("/permanent", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text


def test_require_permission_rejects_anonymous():
    # Anonymous users can never satisfy a permission check — short-circuit
    # before the perm match so the 403 reason is unambiguous.
    app = _build_app(_FakeUser("anon-3", is_anonymous=True))
    token = _encode({"sub": "anon-3", "is_anonymous": True})
    client = TestClient(app)
    r = client.get("/admin", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text
    assert "anonymous" in r.json().get("detail", "").lower()
