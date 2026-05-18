"""Daily cleanup of orphan anonymous Supabase users.

A "Start free" click creates a real ``auth.users`` row with
``is_anonymous=true``. If the user never links a Google/email identity
the row is dead weight. Thirty days is the conservative grace period
the spec asks for — long enough that a returning student keeps their
profile, short enough that we don't accrue indefinitely.

The job is best-effort: a transient failure on a single user is
logged and the rest of the batch continues. A run that finds nothing
returns ``{"deleted": 0}`` so the scheduler's "no-op" filter can keep
it quiet in the logs.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger("career_copilot.profile.anonymous_cleanup")

ANONYMOUS_TTL_DAYS = 30


def _cutoff_iso(now: datetime | None = None) -> str:
    base = now or datetime.now(timezone.utc)
    return (base - timedelta(days=ANONYMOUS_TTL_DAYS)).isoformat()


def _select_expired(supabase: Any, cutoff_iso: str) -> list[dict[str, Any]]:
    rows = (
        supabase.table("profiles")
        .select("id, created_at")
        .eq("is_anonymous", True)
        .lte("created_at", cutoff_iso)
        .limit(500)
        .execute()
        .data
        or []
    )
    return list(rows)


def _delete_one(supabase: Any, user_id: str) -> bool:
    """Delete the auth user (cascades) and fall back to a direct profile delete.

    The Supabase admin client exposes ``auth.admin.delete_user``;
    depending on the project's FK setup it may cascade to ``profiles``.
    We attempt that first, then explicitly delete the profile row to
    guarantee removal even when cascades aren't configured.
    """
    auth_ok = False
    try:
        admin = getattr(supabase.auth, "admin", None)
        if admin and hasattr(admin, "delete_user"):
            admin.delete_user(user_id)
            auth_ok = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("auth.admin.delete_user failed for %s: %s", user_id, exc)
    try:
        supabase.table("profiles").delete().eq("id", user_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("profiles.delete failed for %s: %s", user_id, exc)
        return auth_ok
    return True


def cleanup_anonymous_users(
    supabase: Any, *, now: datetime | None = None
) -> dict[str, Any]:
    """Delete anonymous profiles older than ``ANONYMOUS_TTL_DAYS``.

    Returns a small dict with ``checked`` (rows seen) and ``deleted``
    (rows actually removed) — the scheduler logs this verbatim.
    """
    cutoff = _cutoff_iso(now)
    rows = _select_expired(supabase, cutoff)
    deleted = 0
    for row in rows:
        uid = row.get("id")
        if not uid:
            continue
        if _delete_one(supabase, uid):
            deleted += 1
    return {"checked": len(rows), "deleted": deleted, "cutoff": cutoff}
