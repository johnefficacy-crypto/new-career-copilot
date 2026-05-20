"""End-to-end Study OS runtime test.

Exercises the full deterministic chain against the in-memory Supabase
stub, the path the deferred-work brief asked for:

    seed → lock → set target → generate draft → apply
         → mission control → log mock → review (mastery) → corrections
         → changelog (adaptation events)

This is the safety net the prior PRs deferred. It proves the pieces
compose: a planner that fails closed (PR #367), locked-only coverage
(PR #369), and mission-control reasoning columns (PR #369) all line up
end to end. Runs entirely on the SBStub — no live network.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canonical as canonical_api
from app.core.auth import get_current_user
from app.study_os.mastery import recompute_topic_mastery
from app.study_os.mocks import create_mock, draft_correction_tasks
from app.study_os.planner import apply_plan, compute_draft_plan
from app.study_os.mission_control import build_mission_control
from tests.persona_questions._stub import SBStub


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _seed() -> dict:
    """A minimal-but-complete SSC CGL slice with a draft row that must
    never reach the planner, plus verified PYQ evidence for one topic."""
    return {
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {
                "id": "exam-1",
                "slug": "ssc-cgl",
                "name": "SSC CGL",
                "exam_type": "recruitment",
                "is_active": True,
            }
        ],
        "exam_cycles": [
            {"id": "cyc-1", "exam_id": "exam-1", "exam_start": "2026-09-15"}
        ],
        "exam_topic_coverage": [
            {
                "id": "cov-1",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "exam_phase_id": "ph1",
                "topic_id": "t1",
                "exam_priority_score": 88,
                "is_high_yield": True,
                "confidence_score": 0.9,
                "reviewer_status": "locked",
            },
            {
                "id": "cov-2",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "exam_phase_id": "ph1",
                "topic_id": "t2",
                "exam_priority_score": 80,
                "is_high_yield": True,
                "confidence_score": 0.82,
                "reviewer_status": "locked",
            },
            # Draft coverage — must never reach the planner / aspirant.
            {
                "id": "cov-draft",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "exam_phase_id": "ph1",
                "topic_id": "t-draft",
                "exam_priority_score": 99,
                "is_high_yield": True,
                "reviewer_status": "draft",
            },
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "slug": "percentage", "subject_id": "s1", "is_active": True, "parent_topic_id": None, "level": "topic"},
            {"id": "t2", "name": "Profit and Loss", "slug": "profit-and-loss", "subject_id": "s1", "is_active": True, "parent_topic_id": None, "level": "topic"},
            {"id": "t-draft", "name": "Draft", "slug": "draft", "subject_id": "s1", "is_active": True},
        ],
        "subjects": [{"id": "s1", "name": "Quantitative Aptitude"}],
        "aspirant_persona_snapshots": [
            {
                "user_id": "u-1",
                "persona_version": "v1",
                "primary_persona": "beginner_aspirant",
                "study_policy": {"max_tasks_per_day": 3, "preferred_task_size": "small"},
                "computed_at": "2026-05-01T00:00:00+00:00",
            }
        ],
        "pyq_papers": [{"id": "paper-1", "exam_id": "exam-1", "trust_status": "verified"}],
        "pyq_questions": [{"id": "q1", "pyq_paper_id": "paper-1", "reviewer_status": "verified"}],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t1", "reviewer_status": "verified", "tag_role": "primary"}
        ],
    }


def _canonical_client(sb: SBStub, user_id: str = "u-1") -> TestClient:
    app = FastAPI()
    app.include_router(canonical_api.router, prefix="/api")
    canonical_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return TestClient(app, raise_server_exceptions=False)


def test_full_runtime_chain_seed_to_changelog():
    sb = SBStub(_seed())

    # ── 1. Draft is read-only — no rows written ────────────────────────
    draft = compute_draft_plan(sb, "u-1")
    assert draft["generated"] is True
    assert draft["applied"] is False
    assert sb.db.get("study_plans", []) == []
    assert sb.db.get("study_tasks", []) == []

    # ── 2. Apply persists the plan, fail-closed contract holds ─────────
    applied = apply_plan(sb, "u-1")
    assert applied["generated"] is True
    assert applied["applied"] is True
    assert "reason" not in applied
    assert len(sb.db["study_plans"]) == 1
    assert len(sb.db["study_plan_versions"]) == 1

    tasks = sb.db["study_tasks"]
    assert tasks, "apply must have written today's tasks"
    # Locked-only: the draft topic must never have produced a task.
    task_topics = {t.get("topic_id") for t in tasks}
    assert "t-draft" not in task_topics
    # Every task carries the planner's reasoning columns (migration 034).
    for t in tasks:
        assert "priority_score" in t
        assert "why_this_task" in t

    # The audit row uses a CHECK-legal event_type.
    events = sb.db["study_adaptation_events"]
    assert len(events) == 1
    assert events[0]["event_type"] == "manual_regeneration"

    # ── 3. Mission control surfaces the plan + reasoning ───────────────
    # Force tasks onto today so _load_today_tasks keeps them.
    for t in tasks:
        t["scheduled_date"] = _today()
    mc = build_mission_control(sb, "u-1")
    assert mc["plan"] is not None
    today_tasks = mc["today_tasks"]
    assert today_tasks
    for task in today_tasks:
        assert "priority_score" in task
        assert "why_this_task" in task
        assert "topic_id" in task

    # ── 4. Log a mock with error signal ────────────────────────────────
    mock = create_mock(
        sb,
        "u-1",
        {
            "name": "Full Mock 1",
            "exam_slug": "ssc-cgl",
            "score": 60,
            "max_score": 100,
            "attempted": 80,
            "correct": 50,
            "weak_topics": ["Percentage"],
            "error_patterns": {"concept": 3, "careless": 1},
        },
    )
    mock_id = mock["id"]
    assert sb.db["mock_tests"], "mock must persist"

    # ── 5. Review the mock → topic breakdowns, mastery, regen ──────────
    client = _canonical_client(sb)
    r = client.post(
        f"/api/study/mocks/{mock_id}/review",
        json={
            "review_status": "reviewed",
            "total_questions": 80,
            "correct_answers": 50,
            "wrong_answers": 30,
            "topic_breakdowns": [
                {
                    "topic_id": "t1",
                    "subject_id": "s1",
                    "total_questions": 40,
                    "correct_answers": 20,
                    "wrong_answers": 20,
                    "error_types": {"concept_gap": 3},
                }
            ],
        },
    )
    assert r.status_code == 200, r.text

    # ── 6. Mastery recomputed from the breakdown ───────────────────────
    mastery_rows = sb.db.get("user_topic_mastery", [])
    assert any(m.get("topic_id") == "t1" for m in mastery_rows), (
        f"mastery must include t1; got {mastery_rows}"
    )

    # Belt-and-suspenders: an explicit recompute is idempotent and keeps t1.
    recompute_topic_mastery(sb, "u-1")
    assert any(m.get("topic_id") == "t1" for m in sb.db.get("user_topic_mastery", []))

    # ── 7. Changelog: both the apply and the mock-review regen landed ──
    event_types = [e["event_type"] for e in sb.db["study_adaptation_events"]]
    assert "manual_regeneration" in event_types  # from the initial apply
    assert "mock_reviewed" in event_types         # from the post-review regen

    # ── 8. Correction tasks drafted from the mock's error signal ───────
    corrections = draft_correction_tasks(sb, "u-1", mock_id)
    assert corrections, "error_patterns should yield at least one correction task"
    assert all(c.get("category") for c in corrections)
