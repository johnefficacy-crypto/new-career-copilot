"""Plan Timeline service + API tests."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os import plan_timeline as service
from tests.persona_questions._stub import SBStub


def _client(sb: SBStub):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "u-1"}
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    return TestClient(app)


def _exam_seed(*, with_cycle: bool = True, with_exam_start: bool = True):
    today = date.today()
    seed = {
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
    }
    if with_cycle:
        seed["exam_cycles"] = [{
            "id": "cyc-1",
            "exam_id": "exam-1",
            "cycle_name": "2026",
            "status": "active",
            "notification_date": (today - timedelta(days=30)).isoformat(),
            "application_start": (today - timedelta(days=25)).isoformat(),
            "application_end": (today - timedelta(days=10)).isoformat(),
            "exam_start": (today + timedelta(days=60)).isoformat() if with_exam_start else None,
            "year": 2026,
        }]
        seed["exam_phases"] = [
            {"id": "ph-1", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "phase_name": "Prelims", "phase_slug": "prelims",
             "phase_order": 1, "status": "active"},
            {"id": "ph-2", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "phase_name": "Mains", "phase_slug": "mains",
             "phase_order": 2, "status": "active"},
        ]
    return seed


def _plan_with_tasks(today: date, exam_start: date, *, completed: int, planned: int):
    plan_start = today - timedelta(days=20)
    return {
        "study_plans": [{
            "id": "plan-1",
            "user_id": "u-1",
            "status": "active",
            "start_date": plan_start.isoformat(),
            "end_date": exam_start.isoformat(),
            "created_at": plan_start.isoformat(),
            "updated_at": today.isoformat(),
            "metadata": {},
        }],
        "study_tasks": [
            {
                "id": f"t-{i}",
                "user_id": "u-1",
                "subject": "Polity" if i % 2 == 0 else "English",
                "subject_id": "s1" if i % 2 == 0 else "s2",
                "scheduled_date": (plan_start + timedelta(days=i * 3)).isoformat(),
                "status": "completed" if i < completed else "planned",
                "task_type": "concept",
                "planned_minutes": 60,
                "duration_mins": 60,
            }
            for i in range(planned)
        ],
        "study_sessions": [],
    }


# ── service-level ────────────────────────────────────────────────────────
def test_no_target_exam_returns_safe_fallback():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    out = service.get_plan_timeline(sb, "u-1")
    assert out["cycle_progress"]["status"] == "not_connected"
    assert out["exam_context"]["exam_id"] is None
    assert out["milestones"] == []
    # The "no_exam_date" risk flag is present so the UI can surface it.
    codes = [r["code"] for r in out["risk_flags"]]
    assert "no_exam_date" in codes


def test_no_exam_date_returns_safe_fallback_with_context():
    seed = _exam_seed(with_cycle=True, with_exam_start=False)
    sb = SBStub(seed)
    out = service.get_plan_timeline(sb, "u-1")
    assert out["cycle_progress"]["status"] == "not_connected"
    assert out["exam_context"]["exam_id"] == "exam-1"
    assert out["exam_context"]["exam_start"] is None


def test_active_plan_with_tasks_returns_progress_and_series():
    today = date.today()
    exam_start = today + timedelta(days=60)
    seed = _exam_seed()
    seed.update(_plan_with_tasks(today, exam_start, completed=2, planned=6))
    sb = SBStub(seed)
    out = service.get_plan_timeline(sb, "u-1")
    assert out["exam_context"]["exam_id"] == "exam-1"
    assert out["exam_context"]["days_remaining"] == 60
    # 2/6 completed → 33%.
    assert out["cycle_progress"]["actual_progress_pct"] == 33
    assert isinstance(out["series"], list) and len(out["series"]) >= 2
    # Series is monotonically non-decreasing on planned_pct.
    plans = [p["planned_pct"] for p in out["series"]]
    assert plans == sorted(plans)
    # Phase bands are derived from cycle bounds.
    assert len(out["phase_bands"]) == 5
    assert {b["name"] for b in out["phase_bands"]} == {
        "Foundation", "Coverage", "Revision", "Mock-intensive", "Final sprint"
    }


def test_subject_progress_aggregates_planned_and_actual():
    today = date.today()
    exam_start = today + timedelta(days=60)
    seed = _exam_seed()
    seed.update(_plan_with_tasks(today, exam_start, completed=3, planned=6))
    sb = SBStub(seed)
    out = service.get_plan_timeline(sb, "u-1")
    subjects = {s["subject_name"]: s for s in out["subjects"]}
    assert "Polity" in subjects and "English" in subjects
    # 6 tasks alternate subjects → 3 each; 3 of 6 completed by index → 2
    # Polity and 1 English completed.
    assert subjects["Polity"]["completed_tasks"] == 2
    assert subjects["English"]["completed_tasks"] == 1


def test_behind_plan_risk_flag_when_actual_trails_planned():
    today = date.today()
    exam_start = today + timedelta(days=60)
    seed = _exam_seed()
    # 6 planned tasks, none completed → planned_so_far should be > 0 (some
    # scheduled in the past) while actual is 0 → behind_plan.
    seed.update(_plan_with_tasks(today, exam_start, completed=0, planned=6))
    sb = SBStub(seed)
    out = service.get_plan_timeline(sb, "u-1")
    codes = {r["code"] for r in out["risk_flags"]}
    # behind_plan only triggers when the gap is >= 10 percentage points.
    assert ("behind_plan" in codes) or (out["cycle_progress"]["gap_pct"] < 10)
    assert out["cycle_progress"]["status"] in {"behind", "on_track"}


def test_safe_fallback_on_supabase_exception():
    class Broken:
        def table(self, *a, **k):
            raise RuntimeError("supabase exploded")

    out = service.get_plan_timeline(Broken(), "u-1")
    assert out["cycle_progress"]["status"] == "not_connected"
    assert out["exam_context"]["exam_id"] is None


def test_milestones_include_today_and_exam_day():
    today = date.today()
    exam_start = today + timedelta(days=60)
    seed = _exam_seed()
    seed.update(_plan_with_tasks(today, exam_start, completed=1, planned=4))
    sb = SBStub(seed)
    out = service.get_plan_timeline(sb, "u-1")
    kinds = [m["kind"] for m in out["milestones"]]
    assert "today" in kinds
    assert "exam" in kinds
    assert "phase" in kinds  # exam_phases produce non-dated markers


# ── API-level ────────────────────────────────────────────────────────────
def test_api_returns_full_envelope():
    today = date.today()
    exam_start = today + timedelta(days=60)
    seed = _exam_seed()
    seed.update(_plan_with_tasks(today, exam_start, completed=2, planned=4))
    sb = SBStub(seed)
    body = _client(sb).get("/api/study/plan/timeline").json()
    for key in (
        "exam_context",
        "plan_context",
        "cycle_progress",
        "milestones",
        "phase_bands",
        "series",
        "subjects",
        "risk_flags",
    ):
        assert key in body, f"missing {key} in plan timeline payload"
    assert body["plan_context"]["planner_version"] == "planner_v1"


def test_api_safe_fallback_when_user_has_no_exam():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    body = _client(sb).get("/api/study/plan/timeline").json()
    assert body["cycle_progress"]["status"] == "not_connected"
