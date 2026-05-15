"""Tests for ``GET /api/study/topics`` — locked-only topic intelligence.

Two key contract invariants this PR introduces:
  - rows with ``reviewer_status != 'locked'`` never appear
  - ``is_high_yield`` is the server-side value (no client computation)
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _seed() -> dict:
    return {
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "exam_topic_coverage": [
            # locked high-yield row
            {"id": "cov-1", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 90, "is_high_yield": True,
             "confidence_score": 0.9, "reviewer_status": "locked"},
            # locked, not high-yield
            {"id": "cov-2", "exam_id": "exam-1", "topic_id": "t2",
             "exam_priority_score": 50, "is_high_yield": False,
             "confidence_score": 0.7, "reviewer_status": "locked"},
            # draft — must be invisible to the topics endpoint
            {"id": "cov-3", "exam_id": "exam-1", "topic_id": "t3",
             "exam_priority_score": 99, "is_high_yield": True,
             "confidence_score": 0.4, "reviewer_status": "draft"},
            # rejected — also invisible
            {"id": "cov-4", "exam_id": "exam-1", "topic_id": "t4",
             "exam_priority_score": 85, "is_high_yield": True,
             "confidence_score": 0.9, "reviewer_status": "rejected"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "subject_id": "s1", "is_active": True},
            {"id": "t2", "name": "Vocab", "subject_id": "s2", "is_active": True},
            {"id": "t3", "name": "Draft", "subject_id": "s1", "is_active": True},
            {"id": "t4", "name": "Rejected", "subject_id": "s1", "is_active": True},
        ],
        "subjects": [
            {"id": "s1", "name": "Quantitative Aptitude"},
            {"id": "s2", "name": "English Language"},
        ],
        "user_topic_mastery": [
            {"user_id": "u-1", "topic_id": "t1", "exam_id": "exam-1", "mastery_score": 80},
        ],
    }


def _client(sb: SBStub) -> TestClient:
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": "u-1", "role": "user"}
    return TestClient(app)


def test_topics_returns_only_locked_rows():
    sb = SBStub(_seed())
    r = _client(sb).get("/api/study/topics")
    assert r.status_code == 200
    body = r.json()
    topic_ids = {it["topic_id"] for it in body["items"]}
    # locked: t1, t2; draft/rejected: t3, t4
    assert topic_ids == {"t1", "t2"}
    assert body["trust_status"] == "locked"


def test_topics_high_yield_is_server_side_only():
    sb = SBStub(_seed())
    items = _client(sb).get("/api/study/topics").json()["items"]
    by_id = {it["topic_id"]: it for it in items}
    # high_yield mirrors the locked source row, not a client derivation.
    assert by_id["t1"]["is_high_yield"] is True
    assert by_id["t2"]["is_high_yield"] is False
    # Unlocked rows (t3, t4) carry high_yield=True on the source row but
    # they never appear here, so the flag is structurally unreachable for
    # unlocked rows.
    assert "t3" not in by_id
    assert "t4" not in by_id


def test_topics_filtered_by_subject():
    sb = SBStub(_seed())
    # t1 lives in s1, t2 lives in s2.
    r = _client(sb).get("/api/study/topics?subject_id=s2")
    body = r.json()
    assert [it["topic_id"] for it in body["items"]] == ["t2"]


def test_topics_returns_empty_when_no_exam():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    body = _client(sb).get("/api/study/topics").json()
    assert body["items"] == []
    assert body["exam_id"] is None
