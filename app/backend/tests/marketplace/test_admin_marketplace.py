"""Admin marketplace CRUD + refund flow tests."""
from __future__ import annotations

from tests.marketplace._helpers import MktSBStub, client, patch_razorpay, seed_course


ADMIN = {"id": "admin-1", "email": "admin@example.com", "role": "super_admin"}
USER = {"id": "user-a", "email": "u@example.com", "role": "user"}


def test_non_admin_blocked_from_course_crud():
    sb = MktSBStub()
    c = client(sb, user=USER)
    res = c.get("/api/admin/marketplace/courses")
    assert res.status_code == 403


def test_admin_create_publish_archive_course_flips_visibility():
    sb = MktSBStub()
    admin = client(sb, user=ADMIN)
    res = admin.post(
        "/api/admin/marketplace/courses",
        json={"title": "New Course", "price_inr": 500, "exam_tags": ["UPSC"]},
    )
    assert res.status_code == 200, res.text
    course = res.json()["course"]
    assert course["status"] == "draft"
    course_id = course["id"]

    # Draft is not in public catalogue
    public_list = client(sb).get("/api/marketplace/resources").json()
    assert course_id not in [r["id"] for r in public_list["items"]]

    pub = admin.post(f"/api/admin/marketplace/courses/{course_id}/publish")
    assert pub.status_code == 200
    assert pub.json()["course"]["status"] == "published"
    public_list = client(sb).get("/api/marketplace/resources").json()
    assert course_id in [r["id"] for r in public_list["items"]]

    arc = admin.post(f"/api/admin/marketplace/courses/{course_id}/archive")
    assert arc.status_code == 200
    assert arc.json()["course"]["status"] == "archived"


def test_affiliate_disclosure_required_when_flag_set():
    sb = MktSBStub()
    res = client(sb, user=ADMIN).post(
        "/api/admin/marketplace/courses",
        json={"title": "Affiliate Title", "price_inr": 100, "is_affiliate": True},
    )
    assert res.status_code == 400


def test_refund_approve_revokes_enrollment_and_writes_audit(monkeypatch):
    sb = MktSBStub()
    patch_razorpay(monkeypatch)
    seed_course(sb, id="c1", price_inr=1000)
    sb.db["marketplace_orders"] = [{
        "id": "o1",
        "user_id": USER["id"],
        "course_id": "c1",
        "amount_inr": 1000,
        "status": "paid",
        "razorpay_order_id": "rzp_o",
        "razorpay_payment_id": "pay_o",
    }]
    sb.db["enrollments"] = [{"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "active"}]
    sb.db["marketplace_refunds"] = [{
        "id": "r1", "order_id": "o1", "user_id": USER["id"], "course_id": "c1",
        "amount_inr": 1000, "status": "requested",
    }]

    res = client(sb, user=ADMIN).post("/api/admin/marketplace/refunds/r1/approve")
    assert res.status_code == 200
    assert sb.db["marketplace_refunds"][0]["status"] == "processed"
    assert sb.db["marketplace_orders"][0]["status"] == "refunded"
    assert sb.db["enrollments"][0]["status"] == "refunded"
    actions = [a["action"] for a in sb.db.get("admin_audit_logs", [])]
    assert "marketplace.refund.approved" in actions


def test_refund_deny_does_not_revoke_enrollment():
    sb = MktSBStub()
    seed_course(sb, id="c1", price_inr=1000)
    sb.db["marketplace_orders"] = [{
        "id": "o1", "user_id": USER["id"], "course_id": "c1",
        "amount_inr": 1000, "status": "paid", "razorpay_payment_id": "pay_o",
    }]
    sb.db["enrollments"] = [{"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "active"}]
    sb.db["marketplace_refunds"] = [{
        "id": "r1", "order_id": "o1", "user_id": USER["id"], "course_id": "c1",
        "amount_inr": 1000, "status": "requested",
    }]

    res = client(sb, user=ADMIN).post("/api/admin/marketplace/refunds/r1/deny", json={})
    assert res.status_code == 200
    assert sb.db["marketplace_refunds"][0]["status"] == "denied"
    assert sb.db["enrollments"][0]["status"] == "active"
    assert sb.db["marketplace_orders"][0]["status"] == "paid"


def test_refund_razorpay_failure_does_not_corrupt_state(monkeypatch):
    sb = MktSBStub()
    patch_razorpay(monkeypatch, refund_ok=False)
    seed_course(sb, id="c1", price_inr=1000)
    sb.db["marketplace_orders"] = [{
        "id": "o1", "user_id": USER["id"], "course_id": "c1",
        "amount_inr": 1000, "status": "paid", "razorpay_payment_id": "pay_o",
    }]
    sb.db["enrollments"] = [{"id": "e1", "user_id": USER["id"], "course_id": "c1", "status": "active"}]
    sb.db["marketplace_refunds"] = [{
        "id": "r1", "order_id": "o1", "user_id": USER["id"], "course_id": "c1",
        "amount_inr": 1000, "status": "requested",
    }]

    res = client(sb, user=ADMIN).post("/api/admin/marketplace/refunds/r1/approve")
    assert res.status_code == 502
    assert sb.db["marketplace_refunds"][0]["status"] == "failed"
    assert sb.db["enrollments"][0]["status"] == "active"
    assert sb.db["marketplace_orders"][0]["status"] == "paid"
