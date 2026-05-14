"""Attach anonymous onboarding progress to a freshly authenticated user.

Pre-login, a cold/CTA session is keyed only by ``anonymous_id`` (kept in
the browser's localStorage). After Google/social login the frontend
calls the stitch endpoint, which:

1. claims the anonymous ``funnel_sessions`` / ``onboarding_sessions`` /
   ``onboarding_session_answers`` rows for the ``user_id``;
2. fans the logged answers out to their canonical homes — persona answers
   into ``persona_question_answers``, recruitment answers into
   ``onboarding_answers`` — **without duplicating** anything already
   recorded;
3. returns the resumable session so the chat picks up where it left off.

Nothing here decides eligibility or writes sensitive profile fields.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger("career_copilot.onboarding_unified.anonymous_stitching")


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("anonymous_stitching supabase call failed: %s", exc)
        return default


def _claim_rows(
    supabase: Any, table: str, anonymous_id: str, user_id: str
) -> int:
    """Set ``user_id`` on every ``table`` row for ``anonymous_id`` that has none."""
    rows = _safe(
        lambda: (
            supabase.table(table)
            .select("id, user_id")
            .eq("anonymous_id", anonymous_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    claimed = 0
    for row in rows:
        if row.get("user_id"):
            continue
        row_id = row.get("id")
        if not row_id:
            continue
        _safe(
            lambda rid=row_id: (
                supabase.table(table)
                .update({"user_id": user_id})
                .eq("id", rid)
                .execute()
            )
        )
        claimed += 1
    return claimed


def _existing_persona_keys(supabase: Any, user_id: str) -> set[str]:
    rows = _safe(
        lambda: (
            supabase.table("persona_question_answers")
            .select("question_key, skipped")
            .eq("user_id", user_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {
        r.get("question_key")
        for r in rows
        if r.get("question_key") and not r.get("skipped")
    }


def _existing_onboarding_answer_keys(
    supabase: Any, session_id: str
) -> set[str]:
    rows = _safe(
        lambda: (
            supabase.table("onboarding_answers")
            .select("field_key, session_id")
            .eq("session_id", session_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return {r.get("field_key") for r in rows if r.get("field_key")}


def _fan_out_answers(supabase: Any, anonymous_id: str, user_id: str) -> dict[str, int]:
    """Replay the unified answer log into its canonical per-source tables."""
    log_rows = _safe(
        lambda: (
            supabase.table("onboarding_session_answers")
            .select(
                "id, session_id, question_source, question_key, answer_value, "
                "normalized_value, skipped"
            )
            .eq("anonymous_id", anonymous_id)
            .limit(500)
            .execute()
            .data
        ),
        default=[],
    ) or []

    persona_existing = _existing_persona_keys(supabase, user_id)
    onboarding_existing: dict[str, set[str]] = {}
    persona_written = 0
    recruitment_written = 0

    for row in log_rows:
        if row.get("skipped"):
            continue
        source = row.get("question_source")
        key = row.get("question_key")
        if not key:
            continue

        if source == "persona_question_bank":
            if key in persona_existing:
                continue  # dedupe — never duplicate an existing answer
            inserted = _safe(
                lambda r=row, k=key: (
                    supabase.table("persona_question_answers")
                    .insert(
                        {
                            "user_id": user_id,
                            "question_key": k,
                            "answer_value": r.get("answer_value"),
                            "normalized_value": r.get("normalized_value"),
                            "skipped": False,
                            "source": "unified_onboarding_stitch",
                        }
                    )
                    .execute()
                    .data
                ),
                default=None,
            )
            if inserted is not None:
                persona_existing.add(key)
                persona_written += 1

        elif source == "recruitment_question_requirements":
            session_id = row.get("session_id")
            if session_id not in onboarding_existing:
                onboarding_existing[session_id] = _existing_onboarding_answer_keys(
                    supabase, session_id
                )
            if key in onboarding_existing[session_id]:
                continue  # dedupe
            inserted = _safe(
                lambda r=row, k=key, sid=session_id: (
                    supabase.table("onboarding_answers")
                    .insert(
                        {
                            "session_id": sid,
                            "user_id": user_id,
                            "field_key": k,
                            "answer_value": r.get("answer_value"),
                            "normalized_value": r.get("normalized_value"),
                            "source": "unified_onboarding_stitch",
                        }
                    )
                    .execute()
                    .data
                ),
                default=None,
            )
            if inserted is not None:
                onboarding_existing[session_id].add(key)
                recruitment_written += 1
        # intent_picker answers stay session-only — nothing to fan out.

    return {
        "persona_answers_written": persona_written,
        "recruitment_answers_written": recruitment_written,
    }


def _resumable_session(supabase: Any, user_id: str) -> dict[str, Any] | None:
    rows = _safe(
        lambda: (
            supabase.table("onboarding_sessions")
            .select(
                "id, user_id, anonymous_id, entry_mode, intent, recruitment_id, "
                "post_id, question_count, asked_question_keys, status, "
                "current_question_key, current_question_source, created_at"
            )
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def stitch_anonymous_sessions(
    supabase: Any, anonymous_id: str, user_id: str
) -> dict[str, Any]:
    """Claim + fan out anonymous progress for ``user_id``; idempotent."""
    if not anonymous_id or not user_id:
        return {
            "stitched": False,
            "reason": "missing_anonymous_id_or_user_id",
            "session": None,
        }

    claimed_funnel = _claim_rows(supabase, "funnel_sessions", anonymous_id, user_id)
    claimed_sessions = _claim_rows(
        supabase, "onboarding_sessions", anonymous_id, user_id
    )
    claimed_answers = _claim_rows(
        supabase, "onboarding_session_answers", anonymous_id, user_id
    )
    fan_out = _fan_out_answers(supabase, anonymous_id, user_id)
    session = _resumable_session(supabase, user_id)

    return {
        "stitched": True,
        "claimed": {
            "funnel_sessions": claimed_funnel,
            "onboarding_sessions": claimed_sessions,
            "onboarding_session_answers": claimed_answers,
        },
        **fan_out,
        "session": session,
    }
