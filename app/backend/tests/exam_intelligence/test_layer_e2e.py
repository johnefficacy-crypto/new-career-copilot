"""End-to-end-ish tests for the exam intelligence layer.

Covers admin review writes flowing through to the user-facing read API using
the same in-memory Supabase stub.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intelligence as admin_api
from app.api import exam_intelligence as read_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _seed() -> dict:
    return {
        "exams": [
            {"id": "e1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True},
        ],
        "subjects": [{"id": "sub1", "name": "Quantitative Aptitude"}],
        "topics": [{"id": "t1", "name": "Percentages", "slug": "percentages", "subject_id": "sub1"}],
        "exam_topic_coverage": [],
        "pyq_papers": [{"id": "p1", "exam_id": "e1"}],
        "pyq_questions": [{"id": "q1", "pyq_paper_id": "p1", "reviewer_status": "pending"}],
        "pyq_question_topic_tags": [{"id": "tag1", "question_id": "q1", "topic_id": "t1", "reviewer_status": "pending"}],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "e1", "topic_id": "t1", "reviewer_status": "pending", "raw_text": "Percentages"},
        ],
    }


def _build_client(sb: SBStub) -> TestClient:
    app = FastAPI()
    app.include_router(admin_api.router, prefix="/api")
    app.include_router(read_api.router, prefix="/api")
    admin_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    read_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "role": "super_admin",
        "permissions": ["exam_intelligence.review"],
    }
    return TestClient(app)


def test_exam_intelligence_layer_review_to_read_contract():
    sb = SBStub(_seed())
    client = _build_client(sb)

    before = client.get("/api/exam-intelligence/exams/ssc-cgl")
    assert before.status_code == 200
    assert before.json()["available"] is False
    assert before.json()["topics"] == []

    review = client.patch(
        "/api/admin/exam-intelligence/items/syllabus_topic_mention/m1/review",
        json={"reviewer_status": "verified"},
    )
    assert review.status_code == 200
    assert review.json()["reviewer_status"] == "verified"

    after = client.get("/api/exam-intelligence/exams/ssc-cgl")
    assert after.status_code == 200
    payload = after.json()
    assert payload["verified_only"] is True
    assert payload["available"] is True
    assert payload["exam"]["slug"] == "ssc-cgl"
    assert payload["verified_syllabus_mentions"] == 1


def test_exam_intelligence_layer_exams_list_stays_verified_only():
    sb = SBStub(_seed())
    client = _build_client(sb)

    out = client.get("/api/exam-intelligence/exams")
    assert out.status_code == 200
    body = out.json()
    assert body["verified_only"] is True
    assert body["count"] == 1
    assert body["items"][0]["slug"] == "ssc-cgl"
