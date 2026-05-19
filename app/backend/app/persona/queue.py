"""Persona recompute queue helpers.

Thin Supabase wrappers around `public.persona_recompute_queue`. The
queue is intentionally simple in PR1: callers enqueue a row, a future
worker can drain it. We expose a synchronous `process_pending_*` helper
so tests and ad-hoc admin tooling can drive recomputation without a
background worker.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("career_copilot.persona.queue")


def _safe(call, default=None):
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona queue supabase call failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def enqueue_persona_recompute(
    supabase: Any, user_id: str, reason: str
) -> dict[str, Any] | None:
    """Insert a pending recompute row. Returns the inserted row when available."""
    if not user_id:
        raise ValueError("user_id is required")
    if not reason:
        raise ValueError("reason is required")
    payload = {
        "user_id": user_id,
        "reason": reason,
        "status": "pending",
        "attempts": 0,
    }
    rows = _safe(
        lambda: supabase.table("persona_recompute_queue").insert(payload).execute().data,
        default=None,
    )
    if isinstance(rows, list) and rows:
        return rows[0]
    return payload


def _mark(supabase: Any, row_id: str, patch: dict[str, Any]) -> None:
    _safe(
        lambda: supabase.table("persona_recompute_queue")
        .update(patch)
        .eq("id", row_id)
        .execute()
    )


def process_pending_persona_recompute(
    supabase: Any, limit: int = 25, *, user_id: str | None = None
) -> list[dict[str, Any]]:
    """Drain up to ``limit`` pending rows, computing a fresh snapshot each.

    When ``user_id`` is set, only that user's rows are considered. Request-
    path callers MUST pass ``user_id`` so one user's answer can't drain
    another user's queued work synchronously.

    Returns a summary list of {user_id, status, snapshot_id?} dicts.
    Failures are recorded on the queue row but never raise — the worker
    must stay resilient even if one user's signals are malformed.
    """
    # Imported lazily to avoid a circular import: snapshots → classifier
    # → study_policy is fine, but tests stub `snapshots` separately.
    from app.persona.snapshots import compute_persona_snapshot

    def _fetch():
        q = (
            supabase.table("persona_recompute_queue")
            .select("id, user_id, reason, attempts")
            .eq("status", "pending")
        )
        if user_id:
            q = q.eq("user_id", user_id)
        return q.order("created_at").limit(limit).execute().data

    rows = _safe(_fetch, default=[]) or []

    results: list[dict[str, Any]] = []
    for row in rows:
        row_id = row.get("id")
        user_id = row.get("user_id")
        reason = row.get("reason") or "queued_recompute"
        attempts = int(row.get("attempts") or 0)
        _mark(
            supabase,
            row_id,
            {"status": "processing", "attempts": attempts + 1},
        )
        try:
            snapshot = compute_persona_snapshot(supabase, user_id, reason=reason)
            _mark(
                supabase,
                row_id,
                {"status": "completed", "processed_at": _now_iso(), "error_message": None},
            )
            results.append(
                {
                    "user_id": user_id,
                    "status": "completed",
                    "snapshot_id": (snapshot or {}).get("id"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("persona recompute failed for %s", user_id)
            _mark(
                supabase,
                row_id,
                {
                    "status": "failed",
                    "processed_at": _now_iso(),
                    "error_message": str(exc)[:500],
                },
            )
            results.append({"user_id": user_id, "status": "failed", "error": str(exc)})
    return results
