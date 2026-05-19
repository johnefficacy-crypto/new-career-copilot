"""Tests for the admin CRUD endpoints on ``exam_eligibility_rules`` (PR-D2)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_eligibility as admin_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


EXAM_A = "11111111-1111-4111-8111-111111111111"
EXAM_B = "22222222-2222-4222-8222-222222222222"
RULE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def _build_app(sb: SBStub, role: str = "super_admin") -> FastAPI:
    app = FastAPI()
    app.include_router(admin_api.router, prefix="/api")
    admin_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    user = {
        "id": "admin-1",
        "role": role,
        "permissions": ["exam_eligibility.manage"] if role == "admin" else [],
    }
    app.dependency_overrides[get_current_user] = lambda: user
    return app


def _world():
    return {
        "exams": [
            {"id": EXAM_A, "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True, "exam_family_id": None},
            {"id": EXAM_B, "slug": "upsc-cse", "name": "UPSC CSE", "is_active": True, "exam_family_id": None},
        ],
        "exam_eligibility_rules": [
            {
                "id": RULE_A,
                "exam_id": EXAM_A,
                "scope": "all",
                "rule_type": "age_min",
                "value_num": 18,
                "value_text": None,
                "is_knockout": True,
                "source_url": "https://ssc.gov.in/",
                "source_notes": None,
                "reviewer_status": "verified",
                "verified_by": "admin-9",
                "verified_at": "2026-01-01T00:00:00+00:00",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            },
        ],
    }


# ── Auth ──────────────────────────────────────────────────────────────────


def test_non_admin_user_is_forbidden():
    sb = SBStub(_world())
    app = FastAPI()
    app.include_router(admin_api.router, prefix="/api")
    admin_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "user-1", "role": "user", "permissions": []
    }
    r = TestClient(app).get("/api/admin/exam-eligibility/exams")
    assert r.status_code == 403


def test_admin_with_permission_can_list():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb, role="admin")).get("/api/admin/exam-eligibility/exams")
    assert r.status_code == 200


# ── List ──────────────────────────────────────────────────────────────────


def test_list_exams_reports_rule_counts_per_status():
    sb = SBStub(_world())
    body = TestClient(_build_app(sb)).get("/api/admin/exam-eligibility/exams").json()
    items = {e["slug"]: e for e in body["items"]}
    assert items["ssc-cgl"]["rule_counts"]["verified"] == 1
    assert items["ssc-cgl"]["rule_counts"]["draft"] == 0
    assert items["ssc-cgl"]["total_rules"] == 1
    assert items["upsc-cse"]["total_rules"] == 0


def test_list_rules_for_unknown_exam_is_404():
    sb = SBStub(_world())
    missing = "99999999-9999-4999-8999-999999999999"
    r = TestClient(_build_app(sb)).get(f"/api/admin/exam-eligibility/exams/{missing}/rules")
    assert r.status_code == 404


def test_list_rules_returns_every_status():
    sb = SBStub(_world())
    sb.db["exam_eligibility_rules"].append(
        {
            "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "exam_id": EXAM_A,
            "scope": "general",
            "rule_type": "age_max",
            "value_num": 32,
            "reviewer_status": "draft",
        }
    )
    body = (
        TestClient(_build_app(sb))
        .get(f"/api/admin/exam-eligibility/exams/{EXAM_A}/rules")
        .json()
    )
    statuses = {r["reviewer_status"] for r in body["rules"]}
    assert statuses == {"verified", "draft"}


# ── Create ────────────────────────────────────────────────────────────────


def test_create_rule_happy_path_stamps_verified_metadata():
    sb = SBStub(_world())
    payload = {
        "scope": "general",
        "rule_type": "age_max",
        "value_num": 32,
        "source_url": "https://ssc.gov.in/",
        "reviewer_status": "verified",
    }
    r = TestClient(_build_app(sb)).post(
        f"/api/admin/exam-eligibility/exams/{EXAM_A}/rules", json=payload
    )
    assert r.status_code == 200
    rule = r.json()["rule"]
    assert rule["verified_by"] == "admin-1"
    assert rule["verified_at"] is not None


def test_create_rule_rejects_unknown_scope():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).post(
        f"/api/admin/exam-eligibility/exams/{EXAM_A}/rules",
        json={"scope": "made-up", "rule_type": "age_max", "value_num": 32},
    )
    assert r.status_code == 400
    assert "invalid_scope" in r.json()["detail"]


def test_create_rule_rejects_numeric_rule_without_value_num():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).post(
        f"/api/admin/exam-eligibility/exams/{EXAM_A}/rules",
        json={"scope": "general", "rule_type": "age_max"},
    )
    assert r.status_code == 400
    assert "value_num" in r.json()["detail"]


def test_create_rule_rejects_text_rule_without_value_text():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).post(
        f"/api/admin/exam-eligibility/exams/{EXAM_A}/rules",
        json={"scope": "all", "rule_type": "nationality"},
    )
    assert r.status_code == 400
    assert "value_text" in r.json()["detail"]


def test_create_rule_conflict_when_scope_rule_type_pair_exists():
    sb = SBStub(_world())
    # The fixture already has (EXAM_A, scope=all, rule_type=age_min).
    r = TestClient(_build_app(sb)).post(
        f"/api/admin/exam-eligibility/exams/{EXAM_A}/rules",
        json={"scope": "all", "rule_type": "age_min", "value_num": 21},
    )
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "RULE_ALREADY_EXISTS"
    assert detail["rule_id"] == RULE_A


def test_create_rule_on_unknown_exam_is_404():
    sb = SBStub(_world())
    missing = "99999999-9999-4999-8999-999999999999"
    r = TestClient(_build_app(sb)).post(
        f"/api/admin/exam-eligibility/exams/{missing}/rules",
        json={"scope": "all", "rule_type": "age_min", "value_num": 18},
    )
    assert r.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────


def test_update_rule_promote_draft_to_verified_stamps_metadata():
    sb = SBStub(_world())
    sb.db["exam_eligibility_rules"].append(
        {
            "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "exam_id": EXAM_A,
            "scope": "general",
            "rule_type": "age_max",
            "value_num": 32,
            "reviewer_status": "draft",
            "verified_by": None,
            "verified_at": None,
        }
    )
    r = TestClient(_build_app(sb)).put(
        "/api/admin/exam-eligibility/rules/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 200
    updated = next(r for r in sb.db["exam_eligibility_rules"] if r["id"] == "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    assert updated["reviewer_status"] == "verified"
    assert updated["verified_by"] == "admin-1"
    assert updated["verified_at"] is not None


def test_update_rule_demote_clears_verified_metadata():
    sb = SBStub(_world())
    # RULE_A starts verified; flipping it to draft must wipe verified_*.
    r = TestClient(_build_app(sb)).put(
        f"/api/admin/exam-eligibility/rules/{RULE_A}",
        json={"reviewer_status": "draft"},
    )
    assert r.status_code == 200
    row = next(r for r in sb.db["exam_eligibility_rules"] if r["id"] == RULE_A)
    assert row["reviewer_status"] == "draft"
    assert row["verified_by"] is None
    assert row["verified_at"] is None


def test_update_unknown_rule_is_404():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).put(
        "/api/admin/exam-eligibility/rules/00000000-0000-4000-8000-000000000000",
        json={"value_num": 19},
    )
    assert r.status_code == 404


# ── Delete ────────────────────────────────────────────────────────────────


def test_soft_delete_archives_rule():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).delete(
        f"/api/admin/exam-eligibility/rules/{RULE_A}"
    )
    assert r.status_code == 200
    body = r.json()
    assert body["deleted"] is True
    assert body["hard"] is False
    row = next(r for r in sb.db["exam_eligibility_rules"] if r["id"] == RULE_A)
    assert row["reviewer_status"] == "archived"


def test_hard_delete_removes_row():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).delete(
        f"/api/admin/exam-eligibility/rules/{RULE_A}?hard=true"
    )
    assert r.status_code == 200
    assert all(rule["id"] != RULE_A for rule in sb.db["exam_eligibility_rules"])


def test_delete_unknown_rule_is_404():
    sb = SBStub(_world())
    r = TestClient(_build_app(sb)).delete(
        "/api/admin/exam-eligibility/rules/00000000-0000-4000-8000-000000000000"
    )
    assert r.status_code == 404
