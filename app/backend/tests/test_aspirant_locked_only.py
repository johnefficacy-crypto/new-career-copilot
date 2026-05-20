"""Aspirant-facing endpoints must surface only ``reviewer_status='locked'``
coverage rows. Combined with PR3's enrichment, mission control's today
tasks also carry the planner's reasoning columns and ``/api/study/topics``
carries the topic hierarchy fields (``parent_topic_id`` + ``topic_level``).

This suite seeds coverage rows in every lifecycle state and pins the
locked-only invariant + the new shape contract.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os.planner import apply_plan
from tests.persona_questions._stub import SBStub


def _mixed_lifecycle_seed() -> dict:
    """One topic in each reviewer_status state, plus topic hierarchy."""
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
                "id": "cov-locked",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "topic_id": "t-locked",
                "exam_priority_score": 88,
                "is_high_yield": True,
                "confidence_score": 0.9,
                "reviewer_status": "locked",
            },
            {
                "id": "cov-locked-child",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "topic_id": "t-locked-child",
                "exam_priority_score": 82,
                "is_high_yield": True,
                "confidence_score": 0.85,
                "reviewer_status": "locked",
            },
            # The four lifecycle states that MUST NOT reach aspirants.
            {
                "id": "cov-draft",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "topic_id": "t-draft",
                "exam_priority_score": 90,
                "is_high_yield": True,
                "reviewer_status": "draft",
            },
            {
                "id": "cov-pending",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "topic_id": "t-pending",
                "exam_priority_score": 90,
                "is_high_yield": True,
                "reviewer_status": "pending_review",
            },
            {
                "id": "cov-reviewed",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "topic_id": "t-reviewed",
                "exam_priority_score": 90,
                "is_high_yield": True,
                "reviewer_status": "reviewed",
            },
            {
                "id": "cov-rejected",
                "exam_id": "exam-1",
                "exam_cycle_id": "cyc-1",
                "topic_id": "t-rejected",
                "exam_priority_score": 90,
                "is_high_yield": True,
                "reviewer_status": "rejected",
            },
        ],
        "topics": [
            # Root-level topic.
            {
                "id": "t-locked",
                "name": "Percentage",
                "slug": "percentage",
                "subject_id": "s1",
                "is_active": True,
                "parent_topic_id": None,
                "level": "topic",
            },
            # Child of t-locked — proves parent_topic_id passes through.
            {
                "id": "t-locked-child",
                "name": "Percentage change",
                "slug": "percentage-change",
                "subject_id": "s1",
                "is_active": True,
                "parent_topic_id": "t-locked",
                "level": "microtopic",
            },
            {
                "id": "t-draft",
                "name": "Draft",
                "slug": "draft",
                "subject_id": "s1",
                "is_active": True,
            },
            {
                "id": "t-pending",
                "name": "Pending",
                "slug": "pending",
                "subject_id": "s1",
                "is_active": True,
            },
            {
                "id": "t-reviewed",
                "name": "Reviewed",
                "slug": "reviewed",
                "subject_id": "s1",
                "is_active": True,
            },
            {
                "id": "t-rejected",
                "name": "Rejected",
                "slug": "rejected",
                "subject_id": "s1",
                "is_active": True,
            },
        ],
        "subjects": [{"id": "s1", "name": "Quantitative Aptitude"}],
        "aspirant_persona_snapshots": [
            {
                "user_id": "u-1",
                "computed_at": "2026-05-01T00:00:00+00:00",
                "study_policy": {"max_tasks_per_day": 3, "preferred_task_size": "small"},
            }
        ],
        "pyq_papers": [
            {"id": "paper-1", "exam_id": "exam-1", "trust_status": "verified"}
        ],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "paper-1", "reviewer_status": "verified"}
        ],
        "pyq_question_topic_tags": [
            {
                "question_id": "q1",
                "topic_id": "t-locked",
                "reviewer_status": "verified",
                "tag_role": "primary",
            }
        ],
    }


def _app(sb: SBStub, user_id: str = "u-1") -> FastAPI:
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


# ── /api/study/topics — locked-only + hierarchy ────────────────────────


def test_topics_endpoint_returns_locked_rows_only():
    sb = SBStub(_mixed_lifecycle_seed())
    client = TestClient(_app(sb))
    r = client.get("/api/study/topics")
    assert r.status_code == 200, r.text
    body = r.json()
    returned_ids = {it["topic_id"] for it in body["items"]}
    assert returned_ids == {"t-locked", "t-locked-child"}, returned_ids
    # Sanity: the lifecycle states we excluded must never appear.
    for forbidden in ("t-draft", "t-pending", "t-reviewed", "t-rejected"):
        assert forbidden not in returned_ids


def test_topics_endpoint_carries_parent_topic_id_and_level():
    sb = SBStub(_mixed_lifecycle_seed())
    client = TestClient(_app(sb))
    r = client.get("/api/study/topics")
    assert r.status_code == 200
    by_id = {it["topic_id"]: it for it in r.json()["items"]}
    # Root topic — parent is genuinely null.
    root = by_id["t-locked"]
    assert root["parent_topic_id"] is None
    assert root["topic_level"] == "topic"
    # Child topic — parent_topic_id must pass through, not be hard-coded.
    child = by_id["t-locked-child"]
    assert child["parent_topic_id"] == "t-locked"
    assert child["topic_level"] == "microtopic"


def test_topics_endpoint_trust_status_label_is_locked():
    sb = SBStub(_mixed_lifecycle_seed())
    client = TestClient(_app(sb))
    body = client.get("/api/study/topics").json()
    assert body["trust_status"] == "locked"
    assert all(it["trust_status"] == "locked" for it in body["items"])


# ── /api/study/mission-control — today tasks carry reasoning ───────────


def test_mission_control_today_tasks_carry_priority_and_reasoning():
    sb = SBStub(_mixed_lifecycle_seed())
    # Persist a real plan so mission-control has tasks to load.
    out = apply_plan(sb, "u-1")
    assert out["applied"] is True
    # The planner stamps priority_score + why_this_task on every task row.
    raw_tasks = sb.db["study_tasks"]
    assert raw_tasks, "planner must have created tasks before this assertion"
    assert all("priority_score" in t for t in raw_tasks)
    # Force scheduled_date to today so _load_today_tasks keeps them.
    from datetime import datetime, timezone

    today_iso = datetime.now(timezone.utc).date().isoformat()
    for t in raw_tasks:
        t["scheduled_date"] = today_iso

    client = TestClient(_app(sb))
    body = client.get("/api/study/mission-control").json()
    today_tasks = body.get("today_tasks") or []
    assert today_tasks, f"mission-control returned no today_tasks: {body}"
    for task in today_tasks:
        # Hard-coded None is gone — the real planner score passes through.
        assert "priority_score" in task
        assert task["priority_score"] is not None
        # Reasoning + linkage fields surface inline so the UI can render
        # them without a second /task-reasoning/:id round-trip.
        assert "why_this_task" in task
        assert "topic_id" in task
        assert "exam_topic_coverage_id" in task
        assert "subject_id" in task


# ── /api/study/mission-control exam_context — locked only ──────────────


def test_mission_control_exam_context_high_yield_topics_are_locked_only():
    sb = SBStub(_mixed_lifecycle_seed())
    client = TestClient(_app(sb))
    body = client.get("/api/study/mission-control").json()
    exam_ctx = body.get("exam_context") or {}
    high_yield = exam_ctx.get("high_yield_topics") or []
    # The high_yield_topics block shapes by name, not topic_id (legacy
    # contract). Assert by the topic name string instead — the locked-only
    # filter is what we care about here.
    topic_names = {hy.get("topic") for hy in high_yield}
    assert "Percentage" in topic_names, f"locked topic missing from high_yield: {topic_names}"
    # The four non-locked lifecycle states must NOT leak into the payload.
    for forbidden in ("Draft", "Pending", "Reviewed", "Rejected"):
        assert forbidden not in topic_names, (
            f"non-locked topic {forbidden!r} leaked into high_yield_topics"
        )
    # And the block self-declares status='locked' on every entry.
    assert all(hy.get("status") == "locked" for hy in high_yield), high_yield
