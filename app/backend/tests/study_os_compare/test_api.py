"""PR 1 — API integration via the FastAPI test client."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_compare as api_module
from app.core.auth import get_current_user

from ._stub import SBStub


def _client(sb: SBStub):
    app = FastAPI()
    app.include_router(api_module.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1", "role": "user"}
    api_module.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


def _seed_min_db():
    today = date.today()
    started = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=10)
    return {
        "study_sessions": [
            {"user_id": "user-1", "duration_minutes": 60, "started_at": started.isoformat()}
        ],
        "study_tasks": [
            {"user_id": "user-1", "scheduled_date": today.isoformat(),
             "status": "completed", "task_type": "concept"}
        ],
        "mock_tests": [],
        "mock_correction_tasks": [],
        "study_behavior_daily_snapshots": [],
        "study_comparison_settings": [],
        "study_behavior_source_breakdown": [],
        "user_exam_goals": [],
        "social_session_attendance": [],
        "study_leaderboard_entries": [],
        "study_cohort_memberships": [],
        "study_cohort_definitions": [],
        "study_cohort_metric_snapshots": [],
    }


def test_compare_me_self_view_only():
    sb = SBStub(_seed_min_db())
    client = _client(sb)
    r = client.get("/api/study/compare/me")
    assert r.status_code == 200
    body = r.json()
    assert "behavior_index" in body
    assert "components" in body
    assert "scores" in body
    assert body["trust_level"] == "system_verified"
    # Self-view must not leak any other user_id.
    assert "user_id" not in body or body.get("user_id") == "user-1"


def test_settings_get_returns_safe_defaults_when_unset():
    sb = SBStub(_seed_min_db())
    client = _client(sb)
    r = client.get("/api/study/compare/settings")
    assert r.status_code == 200
    body = r.json()
    # Spec § "Privacy defaults".
    assert body["comparison_enabled"] is True
    assert body["public_leaderboard_enabled"] is False
    assert body["friends_leaderboard_enabled"] is True
    assert body["visibility"] == "private"
    assert body["solo_mode"] is False


def test_put_settings_persists():
    sb = SBStub(_seed_min_db())
    client = _client(sb)
    r = client.put(
        "/api/study/compare/settings",
        json={"solo_mode": True, "public_leaderboard_enabled": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["solo_mode"] is True
    assert body["public_leaderboard_enabled"] is True


def test_titles_endpoint_returns_catalog_even_when_empty():
    sb = SBStub(_seed_min_db())
    client = _client(sb)
    r = client.get("/api/study/compare/titles")
    assert r.status_code == 200
    body = r.json()
    keys = {t["key"] for t in body["all_titles"]}
    # Spec § Titles — Sustained Effort replaces Marathoner.
    assert "sustained_effort" in keys
    assert "marathoner" not in keys


def test_leaderboard_endpoint_returns_empty_shape_when_no_rows():
    sb = SBStub(_seed_min_db())
    client = _client(sb)
    r = client.get("/api/study/leaderboard")
    assert r.status_code == 200
    body = r.json()
    assert body["board_type"] == "behavior"
    assert body["entries"] == []
    assert body["self"] is None
