from __future__ import annotations

from datetime import datetime, timezone
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _looks_like_schema_cache_miss(exc: Exception) -> bool:
    text = str(exc)
    return (
        "PGRST204" in text
        or "schema cache" in text
        or "Could not find the" in text
        or "column" in text and "does not exist" in text
    )


def _legacy_payload(payload: dict) -> dict:
    """Columns available in the clean baseline before queue hardening."""
    return {
        k: v
        for k, v in payload.items()
        if k in {"user_id", "recruitment_id", "post_id", "reason", "status", "queued_at"}
    }


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
    query = (
        supabase.table("eligibility_recompute_queue")
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "pending")
    )
    query = query.is_("recruitment_id", "null") if recruitment_id is None else query.eq("recruitment_id", recruitment_id)
    existing = query.limit(1).execute().data or []
    if existing:
        row_id = existing[0]["id"]
        try:
            out = (
                supabase.table("eligibility_recompute_queue")
                .update(payload)
                .eq("id", row_id)
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            if not _looks_like_schema_cache_miss(exc):
                raise
            fallback = _legacy_payload(payload)
            out = (
                supabase.table("eligibility_recompute_queue")
                .update(fallback)
                .eq("id", row_id)
                .execute()
                .data
                or []
            )
            payload = fallback
        return (out or [{"id": row_id, **payload}])[0]
    try:
        out = supabase.table("eligibility_recompute_queue").insert(payload).execute().data or []
    except Exception as exc:  # noqa: BLE001
        if not _looks_like_schema_cache_miss(exc):
            raise
        payload = _legacy_payload(payload)
        out = supabase.table("eligibility_recompute_queue").insert(payload).execute().data or []
    return (out or [payload])[0]
