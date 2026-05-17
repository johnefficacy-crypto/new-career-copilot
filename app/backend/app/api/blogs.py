from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db.supabase_client import get_supabase_admin

router = APIRouter(tags=["blogs"])
admin_router = APIRouter(prefix="/admin/blogs", tags=["admin-blogs"])


class BlogPostUpsert(BaseModel):
    title: str = Field(min_length=5, max_length=220)
    slug: str = Field(min_length=5, max_length=240)
    excerpt: str | None = None
    content: str = ""
    status: str = "draft"
    category_id: int | None = None
    cover_image_url: str | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    canonical_url: str | None = None
    robots_index: bool = True
    related_recruitment_id: int | None = None
    related_organization_id: int | None = None
    primary_intent: str | None = None
    primary_cta_label: str | None = None
    primary_cta_url: str | None = None
    secondary_cta_label: str | None = None
    secondary_cta_url: str | None = None
    published_at: datetime | None = None


def _seo_missing(row: dict) -> bool:
    return not (row.get("seo_title") and row.get("seo_description"))


def _cta_missing(row: dict) -> bool:
    return not (row.get("primary_cta_label") and row.get("primary_cta_url"))


@router.get("/blogs")
def list_public_blogs(
    q: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
):
    sb = get_supabase_admin()
    query = sb.table("blog_posts").select("*").eq("status", "published").order("published_at", desc=True)
    if q:
        query = query.ilike("title", f"%{q.strip()}%")
    if category_id:
        query = query.eq("category_id", category_id)
    return {"items": query.execute().data or []}


@router.get("/blogs/{slug}")
def get_public_blog(slug: str):
    sb = get_supabase_admin()
    row = sb.table("blog_posts").select("*").eq("slug", slug).eq("status", "published").limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Blog not found")
    return row[0]


@admin_router.get("")
def admin_list_blogs(
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    missing_seo: bool = Query(default=False),
    missing_cta: bool = Query(default=False),
):
    sb = get_supabase_admin()
    query = sb.table("blog_posts").select("*").order("updated_at", desc=True)
    if q:
        query = query.ilike("title", f"%{q.strip()}%")
    if status:
        query = query.eq("status", status)
    rows = query.execute().data or []
    if missing_seo:
        rows = [r for r in rows if _seo_missing(r)]
    if missing_cta:
        rows = [r for r in rows if _cta_missing(r)]
    return {"items": rows}


@admin_router.get("/{blog_id}")
def admin_get_blog(blog_id: int):
    sb = get_supabase_admin()
    row = sb.table("blog_posts").select("*").eq("id", blog_id).limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Blog not found")
    return row[0]


@admin_router.post("")
def admin_create_blog(payload: BlogPostUpsert):
    sb = get_supabase_admin()
    body = payload.model_dump()
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    if body.get("status") == "published" and not body.get("published_at"):
        body["published_at"] = datetime.now(timezone.utc).isoformat()
    created = sb.table("blog_posts").insert(body).execute().data
    return created[0] if created else body


@admin_router.put("/{blog_id}")
def admin_update_blog(blog_id: int, payload: BlogPostUpsert):
    sb = get_supabase_admin()
    body = payload.model_dump()
    body["updated_at"] = datetime.now(timezone.utc).isoformat()
    if body.get("status") == "published" and not body.get("published_at"):
        body["published_at"] = datetime.now(timezone.utc).isoformat()
    updated = sb.table("blog_posts").update(body).eq("id", blog_id).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="Blog not found")
    return updated[0]


@admin_router.post("/{blog_id}/publish")
def admin_publish_blog(blog_id: int):
    sb = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()
    updated = sb.table("blog_posts").update({"status": "published", "published_at": now, "updated_at": now}).eq("id", blog_id).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="Blog not found")
    return updated[0]


@admin_router.post("/{blog_id}/archive")
def admin_archive_blog(blog_id: int):
    sb = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()
    updated = sb.table("blog_posts").update({"status": "archived", "updated_at": now}).eq("id", blog_id).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="Blog not found")
    return updated[0]
