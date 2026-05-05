"""Community: categories, threads, posts, moderation placeholders."""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.security import get_current_user, iso, now_utc
from app.server_deps import get_db

router = APIRouter(prefix="/community", tags=["community"])


def _thread(t: dict, with_body: bool = False) -> dict:
    out = {
        "id": str(t["_id"]),
        "slug": t["slug"],
        "category": t["category"],
        "title": t["title"],
        "author": t.get("author", "Anonymous"),
        "badge": t.get("badge"),
        "pinned": bool(t.get("pinned")),
        "votes": t.get("votes", 0),
        "replies_count": t.get("replies_count", 0),
        "tag": t.get("tag"),
        "created_at": iso(t.get("created_at")),
    }
    if with_body:
        out["body"] = t.get("body", "")
    else:
        body = t.get("body", "")
        out["excerpt"] = body if len(body) < 200 else body[:200] + "…"
    return out


@router.get("/categories")
async def categories():
    db = get_db()
    items = []
    async for c in db.community_categories.find().sort("label", 1):
        c.pop("_id", None)
        items.append(c)
    return {"items": items}


@router.get("/threads")
async def threads(
    category: str | None = Query(default=None),
    sort: str = Query(default="hot"),
):
    db = get_db()
    q: dict = {}
    if category:
        q["category"] = category
    sort_spec = [("pinned", -1), ("votes", -1)]
    if sort == "new":
        sort_spec = [("pinned", -1), ("created_at", -1)]
    if sort == "unanswered":
        q["replies_count"] = 0
    cursor = db.community_threads.find(q).sort(sort_spec)
    return {"items": [_thread(t) async for t in cursor]}


@router.get("/threads/{slug}")
async def thread_detail(slug: str):
    db = get_db()
    t = await db.community_threads.find_one({"slug": slug})
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    posts = []
    async for p in db.community_posts.find({"thread_id": t["_id"]}).sort("created_at", 1):
        posts.append(
            {
                "id": str(p["_id"]),
                "author": p.get("author", "Anonymous"),
                "body": p.get("body", ""),
                "votes": p.get("votes", 0),
                "created_at": iso(p.get("created_at")),
                "accepted": bool(p.get("accepted")),
            }
        )
    return {"thread": _thread(t, with_body=True), "posts": posts}


class ThreadCreate(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    category: str
    body: str = Field(min_length=10, max_length=4000)
    tag: str | None = Field(default="Discussion", max_length=24)


class PostCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


def _slugify(s: str) -> str:
    import re, time

    base = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]
    return f"{base}-{int(time.time())}"


@router.post("/threads")
async def create_thread(body: ThreadCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    cat = await db.community_categories.find_one({"id": body.category})
    if not cat:
        raise HTTPException(status_code=400, detail="Invalid category")
    if cat.get("admin_only") and user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Category is admin-only")
    doc = {
        "slug": _slugify(body.title),
        "title": body.title.strip(),
        "category": body.category,
        "body": body.body,
        "author": user.get("name") or user["email"],
        "author_id": user["_id"],
        "badge": {"mentor": "Mentor", "admin": "Admin", "super_admin": "Admin"}.get(
            user.get("role"), None
        ),
        "tag": body.tag or "Discussion",
        "votes": 0,
        "replies_count": 0,
        "pinned": False,
        "created_at": now_utc(),
    }
    result = await db.community_threads.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _thread(doc, with_body=True)


@router.post("/threads/{slug}/posts")
async def add_post(slug: str, body: PostCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    thread = await db.community_threads.find_one({"slug": slug})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    doc = {
        "thread_id": thread["_id"],
        "author": user.get("name") or user["email"],
        "author_id": user["_id"],
        "body": body.body,
        "votes": 0,
        "created_at": now_utc(),
    }
    result = await db.community_posts.insert_one(doc)
    await db.community_threads.update_one(
        {"_id": thread["_id"]}, {"$inc": {"replies_count": 1}}
    )
    doc["_id"] = result.inserted_id
    return {
        "id": str(result.inserted_id),
        "author": doc["author"],
        "body": doc["body"],
        "votes": 0,
        "created_at": iso(doc["created_at"]),
    }


@router.post("/threads/{slug}/vote")
async def vote_thread(slug: str, user: dict = Depends(get_current_user)):
    db = get_db()
    key = {"user_id": user["_id"], "thread_slug": slug}
    existing = await db.community_votes.find_one(key)
    if existing:
        await db.community_votes.delete_one({"_id": existing["_id"]})
        await db.community_threads.update_one({"slug": slug}, {"$inc": {"votes": -1}})
        return {"voted": False}
    await db.community_votes.insert_one(key)
    await db.community_threads.update_one({"slug": slug}, {"$inc": {"votes": 1}})
    return {"voted": True}
