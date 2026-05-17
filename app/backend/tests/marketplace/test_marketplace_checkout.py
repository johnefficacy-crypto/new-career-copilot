"""Checkout, verify and webhook tests for the marketplace API."""
from __future__ import annotations

import pytest

from tests.marketplace._helpers import MktSBStub, client, patch_razorpay, seed_course


USER = {"id": "user-1", "email": "u@example.com", "name": "U"}


def _seed_profile(sb):
    sb.db.setdefault("profiles", []).append({"id": USER["id"], "full_name": "U"})


def test_order_uses_server_price_for_paid_course(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="c1", price_inr=1500)
    patch_razorpay(monkeypatch, order_id="rzp_order_a")

    c = client(sb, user=USER)
    res = c.post("/api/marketplace/resources/c1/order", json={"idempotency_key": "k1"})
    assert res.status_code == 200
    body = res.json()
    assert body["free"] is False
    assert body["course"]["price_inr"] == 1500
    assert body["order"]["amount"] == 1500 * 100
    assert body["order"]["razorpay_order_id"] == "rzp_order_a"

    order_row = sb.db["marketplace_orders"][0]
    assert order_row["amount_inr"] == 1500
    assert order_row["status"] == "created"


def test_order_rejects_unpublished_course(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="cdraft", price_inr=500, status="draft")
    patch_razorpay(monkeypatch)
    res = client(sb, user=USER).post("/api/marketplace/resources/cdraft/order", json={})
    assert res.status_code == 404


def test_free_course_skips_razorpay_and_activates_enrollment(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="free1", price_inr=0)
    patch_razorpay(monkeypatch)

    res = client(sb, user=USER).post("/api/marketplace/resources/free1/order", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["free"] is True
    assert body["enrollment"]["status"] == "active"
    assert sb.db["enrollments"][0]["status"] == "active"
    assert sb.db["marketplace_orders"][0]["status"] == "paid"


def test_idempotency_key_returns_same_open_order(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="c1", price_inr=999)
    patch_razorpay(monkeypatch, order_id="rzp_order_x")

    c = client(sb, user=USER)
    a = c.post("/api/marketplace/resources/c1/order", json={"idempotency_key": "kk"}).json()
    b = c.post("/api/marketplace/resources/c1/order", json={"idempotency_key": "kk"}).json()
    assert a["order"]["id"] == b["order"]["id"]
    assert len(sb.db["marketplace_orders"]) == 1


def test_double_tap_buy_yields_one_open_order(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="c1", price_inr=999)
    patch_razorpay(monkeypatch)

    c = client(sb, user=USER)
    c.post("/api/marketplace/resources/c1/order", json={})
    c.post("/api/marketplace/resources/c1/order", json={})
    assert len(sb.db["marketplace_orders"]) == 1


def test_verify_rejects_bad_signature(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="c1", price_inr=999)
    patch_razorpay(monkeypatch, valid_signature=False, order_id="rzp_order_bad")

    c = client(sb, user=USER)
    c.post("/api/marketplace/resources/c1/order", json={})
    res = c.post(
        "/api/marketplace/resources/c1/verify",
        json={"razorpay_order_id": "rzp_order_bad", "razorpay_payment_id": "pay_1", "razorpay_signature": "x"},
    )
    assert res.status_code == 400
    assert sb.db["marketplace_orders"][0]["status"] == "created"
    assert sb.db.get("enrollments", []) == []


def test_verify_creates_active_enrollment(monkeypatch):
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="c1", price_inr=999)
    patch_razorpay(monkeypatch, order_id="rzp_order_v")

    c = client(sb, user=USER)
    c.post("/api/marketplace/resources/c1/order", json={})
    res = c.post(
        "/api/marketplace/resources/c1/verify",
        json={"razorpay_order_id": "rzp_order_v", "razorpay_payment_id": "pay_v", "razorpay_signature": "ok"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "active"
    assert sb.db["marketplace_orders"][0]["status"] == "paid"
    assert sb.db["marketplace_orders"][0]["razorpay_payment_id"] == "pay_v"
    enrollments = sb.db["enrollments"]
    assert len(enrollments) == 1
    assert enrollments[0]["status"] == "active"


def test_verify_is_idempotent_with_webhook(monkeypatch):
    """Verify then webhook for the same payment must not double-enroll."""
    sb = MktSBStub()
    _seed_profile(sb)
    seed_course(sb, id="c1", price_inr=999)
    patch_razorpay(monkeypatch, order_id="rzp_order_idem")

    c = client(sb, user=USER)
    c.post("/api/marketplace/resources/c1/order", json={})
    c.post(
        "/api/marketplace/resources/c1/verify",
        json={"razorpay_order_id": "rzp_order_idem", "razorpay_payment_id": "pay_idem", "razorpay_signature": "ok"},
    )
    webhook_body = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"order_id": "rzp_order_idem", "id": "pay_idem"}}},
    }
    res = c.post("/api/marketplace/webhook", json=webhook_body, headers={"X-Razorpay-Signature": "x"})
    assert res.status_code == 200
    assert len(sb.db["enrollments"]) == 1
    assert sb.db["enrollments"][0]["status"] == "active"
