"""Phase 7 — deterministic Study OS planner."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os.planner import generate_plan
from tests.persona_questions._stub import SBStub


def _seed() -> dict:
    """An SSC CGL slice: 4 locked topics (+1 draft that must be ignored),
    one prerequisite edge, partial mastery, one error pattern, a PYQ chain
    for t1, and a small persona study policy.
    """
    return {
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "exam_cycles": [
            {"id": "cyc-1", "exam_id": "exam-1", "exam_start": "2026-09-15"}
        ],
        "exam_topic_coverage": [
            {"id": "cov-1", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "exam_phase_id": "ph1", "topic_id": "t1", "exam_priority_score": 88,
             "is_high_yield": True, "confidence_score": 0.86, "reviewer_status": "locked"},
            {"id": "cov-2", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "exam_phase_id": "ph1", "topic_id": "t2", "exam_priority_score": 80,
             "is_high_yield": True, "confidence_score": 0.81, "reviewer_status": "locked"},
            {"id": "cov-3", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "exam_phase_id": "ph1", "topic_id": "t3", "exam_priority_score": 60,
             "is_high_yield": False, "confidence_score": 0.7, "reviewer_status": "locked"},
            {"id": "cov-4", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "exam_phase_id": "ph1", "topic_id": "t4", "exam_priority_score": 50,
             "is_high_yield": False, "confidence_score": 0.66, "reviewer_status": "locked"},
            # draft coverage — must never reach the planner.
            {"id": "cov-5", "exam_id": "exam-1", "exam_cycle_id": "cyc-1",
             "exam_phase_id": "ph1", "topic_id": "t5", "exam_priority_score": 99,
             "is_high_yield": True, "confidence_score": 0.4, "reviewer_status": "draft"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "slug": "percentage", "subject_id": "s1", "is_active": True},
            {"id": "t2", "name": "Profit and Loss", "slug": "profit-and-loss", "subject_id": "s1", "is_active": True},
            {"id": "t3", "name": "Time and Work", "slug": "time-and-work", "subject_id": "s1", "is_active": True},
            {"id": "t4", "name": "Vocabulary", "slug": "vocabulary", "subject_id": "s2", "is_active": True},
            {"id": "t5", "name": "Draft Topic", "slug": "draft-topic", "subject_id": "s1", "is_active": True},
        ],
        "subjects": [
            {"id": "s1", "name": "Quantitative Aptitude"},
            {"id": "s2", "name": "English Language"},
        ],
        "topic_prerequisites": [
            {"topic_id": "t2", "prerequisite_topic_id": "t1", "relation_type": "requires"},
        ],
        "user_topic_mastery": [
            {"user_id": "u-1", "topic_id": "t1", "exam_id": "exam-1", "mastery_score": 80},
            {"user_id": "u-1", "topic_id": "t2", "exam_id": "exam-1", "mastery_score": 30},
            # t3 has been practised (mastery row) and shows an error pattern —
            # the realistic invariant, since both come from the same mock.
            {"user_id": "u-1", "topic_id": "t3", "exam_id": "exam-1", "mastery_score": 50},
        ],
        "user_topic_error_patterns": [
            {"user_id": "u-1", "topic_id": "t3", "error_type": "concept_gap"},
        ],
        "aspirant_persona_snapshots": [
            {"user_id": "u-1", "computed_at": "2026-05-01T00:00:00+00:00",
             "study_policy": {"max_tasks_per_day": 3, "preferred_task_size": "small"}},
        ],
        "pyq_papers": [{"id": "paper-1", "exam_id": "exam-1"}],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "paper-1", "reviewer_status": "verified"}
        ],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t1", "reviewer_status": "verified", "tag_role": "primary"}
        ],
    }


# ─── Guard conditions ─────────────────────────────────────────────────────
def test_no_target_exam_is_reported_not_raised():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    out = generate_plan(sb, "u-1")
    assert out == {"generated": False, "reason": "no_target_exam"}


def test_no_locked_coverage_is_reported():
    sb = SBStub({
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
                   "exam_type": "recruitment", "is_active": True}],
        "exam_topic_coverage": [
            {"id": "c", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 90, "reviewer_status": "draft"}
        ],
        "topics": [{"id": "t1", "name": "Percentage", "subject_id": "s1", "is_active": True}],
    })
    out = generate_plan(sb, "u-1")
    assert out["generated"] is False
    assert out["reason"] == "no_locked_coverage"


# ─── Plan generation ──────────────────────────────────────────────────────
def test_generate_plan_persists_plan_version_tasks_and_event():
    sb = SBStub(_seed())
    out = generate_plan(sb, "u-1")
    assert out["generated"] is True
    assert out["task_count"] == 3  # capped by max_tasks_per_day
    assert out["version_number"] == 1

    # one active plan, one version row, one adaptation event
    assert len(sb.db["study_plans"]) == 1
    assert sb.db["study_plans"][0]["exam_id"] == "exam-1"
    assert len(sb.db["study_plan_versions"]) == 1
    assert sb.db["study_plan_versions"][0]["generator_version"] == "planner_v1"
    assert len(sb.db["study_adaptation_events"]) == 1
    assert sb.db["study_adaptation_events"][0]["event_type"] == "manual_regeneration"

    # tasks carry the planner output columns
    tasks = sb.db["study_tasks"]
    assert len(tasks) == 3
    for t in tasks:
        assert t["plan_version_id"] == sb.db["study_plan_versions"][0]["id"]
        assert t["status"] == "planned"
        assert t["planned_minutes"] == 25  # preferred_task_size = small
        assert isinstance(t["priority_score"], (int, float))
        assert "summary" in t["why_this_task"]
    # the draft-coverage topic never appears
    assert all(t["topic_id"] != "t5" for t in tasks)


def test_prerequisite_topic_is_scheduled_before_its_dependent():
    sb = SBStub(_seed())
    out = generate_plan(sb, "u-1")
    order = [t["topic"] for t in out["tasks"]]
    # t2 (Profit and Loss) scores higher than t1 (Percentage) but requires
    # it, so Percentage must come first despite the lower score.
    assert order.index("Percentage") < order.index("Profit and Loss")


def test_task_type_follows_mastery_and_errors():
    sb = SBStub(_seed())
    out = generate_plan(sb, "u-1")
    by_topic = {t["topic"]: t for t in out["tasks"]}
    # mastery 80 -> revision; mastery 30 -> concept_learning;
    # no mastery + an error pattern -> retrieval_practice.
    assert by_topic["Percentage"]["task_type"] == "revision"
    assert by_topic["Profit and Loss"]["task_type"] == "concept_learning"
    assert by_topic["Time and Work"]["task_type"] == "retrieval_practice"


def test_verified_pyq_count_flows_into_why_this_task():
    sb = SBStub(_seed())
    out = generate_plan(sb, "u-1")
    pct = next(t for t in out["tasks"] if t["topic"] == "Percentage")
    # t1 has one verified PYQ tag on a verified question.
    assert pct["why_this_task"]["verified_pyq_count"] == 1


def test_regeneration_is_idempotent_and_versions_increment():
    sb = SBStub(_seed())
    generate_plan(sb, "u-1")
    second = generate_plan(sb, "u-1")
    assert second["version_number"] == 2
    # the active plan is reused, not duplicated
    assert len(sb.db["study_plans"]) == 1
    # today's planned tasks are replaced, not piled up
    assert len(sb.db["study_tasks"]) == 3
    assert len(sb.db["study_plan_versions"]) == 2
    assert len(sb.db["study_adaptation_events"]) == 2


def test_completed_tasks_survive_regeneration():
    sb = SBStub(_seed())
    generate_plan(sb, "u-1")
    # mark one of today's tasks completed, then regenerate
    sb.db["study_tasks"][0]["status"] = "completed"
    generate_plan(sb, "u-1")
    statuses = [t["status"] for t in sb.db["study_tasks"]]
    # the completed task is kept; the planned ones were refreshed
    assert statuses.count("completed") == 1
    assert statuses.count("planned") == 3


# ─── API route ────────────────────────────────────────────────────────────
def _app(sb: SBStub, user_id: str = "u-1"):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


def test_generate_plan_route_returns_plan():
    sb = SBStub(_seed())
    client = TestClient(_app(sb))
    r = client.post("/api/study/plan/generate")
    assert r.status_code == 200
    body = r.json()
    assert body["generated"] is True
    assert body["exam"] == "ssc-cgl"
    assert len(body["tasks"]) == 3
