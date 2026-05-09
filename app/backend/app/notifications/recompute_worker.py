"""Eligibility recompute worker — drains ``eligibility_recompute_queue``.

The queue is populated by RLS triggers when a profile/education/exam-credential
field changes (out of scope here) or by manual admin re-queueing. This
worker:

    1. Claims a batch of ``status='pending'`` rows (oldest first).
    2. For each row, runs ``run_eligibility_for_user`` (the deterministic
       engine) — which already upserts ``eligibility_results`` and writes
       ``notification_alerts`` for matched recruitments.
    3. Marks the row ``status='completed'`` (or ``failed`` with ``last_error``
       and an exponential-backoff ``next_attempt_at``).

Idempotent: failures bump ``attempt_count``; rows whose ``next_attempt_at``
is in the future are skipped.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

from app.eligibility.runner import run_eligibility_for_user

logger = logging.getLogger("career_copilot.notifications.recompute_worker")


_MAX_ATTEMPTS = 5


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def claim_pending_recomputes(supabase: Client, limit: int) -> list[dict[str, Any]]:
    """Atomically claim pending recomputes via the claim_eligibility_queue RPC."""
    res = supabase.rpc("claim_eligibility_queue", {"p_limit": limit}).execute()
    return res.data or []


def drain_recompute_queue(supabase: Client, *, limit: int = 25) -> dict[str, Any]:
    """Process up to ``limit`` queued recompute rows. Returns a summary dict."""
    try:
        rows = claim_pending_recomputes(supabase, limit)
    except Exception as exc:  # noqa: BLE001
        logger.warning("recompute queue claim failed (limit=%s): %s", limit, exc)
        return {
            "checked": 0,
            "completed": 0,
            "failed": 0,
            "errors": [str(exc)],
            "claim_error": {"message": str(exc), "limit": limit},
        }

    completed = 0
    failed = 0
    errors: list[str] = []

    for row in rows:
        try:
            result = run_eligibility_for_user(row["user_id"], supabase)
            cleanup = (
                supabase.table("eligibility_recompute_queue")
                .delete()
                .eq("user_id", row["user_id"])
                .eq("status", "completed")
                .neq("id", row["id"])
            )
            cleanup = cleanup.is_("recruitment_id", "null") if row.get("recruitment_id") is None else cleanup.eq("recruitment_id", row.get("recruitment_id"))
            cleanup.execute()
            supabase.table("eligibility_recompute_queue").update(
                {
                    "status": "completed",
                    "processed_at": _now(),
                    "last_error": None,
                }
            ).eq("id", row["id"]).execute()
            completed += 1
            logger.info(
                "recompute %s → eligible=%d conditional=%d",
                row["id"][:8],
                result.get("eligible", 0),
                result.get("conditional", 0),
            )
        except Exception as exc:  # noqa: BLE001
            failed += 1
            attempts = row.get("attempt_count") or 1
            done = attempts >= _MAX_ATTEMPTS
            backoff_min = min(60, 2**attempts)
            patch = {
                "attempt_count": attempts,
                "last_error": str(exc),
                "status": "failed" if done else "pending",
                "next_attempt_at": (
                    datetime.now(timezone.utc) + timedelta(minutes=backoff_min)
                ).isoformat(),
            }
            try:
                supabase.table("eligibility_recompute_queue").update(patch).eq(
                    "id", row["id"]
                ).execute()
            except Exception as exc2:  # noqa: BLE001
                errors.append(f"finalise {row['id'][:8]}: {exc2}")
            errors.append(f"{row['id'][:8]}: {exc}")

    return {"checked": len(rows), "completed": completed, "failed": failed, "errors": errors}
