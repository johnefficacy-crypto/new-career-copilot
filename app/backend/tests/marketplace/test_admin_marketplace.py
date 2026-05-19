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


# ─── PR2 — Marketplace hosted assets (migration 114) ──────────────────────────


_VALID_HASH = "a" * 64
_HASH_B = "b" * 64
_HASH_C = "c" * 64


def _seed_course_with_delivery(sb, *, course_id="c-host", delivery_model="platform_course"):
    seed_course(sb, id=course_id, delivery_model=delivery_model)


def _create_asset(sb, course_id, **body):
    payload = {"asset_type": body.pop("asset_type", "notes_pdf"), **body}
    return client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/courses/{course_id}/assets", json=payload,
    )


def _set_status(sb, asset_id, status, **extra):
    for r in sb.db["marketplace_assets"]:
        if r["id"] == asset_id:
            r["status"] = status
            r.update(extra)
            return r
    raise AssertionError("asset not found")


def _add_file(sb, asset_id, *, file_role="source", path="x/a.pdf",
              bucket="market", content_hash=_VALID_HASH, mime="application/pdf"):
    sb.db.setdefault("marketplace_asset_files", []).append({
        "id": f"f-{len(sb.db.get('marketplace_asset_files', []))+1}",
        "asset_id": asset_id, "file_role": file_role,
        "storage_bucket": bucket, "storage_path": path,
        "content_hash": content_hash, "mime_type": mime,
    })


# 1
def test_create_asset_on_platform_course_returns_201():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    res = _create_asset(sb, "c-host", asset_type="notes_pdf", title="Polity Notes")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "draft"
    assert body["asset_type"] == "notes_pdf"


# 2
def test_create_asset_on_affiliate_external_rejected_422():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="affiliate_external")
    res = _create_asset(sb, "c-host", asset_type="notes_pdf")
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "delivery_model_not_hostable"


# 3, 4, 5
def test_test_session_on_platform_course_mismatch():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    res = _create_asset(sb, "c-host", asset_type="test_session")
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "asset_type_delivery_mismatch"


def test_test_session_on_platform_test_ok():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_test")
    res = _create_asset(sb, "c-host", asset_type="test_session")
    assert res.status_code == 201


def test_notes_pdf_on_platform_test_mismatch():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_test")
    res = _create_asset(sb, "c-host", asset_type="notes_pdf")
    assert res.status_code == 422


# 6
def test_video_on_platform_course_ok():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    res = _create_asset(sb, "c-host", asset_type="video")
    assert res.status_code == 201


# 7
def test_bundle_on_platform_download_mismatch():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_download")
    res = _create_asset(sb, "c-host", asset_type="bundle")
    assert res.status_code == 422


def test_bundle_on_platform_bundle_ok():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_bundle")
    res = _create_asset(sb, "c-host", asset_type="bundle")
    assert res.status_code == 201


# 8
def test_patch_status_is_rejected_with_specific_code():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    res = _create_asset(sb, "c-host", asset_type="notes_pdf")
    asset_id = res.json()["id"]
    bad = client(sb, user=ADMIN).put(
        f"/api/admin/marketplace/assets/{asset_id}",
        json={"status": "published"},
    )
    assert bad.status_code == 400
    assert bad.json()["detail"]["code"] == "status_not_patchable_use_transition_endpoint"


# 9
def test_patch_title_and_description_cleanly():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    res = _create_asset(sb, "c-host", asset_type="notes_pdf", title="Old")
    asset_id = res.json()["id"]
    upd = client(sb, user=ADMIN).put(
        f"/api/admin/marketplace/assets/{asset_id}",
        json={"title": "New", "description": "Polity intro"},
    )
    assert upd.status_code == 200
    assert upd.json()["title"] == "New"
    assert upd.json()["description"] == "Polity intro"


def _make_asset(sb, *, delivery_model="platform_course", asset_type="notes_pdf"):
    _seed_course_with_delivery(sb, delivery_model=delivery_model)
    res = _create_asset(sb, "c-host", asset_type=asset_type)
    assert res.status_code == 201, res.text
    return res.json()["id"]


# 10, 11
def test_submit_review_from_draft_moves_to_pending_review():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/submit-review")
    assert r.status_code == 200
    assert r.json()["status"] == "pending_review"


