"""Community-people endpoints — study groups, partners, mentors, resources.

These routes complement the spaces+threads layer in `canonical.py` and are
consumed by the React screens under `features/community/`. Until canonical
tables (forum_groups, accountability_pairs, mentor_*) are designed they
serve the reference snapshot from ``community_seed`` plus a thin layer of
in-memory per-user state for joins / RSVPs / check-ins / votes so the UI
mutations succeed without hitting the database.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.community_seed import (
    ACCOUNTABILITY,
    COMMUNITY_FLAIRS,
    COMMUNITY_SPACES,
    COMMUNITY_THREADS,
    COMMUNITY_USERS,
    MENTOR_EARNINGS,
    MENTOR_SESSIONS,
    MENTORS,
    RESOURCES,
    STUDY_GROUP_CHECKINS,
    STUDY_GROUP_MEMBERS,
    STUDY_GROUP_SESSION_LOG,
    STUDY_GROUP_SHARED_RESOURCES,
    STUDY_GROUPS,
    STUDY_ROOM_SESSIONS,
)
from app.core.auth import get_current_user, get_optional_user


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── In-memory mutation stores (per-process, per-user) ───────────────────
# We don't persist these; the goal is for the UI's join/RSVP/vote/report
# round trips to succeed and reflect optimistic state without falling
# back to a "feature unavailable" message.
_group_join_requests: dict[str, set[str]] = defaultdict(set)        # uid -> {group_id}
_group_checkins: dict[str, list[dict]] = defaultdict(list)          # group_id -> [checkin]
_room_rsvps: dict[str, set[str]] = defaultdict(set)                 # session_id -> {uid}
_partner_checkins: dict[str, list[dict]] = defaultdict(list)        # uid -> [checkin]
_partner_invites: dict[str, set[str]] = defaultdict(set)            # uid -> {candidate_id}
_mentor_bookings: dict[str, dict[str, dict]] = defaultdict(dict)    # uid -> {session_id: booking}
_resource_votes: dict[str, set[str]] = defaultdict(set)             # resource_id -> {uid}
_resource_reports: dict[str, list[dict]] = defaultdict(list)        # resource_id -> [{uid, reason}]
_contributed_resources: list[dict] = []
_thread_votes: dict[str, dict[str, int]] = defaultdict(dict)        # thread_id -> {uid: +1/-1}
_reply_votes: dict[str, dict[str, int]] = defaultdict(dict)         # reply_id -> {uid: +1/-1}


def _vote_count(base: int, resource_id: str) -> int:
    return base + len(_resource_votes.get(resource_id, set()))


def _resource_shape(r: dict, uid: str | None) -> dict:
    out = dict(r)
    out["upvotes"] = _vote_count(r.get("upvotes", 0), r["id"])
    out["youVoted"] = bool(uid and uid in _resource_votes.get(r["id"], set()))
    out["reportCount"] = len(_resource_reports.get(r["id"], []))
    return out


# ════════════════════════════════════════════════════════════════════════
#  STUDY GROUPS
# ════════════════════════════════════════════════════════════════════════

router = APIRouter(prefix="/community", tags=["community-people"])


@router.get("/groups")
async def list_groups(
    visibility: str | None = Query(default=None, description="open | invite-only"),
    status: str | None = Query(default=None, description="active | paused"),
    exam: str | None = Query(default=None),
    mine: bool = Query(default=False),
    user: dict | None = Depends(get_optional_user),
):
    """List study groups with optional filters."""
    uid = (user or {}).get("id")
    items = []
    for g in STUDY_GROUPS:
        if visibility and g["visibility"] != visibility:
            continue
        if status and g["status"] != status:
            continue
        if exam and g["exam"] != exam:
            continue
        if mine and not g.get("isMine"):
            continue
        shape = dict(g)
        shape["youRequested"] = bool(uid and g["id"] in _group_join_requests.get(uid, set()))
        items.append(shape)
    return {
        "items": items,
        "total": len(STUDY_GROUPS),
        "study_rooms_this_week": len(STUDY_ROOM_SESSIONS),
    }


def _get_group(group_id: str) -> dict:
    for g in STUDY_GROUPS:
        if g["id"] == group_id:
            return g
    raise HTTPException(status_code=404, detail="Group not found")


@router.get("/groups/{group_id}")
async def group_detail(group_id: str, user: dict | None = Depends(get_optional_user)):
    g = _get_group(group_id)
    uid = (user or {}).get("id")
    members_raw = STUDY_GROUP_MEMBERS.get(group_id, STUDY_GROUP_MEMBERS["g1"][: g["members"]])
    members = [
        {
            "user": COMMUNITY_USERS.get(m["u"], {"id": m["u"], "name": m["u"]}),
            "joinedAt": m["join"],
            "weeklyHours": m["hrs"],
            "founder": bool(m.get("founder")),
        }
        for m in members_raw
    ]
    checkins_seed = STUDY_GROUP_CHECKINS.get(group_id, [])
    checkins_runtime = _group_checkins.get(group_id, [])
    checkins = [
        {**c, "user": COMMUNITY_USERS.get(c["u"], {"id": c["u"], "name": c["u"]})}
        for c in (checkins_runtime + checkins_seed)
    ]
    return {
        "group": {
            **g,
            "youRequested": bool(uid and group_id in _group_join_requests.get(uid, set())),
        },
        "founder": COMMUNITY_USERS.get(g["founder"]),
        "members": members,
        "checkins": checkins,
        "sessionLog": STUDY_GROUP_SESSION_LOG.get(group_id, []),
        "sharedResources": [
            {**sr, "user": COMMUNITY_USERS.get(sr["by"])}
            for sr in STUDY_GROUP_SHARED_RESOURCES.get(group_id, [])
        ],
        "nextSession": g.get("nextSession"),
    }


@router.post("/groups/{group_id}/join")
async def join_group(group_id: str, user: dict = Depends(get_current_user)):
    g = _get_group(group_id)
    uid = user["id"]
    if g.get("isMine"):
        return {"status": "already-member", "groupId": group_id}
    _group_join_requests[uid].add(group_id)
    return {"status": "requested", "groupId": group_id, "submittedAt": _now_iso()}


class GroupCheckin(BaseModel):
    body: str = Field(min_length=1, max_length=400)
    hours: float | None = Field(default=None, ge=0, le=24)


@router.post("/groups/{group_id}/checkins")
async def post_group_checkin(
    group_id: str, payload: GroupCheckin, user: dict = Depends(get_current_user)
):
    _get_group(group_id)
    uid = user["id"]
    entry = {
        "id": f"chk-{uuid4().hex[:8]}",
        "u": uid,
        "body": payload.body.strip(),
        "hours": payload.hours,
        "t": datetime.now(timezone.utc).strftime("%H:%M"),
        "at": _now_iso(),
    }
    _group_checkins[group_id].insert(0, entry)
    return entry


@router.get("/study-rooms")
async def list_study_rooms(user: dict | None = Depends(get_optional_user)):
    uid = (user or {}).get("id")
    items = []
    for s in STUDY_ROOM_SESSIONS:
        group = next((g for g in STUDY_GROUPS if g["id"] == s["groupId"]), None)
        items.append(
            {
                **s,
                "groupName": group["name"] if group else None,
                "youRsvpd": bool(uid and uid in _room_rsvps.get(s["id"], set())),
            }
        )
    return {"items": items, "week": "current"}


@router.post("/study-rooms/{session_id}/rsvp")
async def rsvp_room(session_id: str, user: dict = Depends(get_current_user)):
    if not any(s["id"] == session_id for s in STUDY_ROOM_SESSIONS):
        raise HTTPException(status_code=404, detail="Session not found")
    uid = user["id"]
    if uid in _room_rsvps[session_id]:
        _room_rsvps[session_id].discard(uid)
        return {"rsvpd": False, "sessionId": session_id}
    _room_rsvps[session_id].add(uid)
    return {"rsvpd": True, "sessionId": session_id}


# ════════════════════════════════════════════════════════════════════════
#  ACCOUNTABILITY PARTNER
# ════════════════════════════════════════════════════════════════════════


@router.get("/partner")
async def partner_state(user: dict | None = Depends(get_optional_user)):
    partner = COMMUNITY_USERS.get(ACCOUNTABILITY["partner"]["userId"])
    you = COMMUNITY_USERS.get((user or {}).get("id"), COMMUNITY_USERS["u_aarav"])
    uid = (user or {}).get("id")
    runtime_log = _partner_checkins.get(uid, []) if uid else []
    return {
        "you": you,
        "partner": partner,
        "partnership": ACCOUNTABILITY["partner"],
        "selfCommitment": ACCOUNTABILITY["selfCommitment"],
        "partnerCommitment": ACCOUNTABILITY["partnerCommitment"],
        "thisWeek": ACCOUNTABILITY["thisWeek"],
        "recentCheckIns": runtime_log + ACCOUNTABILITY["recentCheckIns"],
        "weeklyReviewQ": ACCOUNTABILITY["weeklyReviewQ"],
        "candidates": [
            {
                **c,
                "user": COMMUNITY_USERS.get(c["id"]),
                "invited": bool(uid and c["id"] in _partner_invites.get(uid, set())),
            }
            for c in ACCOUNTABILITY["candidates"]
        ],
    }


class PartnerCheckin(BaseModel):
    did_study: bool
    note: str | None = Field(default=None, max_length=400)


@router.post("/partner/checkins")
async def post_partner_checkin(payload: PartnerCheckin, user: dict = Depends(get_current_user)):
    uid = user["id"]
    today = datetime.now(timezone.utc).strftime("%b %d")
    label = "Did it" if payload.did_study else "Skipped"
    entry = {
        "date": today,
        "self": f"{label}{(' · ' + payload.note) if payload.note else ''}",
        "partner": "—",
        "at": _now_iso(),
    }
    _partner_checkins[uid].insert(0, entry)
    return entry


class PartnerInvite(BaseModel):
    candidate_id: str = Field(min_length=1, max_length=64)


@router.post("/partner/invite")
async def invite_partner(payload: PartnerInvite, user: dict = Depends(get_current_user)):
    if not any(c["id"] == payload.candidate_id for c in ACCOUNTABILITY["candidates"]):
        raise HTTPException(status_code=404, detail="Candidate not found")
    uid = user["id"]
    _partner_invites[uid].add(payload.candidate_id)
    return {"invited": True, "candidateId": payload.candidate_id, "at": _now_iso()}


@router.post("/partner/end")
async def end_partnership(user: dict = Depends(get_current_user)):
    return {"ended": True, "userId": user["id"], "at": _now_iso()}


# ════════════════════════════════════════════════════════════════════════
#  MENTORS
# ════════════════════════════════════════════════════════════════════════


def _shape_mentor(m: dict) -> dict:
    return {
        **m,
        "user": COMMUNITY_USERS.get(m["id"]),
    }


@router.get("/mentors")
async def list_mentors(
    topic: str | None = Query(default=None),
    role: str | None = Query(default=None, description="topper | officer | mentor"),
    max_price: int | None = Query(default=None, ge=0),
):
    items = []
    for m in MENTORS:
        if topic and not any(t.lower().find(topic.lower()) >= 0 for t in m["topics"]):
            continue
        if role:
            label = (m.get("badge") or "").lower()
            if role == "topper" and "air" not in label:
                continue
            if role == "officer" and "ips" not in label and "ias" not in label:
                continue
            if role == "mentor" and "mentor" not in label:
                continue
        if max_price is not None and m["price"][0] > max_price:
            continue
        items.append(_shape_mentor(m))
    return {"items": items, "total": len(MENTORS)}


@router.get("/mentors/{mentor_id}")
async def mentor_detail(mentor_id: str):
    m = next((x for x in MENTORS if x["id"] == mentor_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Mentor not found")
    sessions = [s for s in MENTOR_SESSIONS if s["mentorId"] == mentor_id]
    return {"mentor": _shape_mentor(m), "sessions": sessions}


@router.get("/mentor-sessions")
async def list_mentor_sessions(user: dict | None = Depends(get_optional_user)):
    uid = (user or {}).get("id")
    items = []
    for s in MENTOR_SESSIONS:
        m = next((x for x in MENTORS if x["id"] == s["mentorId"]), None)
        items.append(
            {
                **s,
                "mentor": _shape_mentor(m) if m else None,
                "youBooked": bool(uid and s["id"] in _mentor_bookings.get(uid, {})),
            }
        )
    total_booked = sum(s["booked"] for s in MENTOR_SESSIONS)
    return {"items": items, "total": len(items), "aspirantsBooked": total_booked}


class MentorBooking(BaseModel):
    payment_token: str | None = Field(default=None, max_length=256)


@router.post("/mentor-sessions/{session_id}/book")
async def book_mentor_session(
    session_id: str, payload: MentorBooking, user: dict = Depends(get_current_user)
):
    s = next((x for x in MENTOR_SESSIONS if x["id"] == session_id), None)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if s["booked"] >= s["capacity"]:
        raise HTTPException(status_code=409, detail="Session is full")
    uid = user["id"]
    booking = {
        "bookingId": f"bk-{uuid4().hex[:10]}",
        "sessionId": session_id,
        "price": s["price"],
        "platform": s["platform"],
        "at": _now_iso(),
        "paymentToken": payload.payment_token,
        "status": "confirmed",
    }
    _mentor_bookings[uid][session_id] = booking
    return booking


@router.post("/mentor-sessions/{session_id}/cancel")
async def cancel_booking(session_id: str, user: dict = Depends(get_current_user)):
    uid = user["id"]
    booking = _mentor_bookings.get(uid, {}).pop(session_id, None)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking["status"] = "refunded"
    return {**booking, "refundedAt": _now_iso()}


@router.get("/mentor-earnings")
async def mentor_earnings(user: dict = Depends(get_current_user)):
    """Mentor mode · earnings KPIs + monthly trend + payout history.

    Visible to the authenticated mentor (the seed snapshot is the same for
    everyone in placeholder mode).
    """
    return {**MENTOR_EARNINGS, "asMentor": user["id"]}


# ════════════════════════════════════════════════════════════════════════
#  RESOURCE LIBRARY
# ════════════════════════════════════════════════════════════════════════


@router.get("/resources")
async def list_resources(
    exam: str | None = Query(default=None),
    type: str | None = Query(default=None, description="pyq_paper | notes | strategy_guide | video_link | course_link | book"),
    trust: str | None = Query(default=None, description="official | community | coaching | unknown"),
    sort: str = Query(default="top", description="top | new | verified"),
    user: dict | None = Depends(get_optional_user),
):
    uid = (user or {}).get("id")
    all_resources = list(RESOURCES) + _contributed_resources
    items = []
    for r in all_resources:
        if exam and exam != "all" and r["exam"] != exam:
            continue
        if type and type != "all" and r["type"] != type:
            continue
        if trust and trust != "all" and r["sourceTrust"] != trust:
            continue
        items.append(_resource_shape(r, uid))
    if sort == "new":
        items.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    elif sort == "verified":
        items.sort(key=lambda x: (not x.get("verifiedByTopper"), -x["upvotes"]))
    else:
        items.sort(key=lambda x: -x["upvotes"])
    return {"items": items, "total": len(all_resources)}


def _find_resource(resource_id: str) -> dict:
    for r in list(RESOURCES) + _contributed_resources:
        if r["id"] == resource_id:
            return r
    raise HTTPException(status_code=404, detail="Resource not found")


@router.get("/resources/{resource_id}")
async def resource_detail(resource_id: str, user: dict | None = Depends(get_optional_user)):
    r = _find_resource(resource_id)
    uid = (user or {}).get("id")
    return {
        "resource": _resource_shape(r, uid),
        "contributor": COMMUNITY_USERS.get(r.get("contributedBy")),
    }


class ResourceContribute(BaseModel):
    title: str = Field(min_length=4, max_length=160)
    type: str = Field(min_length=2, max_length=24)
    exam: str = Field(min_length=2, max_length=32)
    subject: str = Field(default="Meta", max_length=32)
    sourceTrust: str = Field(default="community", max_length=16)
    size: str = Field(default="link", max_length=16)


@router.post("/resources")
async def contribute_resource(payload: ResourceContribute, user: dict = Depends(get_current_user)):
    valid_trust = {"official", "community", "coaching", "unknown"}
    if payload.sourceTrust not in valid_trust:
        raise HTTPException(status_code=400, detail="Invalid sourceTrust")
    new_id = f"res-{uuid4().hex[:8]}"
    record = {
        "id": new_id,
        "title": payload.title.strip(),
        "type": payload.type,
        "exam": payload.exam,
        "subject": payload.subject,
        "sourceTrust": payload.sourceTrust,
        "contributedBy": user["id"],
        "upvotes": 0,
        "verifiedByTopper": False,
        "createdAt": "now",
        "size": payload.size,
    }
    _contributed_resources.append(record)
    return record


@router.post("/resources/{resource_id}/vote")
async def vote_resource(resource_id: str, user: dict = Depends(get_current_user)):
    _find_resource(resource_id)
    uid = user["id"]
    if uid in _resource_votes[resource_id]:
        _resource_votes[resource_id].discard(uid)
        return {"voted": False, "resourceId": resource_id}
    _resource_votes[resource_id].add(uid)
    return {"voted": True, "resourceId": resource_id}


class ResourceReport(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


@router.post("/resources/{resource_id}/report")
async def report_resource(
    resource_id: str, payload: ResourceReport, user: dict = Depends(get_current_user)
):
    _find_resource(resource_id)
    entry = {"uid": user["id"], "reason": payload.reason.strip(), "at": _now_iso()}
    _resource_reports[resource_id].append(entry)
    return {"reported": True, "resourceId": resource_id, "totalReports": len(_resource_reports[resource_id])}


# ════════════════════════════════════════════════════════════════════════
#  SPACES · CHANNELS · THREADS · REPLIES · VOTES
# ════════════════════════════════════════════════════════════════════════
#
# These work against the in-memory ``COMMUNITY_SPACES`` / ``COMMUNITY_THREADS``
# seed dictionaries in ``community_seed.py``. They live alongside the
# Supabase-backed canonical /threads endpoints — the community screen reads
# from this snapshot via ``/api/community/spaces``, so persisting mutations
# here is what makes the UI feel alive end-to-end.


def _find_space(space_id: str) -> dict:
    for s in COMMUNITY_SPACES:
        if s["id"] == space_id:
            return s
    raise HTTPException(status_code=404, detail="Space not found")


def _find_channel(channel_id: str) -> tuple[dict, dict]:
    for s in COMMUNITY_SPACES:
        for c in s["channels"]:
            if c["id"] == channel_id:
                return s, c
    raise HTTPException(status_code=404, detail="Channel not found")


def _find_thread(thread_id: str, channel_id: str | None = None) -> dict:
    channels = [channel_id] if channel_id else list(COMMUNITY_THREADS.keys())
    for cid in channels:
        for t in COMMUNITY_THREADS.get(cid, []):
            if t["id"] == thread_id:
                return t
    raise HTTPException(status_code=404, detail="Thread not found")


def _net_thread_votes(thread: dict) -> int:
    base = (thread.get("upvotes", 0) or 0) - (thread.get("downvotes", 0) or 0)
    return base + sum(_thread_votes.get(thread["id"], {}).values())


def _net_reply_votes(reply: dict) -> int:
    base = reply.get("upvotes", 0) or 0
    return base + sum(_reply_votes.get(reply["id"], {}).values())


def _shape_thread_runtime(thread: dict, uid: str | None) -> dict:
    return {
        **thread,
        "netVotes": _net_thread_votes(thread),
        "youVoted": _thread_votes.get(thread["id"], {}).get(uid) if uid else 0,
    }


def _shape_reply_runtime(reply: dict, uid: str | None) -> dict:
    return {
        **reply,
        "netVotes": _net_reply_votes(reply),
        "youVoted": _reply_votes.get(reply["id"], {}).get(uid) if uid else 0,
    }


@router.get("/channels/{channel_id}/threads")
async def list_channel_threads(
    channel_id: str,
    sort: str = Query(default="hot", description="hot | new | top | verified | unanswered"),
    user: dict | None = Depends(get_optional_user),
):
    _find_channel(channel_id)
    uid = (user or {}).get("id")
    items = [_shape_thread_runtime(t, uid) for t in COMMUNITY_THREADS.get(channel_id, [])]
    if sort == "new":
        items.sort(key=lambda t: not t.get("pinned"))
    elif sort == "top":
        items.sort(key=lambda t: -(t.get("upvotes") or 0))
    elif sort == "verified":
        def _v(t: dict) -> int:
            u = COMMUNITY_USERS.get(t.get("author")) or {}
            badge = u.get("badge") or {}
            return 1 if badge.get("kind") in {"topper", "officer", "admin"} else 0
        items.sort(key=lambda t: (-_v(t), -(t.get("upvotes") or 0)))
    elif sort == "unanswered":
        items = [t for t in items if (t.get("replies") or 0) == 0]
    else:  # hot
        items.sort(
            key=lambda t: (
                not t.get("pinned"),
                -(t.get("netVotes") or 0),
            )
        )
    return {"items": items, "channelId": channel_id, "total": len(items)}


@router.get("/channels/{channel_id}/threads/{thread_id}")
async def thread_with_replies(
    channel_id: str, thread_id: str, user: dict | None = Depends(get_optional_user)
):
    _find_channel(channel_id)
    t = _find_thread(thread_id, channel_id)
    uid = (user or {}).get("id")
    replies = [_shape_reply_runtime(r, uid) for r in (t.get("topReplies") or [])]
    return {"thread": _shape_thread_runtime(t, uid), "replies": replies}


class ThreadCreate(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    body: str = Field(min_length=10, max_length=4000)
    flair: str | None = Field(default="discussion", max_length=24)


@router.post("/channels/{channel_id}/threads")
async def create_thread(
    channel_id: str, payload: ThreadCreate, user: dict = Depends(get_current_user)
):
    _space, channel = _find_channel(channel_id)
    if channel.get("lockedAdminWrite") and user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Channel is admin-write only")
    if payload.flair and payload.flair not in COMMUNITY_FLAIRS:
        raise HTTPException(status_code=400, detail="Invalid flair")
    new_thread = {
        "id": f"t-{uuid4().hex[:10]}",
        "channelId": channel_id,
        "flair": payload.flair or "discussion",
        "title": payload.title.strip(),
        "body": payload.body.strip(),
        "author": user["id"],
        "upvotes": 1,
        "downvotes": 0,
        "replies": 0,
        "createdAt": "now",
        "topReplies": [],
    }
    COMMUNITY_THREADS.setdefault(channel_id, []).insert(0, new_thread)
    # Auto-upvote by the author so the vote count reads naturally.
    _thread_votes[new_thread["id"]][user["id"]] = 1
    if user["id"] not in COMMUNITY_USERS:
        COMMUNITY_USERS[user["id"]] = {
            "id": user["id"],
            "name": user.get("name") or user.get("email") or "Member",
            "role": user.get("role", "aspirant"),
            "avatarColor": "#A68057",
        }
    return _shape_thread_runtime(new_thread, user["id"])


class ReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.post("/channels/{channel_id}/threads/{thread_id}/replies")
async def create_reply(
    channel_id: str,
    thread_id: str,
    payload: ReplyCreate,
    user: dict = Depends(get_current_user),
):
    _find_channel(channel_id)
    t = _find_thread(thread_id, channel_id)
    if t.get("repliesLocked"):
        raise HTTPException(status_code=423, detail="Replies are locked on this thread")
    reply = {
        "id": f"r-{uuid4().hex[:10]}",
        "author": user["id"],
        "upvotes": 1,
        "body": payload.body.strip(),
        "createdAt": "now",
    }
    t.setdefault("topReplies", []).insert(0, reply)
    t["replies"] = (t.get("replies") or 0) + 1
    _reply_votes[reply["id"]][user["id"]] = 1
    if user["id"] not in COMMUNITY_USERS:
        COMMUNITY_USERS[user["id"]] = {
            "id": user["id"],
            "name": user.get("name") or user.get("email") or "Member",
            "role": user.get("role", "aspirant"),
            "avatarColor": "#A68057",
        }
    return _shape_reply_runtime(reply, user["id"])


class VotePayload(BaseModel):
    direction: int = Field(default=1, description="+1 upvote, -1 downvote, 0 clear")


def _toggle_vote(store: dict[str, dict[str, int]], obj_id: str, uid: str, direction: int) -> int:
    if direction not in (-1, 0, 1):
        raise HTTPException(status_code=400, detail="direction must be -1, 0, or 1")
    bucket = store[obj_id]
    if direction == 0 or bucket.get(uid) == direction:
        bucket.pop(uid, None)
        return 0
    bucket[uid] = direction
    return direction


@router.post("/channels/{channel_id}/threads/{thread_id}/vote")
async def vote_thread(
    channel_id: str,
    thread_id: str,
    payload: VotePayload,
    user: dict = Depends(get_current_user),
):
    _find_channel(channel_id)
    t = _find_thread(thread_id, channel_id)
    your_vote = _toggle_vote(_thread_votes, thread_id, user["id"], payload.direction)
    return {
        "threadId": thread_id,
        "yourVote": your_vote,
        "netVotes": _net_thread_votes(t),
    }


@router.post("/channels/{channel_id}/threads/{thread_id}/replies/{reply_id}/vote")
async def vote_reply(
    channel_id: str,
    thread_id: str,
    reply_id: str,
    payload: VotePayload,
    user: dict = Depends(get_current_user),
):
    _find_channel(channel_id)
    t = _find_thread(thread_id, channel_id)
    reply = next((r for r in (t.get("topReplies") or []) if r["id"] == reply_id), None)
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    your_vote = _toggle_vote(_reply_votes, reply_id, user["id"], payload.direction)
    return {
        "replyId": reply_id,
        "yourVote": your_vote,
        "netVotes": _net_reply_votes(reply),
    }


class ChannelCreate(BaseModel):
    name: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9][a-z0-9-]*$")
    purpose: str | None = Field(default=None, max_length=140)
    lockedAdminWrite: bool = False


@router.post("/spaces/{space_id}/channels")
async def create_channel(
    space_id: str, payload: ChannelCreate, user: dict = Depends(get_current_user)
):
    if user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Channels are admin-managed")
    space = _find_space(space_id)
    if any(c["name"] == payload.name for c in space["channels"]):
        raise HTTPException(status_code=409, detail="Channel name already exists in this space")
    prefix = space["id"][:1] if space["id"] else "c"
    channel = {
        "id": f"{prefix}-{payload.name}-{uuid4().hex[:4]}",
        "name": payload.name,
        "purpose": payload.purpose or "Discussion channel.",
        "lockedAdminWrite": payload.lockedAdminWrite,
        "unread": 0,
        "lastActiveAt": "now",
        "pinned": 0,
        "members": space.get("members", 0),
    }
    space["channels"].append(channel)
    COMMUNITY_THREADS.setdefault(channel["id"], [])
    return {"channel": channel, "spaceId": space_id}
