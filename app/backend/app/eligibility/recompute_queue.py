"""Thin Python wrapper around the `enqueue_eligibility_recompute` RPC.

The atomic contract is owned by the Postgres function defined in migration
041. Refer to that SQL header for the full behaviour spec; in short:

  * Active row (`pending` / `queued` / `processing`) → returned unchanged.
  * Failed row → requeued with `attempt_count` and `last_error` preserved.
  * No existing row → fresh `pending` row inserted with attempt_count = 0.

The legacy Python `select → insert/update` path is preserved as a fallback
for deployments that have not yet applied migration 041. It has the known
issues this PR set out to fix (pending-only dedup, retry metadata reset),
so it is only invoked when the RPC is unreachable; in that case a warning
is logged so the operator can apply the missing migration.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger("career_copilot.eligibility.recompute_queue")


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


def _looks_like_rpc_missing(exc: Exception) -> bool:
    """Distinguish "RPC not deployed" from real DB errors.

    `PGRST202` is PostgREST's not-found code for RPC functions. We also match
    the bare Postgres `function ... does not exist` message in case the
    error surfaces from a different layer.
    """
    text = str(exc)
    return (
        "PGRST202" in text
        or "Could not find the function" in text
        or ("function" in text and "does not exist" in text)
        # A client with no `.rpc` attribute at all (older SDK, or a test
        # double) is — for our purposes — an RPC that isn't available, so
        # fall back to the legacy Python enqueue path instead of hard-failing.
        or (isinstance(exc, AttributeError) and "rpc" in text)
    )


def _legacy_payload(payload: dict) -> dict:
    """Columns available in the clean baseline before queue hardening."""
    return {
        k: v
        for k, v in payload.items()
        if k in {"user_id", "recruitment_id", "post_id", "reason", "status", "queued_at"}
    }


def _unwrap_rpc_result(data) -> dict:
    """`returns public.eligibility_recompute_queue` may surface as a dict or
    as a single-element list depending on the client version. Normalise."""
    if isinstance(data, list):
        return data[0] if data else {}
    return data or {}


def enqueue_eligibility_recompute(
    supabase,
    user_id: str,
    reason: str,
    recruitment_id: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Enqueue a recompute event for one user(+optional recruitment scope).

    Calls the atomic Postgres RPC; if that's unavailable, falls back to the
    legacy Python read-then-write path (with a warning log) so old deploys
    keep working until migration 041 is applied.
    """
    try:
        result = supabase.rpc(
            "enqueue_eligibility_recompute",
            {
                "p_user_id": user_id,
                "p_recruitment_id": recruitment_id,
                "p_reason": reason,
                "p_metadata": metadata or {},
            },
        ).execute()
        return _unwrap_rpc_result(getattr(result, "data", None))
    except Exception as exc:  # noqa: BLE001
        if not _looks_like_rpc_missing(exc):
            raise
        logger.warning(
            "enqueue_eligibility_recompute RPC unavailable; falling back to "
            "legacy Python path. Apply migration 041 to restore atomic "
            "enqueue. cause=%s",
            exc,
        )
        return _enqueue_legacy_python(supabase, user_id, reason, recruitment_id, metadata)


def _enqueue_legacy_python(
    supabase,
    user_id: str,
    reason: str,
    recruitment_id: str | None,
    metadata: dict | None,
) -> dict:
    """Pre-migration fallback. Known limitations vs the RPC:
      * Dedupes only against `pending`, not `queued`/`processing`.
      * Resets retry metadata on update.
    """
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
