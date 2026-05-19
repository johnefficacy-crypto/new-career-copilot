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
from urllib.parse import urlparse

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


DELIVERY_MODELS = (
    "affiliate_external",
    "platform_course",
    "platform_download",
    "platform_test",
    "platform_bundle",
)


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _normalise_domain(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    return _host(raw)


def _fetch_partner(sb, partner_id: str) -> dict | None:
    rows = (
        sb.table("affiliate_partners")
        .select("id, name, status, allowed_domains")
        .eq("id", partner_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _validate_delivery(sb, *, delivery_model: str, is_affiliate: bool | None,
                       affiliate_disclosure: str | None, affiliate_partner_id: str | None,
                       external_product_url: str | None) -> None:
    if delivery_model not in DELIVERY_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid delivery_model: {delivery_model}")

    if delivery_model == "affiliate_external":
        if not is_affiliate:
            raise HTTPException(status_code=400, detail="affiliate_external requires is_affiliate=true")
        if not (affiliate_disclosure or "").strip():
            raise HTTPException(status_code=400, detail="affiliate_external requires affiliate_disclosure")
        if not affiliate_partner_id:
            raise HTTPException(status_code=400, detail="affiliate_external requires affiliate_partner_id")
        if not external_product_url:
            raise HTTPException(status_code=400, detail="affiliate_external requires external_product_url")
        partner = _fetch_partner(sb, affiliate_partner_id)
        if not partner:
            raise HTTPException(status_code=400, detail="Unknown affiliate_partner_id")
        if partner.get("status") != "active":
            raise HTTPException(status_code=400, detail="Affiliate partner is not active")
        allowed = {_normalise_domain(d) for d in (partner.get("allowed_domains") or []) if _normalise_domain(d)}
        host = _host(external_product_url)
        if not host or host not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"external_product_url host '{host}' not in partner allowed_domains",
            )
    else:
        if external_product_url:
            raise HTTPException(
                status_code=400,
                detail=f"external_product_url must be null when delivery_model={delivery_model}",
            )
        if affiliate_partner_id:
            raise HTTPException(
                status_code=400,
                detail=f"affiliate_partner_id must be null when delivery_model={delivery_model}",
            )


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
    delivery_model: str = "platform_course"
    affiliate_partner_id: str | None = None
    external_product_url: str | None = None


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
    delivery_model: str | None = None
    affiliate_partner_id: str | None = None
    external_product_url: str | None = None


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
    _validate_delivery(
        sb,
        delivery_model=payload.delivery_model,
        is_affiliate=payload.is_affiliate,
        affiliate_disclosure=payload.affiliate_disclosure,
        affiliate_partner_id=payload.affiliate_partner_id,
        external_product_url=payload.external_product_url,
    )
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

    # Validate delivery-model consistency. Pull current row so partial patches
    # are checked against the eventual merged state, not just the patch keys.
    if any(k in update for k in ("delivery_model", "affiliate_partner_id", "external_product_url",
                                  "is_affiliate", "affiliate_disclosure")):
        current_rows = (
            sb.table("courses")
            .select("delivery_model, is_affiliate, affiliate_disclosure, "
                    "affiliate_partner_id, external_product_url")
            .eq("id", course_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        current = current_rows[0] if current_rows else {}
        merged = {**current, **update}
        _validate_delivery(
            sb,
            delivery_model=merged.get("delivery_model") or "platform_course",
            is_affiliate=merged.get("is_affiliate"),
            affiliate_disclosure=merged.get("affiliate_disclosure"),
            affiliate_partner_id=merged.get("affiliate_partner_id"),
            external_product_url=merged.get("external_product_url"),
        )
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


# ════════════════════════════════════════════════════════════════════════════
#  PR2 — Marketplace hosted assets (migration 114)
# ════════════════════════════════════════════════════════════════════════════
#
# Admin-only review shell on top of the delivery split. Storage is metadata-
# only here: we never read buckets or validate against real storage. File
# rows just carry (bucket, path, hash, mime) for later PRs that wire signed
# URLs and tokenised buyer delivery.
#
# State machine reachable via PR2:
#   draft  ──submit-review──▶ pending_review ──approve──▶ approved ──publish──▶ published
#     ▲                            │                         │
#     └─submit-review── rejected ◀─┴────────reject──────────┘
# (approved→rejected also allowed via reject). suspended / dmca_removed
# are reserved values with no PR2 API path.

import re as _re_assets  # local alias so we don't shadow module-level `re`

_ASSET_PAGE_MAX = 200
_SHA256_RE = _re_assets.compile(r"^[a-f0-9]{64}$")

_HOSTABLE_DELIVERY_MODELS = {
    "platform_course",
    "platform_download",
    "platform_test",
    "platform_bundle",
}

_ASSET_TYPE_DELIVERY_MATRIX: dict[str, set[str]] = {
    "notes_pdf":    {"platform_download", "platform_course", "platform_bundle"},
    "test_session": {"platform_test", "platform_bundle"},
    "video":        {"platform_course", "platform_download", "platform_bundle"},
    "zip":          {"platform_download", "platform_bundle"},
    "bundle":       {"platform_bundle"},
    "other":        {"platform_course", "platform_download", "platform_test", "platform_bundle"},
}

_VALID_ASSET_TYPES = set(_ASSET_TYPE_DELIVERY_MATRIX.keys())

_PATCHABLE_ASSET_FIELDS = {
    "title", "description", "asset_type", "protection_policy",
    "copyright_risk_status", "metadata",
}

_FILE_ROLE_VALUES = {"source", "preview", "watermark", "attachment"}


def _err(status_code: int, code: str, message: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, **({"message": message} if message else {})},
    )


def _fetch_course(sb, course_id: str) -> dict | None:
    rows = (
        sb.table("courses")
        .select("id, delivery_model, status")
        .eq("id", course_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _fetch_asset(sb, asset_id: str) -> dict | None:
    rows = (
        sb.table("marketplace_assets")
        .select("*")
        .eq("id", asset_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _count_files(sb, asset_id: str) -> int:
    rows = (
        sb.table("marketplace_asset_files")
        .select("id")
        .eq("asset_id", asset_id)
        .execute()
        .data
        or []
    )
    return len(rows)


def _primary_source_file(sb, asset_id: str) -> dict | None:
    rows = (
        sb.table("marketplace_asset_files")
        .select("*")
        .eq("asset_id", asset_id)
        .eq("file_role", "source")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


# ─── Pydantic ────────────────────────────────────────────────────────────────


class AssetCreateIn(BaseModel):
    asset_type: str = Field(..., min_length=1, max_length=40)
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    protection_policy: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class AssetPatch(BaseModel):
    # `status` is intentionally absent — patching state is forbidden.
    # Callers that try get a 400 with code=status_not_patchable_use_transition_endpoint.
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    asset_type: str | None = Field(default=None, max_length=40)
    protection_policy: dict[str, Any] | None = None
    copyright_risk_status: str | None = Field(default=None, max_length=40)
    metadata: dict[str, Any] | None = None


class ApprovalDecisionIn(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class FileCreateIn(BaseModel):
    storage_bucket: str = Field(..., min_length=1, max_length=120)
    storage_path: str = Field(..., min_length=1, max_length=512)
    original_filename: str | None = Field(default=None, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=120)
    file_size_bytes: int | None = Field(default=None, ge=0)
    # Length is intentionally not pinned in Pydantic so malformed input
    # surfaces as a typed 400 `invalid_hash_format` from our regex check
    # rather than a 422 from FastAPI's validator.
    content_hash: str = Field(..., min_length=1, max_length=256)
    file_role: str = Field(default="source")
    metadata: dict[str, Any] | None = None


# ─── Validations ─────────────────────────────────────────────────────────────


def _validate_asset_create(course: dict, payload: AssetCreateIn) -> None:
    if payload.asset_type not in _VALID_ASSET_TYPES:
        raise _err(422, "invalid_asset_type",
                   f"asset_type must be one of {sorted(_VALID_ASSET_TYPES)}")

    delivery_model = course.get("delivery_model") or "platform_course"
    if delivery_model not in _HOSTABLE_DELIVERY_MODELS:
        raise _err(422, "delivery_model_not_hostable",
                   f"delivery_model={delivery_model!r} cannot host assets")

    allowed = _ASSET_TYPE_DELIVERY_MATRIX[payload.asset_type]
    if delivery_model not in allowed:
        raise _err(422, "asset_type_delivery_mismatch",
                   f"asset_type={payload.asset_type!r} not allowed for "
                   f"delivery_model={delivery_model!r}")


def _validate_asset_patch(patch: AssetPatch) -> None:
    if patch.asset_type is not None and patch.asset_type not in _VALID_ASSET_TYPES:
        raise _err(422, "invalid_asset_type",
                   f"asset_type must be one of {sorted(_VALID_ASSET_TYPES)}")


# ─── Asset CRUD ──────────────────────────────────────────────────────────────


@router.get("/courses/{course_id}/assets")
def list_course_assets(
    course_id: str,
    limit: int = Query(default=50, ge=1, le=_ASSET_PAGE_MAX),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_admin),
):
    sb = get_supabase_admin()
    rows = (
        sb.table("marketplace_assets")
        .select("*")
        .eq("course_id", course_id)
        .order("created_at", desc=True)
        .limit(offset + limit)
        .execute()
        .data
        or []
    )
    page = rows[offset : offset + limit]
    items = []
    for r in page:
        items.append({
            **r,
            "file_count": _count_files(sb, r["id"]),
            "primary_file": _primary_source_file(sb, r["id"]),
        })
    return {"items": items, "count": len(items), "limit": limit, "offset": offset}


@router.post("/courses/{course_id}/assets", status_code=201)
def create_course_asset(
    course_id: str, payload: AssetCreateIn, admin: dict = Depends(_require_admin),
):
    sb = get_supabase_admin()
    course = _fetch_course(sb, course_id)
    if not course:
        raise _err(404, "course_not_found")
    _validate_asset_create(course, payload)

    record: dict[str, Any] = {
        "course_id": course_id,
        "asset_type": payload.asset_type,
        "status": "draft",
    }
    if payload.title is not None:
        record["title"] = payload.title
    if payload.description is not None:
        record["description"] = payload.description
    if payload.protection_policy is not None:
        record["protection_policy"] = payload.protection_policy
    if payload.metadata is not None:
        record["metadata"] = payload.metadata

    rows = sb.table("marketplace_assets").insert(record).execute().data or []
    if not rows:
        raise _err(500, "asset_insert_failed")
    asset = rows[0]
    _audit(sb, actor=admin, action="marketplace.asset.create",
           entity_type="marketplace_asset", entity_id=asset["id"], new_value=record)
    return asset


@router.put("/assets/{asset_id}")
def update_asset(asset_id: str, patch_body: dict[str, Any], admin: dict = Depends(_require_admin)):
    if "status" in patch_body:
        raise _err(400, "status_not_patchable_use_transition_endpoint",
                   "status changes go through submit-review / approve / reject / publish")

    patch = AssetPatch.model_validate(patch_body)
    _validate_asset_patch(patch)

    sb = get_supabase_admin()
    existing = _fetch_asset(sb, asset_id)
    if not existing:
        raise _err(404, "asset_not_found")

    update = patch.model_dump(exclude_none=True)
    if not update:
        raise _err(400, "no_fields_to_update")
    update["updated_at"] = _now_iso()
    rows = (
        sb.table("marketplace_assets")
        .update(update)
        .eq("id", asset_id)
        .execute()
        .data
        or []
    )
    if not rows:
        raise _err(500, "asset_update_failed")
    _audit(sb, actor=admin, action="marketplace.asset.update",
           entity_type="marketplace_asset", entity_id=asset_id, new_value=update)
    return rows[0]


# ─── State transitions ───────────────────────────────────────────────────────


def _transition(sb, *, asset: dict, allowed_from: set[str], new_status: str,
                extra: dict[str, Any] | None = None) -> dict:
    current = asset.get("status")
    if current not in allowed_from:
        raise _err(
            409, "invalid_state_transition",
            f"cannot transition from {current!r} to {new_status!r}",
        )
    patch = {"status": new_status, "updated_at": _now_iso()}
    if extra:
        patch.update(extra)
    rows = (
        sb.table("marketplace_assets")
        .update(patch)
        .eq("id", asset["id"])
        .execute()
        .data
        or []
    )
    if not rows:
        raise _err(500, "asset_transition_failed")
    return rows[0]


@router.post("/assets/{asset_id}/submit-review")
def submit_asset_for_review(asset_id: str, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    asset = _fetch_asset(sb, asset_id)
    if not asset:
        raise _err(404, "asset_not_found")
    updated = _transition(sb, asset=asset,
                          allowed_from={"draft", "rejected"},
                          new_status="pending_review")
    _audit(sb, actor=admin, action="marketplace.asset.submit_review",
           entity_type="marketplace_asset", entity_id=asset_id,
           new_value={"status": "pending_review"})
    return updated


@router.post("/assets/{asset_id}/approve")
def approve_asset(asset_id: str, body: ApprovalDecisionIn | None = None,
                  admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    asset = _fetch_asset(sb, asset_id)
    if not asset:
        raise _err(404, "asset_not_found")
    extra: dict[str, Any] = {
        "approved_by": admin.get("id"),
        "approved_at": _now_iso(),
        "approval_reason": (body.reason if body else None),
    }
    # On approval, lift an `unchecked` copyright_risk_status to `clear`.
    # Leave `clear`, `flagged`, `rejected`, `known_infringing` untouched.
    if (asset.get("copyright_risk_status") or "unchecked") == "unchecked":
        extra["copyright_risk_status"] = "clear"
    updated = _transition(sb, asset=asset,
                          allowed_from={"pending_review"},
                          new_status="approved", extra=extra)
    _audit(sb, actor=admin, action="marketplace.asset.approve",
           entity_type="marketplace_asset", entity_id=asset_id,
           new_value={"status": "approved", "reason": extra["approval_reason"]})
    return updated


@router.post("/assets/{asset_id}/reject")
def reject_asset(asset_id: str, body: ApprovalDecisionIn | None = None,
                 admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    asset = _fetch_asset(sb, asset_id)
    if not asset:
        raise _err(404, "asset_not_found")
    extra = {
        "rejected_by": admin.get("id"),
        "rejected_at": _now_iso(),
        "rejection_reason": (body.reason if body else None),
    }
    updated = _transition(sb, asset=asset,
                          allowed_from={"pending_review", "approved"},
                          new_status="rejected", extra=extra)
    _audit(sb, actor=admin, action="marketplace.asset.reject",
           entity_type="marketplace_asset", entity_id=asset_id,
           new_value={"status": "rejected", "reason": extra["rejection_reason"]})
    return updated


@router.post("/assets/{asset_id}/publish")
def publish_asset(asset_id: str, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    asset = _fetch_asset(sb, asset_id)
    if not asset:
        raise _err(404, "asset_not_found")
    if asset.get("status") != "approved":
        raise _err(409, "invalid_state_transition",
                   f"cannot publish from status={asset.get('status')!r}")

    risk = asset.get("copyright_risk_status")
    if risk in {"flagged", "rejected", "known_infringing"}:
        raise _err(409, "copyright_block",
                   f"copyright_risk_status={risk!r} blocks publish")

    # `test_session` is exempt from the source-file requirement (delivery
    # happens via the test runner, not an uploaded artifact). `bundle`
    # is NOT exempt — a bundle without a manifest file is not publishable.
    if asset.get("asset_type") != "test_session":
        files = (
            sb.table("marketplace_asset_files")
            .select("file_role")
            .eq("asset_id", asset_id)
            .in_("file_role", ["source", "preview"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if not files:
            raise _err(409, "no_source_file",
                       "asset requires at least one source/preview file before publish")

    updated = _transition(sb, asset=asset,
                          allowed_from={"approved"},
                          new_status="published")
    _audit(sb, actor=admin, action="marketplace.asset.publish",
           entity_type="marketplace_asset", entity_id=asset_id,
           new_value={"status": "published"})
    return updated


# ─── Files ───────────────────────────────────────────────────────────────────


@router.get("/assets/{asset_id}/files")
def list_asset_files(
    asset_id: str,
    limit: int = Query(default=50, ge=1, le=_ASSET_PAGE_MAX),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(_require_admin),
):
    sb = get_supabase_admin()
    if not _fetch_asset(sb, asset_id):
        raise _err(404, "asset_not_found")
    rows = (
        sb.table("marketplace_asset_files")
        .select("*")
        .eq("asset_id", asset_id)
        .order("created_at", desc=False)
        .limit(offset + limit)
        .execute()
        .data
        or []
    )
    page = rows[offset : offset + limit]
    return {"items": page, "count": len(page), "limit": limit, "offset": offset}


@router.post("/assets/{asset_id}/files", status_code=201)
def add_asset_file(asset_id: str, payload: FileCreateIn, admin: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    asset = _fetch_asset(sb, asset_id)
    if not asset:
        raise _err(404, "asset_not_found")

    if payload.file_role not in _FILE_ROLE_VALUES:
        raise _err(422, "invalid_file_role",
                   f"file_role must be one of {sorted(_FILE_ROLE_VALUES)}")

    content_hash = (payload.content_hash or "").lower()
    if not _SHA256_RE.match(content_hash):
        raise _err(400, "invalid_hash_format",
                   "content_hash must be lowercase sha256 hex (64 chars)")

    blocked = (
        sb.table("marketplace_infringing_hashes")
        .select("id")
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    if blocked:
        raise _err(409, "infringing_hash_blocked",
                   "content_hash matches an entry in marketplace_infringing_hashes")

    conflict = (
        sb.table("marketplace_asset_files")
        .select("id")
        .eq("storage_bucket", payload.storage_bucket)
        .eq("storage_path", payload.storage_path)
        .limit(1)
        .execute()
        .data
        or []
    )
    if conflict:
        raise _err(409, "storage_path_conflict",
                   "(storage_bucket, storage_path) is already taken")

    record = {
        "asset_id": asset_id,
        "file_role": payload.file_role,
        "storage_bucket": payload.storage_bucket,
        "storage_path": payload.storage_path,
        "original_filename": payload.original_filename,
        "mime_type": payload.mime_type,
        "file_size_bytes": payload.file_size_bytes,
        "content_hash": content_hash,
        "metadata": payload.metadata or {},
    }
    rows = sb.table("marketplace_asset_files").insert(record).execute().data or []
    if not rows:
        raise _err(500, "file_insert_failed")
    _audit(sb, actor=admin, action="marketplace.asset.file.create",
           entity_type="marketplace_asset_file", entity_id=rows[0]["id"],
           new_value=record)
    return rows[0]

