"""Signal emit + recompute trigger after a tiny question is answered.

Both calls are best-effort. The answers row is the source of truth; if
the event log or recompute queue happens to be unreachable we still
return success to the client.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from app.persona.queue import enqueue_persona_recompute
from app.persona.queue import process_pending_persona_recompute
import time

logger = logging.getLogger("career_copilot.persona_questions.events")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona_questions.events call failed: %s", exc)
        return default


def emit_question_signal(
    supabase: Any,
    user_id: str,
    question_key: str,
    normalized_value: Any,
    *,
    skipped: bool = False,
) -> dict[str, Any]:
    """Insert a ``user_signal_events`` row and enqueue a persona recompute.

    Returns a small status dict the API can include in its response.
    """
    if not user_id or not question_key:
        return {"event_logged": False, "recompute": "skipped"}

    event_type = (
        "persona_question_skipped" if skipped else "persona_question_answered"
    )
    payload = {
        "user_id": user_id,
        "event_type": event_type,
        "payload": {
            "question_key": question_key,
            "normalized_value": normalized_value,
            "skipped": bool(skipped),
        },
    }
    inserted = _safe(
        lambda: supabase.table("user_signal_events").insert(payload).execute().data,
        default=None,
    )
    event_logged = inserted is not None

    recompute_status = "queued"
    drained = 0
    try:
        # Skipping should not trigger a heavy recompute, only an answered
        # one. Skips still log an event for product analytics.
        if not skipped:
            enqueue_persona_recompute(
                supabase, user_id, reason=f"question_answered:{question_key}"
            )
            started = time.monotonic()
            max_items = 5
            budget_sec = 1.5
            while drained < max_items and (time.monotonic() - started) < budget_sec:
                batch = process_pending_persona_recompute(supabase, limit=1)
                if not batch:
                    break
                drained += len(batch)
        else:
            recompute_status = "skipped"
    except Exception as exc:  # noqa: BLE001
        logger.warning("persona recompute enqueue failed: %s", exc)
        recompute_status = "failed"

    return {"event_logged": bool(event_logged), "recompute": recompute_status, "drained": drained}
