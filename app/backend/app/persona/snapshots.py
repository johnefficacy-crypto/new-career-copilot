"""Persona snapshot persistence and lookup.

Snapshots are immutable rows in `public.aspirant_persona_snapshots`. The
backend always writes a fresh row rather than updating an existing one;
`get_latest_persona_snapshot` orders by `computed_at desc`.

`source_hash` is a deterministic digest of the input signals so callers
can skip writing a duplicate snapshot when nothing material changed.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.persona import PERSONA_VERSION
from app.persona.classifier import classify_persona
from app.persona.signals import collect_user_signals
from app.persona.study_policy import derive_study_policy

logger = logging.getLogger("career_copilot.persona.snapshots")


def _safe(call, default=None):
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona snapshot supabase call failed: %s", exc)
        return default


def _hash_signals(signals: dict[str, Any]) -> str:
    # Drop internal underscore-prefixed extras so hashes stay stable
    # across refactors of `signals._*`.
    public = {k: v for k, v in (signals or {}).items() if not k.startswith("_")}
    blob = json.dumps(public, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_snapshot_payload(user_id: str, signals: dict[str, Any]) -> dict[str, Any]:
    """Pure helper: build the snapshot row payload from a signals dict."""
    persona = classify_persona(signals)
    answers = signals.get("persona_question_answers") if isinstance(signals, dict) else None
    study_policy = derive_study_policy(persona["dimensions"], answers)
    return {
        "user_id": user_id,
        "persona_version": PERSONA_VERSION,
        "primary_persona": persona["primary_persona"],
        "dimensions": persona["dimensions"],
        "scores": persona["scores"],
        "evidence": persona["evidence"],
        "study_policy": study_policy,
        "source_hash": _hash_signals(signals),
        "computed_at": _now_iso(),
    }


def save_persona_snapshot(supabase: Any, snapshot: dict[str, Any]) -> dict[str, Any]:
    """Insert a persona snapshot row. Returns the inserted row (best effort)."""
    if not snapshot or not snapshot.get("user_id"):
        raise ValueError("snapshot.user_id is required")
    inserted = _safe(
        lambda: supabase.table("aspirant_persona_snapshots")
        .insert(snapshot)
        .execute()
        .data,
        default=None,
    )
    if isinstance(inserted, list) and inserted:
        return inserted[0]
    # If the client returned nothing usable, fall back to the input shape
    # so callers don't need to special-case the response.
    return snapshot


def get_latest_persona_snapshot(supabase: Any, user_id: str) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("aspirant_persona_snapshots")
            .select(
                "id, user_id, persona_version, primary_persona, dimensions, "
                "scores, evidence, study_policy, source_hash, computed_at, "
                "expires_at, created_at"
            )
            .eq("user_id", user_id)
            .order("computed_at", desc=True)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def compute_persona_snapshot(
    supabase: Any, user_id: str, reason: str = "manual"
) -> dict[str, Any]:
    """End-to-end: collect signals, classify, derive policy, save row.

    Always writes a new snapshot row. Callers that want dedup behaviour
    can compare `source_hash` against `get_latest_persona_snapshot` first.
    """
    signals = collect_user_signals(supabase, user_id)
    payload = build_snapshot_payload(user_id, signals)
    payload["evidence"] = list(payload.get("evidence") or []) + [
        {"dimension": "_meta", "value": "compute_reason", "reason": reason, "signal": None}
    ]
    saved = save_persona_snapshot(supabase, payload)
    return saved or payload
