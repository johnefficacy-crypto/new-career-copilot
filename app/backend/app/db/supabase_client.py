"""Supabase client factories.

We used to call ``create_client`` on every request, which spun up a
fresh httpx connection pool per call. On a profile-completion fan-out
(seven sequential reads inside a single endpoint) that was creating
seven independent pools and exhausting TCP slots — log evidence:

    04:42:19.629–.644: 5× "supabase call failed: Server disconnected" in 14ms

Caching one client per process keeps a single pool alive across requests,
so keepalive connections are actually re-used and Supabase doesn't see
a burst of fresh handshakes. The cache is process-scoped — multi-worker
deployments still get one pool per worker, which is the right granularity
(each worker has its own event loop / httpx instance).

``reset_supabase_clients()`` is exported for tests that monkey-patch
``settings`` or the underlying ``create_client``.
"""
from __future__ import annotations

import threading

from supabase import AsyncClient, Client, acreate_client, create_client

from app.core.config import get_settings

settings = get_settings()

_admin_client: Client | None = None
_public_client: Client | None = None
_async_admin_client: AsyncClient | None = None
_client_lock = threading.Lock()


def get_supabase_admin() -> Client:
    global _admin_client
    cached = _admin_client
    if cached is not None:
        return cached
    if not settings.NEXT_PUBLIC_SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        )
    with _client_lock:
        if _admin_client is None:
            _admin_client = create_client(
                settings.NEXT_PUBLIC_SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY,
            )
        return _admin_client


def get_supabase_public() -> Client:
    global _public_client
    cached = _public_client
    if cached is not None:
        return cached
    if not settings.NEXT_PUBLIC_SUPABASE_URL or not settings.NEXT_PUBLIC_SUPABASE_ANON_KEY:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
        )
    with _client_lock:
        if _public_client is None:
            _public_client = create_client(
                settings.NEXT_PUBLIC_SUPABASE_URL,
                settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            )
        return _public_client


async def get_supabase_admin_async() -> AsyncClient:
    global _async_admin_client
    cached = _async_admin_client
    if cached is not None:
        return cached
    if not settings.NEXT_PUBLIC_SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        )
    # acreate_client is async; the lock dance for the sync clients above
    # protects the dict access, not the construction. Concurrent first
    # callers may race to build two clients; the loser is GC'd.
    if _async_admin_client is None:
        _async_admin_client = await acreate_client(
            settings.NEXT_PUBLIC_SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _async_admin_client


def reset_supabase_clients() -> None:
    """Drop cached clients. Tests-only helper — do not call in app code."""
    global _admin_client, _public_client, _async_admin_client
    with _client_lock:
        _admin_client = None
        _public_client = None
        _async_admin_client = None
