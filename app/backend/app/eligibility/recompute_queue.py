from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def enqueue_eligibility_recompute(
    supabase,
    user_id: str,
    reason: str,
    recruitment_id: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Create/update one pending queue row for a user(+optional recruitment)."""
    payload = {
        "user_id": user_id,
        "recruitment_id": recruitment_id,
        "status": "pending",
        "queued_at": _now_iso(),
        "reason": reason,
        "metadata": metadata or {},
        "next_attempt_at": None,
        "attempt_count": 0,
        "last_error": None,
    }
    existing = (
        supabase.table("eligibility_recompute_queue")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .eq("recruitment_id", recruitment_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        row_id = existing[0]["id"]
        out = (
            supabase.table("eligibility_recompute_queue")
            .update(payload)
            .eq("id", row_id)
            .execute()
            .data
            or []
        )
        return (out or [{"id": row_id, **payload}])[0]
    out = supabase.table("eligibility_recompute_queue").insert(payload).execute().data or []
    return (out or [payload])[0]
