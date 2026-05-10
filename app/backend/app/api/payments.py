"""Razorpay payments + subscription plans API.

Endpoints
---------
Public / user:
    GET  /api/plans                   — list active plans (any visitor)
    GET  /api/subscriptions/me        — current user's active subscription
    GET  /api/payments/me             — current user's payment history
    POST /api/payments/order          — create Razorpay order for a plan
    POST /api/payments/verify         — verify checkout signature, activate sub
    POST /api/payments/webhook        — Razorpay webhook (signed, no auth)

Admin:
    GET    /api/admin/plans           — list every plan
    POST   /api/admin/plans           — create plan
    PUT    /api/admin/plans/{id}      — update plan (price, name, etc.)
    DELETE /api/admin/plans/{id}      — soft-disable plan (is_active=false)
    GET    /api/admin/subscriptions   — list all user_subscriptions
    GET    /api/admin/payments        — list all payment_history rows

Notes
-----
* All amounts are stored in **paise** (integer). UI shows ₹ = price_inr/100.
* Razorpay signature verification uses HMAC-SHA256 with `RAZORPAY_KEY_SECRET`
  for checkout and `RAZORPAY_WEBHOOK_SECRET` for webhooks.
* AI is never involved in pricing or activation — it's a deterministic
  signature check + DB write.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

try:
    import razorpay  # type: ignore
except Exception:  # noqa: BLE001
    razorpay = None  # type: ignore

from app.core.auth import get_current_user, require_permission
from app.core.config import get_settings
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger("career_copilot.api.payments")
router = APIRouter()

# ─── Razorpay client ──────────────────────────────────────────────────────────


def _rzp_client():
    settings = get_settings()
    if razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay SDK not installed")
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay credentials not configured")
    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    client.set_app_details({"title": "Career Copilot", "version": "1.0.0"})
    return client


def _verify_checkout_signature(order_id: str, payment_id: str, signature: str) -> bool:
    settings = get_settings()
    if not settings.RAZORPAY_KEY_SECRET:
        return False
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    settings = get_settings()
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def _ensure_profile(user: dict) -> None:
    """user_subscriptions.user_id FKs into profiles — bootstrap if missing."""
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


def _deactivate_other_active(user_id: str, except_id: str | None = None) -> None:
    """Mark any other active subscription for this user as 'cancelled'.

    A partial unique index `user_subscriptions_user_active_idx` prevents two
    rows with status IN ('active','past_due') for the same user, so before we
    flip a fresh sub to 'active' we must retire the previous one. Safe to
    call even if no active row exists.
    """
    sb = get_supabase_admin()
    q = (
        sb.table("user_subscriptions")
        .update(
            {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("user_id", user_id)
        .in_("status", ["active", "past_due"])
    )
    if except_id:
        q = q.neq("id", except_id)
    try:
        q.execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("deactivate_other_active failed for %s: %s", user_id, exc)


# ─── Schemas ──────────────────────────────────────────────────────────────────


class PlanIn(BaseModel):
    id: str = Field(..., min_length=2, max_length=64)
    name: str
    description: str | None = None
    price_inr: int = Field(..., ge=0)  # paise
    interval: str = "monthly"
    features: list[str] | dict | None = None
    is_active: bool = True
    sort_order: int = 0


class PlanPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    price_inr: int | None = Field(default=None, ge=0)
    interval: str | None = None
    features: list[str] | dict | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class OrderIn(BaseModel):
    plan_id: str


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return s[:64] or "plan"


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _is_uuid_like(value: str | None) -> bool:
    return bool(value and _UUID_RE.match(str(value)))


def _external_plan_id(row: dict[str, Any] | None) -> str | None:
    if not row:
        return None
    return row.get("plan_code") or (str(row.get("id")) if row.get("id") else None)


def _normalise_plan_row(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    db_id = str(out["id"]) if out.get("id") is not None else None
    out["db_id"] = db_id
    out["id"] = _external_plan_id(out) or db_id
    if out.get("price_inr") is None:
        legacy_price = out.get("price")
        out["price_inr"] = int(float(legacy_price or 0) * 100)
    out.setdefault("currency", "INR")
    out["interval"] = out.get("interval") or out.get("billing_period") or "monthly"
    out.setdefault("features", [])
    out.setdefault("sort_order", 0)
    out.setdefault("description", None)
    return out


def _find_plan(sb, plan_id: str, *, active_only: bool = False) -> dict[str, Any] | None:
    q = sb.table("subscription_plans").select("*").eq("plan_code", plan_id)
    if active_only:
        q = q.eq("is_active", True)
    try:
        rows = q.limit(1).execute().data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("subscription_plans lookup by plan_code failed: %s", exc)
        rows = []
    if rows:
        return _normalise_plan_row(rows[0])

    if not _is_uuid_like(plan_id):
        return None

    q = sb.table("subscription_plans").select("*").eq("id", plan_id)
    if active_only:
        q = q.eq("is_active", True)
    rows = q.limit(1).execute().data or []
    return _normalise_plan_row(rows[0]) if rows else None


def _list_subscription_plans(sb, *, active_only: bool) -> list[dict[str, Any]]:
    try:
        q = sb.table("subscription_plans").select("*").order("sort_order")
        if active_only:
            q = q.eq("is_active", True)
        rows = q.execute().data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("subscription_plans rich query unavailable, falling back to legacy shape: %s", exc)
        q = sb.table("subscription_plans").select("*")
        if active_only:
            q = q.eq("is_active", True)
        rows = q.execute().data or []
    return sorted((_normalise_plan_row(r) for r in rows), key=lambda r: r.get("sort_order") or 0)


def _normalise_subscription_row(row: dict[str, Any], plan_by_db_id: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    out = dict(row)
    plan = out.get("plan")
    if isinstance(plan, dict):
        normalised_plan = _normalise_plan_row(plan)
        out["plan"] = normalised_plan
        out["plan_id"] = normalised_plan["id"]
    elif plan_by_db_id and out.get("plan_id"):
        plan_row = plan_by_db_id.get(str(out.get("plan_id")))
        if plan_row:
            out["plan_id"] = plan_row["id"]
    return out


# ─── Public — plans ───────────────────────────────────────────────────────────


@router.get("/plans")
def list_plans_public():
    sb = get_supabase_admin()
    return {"plans": _list_subscription_plans(sb, active_only=True)}


# ─── Admin — plan CRUD ────────────────────────────────────────────────────────


@router.get("/admin/plans")
def admin_list_plans(_: dict = Depends(_require_admin)):
    sb = get_supabase_admin()
    return {"plans": _list_subscription_plans(sb, active_only=False)}


@router.post("/admin/plans")
def admin_create_plan(payload: PlanIn, _: dict = Depends(require_permission("payments.manage"))):
    sb = get_supabase_admin()
    plan_id = _slugify(payload.id)
    record = {
        "plan_code": plan_id,
        "name": payload.name,
        "description": payload.description,
        "price_inr": payload.price_inr,
        "interval": payload.interval,
        "features": payload.features or [],
        "is_active": payload.is_active,
        "sort_order": payload.sort_order,
    }
    try:
        rows = sb.table("subscription_plans").insert(record).execute().data or []
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not create plan: {exc}")
    return {"plan": _normalise_plan_row(rows[0]) if rows else {**record, "id": plan_id}}


@router.put("/admin/plans/{plan_id}")
def admin_update_plan(plan_id: str, patch: PlanPatch, _: dict = Depends(require_permission("payments.manage"))):
    sb = get_supabase_admin()
    plan = _find_plan(sb, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    update = {k: v for k, v in patch.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    rows = (
        sb.table("subscription_plans")
        .update(update)
        .eq("id", plan["db_id"])
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {"plan": _normalise_plan_row(rows[0])}


@router.delete("/admin/plans/{plan_id}")
def admin_disable_plan(plan_id: str, _: dict = Depends(require_permission("payments.manage"))):
    sb = get_supabase_admin()
    plan = _find_plan(sb, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    rows = (
        sb.table("subscription_plans")
        .update({"is_active": False})
        .eq("id", plan["db_id"])
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {"plan": _normalise_plan_row(rows[0])}


# ─── User — subscription + payments ───────────────────────────────────────────


@router.get("/subscriptions/me")
def my_subscription(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    rows = (
        sb.table("user_subscriptions")
        .select("*, plan:subscription_plans(id,plan_code,name,price_inr,interval,features)")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data
        or []
    )
    rows = [_normalise_subscription_row(r) for r in rows]
    active = next((r for r in rows if r.get("status") == "active"), None)
    return {"active": active, "history": rows}


@router.get("/payments/me")
def my_payments(user: dict = Depends(get_current_user)):
    sb = get_supabase_admin()
    rows = (
        sb.table("payment_history")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {"payments": rows}


# ─── User — order + verify ────────────────────────────────────────────────────


@router.post("/payments/order")
def create_order(body: OrderIn, user: dict = Depends(get_current_user)):
    _ensure_profile(user)
    sb = get_supabase_admin()
    plan = _find_plan(sb, body.plan_id, active_only=True)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found or inactive")
    if (plan.get("price_inr") or 0) <= 0:
        raise HTTPException(status_code=400, detail="Free plan does not require payment")

    rzp = _rzp_client()
    receipt = f"cc_{user['id'][:8]}_{int(datetime.now(timezone.utc).timestamp())}"
    try:
        rzp_order = rzp.order.create(
            {
                "amount": int(plan["price_inr"]),
                "currency": plan.get("currency") or "INR",
                "receipt": receipt[:40],
                "notes": {"user_id": user["id"], "plan_id": plan["id"]},
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Razorpay order.create failed")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {exc}")

    sub_record = {
        "user_id": user["id"],
        "plan_id": plan["db_id"],
        "status": "created",
        "razorpay_order_id": rzp_order["id"],
        "amount_paid_inr": int(plan["price_inr"]),
        "currency": plan.get("currency") or "INR",
    }
    sub = sb.table("user_subscriptions").insert(sub_record).execute().data
    sub_id = (sub[0]["id"] if sub else None)

    sb.table("payment_history").insert(
        {
            "user_id": user["id"],
            "subscription_id": sub_id,
            "plan_id": plan["id"],
            "razorpay_order_id": rzp_order["id"],
            "amount_inr": int(plan["price_inr"]),
            "currency": plan.get("currency") or "INR",
            "status": "created",
            "source": "checkout",
            "raw_event": {"order": rzp_order},
        }
    ).execute()

    settings = get_settings()
    return {
        "order": {
            "id": rzp_order["id"],
            "amount": rzp_order["amount"],
            "currency": rzp_order["currency"],
            "receipt": rzp_order.get("receipt"),
        },
        "key_id": settings.NEXT_PUBLIC_RAZORPAY_KEY_ID or settings.RAZORPAY_KEY_ID,
        "plan": {
            "id": plan["id"],
            "name": plan["name"],
            "price_inr": plan["price_inr"],
            "interval": plan["interval"],
        },
        "user": {"email": user.get("email"), "name": user.get("name")},
    }


@router.post("/payments/verify")
def verify_payment(body: VerifyIn, user: dict = Depends(get_current_user)):
    if not _verify_checkout_signature(
        body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    ):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    sb = get_supabase_admin()
    sub_rows = (
        sb.table("user_subscriptions")
        .select("*")
        .eq("razorpay_order_id", body.razorpay_order_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sub_rows:
        raise HTTPException(status_code=404, detail="Order not found for this user")
    sub = sub_rows[0]

    plan = _find_plan(sb, sub["plan_id"]) or {}
    external_plan_id = _external_plan_id(plan) or sub["plan_id"]
    interval = plan.get("interval") or "monthly"
    now = datetime.now(timezone.utc)
    period = (
        timedelta(days=30) if interval == "monthly"
        else timedelta(days=365) if interval == "annual"
        else timedelta(days=30)
    )

    _deactivate_other_active(user["id"], except_id=sub["id"])
    sb.table("user_subscriptions").update(
        {
            "status": "active",
            "razorpay_payment_id": body.razorpay_payment_id,
            "current_period_start": now.isoformat(),
            "current_period_end": (now + period).isoformat(),
        }
    ).eq("id", sub["id"]).execute()

    sb.table("payment_history").insert(
        {
            "user_id": user["id"],
            "subscription_id": sub["id"],
            "plan_id": external_plan_id,
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "amount_inr": sub.get("amount_paid_inr") or 0,
            "currency": sub.get("currency") or "INR",
            "status": "captured",
            "source": "checkout",
            "event": "checkout.captured",
        }
    ).execute()

    # Mirror plan onto the user's auth metadata so the frontend shell sees it.
    try:
        get_supabase_admin().auth.admin.update_user_by_id(
            user["id"], {"user_metadata": {**(user.get("claims", {}).get("user_metadata") or {}), "plan": external_plan_id}}
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("auth.admin.update_user_by_id failed: %s", exc)

    return {"status": "active", "plan_id": external_plan_id, "subscription_id": sub["id"]}


# ─── Webhook ──────────────────────────────────────────────────────────────────


@router.post("/payments/webhook")
async def razorpay_webhook(request: Request):
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not _verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = payload.get("event") or "unknown"
    payment_entity = (
        ((payload.get("payload") or {}).get("payment") or {}).get("entity") or {}
    )
    order_id = payment_entity.get("order_id")
    payment_id = payment_entity.get("id")

    sb = get_supabase_admin()

    sub_rows = (
        sb.table("user_subscriptions")
        .select("*")
        .eq("razorpay_order_id", order_id)
        .limit(1)
        .execute()
        .data
        or []
    ) if order_id else []
    sub = sub_rows[0] if sub_rows else None

    status_map = {
        "payment.authorized": "attempted",
        "payment.captured": "captured",
        "payment.failed": "failed",
        "refund.created": "refunded",
        "refund.processed": "refunded",
    }
    ph_status = status_map.get(event, "attempted")
    plan = _find_plan(sb, sub["plan_id"]) if sub else None
    external_plan_id = _external_plan_id(plan) if plan else None

    sb.table("payment_history").insert(
        {
            "user_id": sub["user_id"] if sub else None,
            "subscription_id": sub["id"] if sub else None,
            "plan_id": external_plan_id or (sub["plan_id"] if sub else None),
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "amount_inr": payment_entity.get("amount") or 0,
            "currency": payment_entity.get("currency") or "INR",
            "status": ph_status,
            "method": payment_entity.get("method"),
            "source": "webhook",
            "event": event,
            "raw_event": payload,
        }
    ).execute() if sub else None
    if not sub:
        logger.warning("Webhook %s referenced unknown order_id=%s — skipping insert", event, order_id)

    if sub and event == "payment.captured" and sub.get("status") != "active":
        interval = (plan or {}).get("interval") or "monthly"
        now = datetime.now(timezone.utc)
        period = timedelta(days=365) if interval == "annual" else timedelta(days=30)
        _deactivate_other_active(sub["user_id"], except_id=sub["id"])
        sb.table("user_subscriptions").update(
            {
                "status": "active",
                "razorpay_payment_id": payment_id,
                "current_period_start": now.isoformat(),
                "current_period_end": (now + period).isoformat(),
            }
        ).eq("id", sub["id"]).execute()
    elif sub and event == "payment.failed":
        sb.table("user_subscriptions").update({"status": "failed"}).eq("id", sub["id"]).execute()
    elif sub and event in ("refund.created", "refund.processed"):
        sb.table("user_subscriptions").update(
            {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", sub["id"]).execute()

    return {"ok": True, "event": event}


# ─── Admin — read-only views ──────────────────────────────────────────────────


@router.get("/admin/subscriptions")
def admin_subs(_: dict = Depends(_require_admin), limit: int = 100):
    sb = get_supabase_admin()
    rows = (
        sb.table("user_subscriptions")
        .select("*")
        .order("created_at", desc=True)
        .limit(min(limit, 500))
        .execute()
        .data
        or []
    )
    plans = _list_subscription_plans(sb, active_only=False)
    plan_by_db_id = {str(p["db_id"]): p for p in plans if p.get("db_id")}
    rows = [_normalise_subscription_row(r, plan_by_db_id) for r in rows]
    return {"subscriptions": rows}


@router.get("/admin/payments")
def admin_payments(_: dict = Depends(_require_admin), limit: int = 100):
    sb = get_supabase_admin()
    rows = (
        sb.table("payment_history")
        .select("*")
        .order("created_at", desc=True)
        .limit(min(limit, 500))
        .execute()
        .data
        or []
    )
    return {"payments": rows}
