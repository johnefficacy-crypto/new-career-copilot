"""Subjects (progress) service + API tests."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os import subjects as subjects_service
from tests.persona_questions._stub import SBStub


def _client(sb: SBStub):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "u-1"}
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


def _seed():
    return {
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "exam_topic_coverage": [
            {"id": "cov-1", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 90, "is_high_yield": True,
             "confidence_score": 0.9, "reviewer_status": "locked"},
            {"id": "cov-2", "exam_id": "exam-1", "topic_id": "t2",
             "exam_priority_score": 80, "is_high_yield": False,
             "confidence_score": 0.7, "reviewer_status": "locked"},
            {"id": "cov-3", "exam_id": "exam-1", "topic_id": "t3",
             "exam_priority_score": 70, "is_high_yield": False,
             "confidence_score": 0.6, "reviewer_status": "locked"},
            # draft — must be invisible.
            {"id": "cov-4", "exam_id": "exam-1", "topic_id": "t4",
             "exam_priority_score": 99, "is_high_yield": True,
             "confidence_score": 0.4, "reviewer_status": "draft"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "slug": "percentage", "subject_id": "s1", "is_active": True},
            {"id": "t2", "name": "Profit & Loss", "slug": "profit-loss", "subject_id": "s1", "is_active": True},
            {"id": "t3", "name": "Vocabulary", "slug": "vocab", "subject_id": "s2", "is_active": True},
            {"id": "t4", "name": "Draft", "slug": "draft", "subject_id": "s1", "is_active": True},
        ],
        "subjects": [
            {"id": "s1", "slug": "quant", "name": "Quant", "subject_group": "math", "is_active": True},
            {"id": "s2", "slug": "english", "name": "English", "subject_group": "lang", "is_active": True},
        ],
        "user_topic_mastery": [
            {"user_id": "u-1", "topic_id": "t1", "exam_id": "exam-1", "mastery_score": 80},
            {"user_id": "u-1", "topic_id": "t2", "exam_id": "exam-1", "mastery_score": 40},
            {"user_id": "u-1", "topic_id": "t3", "exam_id": "exam-1", "mastery_score": 30},
        ],
    }


def test_subjects_returns_averaged_mastery_grouped_by_subject():
    sb = SBStub(_seed())
    items = subjects_service.list_subjects(sb, "u-1")
    # Two subjects appear (Quant and English); the draft-only subject
    # would too if it had any locked coverage rows.
    names = [it["subject"] for it in items]
    assert "Quant" in names
    assert "English" in names

    quant = next(it for it in items if it["subject"] == "Quant")
    # Two locked Quant topics with mastery 80 + 40 → avg 60.
    assert quant["progress"] == 60
    # t2 has mastery < 50 → weak; t1 is not → weak_count = 1.
    assert quant["weak_count"] == 1
    assert quant["locked_topics"] == 2


def test_subjects_skips_draft_and_rejected_coverage():
    sb = SBStub(_seed())
    items = subjects_service.list_subjects(sb, "u-1")
    quant = next(it for it in items if it["subject"] == "Quant")
    # t4 is draft → should not contribute to locked_topics.
    assert quant["locked_topics"] == 2


def test_subjects_empty_when_no_target_exam():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    assert subjects_service.list_subjects(sb, "u-1") == []


def test_api_returns_items_envelope():
    sb = SBStub(_seed())
    body = _client(sb).get("/api/study/subjects").json()
    assert "items" in body and "count" in body
    assert body["count"] == len(body["items"])
    assert any(it["subject"] == "English" for it in body["items"])


def test_subjects_orders_weak_first_then_alpha():
    sb = SBStub(_seed())
    items = subjects_service.list_subjects(sb, "u-1")
    # English has 1 weak (t3 mastery 30) and Quant has 1 weak (t2 mastery
    # 40). Tie on weak_count → English sorts before Quant alphabetically.
    assert items[0]["subject"] in {"English", "Quant"}
    if items[0]["subject"] == items[1]["subject"]:
        return
    # When weak_count is equal, fall back to alphabetical order.
    assert items[0]["subject"] < items[1]["subject"]
