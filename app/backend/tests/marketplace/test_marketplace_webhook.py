"""Razorpay webhook activation tests."""
from __future__ import annotations

from tests.marketplace._helpers import MktSBStub, client, patch_razorpay, seed_course


USER = {"id": "user-1", "email": "u@example.com", "name": "U"}


def _open_order(sb):
    sb.db.setdefault("profiles", []).append({"id": USER["id"]})
    seed_course(sb, id="c1", price_inr=799)
    c = client(sb, user=USER)
    c.post("/api/marketplace/resources/c1/order", json={})
    return c


def test_valid_webhook_activates_enrollment(monkeypatch):
    sb = MktSBStub()
    patch_razorpay(monkeypatch, order_id="rzp_hook_1")
    c = _open_order(sb)
    res = c.post(
        "/api/marketplace/webhook",
        json={"event": "payment.captured", "payload": {"payment": {"entity": {"order_id": "rzp_hook_1", "id": "pay_h1"}}}},
        headers={"X-Razorpay-Signature": "ok"},
    )
    assert res.status_code == 200
    assert sb.db["marketplace_orders"][0]["status"] == "paid"
    assert len(sb.db["enrollments"]) == 1
    assert sb.db["enrollments"][0]["status"] == "active"


def test_replay_webhook_does_not_double_enroll(monkeypatch):
    sb = MktSBStub()
    patch_razorpay(monkeypatch, order_id="rzp_hook_2")
    c = _open_order(sb)
    body = {"event": "payment.captured", "payload": {"payment": {"entity": {"order_id": "rzp_hook_2", "id": "pay_h2"}}}}
    c.post("/api/marketplace/webhook", json=body, headers={"X-Razorpay-Signature": "ok"})
    c.post("/api/marketplace/webhook", json=body, headers={"X-Razorpay-Signature": "ok"})
    assert len(sb.db["enrollments"]) == 1


def test_bad_signature_rejected(monkeypatch):
    sb = MktSBStub()
    patch_razorpay(monkeypatch, valid_webhook=False, order_id="rzp_hook_3")
    _open_order(sb)
    c = client(sb, user=USER)
    res = c.post(
        "/api/marketplace/webhook",
        json={"event": "payment.captured", "payload": {"payment": {"entity": {"order_id": "rzp_hook_3", "id": "p"}}}},
        headers={"X-Razorpay-Signature": "bad"},
    )
    assert res.status_code == 400


def test_unknown_order_ignored(monkeypatch):
    sb = MktSBStub()
    patch_razorpay(monkeypatch)
    res = client(sb, user=USER).post(
        "/api/marketplace/webhook",
        json={"event": "payment.captured", "payload": {"payment": {"entity": {"order_id": "rzp_unknown", "id": "p"}}}},
        headers={"X-Razorpay-Signature": "ok"},
    )
    assert res.status_code == 200
    assert res.json()["ignored"] == "unknown_order"
