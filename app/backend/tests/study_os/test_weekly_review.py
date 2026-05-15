"""Weekly Review service + API tests with the in-memory Supabase stub."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os import weekly_review as wr_service
from tests.persona_questions._stub import SBStub


def _client(sb: SBStub):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "user-1"}
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _seed_week(monday: date, hours_studied_min: int, planned_minutes: int, completed: int, planned_tasks: int, mocks: list[tuple[float, float]]):
    """Build a stub DB seeded with sessions/tasks/mocks for one week."""
    sb = SBStub({})

    # Sessions — single block of `hours_studied_min` minutes mid-week.
    sb.db["study_sessions"] = [
        {
            "id": "s-1",
            "user_id": "user-1",
            "duration_mins": hours_studied_min,
            "started_at": (monday + timedelta(days=2)).isoformat(),
        }
    ]

    # Tasks — `planned_tasks` total, with `completed` completed.
    tasks = []
    per_task_minutes = planned_minutes // planned_tasks if planned_tasks else 0
    for i in range(planned_tasks):
        tasks.append({
            "id": f"t-{i}",
            "user_id": "user-1",
            "scheduled_date": (monday + timedelta(days=i % 7)).isoformat(),
            "status": "completed" if i < completed else "planned",
            "task_type": "concept",
            "planned_minutes": per_task_minutes,
        })
    sb.db["study_tasks"] = tasks

    # Mocks
    sb.db["mock_tests"] = [
        {
            "id": f"m-{i}",
            "user_id": "user-1",
            "test_name": f"M{i}",
            "scored_marks": s,
            "total_marks": t,
            "attempted_at": (monday + timedelta(days=3 + i)).isoformat(),
        }
        for i, (s, t) in enumerate(mocks)
    ]

    sb.db["profiles"] = [{"id": "user-1", "target_exam": "ssc-cgl"}]
    return sb


# ─────────────────────────── service tests ──────────────────────────────────
def test_compute_persists_snapshot_and_items():
    monday = _monday_of(date.today())
    sb = _seed_week(monday, hours_studied_min=240, planned_minutes=720, completed=8, planned_tasks=10, mocks=[(120, 200), (140, 200)])
    out = wr_service.compute_weekly_review(sb, "user-1", monday)

    # Numerics derived from the seed.
    assert out["hours_studied"] == 4.0  # 240 / 60
    assert out["hours_planned"] == 12.0  # 720 / 60
    assert out["tasks_completed"] == 8
    assert out["tasks_planned"] == 10
    assert out["adherence"] == 0.8
    assert out["mocks_taken"] == 2
    assert isinstance(out["mock_trend"], list) and len(out["mock_trend"]) == 2
    # Persisted rows exist.
    assert len(sb.db["weekly_reviews"]) == 1
    # Hours-vs-plan ratio is 4 / 12 = 0.33 < 0.7 → expect a "declined" item.
    declined_labels = [it["label"] for it in out["declined"]]
    assert "Hours vs plan" in declined_labels


def test_get_returns_persisted_when_present():
    monday = _monday_of(date.today())
    sb = _seed_week(monday, hours_studied_min=300, planned_minutes=300, completed=5, planned_tasks=5, mocks=[(100, 200)])
    first = wr_service.compute_weekly_review(sb, "user-1", monday)
    # Mutate sessions; get_weekly_review should still return the persisted row
    # (not recompute) because the snapshot already exists.
    sb.db["study_sessions"].append({
        "id": "s-2",
        "user_id": "user-1",
        "duration_mins": 999,
        "started_at": (monday + timedelta(days=4)).isoformat(),
    })
    second = wr_service.get_weekly_review(sb, "user-1", monday)
    assert second["hours_studied"] == first["hours_studied"]


def test_get_computes_when_absent():
    monday = _monday_of(date.today())
    sb = _seed_week(monday, hours_studied_min=180, planned_minutes=300, completed=4, planned_tasks=5, mocks=[])
    out = wr_service.get_weekly_review(sb, "user-1", monday)
    assert out["hours_studied"] == 3.0
    assert len(sb.db["weekly_reviews"]) == 1


def test_improved_items_compare_against_previous_week():
    this_monday = _monday_of(date.today())
    last_monday = this_monday - timedelta(days=7)
    sb = SBStub({"profiles": [{"id": "user-1"}]})

    # Seed the prior week's review row directly so the "improved" comparator
    # can find it.
    sb.db["weekly_reviews"] = [{
        "id": "wr-prev",
        "user_id": "user-1",
        "week_start": last_monday.isoformat(),
        "week_end": (last_monday + timedelta(days=6)).isoformat(),
        "hours_studied": 5.0,
        "hours_planned": 10.0,
        "adherence": 0.5,
        "tasks_completed": 5,
        "tasks_planned": 10,
        "mocks_taken": 0,
        "mock_trend": [],
        "backlog_start": 0,
        "backlog_end": 0,
        "revision_coverage": None,
        "computed_at": last_monday.isoformat(),
    }]
    # This week — better hours + better adherence.
    sb.db["study_sessions"] = [{
        "id": "s-1", "user_id": "user-1",
        "duration_mins": 600,  # 10 h
        "started_at": (this_monday + timedelta(days=2)).isoformat(),
    }]
    sb.db["study_tasks"] = [
        {"id": f"t-{i}", "user_id": "user-1",
         "scheduled_date": (this_monday + timedelta(days=i % 7)).isoformat(),
         "status": "completed" if i < 9 else "planned",
         "task_type": "concept", "planned_minutes": 60}
        for i in range(10)
    ]
    sb.db["mock_tests"] = []
    out = wr_service.compute_weekly_review(sb, "user-1", this_monday)
    improved_labels = [it["label"] for it in out["improved"]]
    # Study hours up from 5 → 10; adherence up from 0.5 → 0.9.
    assert "Study hours" in improved_labels
    assert "Adherence" in improved_labels


def test_next_change_includes_lighter_friday_when_hours_slip():
    monday = _monday_of(date.today())
    sb = _seed_week(monday, hours_studied_min=120, planned_minutes=720, completed=3, planned_tasks=10, mocks=[])
    out = wr_service.compute_weekly_review(sb, "user-1", monday)
    next_labels = [it["label"] for it in out["declined"] + [
        {"label": x} for x in out["next_changes"]
    ]]
    assert any("Lighter Friday" in s for s in out["next_changes"])


# ─────────────────────────────── API tests ──────────────────────────────────
def test_api_get_returns_shape():
    monday = _monday_of(date.today())
    sb = _seed_week(monday, hours_studied_min=180, planned_minutes=300, completed=4, planned_tasks=5, mocks=[(120, 200)])
    client = _client(sb)
    r = client.get("/api/study/weekly-review")
    assert r.status_code == 200
    body = r.json()
    assert body["hours_studied"] == 3.0
    assert "highlights" in body and "corrections" in body and "next_changes" in body


def test_api_compute_writes_fresh_snapshot():
    monday = _monday_of(date.today())
    sb = _seed_week(monday, hours_studied_min=180, planned_minutes=300, completed=4, planned_tasks=5, mocks=[])
    client = _client(sb)
    r = client.post("/api/study/weekly-review/compute")
    assert r.status_code == 200
    assert len(sb.db["weekly_reviews"]) == 1
