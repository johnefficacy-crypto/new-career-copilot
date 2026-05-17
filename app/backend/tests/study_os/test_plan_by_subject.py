"""Plan-by-Subject service + API tests."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os import plan_by_subject as service
from tests.persona_questions._stub import SBStub


def _monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def _client(sb: SBStub):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "u-1"}
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


def _seed_with_tasks(*, with_coverage: bool = True):
    monday = _monday()
    sb = SBStub({
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "study_tasks": [
            {"id": "t-1", "user_id": "u-1", "subject": "Polity", "subject_id": "s1",
             "scheduled_date": (monday + timedelta(days=0)).isoformat(),
             "status": "planned", "task_type": "concept", "planned_minutes": 60,
             "metadata": {}},
            {"id": "t-2", "user_id": "u-1", "subject": "Polity", "subject_id": "s1",
             "scheduled_date": (monday + timedelta(days=2)).isoformat(),
             "status": "completed", "task_type": "concept", "planned_minutes": 90,
             "metadata": {}},
            {"id": "t-3", "user_id": "u-1", "subject": "English", "subject_id": "s2",
             "scheduled_date": (monday + timedelta(days=1)).isoformat(),
             "status": "planned", "task_type": "retrieval", "planned_minutes": 30,
             "metadata": {"manual_override": True}},
            # Out of week — must be ignored.
            {"id": "t-4", "user_id": "u-1", "subject": "Polity", "subject_id": "s1",
             "scheduled_date": (monday - timedelta(days=2)).isoformat(),
             "status": "planned", "task_type": "concept", "planned_minutes": 60,
             "metadata": {}},
        ],
    })
    if with_coverage:
        sb.db["exam_topic_coverage"] = [
            {"id": "cov-1", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 90, "is_high_yield": True,
             "confidence_score": 0.9, "reviewer_status": "locked"},
        ]
        sb.db["topics"] = [
            {"id": "t1", "name": "Constitution", "slug": "constitution",
             "subject_id": "s1", "is_active": True},
        ]
        sb.db["subjects"] = [
            {"id": "s1", "slug": "polity", "name": "Polity",
             "subject_group": "social-science", "is_active": True},
        ]
    return sb


# ── service ──────────────────────────────────────────────────────────────
def test_groups_by_subject_and_aggregates_minutes_in_week():
    sb = _seed_with_tasks(with_coverage=True)
    out = service.list_plan_by_subject(sb, "u-1")
    by_name = {it["subject_name"]: it for it in out["items"]}
    assert by_name["Polity"]["planned_minutes"] == 150  # 60 + 90, t-4 excluded
    assert by_name["Polity"]["task_count"] == 2
    assert by_name["English"]["planned_minutes"] == 30
    assert out["total_minutes"] == 180


def test_weight_sums_to_one():
    sb = _seed_with_tasks(with_coverage=True)
    out = service.list_plan_by_subject(sb, "u-1")
    total = sum(it["weight"] for it in out["items"])
    assert round(total, 2) == 1.0


def test_subject_is_locked_when_coverage_exists_for_it():
    sb = _seed_with_tasks(with_coverage=True)
    out = service.list_plan_by_subject(sb, "u-1")
    polity = next(it for it in out["items"] if it["subject_name"] == "Polity")
    english = next(it for it in out["items"] if it["subject_name"] == "English")
    assert polity["trust_status"] == "locked"
    assert polity["source"] == "exam_intelligence"
    # English has no locked coverage row → preview.
    assert english["trust_status"] == "preview"


def test_subject_without_locked_coverage_uses_weakness_source():
    sb = _seed_with_tasks(with_coverage=True)
    out = service.list_plan_by_subject(sb, "u-1")
    english = next(it for it in out["items"] if it["subject_name"] == "English")
    assert english["source"] == "weakness_map"


def test_overall_trust_is_partial_when_mixed():
    sb = _seed_with_tasks(with_coverage=True)
    out = service.list_plan_by_subject(sb, "u-1")
    assert out["trust_status"] == "partial"


def test_overall_trust_is_preview_when_no_locked_coverage():
    sb = _seed_with_tasks(with_coverage=False)
    out = service.list_plan_by_subject(sb, "u-1")
    assert out["trust_status"] == "preview"


def test_empty_when_no_tasks_in_week():
    sb = SBStub({
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "study_tasks": [],
    })
    out = service.list_plan_by_subject(sb, "u-1")
    assert out["items"] == []
    assert out["total_minutes"] == 0
    assert out["trust_status"] == "preview"


def test_sorted_by_minutes_descending():
    sb = _seed_with_tasks(with_coverage=True)
    out = service.list_plan_by_subject(sb, "u-1")
    minutes = [it["planned_minutes"] for it in out["items"]]
    assert minutes == sorted(minutes, reverse=True)


# ── API ──────────────────────────────────────────────────────────────────
def test_api_returns_envelope():
    sb = _seed_with_tasks(with_coverage=True)
    body = _client(sb).get("/api/study/plan/by-subject").json()
    assert "items" in body
    assert "total_hours" in body and body["total_hours"] == 3.0
    assert body["trust_status"] in {"locked", "preview", "partial"}
