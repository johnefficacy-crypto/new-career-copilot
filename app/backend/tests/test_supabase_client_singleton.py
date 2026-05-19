"""``get_supabase_admin`` must reuse one client per process.

Previous behaviour: every call returned a fresh ``create_client`` —
each one spinning up a brand-new httpx connection pool. The profile
completion fan-out (7 sequential supabase reads in a single endpoint)
created 7 independent pools and exhausted TCP slots, producing the
``Server disconnected`` warnings observed in production logs.
"""
from __future__ import annotations

from app.db import supabase_client


def test_admin_client_is_cached(monkeypatch):
    calls = {"n": 0}

    class _Fake:
        def __init__(self, url, key):
            self.url = url
            self.key = key

    def _spy(url, key):
        calls["n"] += 1
        return _Fake(url, key)

    monkeypatch.setattr(supabase_client, "create_client", _spy)
    monkeypatch.setattr(
        supabase_client.settings, "NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"
    )
    monkeypatch.setattr(
        supabase_client.settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key"
    )
    supabase_client.reset_supabase_clients()

    c1 = supabase_client.get_supabase_admin()
    c2 = supabase_client.get_supabase_admin()
    c3 = supabase_client.get_supabase_admin()

    assert c1 is c2 is c3
    assert calls["n"] == 1, "create_client must be called exactly once"


def test_public_client_is_cached_independently(monkeypatch):
    calls = {"n": 0}

    class _Fake:
        def __init__(self, url, key):
            pass

    def _spy(url, key):
        calls["n"] += 1
        return _Fake(url, key)

    monkeypatch.setattr(supabase_client, "create_client", _spy)
    monkeypatch.setattr(
        supabase_client.settings, "NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"
    )
    monkeypatch.setattr(
        supabase_client.settings, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key"
    )
    monkeypatch.setattr(
        supabase_client.settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key"
    )
    supabase_client.reset_supabase_clients()

    a1 = supabase_client.get_supabase_admin()
    p1 = supabase_client.get_supabase_public()
    a2 = supabase_client.get_supabase_admin()
    p2 = supabase_client.get_supabase_public()

    assert a1 is a2
    assert p1 is p2
    assert a1 is not p1
    assert calls["n"] == 2, "one admin construction, one public construction"


def test_reset_drops_cached_clients(monkeypatch):
    calls = {"n": 0}

    def _spy(url, key):
        calls["n"] += 1
        return object()

    monkeypatch.setattr(supabase_client, "create_client", _spy)
    monkeypatch.setattr(
        supabase_client.settings, "NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"
    )
    monkeypatch.setattr(
        supabase_client.settings, "SUPABASE_SERVICE_ROLE_KEY", "service-key"
    )
    supabase_client.reset_supabase_clients()

    supabase_client.get_supabase_admin()
    supabase_client.reset_supabase_clients()
    supabase_client.get_supabase_admin()

    assert calls["n"] == 2
