"""Phase 8 — Plan Impact: before/after diff + rollout-gate decisions."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intelligence as admin_api
from app.core.auth import get_current_user
from app.study_os.plan_impact import (
    compute_plan_impact,
    record_plan_impact_decision,
)
from tests.persona_questions._stub import SBStub


def _seed() -> dict:
    """Two locked topics + one reviewed candidate, all on exam e1."""
    return {
        "exams": [
            {"id": "e1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "exam_topic_coverage": [
            {"id": "cov-L1", "exam_id": "e1", "topic_id": "t1",
             "exam_priority_score": 88, "is_high_yield": True,
             "confidence_score": 0.86, "reviewer_status": "locked"},
            {"id": "cov-L2", "exam_id": "e1", "topic_id": "t2",
             "exam_priority_score": 60, "is_high_yield": False,
             "confidence_score": 0.7, "reviewer_status": "locked"},
            {"id": "cov-C", "exam_id": "e1", "topic_id": "t3",
             "exam_priority_score": 80, "is_high_yield": True,
             "confidence_score": 0.81, "reviewer_status": "reviewed"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "slug": "percentage"},
            {"id": "t2", "name": "Time and Work", "slug": "time-and-work"},
            {"id": "t3", "name": "Data Interpretation", "slug": "data-interpretation"},
        ],
    }


# ─── compute_plan_impact ──────────────────────────────────────────────────
def test_impact_missing_coverage_is_reported():
    out = compute_plan_impact(SBStub(_seed()), "no-such")
    assert out == {"available": False, "reason": "coverage_not_found"}


def test_impact_adds_candidate_and_reranks():
    out = compute_plan_impact(SBStub(_seed()), "cov-C")
    assert out["available"] is True
    assert out["already_locked"] is False
    assert len(out["before"]) == 2
    assert len(out["after"]) == 3
    # exam-level scores: t1=54, t3=50, t2=30 → candidate lands at rank 2.
    after_by_topic = {r["topic_id"]: r for r in out["after"]}
    assert after_by_topic["t3"]["rank"] == 2
    # the candidate is high-yield and lands in the top 3 → medium risk.
    assert out["risk_level"] == "medium"
    change_types = {c["type"] for c in out["changes"]}
    assert "topic_added" in change_types
    assert "rank_change" in change_types  # t2 pushed 2 -> 3


def test_impact_for_already_locked_row_is_a_noop():
    out = compute_plan_impact(SBStub(_seed()), "cov-L1")
    assert out["available"] is True
    assert out["already_locked"] is True
    assert out["risk_level"] == "low"
    assert out["changes"] == []
    assert len(out["before"]) == len(out["after"]) == 2


def test_impact_first_locked_topic_message():
    sb = SBStub({
        "exams": _seed()["exams"],
        "exam_topic_coverage": [
            {"id": "cov-C", "exam_id": "e1", "topic_id": "t3",
             "exam_priority_score": 80, "is_high_yield": False,
             "reviewer_status": "reviewed"},
        ],
        "topics": [{"id": "t3", "name": "Data Interpretation"}],
    })
    out = compute_plan_impact(sb, "cov-C")
    assert out["before"] == []
    assert len(out["after"]) == 1
    assert "first locked topic" in out["summary"]


# ─── record_plan_impact_decision ──────────────────────────────────────────
def test_record_decision_persists_with_impact_snapshot():
    sb = SBStub(_seed())
    row = record_plan_impact_decision(
        sb, "cov-C", decision="approve", admin_id="admin-1", notes="Looks safe."
    )
    assert row is not None
    assert row["decision"] == "approve"
    assert row["risk_level"] == "medium"
    assert row["decided_by"] == "admin-1"
    assert row["impact_summary"]["candidate_topic"] == "Data Interpretation"
    assert len(sb.db["plan_impact_decisions"]) == 1


def test_record_decision_rejects_invalid_decision():
    sb = SBStub(_seed())
    assert record_plan_impact_decision(
        sb, "cov-C", decision="maybe", admin_id="admin-1"
    ) is None
    assert not sb.db.get("plan_impact_decisions")


def test_record_decision_rejects_missing_coverage():
    sb = SBStub(_seed())
    assert record_plan_impact_decision(
        sb, "no-such", decision="hold", admin_id="admin-1"
    ) is None


def test_latest_decision_is_surfaced_on_recompute():
    sb = SBStub(_seed())
    record_plan_impact_decision(sb, "cov-C", decision="stage", admin_id="admin-1")
    out = compute_plan_impact(sb, "cov-C")
    assert out["latest_decision"]["decision"] == "stage"


# ─── Admin API ────────────────────────────────────────────────────────────
def _admin_app(sb: SBStub, role: str = "super_admin"):
    app = FastAPI()
    app.include_router(admin_api.router, prefix="/api")
    admin_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    user = {
        "id": "admin-1",
        "role": role,
        "permissions": ["exam_intelligence.review"] if role == "admin" else [],
    }
    app.dependency_overrides[get_current_user] = lambda: user
    return app


def test_get_plan_impact_endpoint():
    sb = SBStub(_seed())
    client = TestClient(_admin_app(sb))
    r = client.get("/api/admin/exam-intelligence/plan-impact/cov-C")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["candidate_topic"] == "Data Interpretation"


def test_get_plan_impact_missing_returns_404():
    sb = SBStub(_seed())
    client = TestClient(_admin_app(sb))
    r = client.get("/api/admin/exam-intelligence/plan-impact/no-such")
    assert r.status_code == 404


def test_post_plan_impact_decision_endpoint():
    sb = SBStub(_seed())
    client = TestClient(_admin_app(sb))
    r = client.post(
        "/api/admin/exam-intelligence/plan-impact/cov-C/decision",
        json={"decision": "stage", "notes": "Stage it."},
    )
    assert r.status_code == 200
    assert r.json()["decision"] == "stage"
    assert len(sb.db["plan_impact_decisions"]) == 1


def test_post_plan_impact_decision_rejects_bad_value():
    sb = SBStub(_seed())
    client = TestClient(_admin_app(sb))
    r = client.post(
        "/api/admin/exam-intelligence/plan-impact/cov-C/decision",
        json={"decision": "definitely"},
    )
    assert r.status_code == 422


def test_plan_impact_blocked_for_non_admin():
    sb = SBStub(_seed())
    client = TestClient(_admin_app(sb, role="user"))
    assert client.get("/api/admin/exam-intelligence/plan-impact/cov-C").status_code == 403
    assert client.post(
        "/api/admin/exam-intelligence/plan-impact/cov-C/decision",
        json={"decision": "hold"},
    ).status_code == 403
