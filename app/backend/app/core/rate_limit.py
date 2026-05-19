"""In-process per-user / per-route token-bucket rate limiter.

In-memory only — state is process-local and is lost on restart. A future
PR will swap this for Redis when the service goes multi-instance. The
contract (`enforce(user_id, route)` -> raise 429 or return) is stable
across the swap.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass

from fastapi import HTTPException, status

# Per-route configuration: route key -> (capacity, refill_per_minute).
# Capacity is the burst size; refill happens linearly over a 60s window.
_ROUTE_CONFIG: dict[str, tuple[int, int]] = {
    "policy_updates.read": (60, 60),
    "reminders.write": (30, 30),
}


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


_state: dict[tuple[str, str], _Bucket] = defaultdict(lambda: _Bucket(tokens=0.0, updated_at=0.0))
_lock = threading.Lock()


def configure(route: str, *, per_minute: int, burst: int | None = None) -> None:
    """Register or override the limit for ``route``. Tests use this."""
    cap = burst if burst is not None else per_minute
    _ROUTE_CONFIG[route] = (cap, per_minute)


def _consume(user_id: str, route: str, now: float) -> bool:
    cap, refill_per_min = _ROUTE_CONFIG.get(route, (0, 0))
    if cap <= 0:
        return True
    key = (user_id, route)
    with _lock:
        bucket = _state[key]
        if bucket.updated_at == 0.0:
            bucket.tokens = float(cap)
        else:
            elapsed = max(0.0, now - bucket.updated_at)
            bucket.tokens = min(float(cap), bucket.tokens + elapsed * (refill_per_min / 60.0))
        bucket.updated_at = now
        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True
        return False


def enforce(user_id: str, route: str) -> None:
    """Consume one token; raise 429 if the bucket is empty."""
    if not user_id or not route:
        return
    if not _consume(user_id, route, time.time()):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )


def reset() -> None:
    """Drop all in-memory state. Tests only."""
    with _lock:
        _state.clear()
