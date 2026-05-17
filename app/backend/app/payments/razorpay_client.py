"""Shared Razorpay helpers used by subscriptions and marketplace.

Everything that talks to Razorpay (order creation, signature verification,
refunds, webhook signature) goes through this module so subscription and
course-purchase flows stay consistent and there is exactly one place that
holds the keys.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

from fastapi import HTTPException

try:
    import razorpay  # type: ignore
except Exception:  # noqa: BLE001
    razorpay = None  # type: ignore

from app.core.config import get_settings

logger = logging.getLogger("career_copilot.payments.razorpay_client")


def get_client():
    settings = get_settings()
    if razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay SDK not installed")
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay credentials not configured")
    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    client.set_app_details({"title": "Career Copilot", "version": "1.0.0"})
    return client


def get_public_key_id() -> str | None:
    settings = get_settings()
    return settings.NEXT_PUBLIC_RAZORPAY_KEY_ID or settings.RAZORPAY_KEY_ID


def create_order(amount_inr: int, receipt: str, notes: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create a Razorpay order. ``amount_inr`` is the integer amount in INR
    (whole rupees in our schema — multiplied to paise here)."""
    client = get_client()
    try:
        return client.order.create(
            {
                "amount": int(amount_inr) * 100,
                "currency": "INR",
                "receipt": receipt[:40],
                "notes": notes or {},
            }
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Razorpay order.create failed")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {exc}") from exc


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    settings = get_settings()
    if not settings.RAZORPAY_KEY_SECRET:
        return False
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    settings = get_settings()
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def refund(payment_id: str, amount_inr: int, notes: dict[str, Any] | None = None) -> dict[str, Any]:
    """Issue a refund against a captured payment. ``amount_inr`` is whole INR."""
    client = get_client()
    try:
        return client.payment.refund(
            payment_id,
            {"amount": int(amount_inr) * 100, "notes": notes or {}},
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Razorpay payment.refund failed for %s", payment_id)
        raise HTTPException(status_code=502, detail=f"Razorpay refund failed: {exc}") from exc
