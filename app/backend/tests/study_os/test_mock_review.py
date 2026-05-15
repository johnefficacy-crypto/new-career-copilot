"""Tests for mock review and correction-task endpoints in canonical.py."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canonical as canonical_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _seed() -> dict:
    return {
        "mock_tests": [
            {"id": "m1", "user_id": "u-1", "exam_id": "exam-1", "test_name": "M1"},
            {"id": "m2", "user_id": "other-user", "exam_id": "exam-1"},
        ],
        "study_plans": [{"id": "p1", "user_id": "u-1", "status": "active"}],
        "topics": [
            {"id": "t1", "name": "Percentage", "subject_id": "s1"},
            {"id": "t2", "name": "Profit", "subject_id": "s1"},
        ],
        "profiles": [{"id": "u-1"}],
    }


def _client(sb: SBStub, user_id: str = "u-1") -> TestClient:
    app = FastAPI()
    app.include_router(canonical_api.router, prefix="/api")
    canonical_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app, TestClient(app)


# ─── /mocks/:id/review ────────────────────────────────────────────────────
def test_review_persists_error_types_and_status():
    sb = SBStub(_seed())
    _, client = _client(sb)
    r = client.post(
        "/api/study/mocks/m1/review",
        json={
            "review_status": "reviewed",
            "error_types": {"concept_gap": 3, "time_pressure": 1},
            "notes": "Need to revisit percentages.",
        },
    )
    assert r.status_code == 200
    mock = sb.db["mock_tests"][0]
    assert mock["review_status"] == "reviewed"
    assert mock["error_types"] == {"concept_gap": 3, "time_pressure": 1}
    assert mock["notes"] == "Need to revisit percentages."


def test_review_404_for_another_users_mock():
    sb = SBStub(_seed())
    _, client = _client(sb)
    r = client.post(
        "/api/study/mocks/m2/review",
        json={"review_status": "reviewed"},
    )
    assert r.status_code == 404


def test_review_with_topic_breakdowns_aggregates_errors():
    sb = SBStub(_seed())
    _, client = _client(sb)
    r = client.post(
        "/api/study/mocks/m1/review",
        json={
            "review_status": "reviewed",
            "topic_breakdowns": [
                {"topic_id": "t1", "wrong_answers": 2,
                 "error_types": {"concept_gap": 2}},
                {"topic_id": "t2", "wrong_answers": 1,
                 "error_types": {"concept_gap": 1, "misread": 1}},
            ],
        },
    )
    assert r.status_code == 200
    mock = sb.db["mock_tests"][0]
    # error counts aggregated server-side
    assert mock["error_types"] == {"concept_gap": 3, "misread": 1}
    # breakdowns persisted
    assert len(sb.db["mock_topic_breakdowns"]) == 2


def test_review_replaces_prior_breakdowns_idempotently():
    sb = SBStub(_seed())
    _, client = _client(sb)
    client.post(
        "/api/study/mocks/m1/review",
        json={
            "review_status": "reviewed",
            "topic_breakdowns": [
                {"topic_id": "t1", "wrong_answers": 5},
            ],
        },
    )
    # Second call with a different breakdown set must replace, not append.
    client.post(
        "/api/study/mocks/m1/review",
        json={
            "review_status": "reviewed",
            "topic_breakdowns": [
                {"topic_id": "t2", "wrong_answers": 1},
            ],
        },
    )
    assert len(sb.db["mock_topic_breakdowns"]) == 1
    assert sb.db["mock_topic_breakdowns"][0]["topic_id"] == "t2"


# ─── /mocks/:id/correction-tasks ──────────────────────────────────────────
def test_correction_tasks_created_from_topic_ids():
    sb = SBStub(_seed())
    _, client = _client(sb)
    r = client.post(
        "/api/study/mocks/m1/correction-tasks",
        json={"topic_ids": ["t1", "t2"], "add_to_today": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    tasks = sb.db["study_tasks"]
    assert {t["topic_id"] for t in tasks} == {"t1", "t2"}
    assert all(t["task_type"] == "mock_correction" for t in tasks)
    assert all(t["plan_id"] == "p1" for t in tasks)


def test_correction_tasks_404_for_another_users_mock():
    sb = SBStub(_seed())
    _, client = _client(sb)
    r = client.post("/api/study/mocks/m2/correction-tasks", json={"topic_ids": ["t1"]})
    assert r.status_code == 404


def test_correction_tasks_from_persisted_breakdowns_when_no_topic_ids():
    sb = SBStub(_seed())
    # seed weak breakdowns directly
    sb.db["mock_topic_breakdowns"] = [
        {"mock_test_id": "m1", "topic_id": "t1", "wrong_answers": 3, "accuracy": 40},
        {"mock_test_id": "m1", "topic_id": "t2", "wrong_answers": 0, "accuracy": 95},
    ]
    _, client = _client(sb)
    r = client.post("/api/study/mocks/m1/correction-tasks", json={})
    body = r.json()
    topic_ids = {t["topic_id"] for t in sb.db["study_tasks"]}
    # only t1 is weak (wrong>0 or accuracy<70); t2 is not
    assert topic_ids == {"t1"}
    assert body["count"] == 1
