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


# ─── Delivery model split (PR1) ───────────────────────────────────────────────


def _seed_partner(sb, *, id="p1", name="ExtCo", status="active", domains=None):
    sb.db.setdefault("affiliate_partners", []).append({
        "id": id,
        "name": name,
        "status": status,
        "allowed_domains": list(domains or []),
    })


def _affiliate_payload(**over):
    base = {
        "title": "Aff Course",
        "price_inr": 0,
        "is_affiliate": True,
        "affiliate_disclosure": "Sponsored — we may earn commission.",
        "delivery_model": "affiliate_external",
        "affiliate_partner_id": "p1",
        "external_product_url": "https://partner.example.com/buy/123",
    }
    base.update(over)
    return base


def test_affiliate_course_rejected_when_url_host_not_in_allowlist():
    sb = MktSBStub()
    _seed_partner(sb, domains=["partner.example.com"])
    res = client(sb, user=ADMIN).post(
        "/api/admin/marketplace/courses",
        json=_affiliate_payload(external_product_url="https://other.invalid/buy"),
    )
    assert res.status_code == 400
    assert "allowed_domains" in res.json()["detail"]


def test_affiliate_course_rejected_when_disclosure_missing():
    sb = MktSBStub()
    _seed_partner(sb, domains=["partner.example.com"])
    payload = _affiliate_payload(affiliate_disclosure="   ")
    res = client(sb, user=ADMIN).post("/api/admin/marketplace/courses", json=payload)
    assert res.status_code == 400


def test_platform_course_rejected_when_external_url_set():
    sb = MktSBStub()
    res = client(sb, user=ADMIN).post(
        "/api/admin/marketplace/courses",
        json={
            "title": "Platform Course",
            "price_inr": 100,
            "delivery_model": "platform_course",
            "external_product_url": "https://partner.example.com/buy",
        },
    )
    assert res.status_code == 400
    assert "external_product_url" in res.json()["detail"]


def test_affiliate_course_rejected_when_partner_suspended():
    sb = MktSBStub()
    _seed_partner(sb, status="suspended", domains=["partner.example.com"])
    res = client(sb, user=ADMIN).post(
        "/api/admin/marketplace/courses",
        json=_affiliate_payload(),
    )
    assert res.status_code == 400
    assert "not active" in res.json()["detail"]


def test_affiliate_course_created_when_partner_active_and_url_allowed():
    sb = MktSBStub()
    _seed_partner(sb, domains=["partner.example.com"])
    res = client(sb, user=ADMIN).post(
        "/api/admin/marketplace/courses",
        json=_affiliate_payload(),
    )
    assert res.status_code == 200, res.text
    course = res.json()["course"]
    assert course["delivery_model"] == "affiliate_external"
    assert course["affiliate_partner_id"] == "p1"
    assert course["external_product_url"] == "https://partner.example.com/buy/123"


def test_existing_course_readable_with_defaults():
    """Existing rows (pre-PR1) still list and read; default delivery_model
    is applied at the DB layer and the API does not require new columns
    on read paths."""
    sb = MktSBStub()
    seed_course(sb, id="legacy-1", delivery_model="platform_course")
    res = client(sb, user=ADMIN).get("/api/admin/marketplace/courses")
    assert res.status_code == 200
    items = res.json()["items"]
    assert any(c["id"] == "legacy-1" and c["delivery_model"] == "platform_course" for c in items)


def test_backfill_is_affiliate_maps_to_affiliate_external():
    """Mirror of the SQL backfill in migration 112: rows with is_affiliate=true
    end up with delivery_model='affiliate_external'."""
    sb = MktSBStub()
    seed_course(sb, id="legacy-aff", is_affiliate=True,
                affiliate_disclosure="Old disclosure", delivery_model="platform_course")
    seed_course(sb, id="legacy-plat", is_affiliate=False, delivery_model="platform_course")
    # Apply the backfill (matches the SQL UPDATE)
    for row in sb.db["courses"]:
        if row.get("is_affiliate") and row.get("delivery_model") == "platform_course":
            row["delivery_model"] = "affiliate_external"
    by_id = {c["id"]: c for c in sb.db["courses"]}
    assert by_id["legacy-aff"]["delivery_model"] == "affiliate_external"
    assert by_id["legacy-plat"]["delivery_model"] == "platform_course"


def test_review_view_returns_courses_with_internal_content_url():
    """Python emulation of admin_courses_needing_delivery_review against
    a fixture: only courses with a lesson on internal/storage URLs surface."""
    sb = MktSBStub()
    seed_course(sb, id="c-internal", title="Internal Storage Course")
    seed_course(sb, id="c-external", title="External Storage Course")
    sb.db.setdefault("course_sections", []).extend([
        {"id": "s-int", "course_id": "c-internal", "order_index": 0},
        {"id": "s-ext", "course_id": "c-external", "order_index": 0},
    ])
    sb.db.setdefault("lessons", []).extend([
        {"id": "l-int", "section_id": "s-int",
         "content_url": "https://abc.supabase.co/storage/v1/object/sign/courses/x.mp4"},
        {"id": "l-ext", "section_id": "s-ext",
         "content_url": "https://youtube.com/watch?v=xyz"},
    ])

    def _is_internal(url: str | None) -> bool:
        if not url:
            return False
        u = url.lower()
        return any(p in u for p in (
            "supabase.co/storage/", "/storage/v1/object/", "storage://",
        )) or u.startswith("/storage/")

    courses_by_id = {c["id"]: c for c in sb.db["courses"]}
    sections_by_course: dict[str, list[str]] = {}
    for s in sb.db["course_sections"]:
        sections_by_course.setdefault(s["course_id"], []).append(s["id"])
    flagged = []
    for cid, section_ids in sections_by_course.items():
        hits = [l for l in sb.db["lessons"]
                if l["section_id"] in section_ids and _is_internal(l.get("content_url"))]
        if hits:
            flagged.append({"course_id": cid, "course_title": courses_by_id[cid]["title"],
                            "internal_lesson_count": len(hits)})
    assert flagged == [
        {"course_id": "c-internal", "course_title": "Internal Storage Course",
         "internal_lesson_count": 1},
    ]


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
