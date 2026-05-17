"""Marketplace — published catalogue + Razorpay one-time course purchase.

Hard rules
----------
* Server is the only price authority. Read ``courses.price_inr``.
* One source of truth for entitlement: ``enrollments.status``.
* Idempotency at three layers: client-supplied key, partial unique index on
  open orders, unique ``razorpay_payment_id``.
* No AI in price, payment, entitlement, refund, or access decisions.

Public read endpoints stay shape-compatible with what canonical.py used to
serve so the existing Marketplace / ResourceDetail pages keep working.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.auth import get_current_user, get_optional_user
from app.db.supabase_client import get_supabase_admin
from app.payments import razorpay_client

logger = logging.getLogger("career_copilot.api.marketplace")
router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _safe(call, default=None):
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase call failed: %s", exc)
        return default


# ─── Catalogue shaping ────────────────────────────────────────────────────────


def _shape_course(c: dict[str, Any]) -> dict[str, Any]:
    profiles = c.get("profiles")
    provider = profiles.get("full_name") if isinstance(profiles, dict) else None
    return {
        "id": c.get("id"),
        "title": c.get("title"),
        "slug": c.get("slug"),
        "provider": provider,
        "type": "course",
        "price": c.get("price_inr"),
        "price_inr": c.get("price_inr"),
        "original_price": c.get("original_price_inr"),
        "rating": float(c.get("avg_rating") or 0),
        "students": c.get("total_enrollments") or 0,
        "exams": c.get("exam_tags") or [],
        "level": c.get("level"),
        "language": c.get("language"),
        "thumbnail": c.get("thumbnail_url"),
        "short_description": c.get("short_description"),
        "duration_mins": c.get("total_duration_mins"),
        "total_lessons": c.get("total_lessons"),
        "refund_window_days": c.get("refund_window_days"),
        "is_affiliate": c.get("is_affiliate") or False,
        "affiliate_disclosure": c.get("affiliate_disclosure"),
    }


def _course_select() -> str:
    return (
        "id, title, slug, short_description, thumbnail_url, price_inr, "
        "original_price_inr, level, language, exam_tags, total_lessons, "
        "total_duration_mins, avg_rating, total_enrollments, status, "
        "refund_window_days, is_affiliate, affiliate_disclosure, "
        "profiles!instructor_id ( full_name )"
    )


# ════════════════════════════════════════════════════════════════════════════
#  Catalogue (read)
# ════════════════════════════════════════════════════════════════════════════


@router.get("/resources")
async def list_resources(exam: str | None = Query(default=None), type: str | None = Query(default=None)):
    sb = get_supabase_admin()
    q = sb.table("courses").select(_course_select()).eq("status", "published")
    if exam:
        q = q.contains("exam_tags", [exam])
    rows = _safe(lambda: q.order("total_enrollments", desc=True).limit(60).execute().data, default=[]) or []
    return {"items": [_shape_course(r) for r in rows]}


@router.get("/resources/{course_id}")
async def resource_detail(course_id: str):
    sb = get_supabase_admin()
    rows = _safe(
        lambda: sb.table("courses")
        .select(
            "*, profiles!instructor_id ( full_name, instructor_bio ), "
            "course_sections ( id, title, order_index, lessons ( id, title, type, duration_mins, is_free_preview, order_index ) )"
        )
        .eq("id", course_id)
        .eq("status", "published")
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Resource not found")
    c = rows[0]
    out = _shape_course(c)
    out["description"] = c.get("description")
    sections = sorted(c.get("course_sections") or [], key=lambda s: s.get("order_index") or 0)
    out["sections"] = [
        {
            "id": s.get("id"),
            "title": s.get("title"),
            "order_index": s.get("order_index"),
            "lessons": sorted(
                [
                    {
                        "id": lesson.get("id"),
                        "title": lesson.get("title"),
                        "type": lesson.get("type"),
                        "duration_mins": lesson.get("duration_mins"),
                        "is_preview": bool(lesson.get("is_free_preview")),
                        "order_index": lesson.get("order_index"),
                    }
                    for lesson in (s.get("lessons") or [])
                ],
                key=lambda l: l.get("order_index") or 0,
            ),
        }
        for s in sections
    ]
    out["curriculum"] = [
        {
            "module": s["title"],
            "lessons": len(s["lessons"]),
            "duration": sum((l.get("duration_mins") or 0) for l in s["lessons"]),
        }
        for s in out["sections"]
    ]
    review_rows = _safe(
        lambda: sb.table("reviews")
        .select("rating, body, created_at, profiles!reviews_user_id_fkey ( full_name )")
        .eq("course_id", course_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data,
        default=[],
    ) or []
    out["reviews"] = [
        {
            "name": (r.get("profiles") or {}).get("full_name") if isinstance(r.get("profiles"), dict) else "Anonymous",
            "rating": r.get("rating"),
            "text": r.get("body"),
        }
        for r in review_rows
    ]
    return out


@router.get("/providers")
async def providers():
    sb = get_supabase_admin()
    rows = _safe(
        lambda: sb.table("profiles")
        .select("id, full_name, courses!instructor_id ( id, exam_tags, avg_rating, status )")
        .eq("is_instructor", True)
        .limit(40)
        .execute()
        .data,
        default=[],
    ) or []
    items = []
    for p in rows:
        courses = [c for c in (p.get("courses") or []) if c.get("status") == "published"]
        if not courses:
            continue
        ratings = [c.get("avg_rating") for c in courses if c.get("avg_rating")]
        items.append(
            {
                "id": p["id"],
                "name": p.get("full_name"),
                "type": "Individual",
                "courses": len(courses),
                "rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
                "exams": sorted({t for c in courses for t in (c.get("exam_tags") or [])}),
            }
        )
    return {"items": items}


@router.get("/affiliates")
async def affiliates():
    """Surface published courses that carry an affiliate disclosure."""
    sb = get_supabase_admin()
    rows = _safe(
        lambda: sb.table("courses")
        .select("id, title, exam_tags, affiliate_disclosure, price_inr, profiles!instructor_id ( full_name )")
        .eq("status", "published")
        .eq("is_affiliate", True)
        .limit(40)
        .execute()
        .data,
        default=[],
    ) or []
    items = [
        {
            "id": r["id"],
            "name": r.get("title"),
            "type": "course",
            "commission": "disclosed",
            "disclosure": r.get("affiliate_disclosure"),
            "exams": r.get("exam_tags") or [],
            "provider": (r.get("profiles") or {}).get("full_name") if isinstance(r.get("profiles"), dict) else None,
        }
        for r in rows
    ]
    return {"items": items}


# Mentors — kept seed-shaped exactly like canonical.py used to render them.


@router.get("/mentors")
async def list_mentors(exam: str | None = Query(default=None)):
    sb = get_supabase_admin()
    rows = _safe(
        lambda: sb.table("profiles")
        .select("id, full_name, instructor_bio, avatar_url, courses!instructor_id ( id, exam_tags, price_inr, avg_rating )")
        .eq("is_instructor", True)
        .limit(60)
        .execute()
        .data,
        default=[],
    ) or []
    items = []
    for p in rows:
        courses = p.get("courses") or []
        all_exams = sorted({tag for c in courses for tag in (c.get("exam_tags") or [])})
        if exam and exam not in all_exams:
            continue
        prices = [c.get("price_inr") for c in courses if c.get("price_inr") is not None]
        ratings = [c.get("avg_rating") for c in courses if c.get("avg_rating")]
        items.append(
            {
                "id": p.get("id"),
                "name": p.get("full_name"),
                "headline": (p.get("instructor_bio") or "")[:80],
                "bio": p.get("instructor_bio"),
                "exams": all_exams,
                "avatar": p.get("avatar_url"),
                "sessions": len(courses),
                "price_per_hour": min(prices) if prices else 0,
                "rating": round(sum(ratings) / len(ratings), 2) if ratings else 0,
                "languages": p.get("languages") or ["English"],
            }
        )
    return {"items": items}


@router.get("/mentors/{mid}")
async def mentor_detail(mid: str):
    sb = get_supabase_admin()
    rows = _safe(
        lambda: sb.table("profiles")
        .select(
            "id, full_name, instructor_bio, avatar_url, "
            "courses!instructor_id ( id, title, slug, exam_tags, price_inr, avg_rating, total_enrollments )"
        )
        .eq("id", mid)
        .limit(1)
        .execute()
        .data,
        default=[],
    ) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Mentor not found")
    p = rows[0]
    courses = p.get("courses") or []
    prices = [c.get("price_inr") for c in courses if c.get("price_inr") is not None]
    ratings = [c.get("avg_rating") for c in courses if c.get("avg_rating")]
    return {
        "id": p["id"],
        "name": p.get("full_name"),
        "headline": (p.get("instructor_bio") or "")[:120],
        "bio": p.get("instructor_bio"),
        "avatar": p.get("avatar_url"),
        "exams": sorted({t for c in courses for t in (c.get("exam_tags") or [])}),
        "courses": courses,
        "sessions": sum((c.get("total_enrollments") or 0) for c in courses),
        "price_per_hour": min(prices) if prices else 0,
        "rating": round(sum(ratings) / len(ratings), 2) if ratings else 0,
        "languages": p.get("languages") or ["English"],
        "availability": [],
        "testimonials": [],
    }


# ════════════════════════════════════════════════════════════════════════════
#  Purchase + verify
# ════════════════════════════════════════════════════════════════════════════


class OrderIn(BaseModel):
    idempotency_key: str | None = Field(default=None, max_length=80)


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RefundIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class ProgressIn(BaseModel):
    percent: int | None = Field(default=None, ge=0, le=100)
    completed: bool = False
    watch_seconds: int | None = Field(default=None, ge=0)


def _ensure_profile(user: dict) -> None:
    sb = get_supabase_admin()
    rows = sb.table("profiles").select("id").eq("id", user["id"]).limit(1).execute().data or []
    if rows:
        return
    sb.table("profiles").insert(
        {
            "id": user["id"],
            "full_name": user.get("name") or (user.get("email") or "").split("@")[0] or "User",
        }
    ).execute()


def _get_published_course(sb, course_id: str) -> dict[str, Any]:
    rows = sb.table("courses").select("*").eq("id", course_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    course = rows[0]
    if course.get("status") != "published":
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _activate_enrollment(sb, *, user_id: str, course_id: str, amount_inr: int, order: dict[str, Any]) -> dict[str, Any]:
    """Upsert an enrollment to ``active`` after a verified payment."""
    existing = (
        sb.table("enrollments")
        .select("id, status")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    payload = {
        "status": "active",
        "amount_paid_inr": amount_inr,
        "razorpay_order_id": order.get("razorpay_order_id"),
        "razorpay_payment_id": order.get("razorpay_payment_id"),
        "enrolled_at": _now_iso(),
        "completed_at": None,
    }
    if existing:
        sb.table("enrollments").update(payload).eq("id", existing[0]["id"]).execute()
        return {**existing[0], **payload}
    insert = {"user_id": user_id, "course_id": course_id, **payload}
    rows = sb.table("enrollments").insert(insert).execute().data or []
    return rows[0] if rows else insert


def _audit(sb, *, actor_id: str | None, action: str, entity_type: str, entity_id: str | None, new_value: Any = None, notes: str = "marketplace") -> None:
    try:
        sb.table("admin_audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "new_value": new_value,
                "notes": notes,
            }
        ).execute()
    except Exception:  # noqa: BLE001
        logger.exception("audit insert failed action=%s entity=%s", action, entity_id)


@router.post("/resources/{course_id}/order")
def create_order(course_id: str, body: OrderIn, user: dict = Depends(get_current_user)):
    _ensure_profile(user)
    sb = get_supabase_admin()
    course = _get_published_course(sb, course_id)
    price = int(course.get("price_inr") or 0)

    # Reuse the open order for this (user, course) when one exists. The partial
    # unique index makes the race-loss case a fast failure rather than a duplicate.
    open_rows = (
        sb.table("marketplace_orders")
        .select("*")
        .eq("user_id", user["id"])
        .eq("course_id", course_id)
        .eq("status", "created")
        .limit(1)
        .execute()
        .data
        or []
    )
    if open_rows:
        existing = open_rows[0]
        if body.idempotency_key and existing.get("idempotency_key") and existing["idempotency_key"] != body.idempotency_key:
            # Different idempotency key on a still-open order — caller must wait
            # or supply the same key. Surface the existing order so the client
            # can recover instead of double-billing.
            return _order_response(course, existing, price)
        return _order_response(course, existing, price)

    # ── Free course path ──────────────────────────────────────────────────
    if price <= 0:
        order_row = {
            "user_id": user["id"],
            "course_id": course_id,
            "amount_inr": 0,
            "currency": "INR",
            "status": "paid",
            "paid_at": _now_iso(),
            "idempotency_key": body.idempotency_key,
            "metadata": {"free": True},
        }
        try:
            rows = sb.table("marketplace_orders").insert(order_row).execute().data or []
        except Exception as exc:  # noqa: BLE001
            logger.warning("free order insert race: %s", exc)
            rows = (
                sb.table("marketplace_orders")
                .select("*")
                .eq("user_id", user["id"])
                .eq("course_id", course_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
                .data
                or []
            )
        if not rows:
            raise HTTPException(status_code=500, detail="Could not record free enrollment order")
        order = rows[0]
        enrollment = _activate_enrollment(
            sb,
            user_id=user["id"],
            course_id=course_id,
            amount_inr=0,
            order=order,
        )
        return {
            "free": True,
            "order": {"id": order["id"], "status": "paid", "amount_inr": 0},
            "enrollment": {"id": enrollment.get("id"), "status": "active"},
            "course": {"id": course_id, "title": course.get("title"), "price_inr": 0},
        }

    # ── Paid course path ──────────────────────────────────────────────────
    receipt = f"crs_{course_id[:8]}_{int(_now().timestamp())}"
    rzp_order = razorpay_client.create_order(
        amount_inr=price,
        receipt=receipt,
        notes={"user_id": user["id"], "course_id": course_id, "kind": "course"},
    )
    insert = {
        "user_id": user["id"],
        "course_id": course_id,
        "amount_inr": price,
        "currency": "INR",
        "status": "created",
        "razorpay_order_id": rzp_order["id"],
        "idempotency_key": body.idempotency_key,
        "metadata": {"receipt": rzp_order.get("receipt")},
    }
    try:
        rows = sb.table("marketplace_orders").insert(insert).execute().data or []
    except Exception as exc:  # noqa: BLE001
        # Partial unique index loss — another request just created the order.
        logger.warning("order insert race for user=%s course=%s: %s", user["id"], course_id, exc)
        rows = (
            sb.table("marketplace_orders")
            .select("*")
            .eq("user_id", user["id"])
            .eq("course_id", course_id)
            .eq("status", "created")
            .limit(1)
            .execute()
            .data
            or []
        )
    if not rows:
        raise HTTPException(status_code=500, detail="Could not create order")
    return _order_response(course, rows[0], price, rzp_order=rzp_order, user=user)


def _order_response(course: dict, order_row: dict, price: int, *, rzp_order: dict | None = None, user: dict | None = None) -> dict[str, Any]:
    key_id = razorpay_client.get_public_key_id() if price > 0 else None
    rzp = rzp_order or {
        "id": order_row.get("razorpay_order_id"),
        "amount": price * 100,
        "currency": "INR",
    }
    return {
        "free": price <= 0,
        "order": {
            "id": order_row["id"],
            "razorpay_order_id": order_row.get("razorpay_order_id"),
            "amount": int(rzp.get("amount") or price * 100),
            "currency": rzp.get("currency") or "INR",
            "status": order_row.get("status"),
        },
        "key_id": key_id,
        "course": {
            "id": course["id"],
            "title": course.get("title"),
            "price_inr": price,
            "refund_window_days": course.get("refund_window_days"),
        },
        "user": {"email": (user or {}).get("email"), "name": (user or {}).get("name")},
    }


def _settle_paid_order(sb, order: dict[str, Any], *, payment_id: str, actor_id: str | None) -> dict[str, Any]:
    """Mark an order paid + upsert active enrollment. Idempotent: a second
    invocation with the same payment_id is a no-op."""
    if order.get("status") == "paid" and order.get("razorpay_payment_id") == payment_id:
        existing_enrollment = (
            sb.table("enrollments")
            .select("id, status")
            .eq("user_id", order["user_id"])
            .eq("course_id", order["course_id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        return {
            "order": order,
            "enrollment": existing_enrollment[0] if existing_enrollment else None,
            "already_settled": True,
        }
    updated = (
        sb.table("marketplace_orders")
        .update(
            {
                "status": "paid",
                "razorpay_payment_id": payment_id,
                "paid_at": _now_iso(),
            }
        )
        .eq("id", order["id"])
        .execute()
        .data
        or []
    )
    order = updated[0] if updated else order
    enrollment = _activate_enrollment(
        sb,
        user_id=order["user_id"],
        course_id=order["course_id"],
        amount_inr=int(order.get("amount_inr") or 0),
        order=order,
    )
    _audit(
        sb,
        actor_id=actor_id or order["user_id"],
        action="marketplace.order.paid",
        entity_type="marketplace_order",
        entity_id=order["id"],
        new_value={"course_id": order["course_id"], "amount_inr": order.get("amount_inr")},
        notes="marketplace_purchase",
    )
    return {"order": order, "enrollment": enrollment, "already_settled": False}


@router.post("/resources/{course_id}/verify")
def verify_purchase(course_id: str, body: VerifyIn, user: dict = Depends(get_current_user)):
    if not razorpay_client.verify_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    ):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    sb = get_supabase_admin()
    rows = (
        sb.table("marketplace_orders")
        .select("*")
        .eq("razorpay_order_id", body.razorpay_order_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Order not found for this user")
    order = rows[0]
    if order.get("course_id") != course_id:
        raise HTTPException(status_code=400, detail="Order does not match course")

    result = _settle_paid_order(sb, order, payment_id=body.razorpay_payment_id, actor_id=user["id"])
    enrollment = result.get("enrollment") or {}
    return {
        "status": "active",
        "course_id": course_id,
        "enrollment_id": enrollment.get("id"),
        "order_id": order["id"],
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not razorpay_client.verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = payload.get("event") or "unknown"
    payment_entity = ((payload.get("payload") or {}).get("payment") or {}).get("entity") or {}
    order_id = payment_entity.get("order_id")
    payment_id = payment_entity.get("id")

    sb = get_supabase_admin()
    if not order_id:
        return {"ok": True, "event": event, "ignored": "no_order_id"}

    rows = (
        sb.table("marketplace_orders")
        .select("*")
        .eq("razorpay_order_id", order_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        # Subscriptions and other webhooks share the same Razorpay account.
        # Silently ignore orders that didn't originate here.
        return {"ok": True, "event": event, "ignored": "unknown_order"}
    order = rows[0]

    if event == "payment.captured" and payment_id:
        _settle_paid_order(sb, order, payment_id=payment_id, actor_id=None)
    elif event == "payment.failed":
        sb.table("marketplace_orders").update({"status": "failed"}).eq("id", order["id"]).execute()
    return {"ok": True, "event": event}


@router.get("/enrollments/me")
def my_enrollments(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    rows = (
        sb.table("enrollments")
        .select("id, course_id, status, amount_paid_inr, enrolled_at, completed_at, courses ( id, title, slug, thumbnail_url, price_inr )")
        .eq("user_id", user["id"])
        .order("enrolled_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return {"items": rows}


@router.post("/resources/{course_id}/refund-request")
def refund_request(course_id: str, body: RefundIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    course = _get_published_course(sb, course_id)
    enrollment_rows = (
        sb.table("enrollments")
        .select("*")
        .eq("user_id", user["id"])
        .eq("course_id", course_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not enrollment_rows or enrollment_rows[0].get("status") != "active":
        raise HTTPException(status_code=400, detail="Active enrollment required")
    enrollment = enrollment_rows[0]

    order_rows = (
        sb.table("marketplace_orders")
        .select("*")
        .eq("user_id", user["id"])
        .eq("course_id", course_id)
        .eq("status", "paid")
        .order("paid_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not order_rows:
        raise HTTPException(status_code=400, detail="No paid order found for this course")
    order = order_rows[0]
    paid_at_raw = order.get("paid_at")
    try:
        paid_at = datetime.fromisoformat(str(paid_at_raw).replace("Z", "+00:00"))
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Order missing paid_at timestamp")
    window = int(course.get("refund_window_days") or 0)
    if window <= 0 or _now() > paid_at + timedelta(days=window):
        raise HTTPException(status_code=400, detail="Refund window expired")

    # Block duplicate open refund requests.
    open_refunds = (
        sb.table("marketplace_refunds")
        .select("id, status")
        .eq("order_id", order["id"])
        .in_("status", ["requested", "approved"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if open_refunds:
        return {"refund": open_refunds[0], "already_open": True}

    insert = {
        "order_id": order["id"],
        "user_id": user["id"],
        "course_id": course_id,
        "reason": body.reason,
        "status": "requested",
        "amount_inr": int(order.get("amount_inr") or 0),
    }
    rows = sb.table("marketplace_refunds").insert(insert).execute().data or []
    _audit(
        sb,
        actor_id=user["id"],
        action="marketplace.refund.requested",
        entity_type="marketplace_refund",
        entity_id=(rows[0] if rows else {}).get("id"),
        new_value={"course_id": course_id, "order_id": order["id"]},
        notes=body.reason[:200],
    )
    return {"refund": rows[0] if rows else insert, "enrollment_id": enrollment.get("id")}


# ════════════════════════════════════════════════════════════════════════════
#  Entitlement + lesson playback
# ════════════════════════════════════════════════════════════════════════════


def _get_access_state(sb, *, user_id: str | None, course_id: str) -> dict[str, Any]:
    if not user_id:
        return {"state": "free_preview_only"}
    enrollment_rows = (
        sb.table("enrollments")
        .select("id, status")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if enrollment_rows:
        en = enrollment_rows[0]
        if en.get("status") == "active":
            refund_rows = (
                sb.table("marketplace_refunds")
                .select("id, status")
                .eq("user_id", user_id)
                .eq("course_id", course_id)
                .in_("status", ["requested", "approved"])
                .order("created_at", desc=True)
                .limit(1)
                .execute()
                .data
                or []
            )
            if refund_rows:
                return {
                    "state": "refund_requested",
                    "enrollment_id": en["id"],
                    "refund_status": refund_rows[0]["status"],
                }
            return {"state": "enrolled", "enrollment_id": en["id"]}
        if en.get("status") == "refunded":
            return {"state": "refunded", "enrollment_id": en["id"]}
    return {"state": "not_enrolled"}


@router.get("/resources/{course_id}/access")
def access_state(course_id: str, user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    _get_published_course(sb, course_id)
    return _get_access_state(sb, user_id=(user or {}).get("id"), course_id=course_id)


def _is_enrolled(sb, *, user_id: str, course_id: str) -> bool:
    rows = (
        sb.table("enrollments")
        .select("status")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .eq("status", "active")
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _load_lesson(sb, course_id: str, lesson_id: str) -> dict[str, Any]:
    rows = (
        sb.table("lessons")
        .select("*, course_sections!inner ( id, course_id, title, order_index )")
        .eq("id", lesson_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson = rows[0]
    section = lesson.get("course_sections") or {}
    if isinstance(section, list):
        section = section[0] if section else {}
    if (section or {}).get("course_id") != course_id:
        raise HTTPException(status_code=404, detail="Lesson not in course")
    lesson["_section"] = section
    return lesson


@router.get("/resources/{course_id}/lessons/{lesson_id}")
def get_lesson(course_id: str, lesson_id: str, user: dict | None = Depends(get_optional_user)):
    sb = get_supabase_admin()
    _get_published_course(sb, course_id)
    lesson = _load_lesson(sb, course_id, lesson_id)
    is_preview = bool(lesson.get("is_free_preview"))
    if not is_preview:
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not _is_enrolled(sb, user_id=user["id"], course_id=course_id):
            raise HTTPException(status_code=403, detail="Enrollment required")

    progress = None
    if user:
        prog_rows = (
            sb.table("lesson_progress")
            .select("*")
            .eq("user_id", user["id"])
            .eq("lesson_id", lesson_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        progress = prog_rows[0] if prog_rows else None

    return {
        "id": lesson["id"],
        "course_id": course_id,
        "section": lesson.get("_section"),
        "title": lesson.get("title"),
        "type": lesson.get("type"),
        "duration_mins": lesson.get("duration_mins"),
        "is_preview": is_preview,
        "content_url": lesson.get("content_url"),
        "content_text": lesson.get("content_text"),
        "progress": progress,
    }


@router.put("/resources/{course_id}/lessons/{lesson_id}/progress")
def update_progress(course_id: str, lesson_id: str, body: ProgressIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    _get_published_course(sb, course_id)
    _load_lesson(sb, course_id, lesson_id)
    if not _is_enrolled(sb, user_id=user["id"], course_id=course_id):
        raise HTTPException(status_code=403, detail="Enrollment required")

    existing = (
        sb.table("lesson_progress")
        .select("*")
        .eq("user_id", user["id"])
        .eq("lesson_id", lesson_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    payload = {
        "user_id": user["id"],
        "lesson_id": lesson_id,
        "course_id": course_id,
        "completed": bool(body.completed),
        "completed_at": _now_iso() if body.completed else None,
        "watch_seconds": body.watch_seconds if body.watch_seconds is not None else (existing[0].get("watch_seconds") if existing else 0),
    }
    if existing:
        rows = sb.table("lesson_progress").update(payload).eq("id", existing[0]["id"]).execute().data or []
    else:
        rows = sb.table("lesson_progress").insert(payload).execute().data or []
    return {"progress": rows[0] if rows else payload}


# ════════════════════════════════════════════════════════════════════════════
#  Reviews — gated by active enrollment
# ════════════════════════════════════════════════════════════════════════════


class ReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    body: str | None = Field(default=None, max_length=4000)


@router.post("/resources/{course_id}/reviews")
def submit_review(course_id: str, body: ReviewIn, user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    _get_published_course(sb, course_id)
    if not _is_enrolled(sb, user_id=user["id"], course_id=course_id):
        raise HTTPException(status_code=403, detail="Enrollment required to review")
    existing = (
        sb.table("reviews")
        .select("id")
        .eq("user_id", user["id"])
        .eq("course_id", course_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    payload = {
        "user_id": user["id"],
        "course_id": course_id,
        "rating": body.rating,
        "body": body.body,
        "updated_at": _now_iso(),
    }
    if existing:
        rows = sb.table("reviews").update(payload).eq("id", existing[0]["id"]).execute().data or []
    else:
        rows = sb.table("reviews").insert(payload).execute().data or []
    return {"review": rows[0] if rows else payload}
