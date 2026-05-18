"""Session lifecycle for the unified onboarding engine.

One ``onboarding_sessions`` row backs both entry modes. A companion
``funnel_sessions`` row carries the funnel/UTM context (and the
``anonymous_id`` for pre-login persistence). Every presented question —
answered or skipped — is appended to ``onboarding_session_answers``,
which is the engine's source-agnostic answer log (NOT canonical profile
truth).

All Supabase calls are defensive: a missing table or a transient error
degrades to "no session / empty log" rather than a 5xx.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable
from app.onboarding_unified.anonymous_stitching import stitch_anonymous_sessions

logger = logging.getLogger("career_copilot.onboarding_unified.session")

_SESSION_COLUMNS = (
    "id, user_id, anonymous_id, funnel_session_id, mode, entry_mode, intent, "
    "recruitment_id, post_id, current_question_key, current_question_source, "
    "asked_question_keys, question_count, missing_fields, completed_fields, "
    "status, created_at, updated_at"
)

_ANSWER_COLUMNS = (
    "id, session_id, user_id, anonymous_id, question_source, question_key, "
    "answer_value, normalized_value, skipped, created_at"
)


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("onboarding_unified.session supabase call failed: %s", exc)
        return default


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _asked_keys(session: dict[str, Any]) -> list[str]:
    raw = session.get("asked_question_keys") or []
    if isinstance(raw, list):
        return [str(k) for k in raw]
    return []


# ─── session lookup / creation ───────────────────────────────────────────
def load_session(supabase: Any, session_id: str) -> dict[str, Any] | None:
    if not session_id:
        return None
    rows = _safe(
        lambda: (
            supabase.table("onboarding_sessions")
            .select(_SESSION_COLUMNS)
            .eq("id", session_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return rows[0] if rows else None


def _list_active_sessions(
    supabase: Any, *, user_id: str | None, anonymous_id: str | None
) -> list[dict[str, Any]]:
    if not user_id and not anonymous_id:
        return []
    column, value = ("user_id", user_id) if user_id else ("anonymous_id", anonymous_id)
    rows = _safe(
        lambda: (
            supabase.table("onboarding_sessions")
            .select(_SESSION_COLUMNS)
            .eq(column, value)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return list(rows)


def _list_active_sessions_by_user_and_anonymous(
    supabase: Any, *, user_id: str, anonymous_id: str
) -> list[dict[str, Any]]:
    user_rows = _safe(
        lambda: (
            supabase.table("onboarding_sessions")
            .select(_SESSION_COLUMNS)
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
        ),
        default=[],
    ) or []
    anon_rows = _safe(
        lambda: (
            supabase.table("onboarding_sessions")
            .select(_SESSION_COLUMNS)
            .eq("anonymous_id", anonymous_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
        ),
        default=[],
    ) or []
    seen = set()
    out = []
    for row in [*anon_rows, *user_rows]:
        sid = row.get("id")
        if sid and sid not in seen:
            seen.add(sid)
            out.append(row)
    return out


def _find_resumable_session(
    supabase: Any,
    *,
    user_id: str | None,
    anonymous_id: str | None,
    recruitment_id: str | None,
) -> dict[str, Any] | None:
    """Resume an active session for this identity in the same context.

    A CTA session is keyed to its recruitment; a cold session has none.
    If the incoming context doesn't match any active session we let the
    caller create a fresh one rather than cross-wiring contexts.
    """
    if user_id and anonymous_id:
        sessions = _list_active_sessions_by_user_and_anonymous(
            supabase, user_id=user_id, anonymous_id=anonymous_id
        )
    else:
        sessions = _list_active_sessions(
            supabase, user_id=user_id, anonymous_id=anonymous_id
        )
    for sess in sessions:
        if recruitment_id:
            if sess.get("recruitment_id") == recruitment_id:
                return sess
        else:
            if not sess.get("recruitment_id"):
                return sess
    return None


def _create_funnel_session(
    supabase: Any,
    *,
    user_id: str | None,
    anonymous_id: str | None,
    intent: str | None,
    recruitment_id: str | None,
    post_id: str | None,
    source: str | None,
) -> str | None:
    payload = {
        "user_id": user_id,
        "anonymous_id": anonymous_id,
        "recruitment_id": recruitment_id,
        "post_id": post_id,
        # funnel_sessions.intent is NOT NULL — a cold session with no intent
        # yet still records that it began as a discovery funnel.
        "intent": intent or "discovery",
        "source": source,
        "status": "started",
    }
    rows = _safe(
        lambda: supabase.table("funnel_sessions").insert(payload).execute().data,
        default=None,
    )
    if isinstance(rows, list) and rows:
        return rows[0].get("id")
    return None


def get_or_create_session(
    supabase: Any,
    *,
    user_id: str | None = None,
    anonymous_id: str | None = None,
    entry_mode: str = "cold",
    intent: str | None = None,
    recruitment_id: str | None = None,
    post_id: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    """Resume or create the unified onboarding session for this caller."""
    existing = _find_resumable_session(
        supabase,
        user_id=user_id,
        anonymous_id=anonymous_id,
        recruitment_id=recruitment_id,
    )
    if existing:
        if user_id and anonymous_id and not existing.get("user_id") and existing.get("anonymous_id") == anonymous_id:
            stitched = stitch_anonymous_sessions(supabase, anonymous_id, user_id)
            resumed = stitched.get("session")
            if isinstance(resumed, dict) and resumed.get("id"):
                return resumed
        patch: dict[str, Any] = {}
        # Backfill context that becomes known mid-flow (e.g. intent picked,
        # or an anonymous session that just learned its user_id).
        if intent and not existing.get("intent"):
            patch["intent"] = intent
        if user_id and not existing.get("user_id"):
            patch["user_id"] = user_id
        if recruitment_id and not existing.get("recruitment_id"):
            patch["recruitment_id"] = recruitment_id
        if post_id and not existing.get("post_id"):
            patch["post_id"] = post_id
        if patch:
            patch["updated_at"] = _now_iso()
            updated = update_session(supabase, existing["id"], patch)
            return updated or {**existing, **patch}
        return existing

    funnel_session_id = _create_funnel_session(
        supabase,
        user_id=user_id,
        anonymous_id=anonymous_id,
        intent=intent,
        recruitment_id=recruitment_id,
        post_id=post_id,
        source=source,
    )
    payload = {
        "user_id": user_id,
        "anonymous_id": anonymous_id,
        "funnel_session_id": funnel_session_id,
        "mode": "chat",
        "entry_mode": entry_mode,
        "intent": intent,
        "recruitment_id": recruitment_id,
        "post_id": post_id,
        "asked_question_keys": [],
        "question_count": 0,
        "status": "active",
    }
    rows = _safe(
        lambda: supabase.table("onboarding_sessions").insert(payload).execute().data,
        default=None,
    )
    if isinstance(rows, list) and rows:
        return rows[0]
    # Stub/degraded path — return the payload so callers stay functional.
    payload.setdefault("id", "onboarding-session-local")
    return payload


def update_session(
    supabase: Any, session_id: str, patch: dict[str, Any]
) -> dict[str, Any] | None:
    if not session_id or not patch:
        return None
    rows = _safe(
        lambda: (
            supabase.table("onboarding_sessions")
            .update(patch)
            .eq("id", session_id)
            .execute()
            .data
        ),
        default=None,
    )
    if isinstance(rows, list) and rows:
        return rows[0]
    return None


def set_current_question(
    supabase: Any,
    session_id: str,
    question_key: str | None,
    question_source: str | None,
) -> None:
    update_session(
        supabase,
        session_id,
        {
            "current_question_key": question_key,
            "current_question_source": question_source,
            "updated_at": _now_iso(),
        },
    )


def mark_session_completed(supabase: Any, session_id: str) -> None:
    update_session(
        supabase,
        session_id,
        {"status": "completed", "updated_at": _now_iso()},
    )


# ─── answer log ──────────────────────────────────────────────────────────
def load_answer_log(supabase: Any, session_id: str) -> list[dict[str, Any]]:
    if not session_id:
        return []
    rows = _safe(
        lambda: (
            supabase.table("onboarding_session_answers")
            .select(_ANSWER_COLUMNS)
            .eq("session_id", session_id)
            .order("created_at")
            .limit(200)
            .execute()
            .data
        ),
        default=[],
    ) or []
    return list(rows)


def answered_keys(answer_log: list[dict[str, Any]]) -> set[str]:
    """Question keys with a real (non-skipped) answer."""
    return {
        row.get("question_key")
        for row in answer_log
        if row.get("question_key") and not row.get("skipped")
    }


def record_answer(
    supabase: Any,
    session: dict[str, Any],
    *,
    question_source: str,
    question_key: str,
    answer_value: Any,
    normalized_value: Any,
    skipped: bool = False,
    defer_session_patch: bool = False,
) -> dict[str, Any]:
    """Append to the answer log and advance the session's asked/count state.

    When ``defer_session_patch`` is True the session row is updated
    in-memory only — the caller is responsible for issuing a single
    consolidated UPDATE that folds in the new ``asked_question_keys`` /
    ``question_count`` (and any other fields, e.g. ``intent``,
    ``current_question_key``). This collapses 2–3 round-trips per answer
    into one.
    """
    session_id = session.get("id")
    payload = {
        "session_id": session_id,
        "user_id": session.get("user_id"),
        "anonymous_id": session.get("anonymous_id"),
        "question_source": question_source,
        "question_key": question_key,
        "answer_value": answer_value,
        "normalized_value": normalized_value,
        "skipped": bool(skipped),
    }
    rows = _safe(
        lambda: (
            supabase.table("onboarding_session_answers")
            .insert(payload)
            .execute()
            .data
        ),
        default=None,
    )
    saved = rows[0] if isinstance(rows, list) and rows else payload

    asked = _asked_keys(session)
    if question_key not in asked:
        asked.append(question_key)
        new_count = int(session.get("question_count") or 0) + 1
        if not defer_session_patch:
            update_session(
                supabase,
                session_id,
                {
                    "asked_question_keys": asked,
                    "question_count": new_count,
                    "updated_at": _now_iso(),
                },
            )
        session["asked_question_keys"] = asked
        session["question_count"] = new_count
    return saved


def belongs_to_caller(
    session: dict[str, Any] | None,
    *,
    user_id: str | None,
    anonymous_id: str | None,
) -> bool:
    """True when the session is owned by the calling user or anon id."""
    if not session:
        return False
    if user_id and session.get("user_id") == user_id:
        return True
    if anonymous_id and session.get("anonymous_id") == anonymous_id:
        return True
    # A freshly authenticated caller may own an as-yet-unstitched anon
    # session; the stitch endpoint claims it explicitly, so we don't widen
    # ownership here.
    return False
