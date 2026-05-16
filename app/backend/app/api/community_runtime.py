"""Durable community/social runtime routes.

These routes intentionally shadow the older seed-backed community endpoints.
They use the canonical tables that already exist for forum, study groups,
accountability partners, mentor bookings, marketplace mentors, and the
community resource library.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl

from app.core.auth import get_current_user, get_optional_user
from app.db.supabase_client import get_supabase_admin


router = APIRouter(tags=["community-runtime"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_uuid(value: Any) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _rows(query) -> list[dict[str, Any]]:
    return query.execute().data or []


def _first(query) -> dict[str, Any] | None:
    rows = _rows(query.limit(1))
    return rows[0] if rows else None


def _resolve_channel_id(sb, channel_ref: str) -> str | None:
    """Resolve channel route param to canonical UUID id.

    Supports both UUID ids and slug-based ids used by seeded/demo data.
    """
    if _is_uuid(channel_ref):
        return channel_ref
    row = _first(sb.table("community_channels").select("id").eq("slug", channel_ref))
    return row.get("id") if row else None


def _resolve_thread_id(sb, channel_id: str, thread_ref: str) -> str | None:
    """Resolve thread route param to canonical UUID id within a channel.

    Accepts UUID ids directly and falls back to slug/title matching for
    non-UUID route values (ex: ``/threads/f1`` from legacy UI state).
    """
    if _is_uuid(thread_ref):
        return thread_ref
    for key in ("slug", "legacy_key", "thread_code"):
        row = _safe(
            lambda: _first(
                sb.table("community_threads")
                .select("id")
                .eq("channel_id", channel_id)
                .eq(key, thread_ref)
            )
        )
        if row:
            return row.get("id")
    # Last-resort deterministic fallback: oldest visible thread in channel for
    # short legacy ids that are not persisted in DB columns.
    fallback = _first(
        sb.table("community_threads")
        .select("id")
        .eq("channel_id", channel_id)
        .eq("status", "visible")
        .order("created_at")
    )
    return fallback.get("id") if fallback else None


def _safe(call, default=None):
    try:
        return call()
    except Exception:
        return default


def _profile_name(row: dict[str, Any] | None, fallback: str | None = None) -> str | None:
    if not row:
        return fallback
    return row.get("display_name") or row.get("full_name") or fallback


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    if (user.get("role") or "") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def _audit(sb, actor: dict, action: str, entity_type: str, entity_id: str | None, payload: dict | None = None) -> None:
    _safe(
        lambda: sb.table("admin_audit_logs")
        .insert(
            {
                "actor_id": actor.get("id"),
                "actor_email": actor.get("email"),
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "new_value": payload or {},
                "notes": "community_runtime",
            }
        )
        .execute()
    )


def _event(sb, user_id: str, event_name: str, metadata: dict | None = None) -> None:
    _safe(
        lambda: sb.table("user_events")
        .insert(
            {
                "user_id": user_id,
                "event_name": event_name,
                "event_type": "community",
                "source": "community_runtime",
                "metadata": metadata or {},
            }
        )
        .execute()
    )


def _notify(sb, user_id: str | None, alert_type: str, explanation: dict | None = None) -> None:
    if not user_id:
        return
    _safe(
        lambda: sb.table("notification_alerts")
        .insert(
            {
                "user_id": user_id,
                "alert_type": alert_type,
                "priority": 2,
                "explanation": explanation or {},
            }
        )
        .execute()
    )


def _rpc_inc(sb, fn_name: str, params: dict[str, Any], fallback_table: str, fallback_id: str, fallback_col: str, fallback_delta: int) -> int | None:
    """Call an atomic-increment RPC. Returns the post-update counter value.

    Falls back to a best-effort read-modify-write if the RPC is unavailable
    (e.g. older deployments without migration 089). The fallback is racy by
    construction and only exists so the endpoint doesn't 500 in that case.
    """
    try:
        result = sb.rpc(fn_name, params).execute()
        value = getattr(result, "data", None)
        if isinstance(value, list) and value:
            value = value[0]
        if isinstance(value, dict):
            value = next(iter(value.values()), None)
        if value is not None:
            return int(value)
    except Exception:
        pass
    current = _first(sb.table(fallback_table).select(f"id, {fallback_col}").eq("id", fallback_id))
    if not current:
        return None
    new_val = max(0, (current.get(fallback_col) or 0) + fallback_delta)
    sb.table(fallback_table).update({fallback_col: new_val}).eq("id", fallback_id).execute()
    return new_val


# Community / forum


def _shape_space(row: dict[str, Any], channels: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name") or row.get("slug"),
        "label": row.get("name") or row.get("slug"),
        "slug": row.get("slug"),
        "description": row.get("description"),
        "members": row.get("member_count") or 0,
        "online": 0,
        "channels": [_shape_channel(c) for c in channels],
    }


def _shape_channel(row: dict[str, Any]) -> dict[str, Any]:
    locked = row.get("locked_admin_write")
    if locked is None:
        locked = row.get("channel_type") in {"official", "admin"}
    return {
        "id": row.get("id"),
        "name": row.get("name") or row.get("slug"),
        "slug": row.get("slug"),
        "purpose": row.get("purpose") or row.get("description") or row.get("channel_type") or "Discussion channel.",
        "lockedAdminWrite": bool(locked),
        "unread": 0,
        "pinned": row.get("pinned_count") or 0,
        "members": row.get("member_count") or 0,
    }


def _shape_thread(row: dict[str, Any], uid: str | None = None, replies: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    author = row.get("profiles") if isinstance(row.get("profiles"), dict) else None
    return {
        "id": row.get("id"),
        "channelId": row.get("channel_id"),
        "title": row.get("title"),
        "body": row.get("body"),
        "author": row.get("author_id"),
        "authorName": _profile_name(author, row.get("author_id")),
        "flair": row.get("flair") or row.get("tag") or "discussion",
        "upvotes": row.get("vote_count") or 0,
        "downvotes": 0,
        "netVotes": row.get("vote_count") or 0,
        "youVoted": row.get("you_voted") if uid else 0,
        "replies": row.get("reply_count") or len(replies or []),
        "createdAt": row.get("created_at") or row.get("updated_at"),
        "pinned": bool(row.get("is_pinned")),
        "repliesLocked": bool(row.get("is_locked")),
        "topReplies": replies or [],
    }


def _shape_reply(row: dict[str, Any], uid: str | None = None) -> dict[str, Any]:
    author = row.get("profiles") if isinstance(row.get("profiles"), dict) else None
    return {
        "id": row.get("id"),
        "author": row.get("author_id"),
        "authorName": _profile_name(author, row.get("author_id")),
        "body": row.get("body"),
        "upvotes": row.get("vote_count") or 0,
        "netVotes": row.get("vote_count") or 0,
        "youVoted": row.get("you_voted") if uid else 0,
        "createdAt": row.get("created_at"),
    }


@router.get("/community/spaces")
async def list_spaces():
    sb = get_supabase_admin()
    spaces = _rows(
        sb.table("community_spaces")
        .select("id, name, slug, description, is_active, created_at")
        .eq("is_active", True)
        .order("created_at")
    )
    channels = _rows(
        sb.table("community_channels")
        .select("id, space_id, name, slug, channel_type, is_active, created_at")
        .eq("is_active", True)
        .order("created_at")
    )
    by_space: dict[str, list[dict[str, Any]]] = {}
    for channel in channels:
        by_space.setdefault(str(channel.get("space_id")), []).append(channel)
    return {
        "spaces": [_shape_space(s, by_space.get(str(s.get("id")), [])) for s in spaces],
        "users": {},
        "threads": {},
        "flairs": {},
        "channel_rules": {},
    }


@router.get("/community/channels/{channel_id}/threads")
async def list_channel_threads(
    channel_id: str,
    sort: str = Query(default="hot"),
    user: dict | None = Depends(get_optional_user),
):
    sb = get_supabase_admin()
    resolved_channel_id = _resolve_channel_id(sb, channel_id)
    if not resolved_channel_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    q = (
        sb.table("community_threads")
        .select("id, channel_id, author_id, title, body, status, is_locked, reply_count, vote_count, created_at, updated_at")
        .eq("channel_id", resolved_channel_id)
        .eq("status", "visible")
    )
    if sort == "new":
        q = q.order("created_at", desc=True)
    elif sort == "unanswered":
        q = q.eq("reply_count", 0).order("created_at", desc=True)
    else:
        q = q.order("vote_count", desc=True).order("created_at", desc=True)
    return {"items": [_shape_thread(t, (user or {}).get("id")) for t in _rows(q.limit(50))], "channelId": channel_id}


@router.get("/community/channels/{channel_id}/threads/{thread_id}")
async def get_channel_thread(channel_id: str, thread_id: str, user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    resolved_channel_id = _resolve_channel_id(sb, channel_id)
    if not resolved_channel_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    resolved_thread_id = _resolve_thread_id(sb, resolved_channel_id, thread_id)
    if not resolved_thread_id:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread = _first(
        sb.table("community_threads")
        .select("id, channel_id, author_id, title, body, status, is_locked, reply_count, vote_count, created_at, updated_at")
        .eq("id", resolved_thread_id)
        .eq("channel_id", resolved_channel_id)
    )
    if not thread or thread.get("status") != "visible":
        raise HTTPException(status_code=404, detail="Thread not found")
    replies = _rows(
        sb.table("community_replies")
        .select("id, thread_id, author_id, body, status, vote_count, created_at")
        .eq("thread_id", resolved_thread_id)
        .eq("status", "visible")
        .order("created_at")
    )
    shaped = [_shape_reply(r, (user or {}).get("id")) for r in replies]
    return {"thread": _shape_thread(thread, (user or {}).get("id"), shaped), "replies": shaped}


class ThreadCreate(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    body: str = Field(min_length=10, max_length=4000)
    flair: str | None = Field(default="discussion", max_length=24)


@router.post("/community/channels/{channel_id}/threads")
async def create_channel_thread(channel_id: str, payload: ThreadCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    resolved_channel_id = _resolve_channel_id(sb, channel_id)
    if not resolved_channel_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    channel = _first(sb.table("community_channels").select("id, space_id, channel_type").eq("id", resolved_channel_id))
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel.get("channel_type") in {"official", "admin"} and user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Channel is admin-write only")
    inserted = _rows(
        sb.table("community_threads")
        .insert(
            {
                "space_id": channel.get("space_id"),
                "channel_id": resolved_channel_id,
                "author_id": user["id"],
                "title": payload.title.strip(),
                "body": payload.body.strip(),
                "status": "visible",
            }
        )
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Could not create thread")
    _event(sb, user["id"], "community.thread.created", {"thread_id": inserted[0]["id"], "channel_id": resolved_channel_id})
    return _shape_thread(inserted[0], user["id"])


class ReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.post("/community/channels/{channel_id}/threads/{thread_id}/replies")
async def create_thread_reply(channel_id: str, thread_id: str, payload: ReplyCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    resolved_channel_id = _resolve_channel_id(sb, channel_id)
    if not resolved_channel_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    resolved_thread_id = _resolve_thread_id(sb, resolved_channel_id, thread_id)
    if not resolved_thread_id:
        raise HTTPException(status_code=404, detail="Thread not found")
    thread = _first(
        sb.table("community_threads")
        .select("id, author_id, is_locked, reply_count")
        .eq("id", resolved_thread_id)
        .eq("channel_id", resolved_channel_id)
    )
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if thread.get("is_locked"):
        raise HTTPException(status_code=423, detail="Replies are locked on this thread")
    inserted = _rows(
        sb.table("community_replies")
        .insert({"thread_id": resolved_thread_id, "author_id": user["id"], "body": payload.body.strip(), "status": "visible"})
    )
    _rpc_inc(
        sb,
        "community_inc_thread_reply_count",
        {"p_thread_id": resolved_thread_id, "p_delta": 1},
        "community_threads", resolved_thread_id, "reply_count", 1,
    )
    _event(sb, user["id"], "community.reply.created", {"thread_id": resolved_thread_id})
    _notify(sb, thread.get("author_id"), "community_reply", {"thread_id": resolved_thread_id})
    return _shape_reply(inserted[0], user["id"]) if inserted else {}


class VotePayload(BaseModel):
    direction: int = Field(default=1)


@router.post("/community/channels/{channel_id}/threads/{thread_id}/vote")
async def vote_channel_thread(channel_id: str, thread_id: str, payload: VotePayload, user: dict = Depends(get_current_user)):
    if payload.direction not in (-1, 0, 1):
        raise HTTPException(status_code=400, detail="direction must be -1, 0, or 1")
    sb = get_supabase_admin()
    thread = _first(sb.table("community_threads").select("id, vote_count").eq("id", thread_id).eq("channel_id", channel_id))
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    existing = _first(sb.table("community_votes").select("id, vote").eq("thread_id", thread_id).eq("user_id", user["id"]))
    old_vote = int((existing or {}).get("vote") or 0)
    new_vote = 0 if payload.direction == 0 or old_vote == payload.direction else payload.direction
    if existing and new_vote == 0:
        sb.table("community_votes").delete().eq("id", existing["id"]).execute()
    elif existing:
        sb.table("community_votes").update({"vote": new_vote}).eq("id", existing["id"]).execute()
    elif new_vote:
        sb.table("community_votes").insert({"thread_id": thread_id, "user_id": user["id"], "vote": new_vote}).execute()
    delta = new_vote - old_vote
    net = _rpc_inc(
        sb,
        "community_inc_thread_vote_count",
        {"p_thread_id": thread_id, "p_delta": delta},
        "community_threads", thread_id, "vote_count", delta,
    )
    if net is None:
        net = (thread.get("vote_count") or 0) + delta
    _event(sb, user["id"], "community.thread.voted", {"thread_id": thread_id, "vote": new_vote})
    return {"threadId": thread_id, "yourVote": new_vote, "netVotes": net}


@router.post("/community/channels/{channel_id}/threads/{thread_id}/replies/{reply_id}/vote")
async def vote_thread_reply(
    channel_id: str,
    thread_id: str,
    reply_id: str,
    payload: VotePayload,
    user: dict = Depends(get_current_user),
):
    if payload.direction not in (-1, 0, 1):
        raise HTTPException(status_code=400, detail="direction must be -1, 0, or 1")
    sb = get_supabase_admin()
    thread = _first(sb.table("community_threads").select("id").eq("id", thread_id).eq("channel_id", channel_id))
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    reply = _first(sb.table("community_replies").select("id, vote_count").eq("id", reply_id).eq("thread_id", thread_id))
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    existing = _first(sb.table("community_votes").select("id, vote").eq("reply_id", reply_id).eq("user_id", user["id"]))
    old_vote = int((existing or {}).get("vote") or 0)
    new_vote = 0 if payload.direction == 0 or old_vote == payload.direction else payload.direction
    if existing and new_vote == 0:
        sb.table("community_votes").delete().eq("id", existing["id"]).execute()
    elif existing:
        sb.table("community_votes").update({"vote": new_vote}).eq("id", existing["id"]).execute()
    elif new_vote:
        sb.table("community_votes").insert({"reply_id": reply_id, "user_id": user["id"], "vote": new_vote}).execute()
    delta = new_vote - old_vote
    net = _rpc_inc(
        sb,
        "community_inc_reply_vote_count",
        {"p_reply_id": reply_id, "p_delta": delta},
        "community_replies", reply_id, "vote_count", delta,
    )
    if net is None:
        net = (reply.get("vote_count") or 0) + delta
    _event(sb, user["id"], "community.reply.voted", {"reply_id": reply_id, "thread_id": thread_id, "vote": new_vote})
    return {"replyId": reply_id, "threadId": thread_id, "yourVote": new_vote, "netVotes": net}


class ReportBody(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/community/channels/{channel_id}/threads/{thread_id}/report")
async def report_channel_thread(channel_id: str, thread_id: str, payload: ReportBody, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    if not _first(sb.table("community_threads").select("id").eq("id", thread_id).eq("channel_id", channel_id)):
        raise HTTPException(status_code=404, detail="Thread not found")
    row = _rows(
        sb.table("community_reports").insert(
            {"reporter_id": user["id"], "thread_id": thread_id, "reason": payload.reason.strip(), "status": "pending"}
        )
    )
    _event(sb, user["id"], "community.thread.reported", {"thread_id": thread_id})
    return {"reported": True, "id": (row[0] or {}).get("id") if row else None}


# Study groups


def _shape_group(row: dict[str, Any], joined: bool = False, member_count: int = 0) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "exam": row.get("exam_label") or row.get("exam_id") or "General",
        "visibility": "open" if row.get("visibility") == "public" else row.get("visibility", "private"),
        "status": row.get("status", "active"),
        "members": member_count,
        "maxMembers": row.get("max_members"),
        "isMine": joined or row.get("joined") or False,
        "youRequested": False,
        "nextSession": row.get("next_session"),
    }


@router.get("/community/groups")
async def list_groups(user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    uid = (user or {}).get("id")
    groups = _rows(sb.table("study_groups").select("*").eq("status", "active").limit(80))
    memberships = _rows(sb.table("study_group_members").select("group_id, user_id").eq("status", "active"))
    joined = {m["group_id"] for m in memberships if uid and m.get("user_id") == uid}
    counts: dict[str, int] = {}
    for m in memberships:
        counts[str(m.get("group_id"))] = counts.get(str(m.get("group_id")), 0) + 1
    return {"items": [_shape_group(g, g.get("id") in joined, counts.get(str(g.get("id")), 0)) for g in groups], "total": len(groups)}


@router.get("/community/groups/{group_id}")
async def group_detail(group_id: str, user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    group = _first(sb.table("study_groups").select("*").eq("id", group_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    members = _rows(sb.table("study_group_members").select("id, user_id, role, joined_at, status").eq("group_id", group_id).eq("status", "active"))
    checkins = _rows(
        sb.table("user_events")
        .select("id, user_id, metadata, occurred_at, created_at")
        .eq("event_name", "study_group.checkin")
        .order("created_at", desc=True)
        .limit(30)
    )
    return {
        "group": _shape_group(group, any(m.get("user_id") == (user or {}).get("id") for m in members), len(members)),
        "members": [{"user": {"id": m.get("user_id"), "name": m.get("user_id")}, "joinedAt": m.get("joined_at"), "role": m.get("role")} for m in members],
        "checkins": [{"id": c.get("id"), "u": c.get("user_id"), **(c.get("metadata") or {}), "at": c.get("created_at")} for c in checkins if (c.get("metadata") or {}).get("group_id") == group_id],
        "sessionLog": [],
        "sharedResources": [],
        "nextSession": group.get("next_session"),
    }


@router.post("/community/groups/{group_id}/join")
async def join_group(group_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    group = _first(sb.table("study_groups").select("id, max_members, status").eq("id", group_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.get("status") != "active":
        raise HTTPException(status_code=409, detail="Group is not active")
    row = _rows(
        sb.table("study_group_members").upsert(
            {"group_id": group_id, "user_id": user["id"], "status": "active"},
            on_conflict="group_id,user_id",
        )
    )
    _event(sb, user["id"], "study_group.joined", {"group_id": group_id})
    return {"status": "joined", "groupId": group_id, "membership": row[0] if row else None}


class GroupCheckin(BaseModel):
    body: str = Field(min_length=1, max_length=400)
    hours: float | None = Field(default=None, ge=0, le=24)


@router.post("/community/groups/{group_id}/checkins")
async def post_group_checkin(group_id: str, payload: GroupCheckin, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    if not _first(sb.table("study_groups").select("id").eq("id", group_id)):
        raise HTTPException(status_code=404, detail="Group not found")
    metadata = {"group_id": group_id, "body": payload.body.strip(), "hours": payload.hours}
    row = _rows(sb.table("user_events").insert({"user_id": user["id"], "event_name": "study_group.checkin", "event_type": "community", "metadata": metadata}))
    _notify(sb, user["id"], "study_group_checkin_recorded", {"group_id": group_id})
    return {"id": (row[0] or {}).get("id") if row else None, "u": user["id"], **metadata, "at": _now_iso()}


@router.get("/community/study-rooms")
async def list_study_rooms(user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    uid = (user or {}).get("id")
    sessions = _rows(
        sb.table("social_study_sessions")
        .select("id, session_type, group_id, started_at, ended_at, planned_minutes")
        .eq("session_type", "group")
        .order("started_at", desc=False)
        .limit(50)
    )
    attendance = _rows(sb.table("social_session_attendance").select("session_id, user_id").eq("user_id", uid)) if uid else []
    mine = {a.get("session_id") for a in attendance}
    return {
        "items": [
            {
                "id": s.get("id"),
                "groupId": s.get("group_id"),
                "at": s.get("started_at"),
                "duration": s.get("planned_minutes"),
                "youRsvpd": s.get("id") in mine,
                "confirmed": 0,
                "maxParticipants": 50,
            }
            for s in sessions
        ],
        "week": "current",
    }


@router.post("/community/study-rooms/{session_id}/rsvp")
async def rsvp_room(session_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    if not _first(sb.table("social_study_sessions").select("id").eq("id", session_id)):
        raise HTTPException(status_code=404, detail="Session not found")
    existing = _first(sb.table("social_session_attendance").select("id").eq("session_id", session_id).eq("user_id", user["id"]))
    if existing:
        sb.table("social_session_attendance").delete().eq("id", existing["id"]).execute()
        return {"rsvpd": False, "sessionId": session_id}
    sb.table("social_session_attendance").insert({"session_id": session_id, "user_id": user["id"], "attendance_status": "present"}).execute()
    _event(sb, user["id"], "study_room.rsvped", {"session_id": session_id})
    return {"rsvpd": True, "sessionId": session_id}


# Accountability partner


@router.get("/community/partner")
async def partner_state(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    pair = _first(
        sb.table("accountability_pairs")
        .select("*")
        .eq("status", "active")
        .or_(f"user_a.eq.{user['id']},user_b.eq.{user['id']}")
    )
    partner_id = None
    if pair:
        partner_id = pair.get("user_b") if pair.get("user_a") == user["id"] else pair.get("user_a")
    partner = _first(sb.table("profiles").select("id, full_name, display_name, exam_focus, city").eq("id", partner_id)) if partner_id else None
    requests = _rows(sb.table("accountability_partner_requests").select("*").eq("requester_id", user["id"]).order("created_at", desc=True).limit(10))
    checkins = _rows(
        sb.table("user_events")
        .select("id, metadata, created_at")
        .eq("user_id", user["id"])
        .eq("event_name", "partner.checkin")
        .order("created_at", desc=True)
        .limit(14)
    )
    return {
        "you": {"id": user["id"], "name": user.get("name") or user.get("email")},
        "partner": partner,
        "partnership": pair,
        "recentCheckIns": [{"date": c.get("created_at"), **(c.get("metadata") or {})} for c in checkins],
        "candidates": [{"id": r.get("partner_id"), "match": 0, "why": "Pending invite", "invited": True} for r in requests],
        "thisWeek": {},
        "weeklyReviewQ": [],
    }


class PartnerCheckin(BaseModel):
    did_study: bool
    note: str | None = Field(default=None, max_length=400)


@router.post("/community/partner/checkins")
async def post_partner_checkin(payload: PartnerCheckin, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    metadata = {"did_study": payload.did_study, "note": payload.note}
    row = _rows(sb.table("user_events").insert({"user_id": user["id"], "event_name": "partner.checkin", "event_type": "community", "metadata": metadata}))
    return {"id": (row[0] or {}).get("id") if row else None, "self": payload.note, "at": _now_iso(), **metadata}


class PartnerInvite(BaseModel):
    candidate_id: str = Field(min_length=1, max_length=64)
    message: str | None = Field(default=None, max_length=500)


@router.post("/community/partner/invite")
async def invite_partner(payload: PartnerInvite, user: dict = Depends(get_current_user)):
    if not _is_uuid(payload.candidate_id) or payload.candidate_id == user["id"]:
        raise HTTPException(status_code=400, detail="Invalid candidate")
    sb = get_supabase_admin()
    row = _rows(
        sb.table("accountability_partner_requests")
        .insert({"requester_id": user["id"], "partner_id": payload.candidate_id, "message": payload.message, "status": "pending"})
    )
    _notify(sb, payload.candidate_id, "partner_invite", {"requester_id": user["id"]})
    return {"invited": True, "candidateId": payload.candidate_id, "request": row[0] if row else None}


@router.post("/community/partner/end")
async def end_partnership(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    pairs = _rows(sb.table("accountability_pairs").select("id").eq("status", "active").or_(f"user_a.eq.{user['id']},user_b.eq.{user['id']}"))
    for pair in pairs:
        sb.table("accountability_pairs").update({"status": "ended"}).eq("id", pair["id"]).execute()
        _audit(sb, user, "partner.end", "accountability_pairs", pair["id"], {"status": "ended"})
    return {"ended": bool(pairs), "userId": user["id"], "at": _now_iso()}


# Mentors


def _shape_mentor_profile(row: dict[str, Any]) -> dict[str, Any]:
    courses = row.get("courses") or []
    ratings = [c.get("avg_rating") for c in courses if c.get("avg_rating")]
    prices = [c.get("price_inr") for c in courses if c.get("price_inr") is not None]
    return {
        "id": row.get("id"),
        "name": row.get("full_name") or row.get("display_name"),
        "headline": (row.get("instructor_bio") or "")[:120],
        "bio": row.get("instructor_bio"),
        "exams": sorted({tag for c in courses for tag in (c.get("exam_tags") or [])}),
        "price": [min(prices), max(prices)] if prices else [0, 0],
        "price_per_hour": min(prices) if prices else 0,
        "rating": round(sum(ratings) / len(ratings), 2) if ratings else 0,
        "sessions": len(courses),
        "languages": row.get("languages") or ["English"],
        "availability": row.get("availability") or [],
        "topics": sorted({c.get("title") for c in courses if c.get("title")}),
        "user": {"id": row.get("id"), "name": row.get("full_name") or row.get("display_name")},
    }


@router.get("/community/mentors")
async def list_mentors(topic: str | None = None, role: str | None = None, max_price: int | None = None):
    sb = get_supabase_admin()
    rows = _rows(
        sb.table("profiles")
        .select("id, full_name, display_name, instructor_bio, avatar_url, is_instructor, courses!instructor_id ( id, title, exam_tags, price_inr, avg_rating )")
        .eq("is_instructor", True)
        .limit(80)
    )
    items = [_shape_mentor_profile(r) for r in rows]
    if topic:
        items = [m for m in items if any(topic.lower() in str(t).lower() for t in m.get("topics", []))]
    if max_price is not None:
        items = [m for m in items if (m.get("price") or [0])[0] <= max_price]
    return {"items": items, "total": len(items)}


@router.get("/community/mentors/{mentor_id}")
async def mentor_detail(mentor_id: str):
    sb = get_supabase_admin()
    row = _first(
        sb.table("profiles")
        .select("id, full_name, display_name, instructor_bio, avatar_url, is_instructor, courses!instructor_id ( id, title, exam_tags, price_inr, avg_rating, total_enrollments )")
        .eq("id", mentor_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Mentor not found")
    mentor = _shape_mentor_profile(row)
    return {"mentor": mentor, "sessions": row.get("courses") or []}


@router.get("/community/mentor-sessions")
async def list_mentor_sessions(user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    courses = _rows(
        sb.table("courses")
        .select("id, instructor_id, title, exam_tags, price_inr, total_enrollments, profiles!instructor_id ( id, full_name, display_name, instructor_bio )")
        .eq("status", "published")
        .limit(80)
    )
    bookings = _rows(sb.table("mentor_bookings").select("mentor_id, slot, status").eq("user_id", user["id"])) if user else []
    booked_ids = {b.get("mentor_id") for b in bookings}
    items = []
    for course in courses:
        mentor = course.get("profiles") if isinstance(course.get("profiles"), dict) else {}
        items.append(
            {
                "id": course.get("id"),
                "mentorId": course.get("instructor_id"),
                "title": course.get("title"),
                "tags": course.get("exam_tags") or [],
                "at": None,
                "duration": "60m",
                "capacity": 50,
                "booked": course.get("total_enrollments") or 0,
                "price": course.get("price_inr") or 0,
                "platform": "Career Copilot",
                "status": "booking_open",
                "mentor": _shape_mentor_profile({**mentor, "courses": [course]}),
                "youBooked": course.get("instructor_id") in booked_ids,
            }
        )
    return {"items": items, "total": len(items), "aspirantsBooked": sum(i["booked"] for i in items)}


class MentorBooking(BaseModel):
    payment_token: str | None = Field(default=None, max_length=256)


class MentorDirectBooking(BaseModel):
    mentor_id: str
    slot: str
    agenda: str | None = Field(default=None, max_length=1000)
    duration_minutes: int = Field(default=60, ge=15, le=240)


@router.post("/community/mentor-sessions/{session_id}/book")
async def book_mentor_session(session_id: str, payload: MentorBooking, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    course = _first(sb.table("courses").select("id, instructor_id, title, price_inr").eq("id", session_id).eq("status", "published"))
    if not course:
        raise HTTPException(status_code=404, detail="Session not found")
    booking = _rows(
        sb.table("mentor_bookings").insert(
            {
                "user_id": user["id"],
                "mentor_id": course.get("instructor_id"),
                "agenda": course.get("title"),
                "status": "pending_payment" if (course.get("price_inr") or 0) > 0 else "confirmed",
            }
        )
    )
    _event(sb, user["id"], "mentor_session.booked", {"session_id": session_id, "mentor_id": course.get("instructor_id")})
    return {
        "bookingId": (booking[0] or {}).get("id") if booking else None,
        "sessionId": session_id,
        "price": course.get("price_inr") or 0,
        "paymentToken": payload.payment_token,
        "status": (booking[0] or {}).get("status", "pending_payment") if booking else "pending_payment",
    }


@router.post("/accountability/mentors/book")
async def book_mentor_direct(payload: MentorDirectBooking, user: dict = Depends(get_current_user)):
    if not _is_uuid(payload.mentor_id):
        raise HTTPException(status_code=400, detail="Invalid mentor_id")
    sb = get_supabase_admin()
    mentor = _first(sb.table("profiles").select("id, is_instructor").eq("id", payload.mentor_id))
    if not mentor or not mentor.get("is_instructor"):
        raise HTTPException(status_code=404, detail="Mentor not found")
    row = _rows(
        sb.table("mentor_bookings").insert(
            {
                "user_id": user["id"],
                "mentor_id": payload.mentor_id,
                "slot": payload.slot,
                "agenda": payload.agenda,
                "status": "requested",
            }
        )
    )
    booking = row[0] if row else {}
    _event(sb, user["id"], "mentor_session.requested", {"mentor_id": payload.mentor_id, "booking_id": booking.get("id")})
    _notify(sb, payload.mentor_id, "mentor_booking_requested", {"user_id": user["id"], "booking_id": booking.get("id")})
    return booking


@router.post("/community/mentor-sessions/{session_id}/cancel")
async def cancel_mentor_session(session_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    booking = _first(sb.table("mentor_bookings").select("*").eq("id", session_id).eq("user_id", user["id"]))
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    sb.table("mentor_bookings").update({"status": "cancelled", "updated_at": _now_iso()}).eq("id", booking["id"]).execute()
    _event(sb, user["id"], "mentor_session.cancelled", {"booking_id": booking["id"]})
    return {**booking, "status": "cancelled", "cancelledAt": _now_iso()}


@router.get("/community/mentor-earnings")
async def mentor_earnings(user: dict = Depends(get_current_user)):
    if (user.get("role") or "") not in {"mentor", "admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Mentor role required")
    sb = get_supabase_admin()
    rows = _rows(sb.table("mentor_bookings").select("*").eq("mentor_id", user["id"]).limit(200))
    return {
        "asMentor": user["id"],
        "kpis": {
            "bookings": len(rows),
            "confirmed": len([r for r in rows if r.get("status") == "confirmed"]),
            "cancelled": len([r for r in rows if r.get("status") == "cancelled"]),
        },
        "payouts": [],
        "trend": [],
    }


# Community resource library


def _shape_resource(row: dict[str, Any], uid: str | None = None) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "type": row.get("resource_type"),
        "exam": row.get("exam"),
        "subject": row.get("subject"),
        "sourceTrust": row.get("source_trust"),
        "sourceUrl": row.get("source_url"),
        "contributedBy": row.get("contributed_by"),
        "upvotes": row.get("upvote_count") or 0,
        "verifiedByTopper": bool(row.get("verified_by_topper")),
        "createdAt": row.get("created_at"),
        "size": row.get("size_label") or "link",
        "reportCount": row.get("report_count") or 0,
        "status": row.get("status"),
    }


@router.get("/community/resources")
async def list_resources(
    exam: str | None = None,
    type: str | None = None,
    trust: str | None = None,
    sort: str = "top",
    user: dict | None = Depends(get_optional_user),
):
    sb = get_supabase_admin()
    q = sb.table("community_resources").select("*").eq("status", "approved")
    if exam and exam != "all":
        q = q.eq("exam", exam)
    if type and type != "all":
        q = q.eq("resource_type", type)
    if trust and trust != "all":
        q = q.eq("source_trust", trust)
    q = q.order("created_at", desc=True) if sort == "new" else q.order("upvote_count", desc=True)
    rows = _rows(q.limit(100))
    return {"items": [_shape_resource(r, (user or {}).get("id")) for r in rows], "total": len(rows)}


@router.get("/community/resources/{resource_id}")
async def resource_detail(resource_id: str, user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    row = _first(sb.table("community_resources").select("*").eq("id", resource_id))
    if not row or row.get("status") not in {"approved", "pending_review"}:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"resource": _shape_resource(row, (user or {}).get("id")), "contributor": {"id": row.get("contributed_by")}}


class ResourceContribute(BaseModel):
    title: str = Field(min_length=4, max_length=160)
    type: str = Field(min_length=2, max_length=24)
    exam: str = Field(min_length=2, max_length=64)
    subject: str = Field(default="Meta", max_length=64)
    sourceTrust: str = Field(default="community", max_length=16)
    size: str = Field(default="link", max_length=16)
    sourceUrl: HttpUrl


@router.post("/community/resources")
async def contribute_resource(payload: ResourceContribute, user: dict = Depends(get_current_user)):
    if payload.sourceTrust not in {"official", "community", "coaching", "unknown"}:
        raise HTTPException(status_code=400, detail="Invalid sourceTrust")
    sb = get_supabase_admin()
    row = _rows(
        sb.table("community_resources").insert(
            {
                "title": payload.title.strip(),
                "resource_type": payload.type,
                "exam": payload.exam,
                "subject": payload.subject,
                "source_trust": payload.sourceTrust,
                "source_url": str(payload.sourceUrl),
                "contributed_by": user["id"],
                "size_label": payload.size,
                "status": "pending_review",
            }
        )
    )
    _event(sb, user["id"], "community_resource.contributed", {"resource_id": (row[0] or {}).get("id") if row else None})
    return _shape_resource(row[0], user["id"]) if row else {}


@router.post("/community/resources/{resource_id}/vote")
async def vote_resource(resource_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    resource = _first(sb.table("community_resources").select("id, upvote_count").eq("id", resource_id))
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    existing = _first(sb.table("community_resource_votes").select("id").eq("resource_id", resource_id).eq("user_id", user["id"]))
    if existing:
        sb.table("community_resource_votes").delete().eq("id", existing["id"]).execute()
        delta = -1
        voted = False
    else:
        sb.table("community_resource_votes").insert({"resource_id": resource_id, "user_id": user["id"]}).execute()
        delta = 1
        voted = True
    count = _rpc_inc(
        sb,
        "community_inc_resource_upvote_count",
        {"p_resource_id": resource_id, "p_delta": delta},
        "community_resources", resource_id, "upvote_count", delta,
    )
    if count is None:
        count = max(0, (resource.get("upvote_count") or 0) + delta)
    return {"voted": voted, "resourceId": resource_id, "upvotes": count}


@router.post("/community/resources/{resource_id}/report")
async def report_resource(resource_id: str, payload: ReportBody, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    resource = _first(sb.table("community_resources").select("id, report_count").eq("id", resource_id))
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    row = _rows(
        sb.table("community_resource_reports").insert(
            {"resource_id": resource_id, "reporter_id": user["id"], "reason": payload.reason.strip(), "status": "open"}
        )
    )
    count = _rpc_inc(
        sb,
        "community_inc_resource_report_count",
        {"p_resource_id": resource_id, "p_delta": 1},
        "community_resources", resource_id, "report_count", 1,
    )
    if count is None:
        count = (resource.get("report_count") or 0) + 1
    return {"reported": True, "resourceId": resource_id, "totalReports": count, "id": (row[0] or {}).get("id") if row else None}


# Admin moderation


@router.get("/admin/community/flags")
async def admin_community_flags(admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    forum_reports = _rows(sb.table("forum_reports").select("*").eq("status", "open").order("created_at", desc=True).limit(100))
    community_reports = _rows(sb.table("community_reports").select("*").eq("status", "pending").order("created_at", desc=True).limit(100))
    resource_reports = _rows(sb.table("community_resource_reports").select("*").eq("status", "open").order("created_at", desc=True).limit(100))
    items = []
    for r in forum_reports:
        items.append({"id": r.get("id"), "kind": "forum", "thread": r.get("post_id") or r.get("comment_id"), "reason": r.get("reason"), "raised": r.get("created_at")})
    for r in community_reports:
        items.append({"id": r.get("id"), "kind": "community", "thread": r.get("thread_id") or r.get("reply_id"), "reason": r.get("reason"), "raised": r.get("created_at")})
    for r in resource_reports:
        items.append({"id": r.get("id"), "kind": "resource", "thread": r.get("resource_id"), "reason": r.get("reason"), "raised": r.get("created_at")})
    return {"items": items}


class ModerationAction(BaseModel):
    action: str = Field(pattern="^(dismiss|hide)$")
    notes: str | None = Field(default=None, max_length=500)


@router.post("/admin/community/flags/{flag_id}")
async def admin_resolve_community_flag(flag_id: str, payload: ModerationAction, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    status = "dismissed" if payload.action == "dismiss" else "resolved"
    for table in ("forum_reports", "community_reports", "community_resource_reports"):
        rows = _rows(sb.table(table).select("*").eq("id", flag_id).limit(1))
        if not rows:
            continue
        report = rows[0]
        hidden_targets: dict[str, str] = {}
        if payload.action == "hide":
            hidden_targets = _hide_report_target(sb, table, report)
        sb.table(table).update({"status": status, "moderator_notes": payload.notes, "resolved_at": _now_iso()}).eq("id", flag_id).execute()
        _audit(
            sb,
            admin,
            f"community.flag.{payload.action}",
            table,
            flag_id,
            {"status": status, "notes": payload.notes, "hidden": hidden_targets or None},
        )
        return {"ok": True, "id": flag_id, "status": status, "hidden": hidden_targets}
    raise HTTPException(status_code=404, detail="Flag not found")


def _hide_report_target(sb, report_table: str, report: dict[str, Any]) -> dict[str, str]:
    """Flip the target entity's status to 'hidden' for the entity referenced by the report.

    Returns a map of {entity_type: entity_id} actually hidden. Idempotent — re-hiding
    an already-hidden entity is a no-op but still recorded.
    """
    hidden: dict[str, str] = {}
    now = _now_iso()
    if report_table == "community_reports":
        thread_id = report.get("thread_id")
        reply_id = report.get("reply_id")
        if thread_id:
            sb.table("community_threads").update({"status": "hidden", "updated_at": now}).eq("id", thread_id).execute()
            hidden["community_thread"] = thread_id
        if reply_id:
            sb.table("community_replies").update({"status": "hidden", "updated_at": now}).eq("id", reply_id).execute()
            hidden["community_reply"] = reply_id
    elif report_table == "forum_reports":
        post_id = report.get("post_id")
        comment_id = report.get("comment_id")
        if post_id:
            sb.table("forum_posts").update({"status": "hidden", "updated_at": now}).eq("id", post_id).execute()
            hidden["forum_post"] = post_id
        if comment_id:
            sb.table("forum_comments").update({"status": "hidden", "updated_at": now}).eq("id", comment_id).execute()
            hidden["forum_comment"] = comment_id
    elif report_table == "community_resource_reports":
        resource_id = report.get("resource_id")
        if resource_id:
            sb.table("community_resources").update({"status": "hidden", "updated_at": now}).eq("id", resource_id).execute()
            hidden["community_resource"] = resource_id
    return hidden
