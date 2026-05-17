"""AI chat API — Supabase-backed.

Supersedes the in-memory placeholder at /ai/{guidance,chat,history}. All
messages are durable so the weekly-review service, KPI pipeline, and
copyright/abuse moderation can read them. Replies are still rule-based
(scripted) — wiring a real LLM provider is a follow-up PR; the contract
here doesn't change when that lands.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(prefix="/ai", tags=["ai"])


INTENTS = {"study", "strategy", "wellbeing", "exam_policy", "other"}

SCRIPTED_REPLIES = [
    "Got it. Based on your last 7 days, the highest-leverage move is closing one Quant topic — pick the weakest and run a 60-minute drill.",
    "Your focus streak is solid. Keep the morning slot sacred and add one full-length mock this weekend.",
    "Don't overthink the GA gap. Use a single curated source and a 30-minute daily slot — that's enough to recover by Friday.",
    "If RBI Grade B is on your list, prioritise ESI + F&M reading; objective is volume, not speed.",
    "Consistency over intensity. A 75-minute day for 5 days beats a 6-hour Sunday binge.",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_uuid(v: Any) -> bool:
    try:
        UUID(str(v))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _shape_conv(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "topic": row.get("topic"),
        "exam_slug": row.get("exam_slug"),
        "intent": row.get("intent"),
        "message_count": row.get("message_count") or 0,
        "last_message_at": row.get("last_message_at"),
        "is_archived": bool(row.get("is_archived")),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _shape_msg(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "conversation_id": row.get("conversation_id"),
        "role": row.get("role"),
        "content": row.get("content"),
        "model": row.get("model"),
        "confidence": float(row["confidence"]) if row.get("confidence") is not None else None,
        "is_flagged": bool(row.get("is_flagged")),
        "flag_reason": row.get("flag_reason"),
        "prompt_id": row.get("prompt_id"),
        "metadata": row.get("metadata") or {},
        "created_at": row.get("created_at"),
    }


def _bump_counts(sb, conv_id: str, increment: int = 2) -> None:
    row = (
        sb.table("ai_conversations")
        .select("message_count")
        .eq("id", conv_id)
        .limit(1)
        .execute()
        .data
    )
    if not row:
        return
    sb.table("ai_conversations").update(
        {
            "message_count": (row[0].get("message_count") or 0) + increment,
            "last_message_at": _now_iso(),
            "updated_at": _now_iso(),
        }
    ).eq("id", conv_id).execute()


# ───────────────────────────── Guidance ─────────────────────────────


@router.get("/guidance")
def guidance(user: dict = Depends(get_current_user)) -> dict:
    """Deterministic personalised next-actions panel.

    Reads recent focus + task signals so the call is real even without an
    LLM. If reads fail the response is still useful (generic guidance) —
    the UI never blocks on this.
    """
    sb = get_supabase_admin()
    name = user.get("name") or "aspirant"

    next_actions: list[dict] = []
    warnings: list[str] = []
    try:
        focus_recent = (
            sb.table("study_sessions")
            .select("started_at,duration_minutes,subject_id")
            .eq("user_id", user["id"])
            .order("started_at", desc=True)
            .limit(7)
            .execute()
            .data
            or []
        )
        if not focus_recent:
            next_actions.append({"label": "Start with a 25-minute focus block", "type": "focus"})
        else:
            total = sum(int(s.get("duration_minutes") or 0) for s in focus_recent)
            if total < 90:
                warnings.append("Focus minutes are low this week — pick one weak subject and run a single sprint today.")
            next_actions.append({"label": "Take a 25-min focus block", "type": "focus"})
    except Exception:
        next_actions.append({"label": "Take a 25-min focus block", "type": "focus"})

    try:
        open_mistakes = (
            sb.table("mistake_entries")
            .select("id", count="exact")
            .eq("user_id", user["id"])
            .eq("status", "open")
            .execute()
        )
        cnt = getattr(open_mistakes, "count", None) or 0
        if cnt:
            next_actions.append({"label": f"Drill {min(cnt, 5)} open mistakes", "type": "review"})
    except Exception:
        pass

    next_actions.append({"label": "Close one weak topic today", "type": "study"})

    return {
        "greeting": f"Hey {name} — your plan is ready.",
        "next_actions": next_actions,
        "warnings": warnings,
    }


# ───────────────────────────── Conversations ─────────────────────────────


class ConvUpsert(BaseModel):
    title: str = Field(default="New conversation", max_length=120)
    topic: str | None = None
    exam_slug: str | None = None
    intent: str = "study"


@router.get("/conversations")
def list_conversations(user: dict = Depends(get_current_user), limit: int = Query(default=50, ge=1, le=200)) -> dict:
    sb = get_supabase_admin()
    rows = (
        sb.table("ai_conversations")
        .select("*")
        .eq("user_id", user["id"])
        .eq("is_archived", False)
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {"conversations": [_shape_conv(r) for r in rows]}


@router.post("/conversations")
def create_conversation(body: ConvUpsert, user: dict = Depends(get_current_user)) -> dict:
    if body.intent not in INTENTS:
        raise HTTPException(status_code=400, detail=f"intent must be one of {sorted(INTENTS)}")
    sb = get_supabase_admin()
    payload = body.model_dump()
    payload["user_id"] = user["id"]
    row = sb.table("ai_conversations").insert(payload).execute().data
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create conversation")
    return _shape_conv(row[0])


# ───────────────────────────── Chat ─────────────────────────────


class ChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    intent: str = "study"
    prompt_id: str | None = None


@router.post("/chat")
def chat(body: ChatBody, user: dict = Depends(get_current_user)) -> dict:
    sb = get_supabase_admin()

    # Locate or create the conversation.
    conv_id = body.conversation_id if body.conversation_id and _is_uuid(body.conversation_id) else None
    if conv_id:
        owned = (
            sb.table("ai_conversations")
            .select("id")
            .eq("id", conv_id)
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
            .data
        )
        if not owned:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        intent = body.intent if body.intent in INTENTS else "study"
        title = body.message[:80] + ("…" if len(body.message) > 80 else "")
        created = (
            sb.table("ai_conversations")
            .insert({"user_id": user["id"], "title": title, "intent": intent})
            .execute()
            .data
        )
        if not created:
            raise HTTPException(status_code=500, detail="Failed to start conversation")
        conv_id = created[0]["id"]

    # Pick a deterministic reply based on existing message count so repeats vary.
    count_row = (
        sb.table("ai_messages")
        .select("id", count="exact")
        .eq("conversation_id", conv_id)
        .execute()
    )
    prior = getattr(count_row, "count", None) or 0
    reply_text = SCRIPTED_REPLIES[prior % len(SCRIPTED_REPLIES)]

    user_msg = (
        sb.table("ai_messages")
        .insert(
            {
                "conversation_id": conv_id,
                "user_id": user["id"],
                "role": "user",
                "content": body.message,
                "prompt_id": body.prompt_id,
            }
        )
        .execute()
        .data
    )
    bot_msg = (
        sb.table("ai_messages")
        .insert(
            {
                "conversation_id": conv_id,
                "user_id": user["id"],
                "role": "assistant",
                "content": reply_text,
                "model": "scripted-v1",
                "confidence": 0.50,
                "prompt_id": body.prompt_id,
                "metadata": {"reply_index": prior % len(SCRIPTED_REPLIES)},
            }
        )
        .execute()
        .data
    )
    _bump_counts(sb, conv_id, increment=2)

    return {
        "conversation_id": conv_id,
        "reply": _shape_msg(bot_msg[0]) if bot_msg else None,
        "user_message": _shape_msg(user_msg[0]) if user_msg else None,
    }


@router.get("/history")
def history(
    conversation_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    user: dict = Depends(get_current_user),
) -> dict:
    sb = get_supabase_admin()
    q = sb.table("ai_messages").select("*").eq("user_id", user["id"])
    if conversation_id:
        if not _is_uuid(conversation_id):
            raise HTTPException(status_code=400, detail="Invalid conversation_id")
        q = q.eq("conversation_id", conversation_id).order("created_at")
    else:
        q = q.order("created_at", desc=True)
    rows = q.limit(limit).execute().data or []
    if not conversation_id:
        rows = list(reversed(rows))
    return {"items": [_shape_msg(r) for r in rows]}


class FlagBody(BaseModel):
    reason: str = Field(min_length=4, max_length=500)


@router.post("/messages/{message_id}/flag")
def flag_message(message_id: str, body: FlagBody, user: dict = Depends(get_current_user)) -> dict:
    """Self-report a bad AI response so trust ops can review.

    Writes the flag onto the message AND files a moderation_items row so it
    shows up in the queue we built in PR 095.
    """
    if not _is_uuid(message_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    sb = get_supabase_admin()
    msg = (
        sb.table("ai_messages")
        .select("*")
        .eq("id", message_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
    )
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    sb.table("ai_messages").update(
        {"is_flagged": True, "flag_reason": body.reason}
    ).eq("id", message_id).execute()
    try:
        sb.table("moderation_items").insert(
            {
                "entity_type": "ai_response",
                "entity_id": message_id,
                "severity": "p2",
                "severity_rubric_version": "v1",
                "reason": body.reason,
                "reason_code": "ai_response_quality",
                "reporter_id": user["id"],
                "reporter_role": user.get("role") or "user",
                "metadata": {"conversation_id": msg[0].get("conversation_id")},
            }
        ).execute()
    except Exception:
        pass
    return {"ok": True, "id": message_id}
