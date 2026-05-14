"""Admin exam intelligence API tests (PR5)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intelligence as admin_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub, role: str = "super_admin"):
    app = FastAPI()
    app.include_router(admin_api.router, prefix="/api")
    admin_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    user_dict = {
        "id": "admin-1",
        "role": role,
        "permissions": ["exam_intelligence.review"] if role == "admin" else [],
    }
    app.dependency_overrides[get_current_user] = lambda: user_dict
    return app


def _seed():
    return {
        "exams": [
            {"id": "e1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True},
            {"id": "e2", "slug": "ibps-po", "name": "IBPS PO", "exam_type": "recruitment", "is_active": True},
        ],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "e1", "topic_id": "t1", "raw_text": "Percentages",
             "normalized_text": "percentages", "mention_type": "explicit", "confidence_score": 0.9,
             "reviewer_status": "pending", "created_at": "2026-05-01T00:00:00+00:00"},
            {"id": "m2", "exam_id": "e1", "topic_id": "t2", "raw_text": "Ratios",
             "normalized_text": "ratios", "mention_type": "explicit", "confidence_score": 0.8,
             "reviewer_status": "verified", "created_at": "2026-04-30T00:00:00+00:00"},
            {"id": "m3", "exam_id": "e2", "topic_id": "t1", "reviewer_status": "pending",
             "created_at": "2026-04-29T00:00:00+00:00"},
        ],
        "exam_topic_coverage": [
            {"exam_id": "e1", "topic_id": "t1", "is_active": True},
            {"exam_id": "e1", "topic_id": "t2", "is_active": True},
        ],
        "pyq_papers": [{"id": "p1", "exam_id": "e1"}],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "p1", "question_type": "mcq", "reviewer_status": "pending",
             "created_at": "2026-05-01T00:00:00+00:00"},
        ],
        "pyq_question_topic_tags": [
            {"id": "tag1", "question_id": "q1", "topic_id": "t1",
             "tag_weight": 1.0, "tag_role": "primary", "tagging_source": "manual",
             "confidence_score": 0.5, "reviewer_status": "pending",
             "created_at": "2026-05-01T00:00:00+00:00"},
        ],
    }


# ─── Access control ────────────────────────────────────────────────────────
def test_non_admin_blocked_on_every_endpoint():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb, role="user"))
    for path, method in [
        ("/api/admin/exam-intelligence/overview", "get"),
        ("/api/admin/exam-intelligence/exams", "get"),
        ("/api/admin/exam-intelligence/exams/e1/items", "get"),
    ]:
        r = getattr(client, method)(path)
        assert r.status_code == 403, path
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 403


def test_admin_with_perm_can_access():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb, role="admin"))
    r = client.get("/api/admin/exam-intelligence/overview")
    assert r.status_code == 200


# ─── Overview ──────────────────────────────────────────────────────────────
def test_overview_aggregates_status_counts():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/overview")
    assert r.status_code == 200
    body = r.json()
    syllabus = body["tables"]["syllabus_topic_mention"]
    assert syllabus["total"] == 3
    assert syllabus["verified"] == 1
    assert syllabus["pending"] == 2
    assert body["exams"]["active"] == 2


# ─── Exam list ────────────────────────────────────────────────────────────
def test_list_exams_includes_per_exam_counts():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams")
    assert r.status_code == 200
    body = r.json()
    by_slug = {e["slug"]: e for e in body["items"]}
    assert by_slug["ssc-cgl"]["syllabus_verified"] == 1
    assert by_slug["ssc-cgl"]["syllabus_pending"] == 1
    assert by_slug["ssc-cgl"]["coverage_active"] == 2
    assert by_slug["ibps-po"]["syllabus_verified"] == 0
    assert by_slug["ibps-po"]["syllabus_pending"] == 1


# ─── Items list ───────────────────────────────────────────────────────────
def test_items_default_pending_filter():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams/e1/items?kind=syllabus_topic_mention")
    assert r.status_code == 200
    rows = r.json()["items"]
    assert rows and all(r["reviewer_status"] == "pending" for r in rows)


def test_items_unknown_kind_rejected():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/admin/exam-intelligence/exams/e1/items?kind=ghost")
    assert r.status_code == 400


def test_items_invalid_status_rejected():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/admin/exam-intelligence/exams/e1/items?kind=syllabus_topic_mention&status=nonsense"
    )
    assert r.status_code == 400


def test_pyq_question_topic_tag_list_filters_by_exam():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/admin/exam-intelligence/exams/e1/items?kind=pyq_question_topic_tag&status=all"
    )
    assert r.status_code == 200
    rows = r.json()["items"]
    assert any(row["id"] == "tag1" for row in rows)


# ─── Review patch ─────────────────────────────────────────────────────────
def test_review_patch_marks_verified_and_records_reviewer():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "verified", "reviewer_notes": "Cross-checked PDF page 4."},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reviewer_status"] == "verified"
    assert body["reviewed_by"] == "admin-1"
    assert body["reviewer_notes"] == "Cross-checked PDF page 4."


def test_review_patch_rejects_unknown_kind():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/ghost/m1/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 400


def test_review_patch_rejects_unknown_status():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "definitely_yes"},
    )
    assert r.status_code == 422


def test_review_patch_missing_row_returns_404():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/no-such/review",
        json={"reviewer_status": "verified"},
    )
    assert r.status_code == 404


def test_pyq_tag_review_excludes_notes_field():
    # pyq_question_topic_tags table doesn't carry reviewer_notes; verify the
    # PATCH ignores notes for that kind without erroring.
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.patch(
        "/api/admin/exam-intelligence/items/pyq_question_topic_tag/tag1/review",
        json={"reviewer_status": "verified", "reviewer_notes": "ignored"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["reviewer_status"] == "verified"
    assert "reviewer_notes" not in body  # never written for this kind