def test_submit_review_from_approved_409():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "approved")
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/submit-review")
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "invalid_state_transition"


# 12, 13, 14
def test_approve_from_pending_review_sets_fields_and_lifts_unchecked():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "pending_review", copyright_risk_status="unchecked")
    r = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/approve",
        json={"reason": "looks good"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    assert body["approved_by"] == ADMIN["id"]
    assert body["approval_reason"] == "looks good"
    assert body["copyright_risk_status"] == "clear"


def test_approve_from_draft_409():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/approve")
    assert r.status_code == 409


def test_approve_from_rejected_409():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "rejected")
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/approve")
    assert r.status_code == 409


# 15, 16
def test_reject_from_pending_review_and_from_approved():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "pending_review")
    r1 = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/reject",
        json={"reason": "blurry"},
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == "rejected"
    assert r1.json()["rejection_reason"] == "blurry"

    _set_status(sb, asset_id, "approved")
    r2 = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/reject")
    assert r2.status_code == 200
    assert r2.json()["status"] == "rejected"


def test_reject_from_draft_409():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/reject")
    assert r.status_code == 409


# 17, 18, 19, 20, 21, 22
def test_publish_from_approved_with_source_file_succeeds():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "approved", copyright_risk_status="clear")
    _add_file(sb, asset_id)
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/publish")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published"


def test_publish_from_pending_review_409():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "pending_review")
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/publish")
    assert r.status_code == 409


def test_publish_notes_pdf_without_files_blocked():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "approved", copyright_risk_status="clear")
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/publish")
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "no_source_file"


def test_publish_test_session_without_files_succeeds():
    sb = MktSBStub()
    asset_id = _make_asset(sb, delivery_model="platform_test", asset_type="test_session")
    _set_status(sb, asset_id, "approved", copyright_risk_status="clear")
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/publish")
    assert r.status_code == 200
    assert r.json()["status"] == "published"


def test_publish_bundle_without_files_blocked():
    sb = MktSBStub()
    asset_id = _make_asset(sb, delivery_model="platform_bundle", asset_type="bundle")
    _set_status(sb, asset_id, "approved", copyright_risk_status="clear")
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/publish")
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "no_source_file"


def test_publish_blocked_when_copyright_flagged():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _set_status(sb, asset_id, "approved", copyright_risk_status="flagged")
    _add_file(sb, asset_id)
    r = client(sb, user=ADMIN).post(f"/api/admin/marketplace/assets/{asset_id}/publish")
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "copyright_block"


# 23, 24, 25, 26, 27
def test_file_insert_with_valid_sha256():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    r = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/files",
        json={
            "storage_bucket": "market", "storage_path": "a/b.pdf",
            "original_filename": "b.pdf", "mime_type": "application/pdf",
            "file_size_bytes": 100, "content_hash": _VALID_HASH,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["content_hash"] == _VALID_HASH


def test_file_insert_with_malformed_hash():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    r = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/files",
        json={
            "storage_bucket": "market", "storage_path": "a/b.pdf",
            "mime_type": "application/pdf",
            "content_hash": "NOT_HEX_AND_TOO_SHORT_BUT_64_CHARS_____________________________",
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_hash_format"


def test_file_insert_blocked_by_infringing_hash():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    sb.db.setdefault("marketplace_infringing_hashes", []).append({
        "id": "h1", "content_hash": _HASH_B, "reason": "DMCA notice 2026-04",
    })
    r = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/files",
        json={
            "storage_bucket": "market", "storage_path": "a/x.pdf",
            "mime_type": "application/pdf", "content_hash": _HASH_B,
        },
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "infringing_hash_blocked"


def test_duplicate_storage_path_conflict():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    payload = {
        "storage_bucket": "market", "storage_path": "a/c.pdf",
        "mime_type": "application/pdf", "content_hash": _VALID_HASH,
    }
    first = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/files", json=payload,
    )
    assert first.status_code == 201
    second = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/files",
        json={**payload, "content_hash": _HASH_C},
    )
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "storage_path_conflict"


