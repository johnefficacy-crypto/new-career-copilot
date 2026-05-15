"""Production Mocks surface — service-layer + API tests with the in-memory
Supabase stub.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os import mocks as mocks_service
from tests.persona_questions._stub import SBStub


def _client(sb: SBStub):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1"}
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


# ─────────────────────────── service-level tests ────────────────────────────
def test_create_mock_persists_row_and_breakdowns():
    sb = SBStub({})
    out = mocks_service.create_mock(
        sb,
        "user-1",
        {
            "name": "Mock 13",
            "exam_slug": "ssc-cgl-2026",
            "score": 122,
            "max_score": 200,
            "duration_min": 60,
            "attempted": 100,
            "correct": 80,
            "weak_topics": ["Polity", "Modern History"],
            "error_patterns": {"concept": 4, "time": 2},
            "subject_breakdown": [
                {"subject": "Polity", "total_questions": 40, "correct_answers": 24, "wrong_answers": 16, "accuracy": 0.6},
            ],
        },
    )
    assert out["name"] == "Mock 13"
    assert out["percentage"] == 61.0
    assert out["weak_topics"] == ["Polity", "Modern History"]
    assert out["error_patterns"] == {"concept": 4, "time": 2}
    assert out["wrong"] == 20
    assert len(out["subject_breakdown"]) == 1
    assert sb.db["mock_tests"][0]["user_id"] == "user-1"
    assert sb.db["mock_subject_breakdowns"][0]["subject"] == "Polity"


def test_list_mocks_returns_newest_first():
    sb = SBStub({})
    mocks_service.create_mock(sb, "user-1", {"name": "M1", "score": 100, "max_score": 200, "attempted_at": "2026-01-01T00:00:00Z"})
    mocks_service.create_mock(sb, "user-1", {"name": "M2", "score": 110, "max_score": 200, "attempted_at": "2026-01-08T00:00:00Z"})
    items = mocks_service.list_mocks(sb, "user-1")
    assert [m["name"] for m in items] == ["M2", "M1"]
    trend = mocks_service.mock_trend(items)
    assert [t["name"] for t in trend] == ["M1", "M2"]


def test_set_review_state_only_allows_valid_states():
    sb = SBStub({})
    m = mocks_service.create_mock(sb, "user-1", {"name": "M1", "score": 100, "max_score": 200})
    out = mocks_service.set_review_state(sb, "user-1", m["id"], "reviewed")
    assert out["review_state"] == "reviewed"

    import pytest
    with pytest.raises(ValueError):
        mocks_service.set_review_state(sb, "user-1", m["id"], "not_a_state")


def test_draft_correction_tasks_uses_error_patterns():
    sb = SBStub({})
    m = mocks_service.create_mock(
        sb,
        "user-1",
        {
            "name": "M1",
            "score": 100,
            "max_score": 200,
            "weak_topics": ["Polity"],
            "error_patterns": {"concept": 3, "time": 1, "memory": 0},
        },
    )
    drafts = mocks_service.draft_correction_tasks(sb, "user-1", m["id"])
    categories = [d["category"] for d in drafts]
    # concept_gap from "concept: 3", speed_issue from "time: 1",
    # memory_gap suppressed because count is 0.
    assert "concept_gap" in categories
    assert "speed_issue" in categories
    assert "memory_gap" not in categories
    # Mock review_state should be bumped to correction_drafted.
    refreshed = mocks_service.get_mock(sb, "user-1", m["id"])
    assert refreshed["review_state"] == "correction_drafted"


def test_draft_correction_falls_back_to_weak_topics_when_no_errors():
    sb = SBStub({})
    m = mocks_service.create_mock(
        sb,
        "user-1",
        {
            "name": "M1",
            "score": 100,
            "max_score": 200,
            "weak_topics": ["Polity", "Economy", "History", "Geo"],
            "error_patterns": {},
        },
    )
    drafts = mocks_service.draft_correction_tasks(sb, "user-1", m["id"])
    # Capped at 3 weak-topic drills when no error_patterns provided.
    assert len(drafts) == 3
    assert all(d["category"] == "concept_gap" for d in drafts)
    assert [d["topic"] for d in drafts] == ["Polity", "Economy", "History"]


def test_draft_correction_replaces_prior_drafts():
    sb = SBStub({})
    m = mocks_service.create_mock(
        sb,
        "user-1",
        {"name": "M1", "score": 100, "max_score": 200, "error_patterns": {"concept": 1}},
    )
    first = mocks_service.draft_correction_tasks(sb, "user-1", m["id"])
    second = mocks_service.draft_correction_tasks(sb, "user-1", m["id"])
    # Prior drafted rows wiped; new ones in place. Only one set of drafted
    # rows remains in storage.
    drafted_rows = [r for r in sb.db.get("mock_correction_tasks", []) if r.get("state") == "drafted"]
    assert len(drafted_rows) == len(second)
    assert len(first) == len(second)


def test_apply_correction_task_creates_study_task_and_links():
    sb = SBStub({"study_plans": [{"id": "plan-1", "user_id": "user-1", "status": "active", "created_at": "2026-01-01T00:00:00Z"}]})
    m = mocks_service.create_mock(
        sb,
        "user-1",
        {"name": "M1", "score": 100, "max_score": 200, "error_patterns": {"concept": 1}, "weak_topics": ["Polity"]},
    )
    drafts = mocks_service.draft_correction_tasks(sb, "user-1", m["id"])
    correction = drafts[0]
    applied = mocks_service.apply_correction_task(sb, "user-1", correction["id"])
    assert applied["state"] == "applied"
    assert applied["study_task_id"] is not None
    # study_tasks row was created and tagged.
    task_row = sb.db["study_tasks"][0]
    assert task_row["task_type"] == "mock_correction"
    assert task_row["metadata"]["mock_test_id"] == m["id"]
    assert task_row["plan_id"] == "plan-1"


# ───────────────────────────── API-level tests ──────────────────────────────
def test_api_create_then_list():
    sb = SBStub({})
    client = _client(sb)
    r = client.post(
        "/api/study/mocks",
        json={
            "name": "Mock 13",
            "exam_slug": "ssc-cgl-2026",
            "score": 122,
            "max_score": 200,
            "duration_min": 60,
            "attempted": 100,
            "correct": 80,
            "weak_topics": ["Polity"],
        },
    )
    assert r.status_code == 200
    assert r.json()["percentage"] == 61.0

    listed = client.get("/api/study/mocks").json()
    assert listed["items"][0]["name"] == "Mock 13"
    assert isinstance(listed["trend"], list)


def test_api_set_review_state_validates_value():
    sb = SBStub({})
    client = _client(sb)
    created = client.post("/api/study/mocks", json={"name": "M", "score": 1, "max_score": 1}).json()
    ok = client.patch(
        f"/api/study/mocks/{created['id']}/review-state",
        json={"state": "reviewed"},
    )
    assert ok.status_code == 200
    assert ok.json()["review_state"] == "reviewed"

    bad = client.patch(
        f"/api/study/mocks/{created['id']}/review-state",
        json={"state": "not_a_state"},
    )
    assert bad.status_code == 422


def test_api_correction_flow_end_to_end():
    sb = SBStub({"study_plans": [{"id": "plan-1", "user_id": "user-1", "status": "active", "created_at": "2026-01-01"}]})
    client = _client(sb)
    mock = client.post(
        "/api/study/mocks",
        json={
            "name": "M",
            "score": 1,
            "max_score": 2,
            "weak_topics": ["Polity"],
            "error_patterns": {"concept": 2, "time": 1},
        },
    ).json()

    drafted = client.post(f"/api/study/mocks/{mock['id']}/correction-tasks").json()
    assert len(drafted["items"]) >= 1
    correction_id = drafted["items"][0]["id"]

    applied = client.post(f"/api/study/mocks/correction-tasks/{correction_id}/apply").json()
    assert applied["state"] == "applied"
    assert applied["study_task_id"] is not None


def test_api_analysis_bundle_shape():
    sb = SBStub({})
    client = _client(sb)
    mock = client.post(
        "/api/study/mocks",
        json={
            "name": "M",
            "score": 50,
            "max_score": 100,
            "weak_topics": ["Polity"],
            "error_patterns": {"concept": 1},
            "subject_breakdown": [
                {"subject": "Polity", "total_questions": 10, "correct_answers": 4, "wrong_answers": 6, "accuracy": 0.4}
            ],
        },
    ).json()
    bundle = client.get(f"/api/study/mocks/{mock['id']}/analysis").json()
    assert bundle["mock"]["name"] == "M"
    assert bundle["subject_breakdown"][0]["subject"] == "Polity"
    assert bundle["error_patterns"] == {"concept": 1}
    assert bundle["weak_topics"] == ["Polity"]
    assert bundle["review_state"] == "unreviewed"
    assert bundle["correction_tasks"] == []
