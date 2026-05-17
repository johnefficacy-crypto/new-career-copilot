"""Admin marketplace ops — course CRUD, order browsing, refund review.

All writes go through the service-role client and write to ``admin_audit_logs``.
Razorpay refunds are routed through the shared client; on Razorpay failure we
mark the refund row ``failed`` and touch nothing else so state stays consistent.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.supabase_client import get_supabase_admin
from app.payments import razorpay_client

logger = logging.getLogger("career_copilot.api.admin_marketplace")
router = APIRouter(prefix="/admin/marketplace", tags=["admin-marketplace"])


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = (user.get("role") or "").lower()
    if role in {"admin", "super_admin"}:
        return user
    raise HTTPException(status_code=403, detail="Admin role required")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return s[:80] or "course"


def _audit(sb, *, actor: dict, action: str, entity_type: str, entity_id: str | None, new_value: Any = None, old_value: Any = None, notes: str = "admin_marketplace") -> None:
    try:
        sb.table("admin_audit_logs").insert(
            {
                "actor_id": actor.get("id"),
                "actor_email": actor.get("email"),
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "new_value": new_value,
                "old_value": old_value,
                "notes": notes,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("audit insert failed action=%s entity=%s", action, entity_id)


# ─── Courses ──────────────────────────────────────────────────────────────────


class CourseIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    slug: str | None = None
    short_description: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    preview_video_url: str | None = None
    price_inr: int = Field(default=0, ge=0)
    original_price_inr: int | None = Field(default=None, ge=0)
    level: str = "all"
    language: str = "Hindi"
    exam_tags: list[str] = Field(default_factory=list)
    refund_window_days: int = Field(default=7, ge=0, le=180)
    is_affiliate: bool = False
    affiliate_disclosure: str | None = None
    instructor_id: str | None = None
    commission_pct: int = Field(default=20, ge=0, le=100)


class CoursePatch(BaseModel):
    title: str | None = None
    slug: str | None = None
    short_description: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    preview_video_url: str | None = None
    price_inr: int | None = Field(default=None, ge=0)
    original_price_inr: int | None = Field(default=None, ge=0)
    level: str | None = None
    language: str | None = None
    exam_tags: list[str] | None = None
    refund_window_days: int | None = Field(default=None, ge=0, le=180)
    is_affiliate: bool | None = None
    affiliate_disclosure: str | None = None
    instructor_id: str | None = None
    commission_pct: int | None = Field(default=None, ge=0, le=100)


@router.get("/courses")
def list_courses(
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    _admin: dict = Depends(_require_admin),
):
    sb = get_supabase_admin()
    query = sb.table("courses").select("*").order("updated_at", desc=True).limit(limit)
    if status:
        query = query.eq("status", status)
    if q:
        query = query.ilike("title", f"%{q}%")
    rows = query.execute().data or []
    return {"items": rows}


@router.post("/courses")
def create_course(payload: CourseIn, admin: dict = Depends(_require_admin)):
    if payload.is_affiliate and not (payload.affiliate_disclosure and payload.affiliate_disclosure.strip()):
        raise HTTPException(status_code=400, detail="Affiliate disclosure required when is_affiliate=true")
    sb = get_supabase_admin()
    record = payload.model_dump(exclude_none=True)
    record["status"] = "draft"
    if not record.get("slug"):
        record["slug"] = _slug(record["title"])
    rows = sb.table("courses").insert(record).execute().data or []
    if not rows:
        raise HTTPException(status_code=400, detail="Could not create course")
    course = rows[0]
    _audit(sb, actor=admin, action="marketplace.course.create", entity_type="course", entity_id=course["id"], new_value=record)
    return {"course": course}


@router.put("/courses/{course_id}")
def update_course(course_id: str, patch: CoursePatch, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    update = patch.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if update.get("is_affiliate") is True and update.get("affiliate_disclosure") in (None, ""):
        existing = sb.table("courses").select("affiliate_disclosure").eq("id", course_id).limit(1).execute().data or []
        if not existing or not (existing[0].get("affiliate_disclosure") or "").strip():
            raise HTTPException(status_code=400, detail="Affiliate disclosure required when is_affiliate=true")
    update["updated_at"] = _now_iso()
    rows = sb.table("courses").update(update).eq("id", course_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    _audit(sb, actor=admin, action="marketplace.course.update", entity_type="course", entity_id=course_id, new_value=update)
    return {"course": rows[0]}


@router.post("/courses/{course_id}/publish")
def publish_course(course_id: str, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    rows = sb.table("courses").update({"status": "published", "updated_at": _now_iso()}).eq("id", course_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    _audit(sb, actor=admin, action="marketplace.course.publish", entity_type="course", entity_id=course_id, new_value={"status": "published"})
    return {"course": rows[0]}


@router.post("/courses/{course_id}/archive")
def archive_course(course_id: str, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    rows = sb.table("courses").update({"status": "archived", "updated_at": _now_iso()}).eq("id", course_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    _audit(sb, actor=admin, action="marketplace.course.archive", entity_type="course", entity_id=course_id, new_value={"status": "archived"})
    return {"course": rows[0]}


# ─── Orders ───────────────────────────────────────────────────────────────────


@router.get("/orders")
def list_orders(
    status: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    course_id: str | None = Query(default=None),
    since: str | None = Query(default=None, description="ISO timestamp"),
    limit: int = Query(default=100, ge=1, le=500),
    _admin: dict = Depends(_require_admin),
):
    sb = get_supabase_admin()
    q = sb.table("marketplace_orders").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    if user_id:
        q = q.eq("user_id", user_id)
    if course_id:
        q = q.eq("course_id", course_id)
    if since:
        q = q.gte("created_at", since)
    return {"items": q.execute().data or []}


# ─── Refunds ──────────────────────────────────────────────────────────────────


@router.get("/refunds")
def list_refunds(
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    _admin: dict = Depends(_require_admin),
):
    sb = get_supabase_admin()
    q = sb.table("marketplace_refunds").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    return {"items": q.execute().data or []}


@router.post("/refunds/{refund_id}/approve")
def approve_refund(refund_id: str, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    rows = sb.table("marketplace_refunds").select("*").eq("id", refund_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Refund not found")
    refund = rows[0]
    if refund.get("status") not in ("requested", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot approve refund in status={refund.get('status')}")

    order_rows = sb.table("marketplace_orders").select("*").eq("id", refund["order_id"]).limit(1).execute().data or []
    if not order_rows:
        raise HTTPException(status_code=404, detail="Order missing for refund")
    order = order_rows[0]
    payment_id = order.get("razorpay_payment_id")
    amount = int(refund.get("amount_inr") or order.get("amount_inr") or 0)

    # Free-course refund: no Razorpay call, just flip the entitlement.
    if amount <= 0 or not payment_id:
        return _finalise_approved_refund(
            sb,
            admin=admin,
            refund=refund,
            order=order,
            razorpay_refund_id=None,
        )

    try:
        rzp_refund = razorpay_client.refund(payment_id, amount, notes={"refund_id": refund_id})
    except HTTPException:
        failed = (
            sb.table("marketplace_refunds")
            .update({"status": "failed", "resolved_at": _now_iso(), "reviewed_by": admin.get("id")})
            .eq("id", refund_id)
            .execute()
            .data
            or []
        )
        _audit(
            sb,
            actor=admin,
            action="marketplace.refund.failed",
            entity_type="marketplace_refund",
            entity_id=refund_id,
            new_value={"order_id": order["id"], "amount_inr": amount},
        )
        raise HTTPException(status_code=502, detail="Razorpay refund failed") from None

    return _finalise_approved_refund(
        sb,
        admin=admin,
        refund=refund,
        order=order,
        razorpay_refund_id=rzp_refund.get("id"),
    )


def _finalise_approved_refund(sb, *, admin: dict, refund: dict, order: dict, razorpay_refund_id: str | None):
    refund_id = refund["id"]
    refund_update = {
        "status": "processed",
        "razorpay_refund_id": razorpay_refund_id,
        "reviewed_by": admin.get("id"),
        "resolved_at": _now_iso(),
    }
    refund_rows = sb.table("marketplace_refunds").update(refund_update).eq("id", refund_id).execute().data or []
    sb.table("marketplace_orders").update(
        {"status": "refunded", "refunded_at": _now_iso()}
    ).eq("id", order["id"]).execute()
    sb.table("enrollments").update(
        {"status": "refunded", "completed_at": None}
    ).eq("user_id", order["user_id"]).eq("course_id", order["course_id"]).execute()
    _audit(
        sb,
        actor=admin,
        action="marketplace.refund.approved",
        entity_type="marketplace_refund",
        entity_id=refund_id,
        new_value={
            "order_id": order["id"],
            "course_id": order["course_id"],
            "user_id": order["user_id"],
            "amount_inr": refund.get("amount_inr"),
            "razorpay_refund_id": razorpay_refund_id,
        },
    )
    return {"refund": refund_rows[0] if refund_rows else {**refund, **refund_update}}


class RefundDecision(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


@router.post("/refunds/{refund_id}/deny")
def deny_refund(refund_id: str, body: RefundDecision | None = None, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    rows = sb.table("marketplace_refunds").select("*").eq("id", refund_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Refund not found")
    if rows[0].get("status") != "requested":
        raise HTTPException(status_code=400, detail="Only requested refunds can be denied")
    update = {
        "status": "denied",
        "reviewed_by": admin.get("id"),
        "resolved_at": _now_iso(),
    }
    updated = sb.table("marketplace_refunds").update(update).eq("id", refund_id).execute().data or []
    _audit(
        sb,
        actor=admin,
        action="marketplace.refund.denied",
        entity_type="marketplace_refund",
        entity_id=refund_id,
        new_value={"order_id": rows[0].get("order_id")},
        notes=(body.note if body else None) or "admin_marketplace",
    )
    return {"refund": updated[0] if updated else {**rows[0], **update}}


# ─── Providers (basic CRUD) ───────────────────────────────────────────────────


class ProviderIn(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    instructor_bio: str | None = None
    avatar_url: str | None = None
    is_instructor: bool = True


@router.get("/providers")
def list_providers(_admin: dict = Depends(_require_admin), limit: int = Query(default=100, ge=1, le=500)):
    sb = get_supabase_admin()
    rows = (
        sb.table("profiles")
        .select("id, full_name, instructor_bio, avatar_url, is_instructor")
        .eq("is_instructor", True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.put("/providers/{provider_id}")
def update_provider(provider_id: str, payload: ProviderIn, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    update = payload.model_dump(exclude_none=True)
    rows = sb.table("profiles").update(update).eq("id", provider_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Provider not found")
    _audit(sb, actor=admin, action="marketplace.provider.update", entity_type="profile", entity_id=provider_id, new_value=update)
    return {"provider": rows[0]}


# ─── KPIs ─────────────────────────────────────────────────────────────────────


def _count(sb, table: str, **filters) -> int:
    try:
        q = sb.table(table).select("id", count="exact")
        for k, v in filters.items():
            q = q.eq(k, v)
        return int(getattr(q.execute(), "count", None) or 0)
    except Exception:
        return 0


@router.get("/kpis")
def kpis(_admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    paid_orders = (
        sb.table("marketplace_orders")
        .select("amount_inr")
        .eq("status", "paid")
        .limit(1000)
        .execute()
        .data
        or []
    )
    refunded_orders_count = _count(sb, "marketplace_orders", status="refunded")
    paid_count = len(paid_orders)
    gmv = sum(int(r.get("amount_inr") or 0) for r in paid_orders)
    return {
        "counts": {
            "courses_total": _count(sb, "courses"),
            "courses_published": _count(sb, "courses", status="published"),
            "courses_draft": _count(sb, "courses", status="draft"),
            "orders_paid": paid_count,
            "orders_refunded": refunded_orders_count,
            "refunds_open": _count(sb, "marketplace_refunds", status="requested"),
            "enrollments_active": _count(sb, "enrollments", status="active"),
        },
        "gmv_inr": gmv,
        "refund_rate": round(refunded_orders_count / paid_count, 4) if paid_count else 0,
    }
