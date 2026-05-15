"""API-level tests for the Study OS routes (Phase 5).

Covers GET /api/study/mission-control and the new
GET /api/study/task-reasoning/:task_id endpoint.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub, user_id: str = "u-1"):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


def _snapshot(user_id: str = "u-1") -> dict:
    return {
        "id": "snap-1",
        "user_id": user_id,
        "persona_version": "v1",
        "primary_persona": "beginner_aspirant",
        "dimensions": {"time_constraint": "low_availability"},
        "scores": {"execution": 0.4},
        "study_policy": {"preferred_task_size": "small"},
        "computed_at": "2026-05-01T00:00:00+00:00",
    }


def test_mission_control_returns_contract_shape():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot()]})
    client = TestClient(_build_app(sb))
    r = client.get("/api/study/mission-control")
    assert r.status_code == 200
    body = r.json()
    assert body["date"]
    assert "safe_user_explanation" in body["user_context"]
    assert "exam_context" in body
    assert "update_context" in body
    assert isinstance(body["plan_reasoning"], list)


def test_task_reasoning_returns_detail_for_owned_task():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot()],
        "study_plans": [{"id": "p1", "user_id": "u-1", "status": "active"}],
        "study_tasks": [
            {"id": "task-1", "plan_id": "p1", "title": "Revise quant",
             "task_type": "revision", "topic": "Percentage", "status": "planned"},
        ],
    })
    client = TestClient(_build_app(sb))
    r = client.get("/api/study/task-reasoning/task-1")
    assert r.status_code == 200
    body = r.json()
    assert body["task_id"] == "task-1"
    assert set(body["reasoning"]) == {
        "user_signals", "persona_signals", "exam_signals",
        "update_signals", "planner_action",
    }
    assert body["safe_user_copy"]
    # reasoning_trace[] — server-derived structured layer-by-layer evidence
    trace = body["reasoning_trace"]
    assert isinstance(trace, list) and len(trace) >= 1
    for row in trace:
        assert set(row.keys()) == {
            "layer", "rule_key", "label", "evidence_id", "confidence", "status"
        }
        assert row["layer"] in {"user", "exam", "competition", "engine", "plan"}
        assert row["status"] in {"locked", "live", "partial", "preview"}


def test_task_reasoning_404_for_unknown_task():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot()]})
    client = TestClient(_build_app(sb))
    r = client.get("/api/study/task-reasoning/does-not-exist")
    assert r.status_code == 404


def test_task_reasoning_404_for_task_owned_by_other_user():
    # A task whose plan belongs to a different user must not be readable —
    # task ids cannot be probed across accounts.
    sb = SBStub({
        "study_plans": [{"id": "p1", "user_id": "someone-else", "status": "active"}],
        "study_tasks": [
            {"id": "task-1", "plan_id": "p1", "title": "X", "status": "planned"},
        ],
    })
    client = TestClient(_build_app(sb, user_id="u-1"))
    r = client.get("/api/study/task-reasoning/task-1")
    assert r.status_code == 404