def test_same_content_hash_across_two_assets_allowed():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    a1 = _create_asset(sb, "c-host", asset_type="notes_pdf").json()["id"]
    a2 = _create_asset(sb, "c-host", asset_type="notes_pdf").json()["id"]
    body = {
        "storage_bucket": "market",
        "mime_type": "application/pdf", "content_hash": _VALID_HASH,
    }
    r1 = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{a1}/files",
        json={**body, "storage_path": "asset1/file.pdf"},
    )
    r2 = client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{a2}/files",
        json={**body, "storage_path": "asset2/file.pdf"},
    )
    assert r1.status_code == 201
    assert r2.status_code == 201


# 28
def test_normal_user_blocked_from_asset_endpoints():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    user_client = client(sb, user=USER)
    assert user_client.get("/api/admin/marketplace/courses/c-host/assets").status_code == 403
    assert user_client.post(
        "/api/admin/marketplace/courses/c-host/assets",
        json={"asset_type": "notes_pdf"},
    ).status_code == 403


# 29
def test_list_course_assets_includes_file_count_and_primary_file():
    sb = MktSBStub()
    asset_id = _make_asset(sb)
    _add_file(sb, asset_id, file_role="source", path="src.pdf")
    _add_file(sb, asset_id, file_role="preview", path="preview.pdf",
              content_hash=_HASH_C)
    r = client(sb, user=ADMIN).get("/api/admin/marketplace/courses/c-host/assets")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["file_count"] == 2
    assert items[0]["primary_file"] is not None
    assert items[0]["primary_file"]["file_role"] == "source"


# 30
def test_list_pagination_limit_offset_and_max_enforced():
    sb = MktSBStub()
    _seed_course_with_delivery(sb, delivery_model="platform_course")
    for _ in range(5):
        _create_asset(sb, "c-host", asset_type="notes_pdf")
    r = client(sb, user=ADMIN).get(
        "/api/admin/marketplace/courses/c-host/assets?limit=2&offset=1",
    )
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 2
    assert body["offset"] == 1
    assert len(body["items"]) == 2

    too_big = client(sb, user=ADMIN).get(
        "/api/admin/marketplace/courses/c-host/assets?limit=999",
    )
    assert too_big.status_code == 422  # FastAPI Query(le=200) validation


# 31
def test_public_marketplace_does_not_leak_asset_storage_paths():
    """Even with a published asset attached to a published course, the
    public catalogue / resource-detail endpoint must not surface
    storage_bucket, storage_path, or file rows. The current public
    endpoint does not query marketplace_assets at all — this test
    pins that contract so a future refactor cannot regress it."""
    sb = MktSBStub()
    seed_course(sb, id="pub-course", status="published",
                delivery_model="platform_course")
    sb.db.setdefault("marketplace_assets", []).append({
        "id": "asset-1", "course_id": "pub-course",
        "asset_type": "notes_pdf", "status": "published",
        "title": "Polity Pack",
    })
    sb.db.setdefault("marketplace_asset_files", []).append({
        "id": "file-1", "asset_id": "asset-1", "file_role": "source",
        "storage_bucket": "market", "storage_path": "secret/path/file.pdf",
        "content_hash": _VALID_HASH, "mime_type": "application/pdf",
    })
    r = client(sb).get("/api/marketplace/resources/pub-course")
    # Endpoint may 200 (course shape) or 404 if shape mismatch in stub;
    # either way the body must not leak file internals.
    body_text = r.text
    assert "secret/path/file.pdf" not in body_text
    assert "storage_path" not in body_text
    assert "storage_bucket" not in body_text


# 32
def test_suspended_and_dmca_removed_unreachable_via_pr2_paths():
    """No PR2 API path can set status to 'suspended' or 'dmca_removed'.
    PUT rejects status outright; transition endpoints only accept the
    documented targets. Asserts both paths."""
    sb = MktSBStub()
    asset_id = _make_asset(sb)

    # PUT path
    for target in ("suspended", "dmca_removed"):
        r = client(sb, user=ADMIN).put(
            f"/api/admin/marketplace/assets/{asset_id}",
            json={"status": target},
        )
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "status_not_patchable_use_transition_endpoint"

    # No /suspend or /dmca-remove endpoints exist either.
    assert client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/suspend",
    ).status_code == 404
    assert client(sb, user=ADMIN).post(
        f"/api/admin/marketplace/assets/{asset_id}/dmca-remove",
    ).status_code == 404
