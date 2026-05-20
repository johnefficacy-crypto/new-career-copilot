"""Trust invariant for the Exam-Intelligence CMS (data import/seed pipeline).

The CMS lets operators create exam-registry / PYQ / coverage / competition
rows so the review queue has something to review. The safety-critical
guarantee is that **nothing it creates can land in a planner-ready /
aspirant-visible state**: seeded rows must always start in their lowest
review state (pending / pending_review / draft) and can only be promoted
through the separate review-side lifecycle.

If that ever regressed, an operator (or a buggy import) could inject
unreviewed data straight into the aspirant-facing planner. These tests
pin the invariant on both the single-create endpoints and /bulk-import,
including the adversarial case where the caller *tries* to set a
locked/verified status in the payload.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import admin_exam_intel_cms as cms_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub):
    app = FastAPI()
    app.include_router(cms_api.router, prefix="/api")
    cms_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[cms_api._flag_enabled] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "admin-1",
        "role": "super_admin",
        "permissions": [cms_api.PERM_CMS],
    }
    return TestClient(app, raise_server_exceptions=False)


_BASE = "/api/admin/exam-intelligence-cms"


def _seeded_exam() -> dict:
    return {"exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True}]}


# ── single-create endpoints force pre-review state ─────────────────────


def test_create_pyq_paper_is_forced_pending_even_if_caller_sends_verified():
    sb = SBStub(_seeded_exam())
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/pyq-papers",
        json={
            "reason": "seeding 2024 paper",
            "payload": {"exam_id": "exam-1", "year": 2024, "trust_status": "verified"},
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["row"]["trust_status"] == "pending"
    assert sb.db["pyq_papers"][0]["trust_status"] == "pending"


def test_create_pyq_question_is_forced_pending():
    sb = SBStub({**_seeded_exam(), "pyq_papers": [{"id": "p1", "exam_id": "exam-1"}]})
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/pyq-questions",
        json={
            "reason": "seeding question 1",
            "payload": {
                "pyq_paper_id": "p1",
                "question_text": "What is 10% of 200?",
                "reviewer_status": "verified",
            },
        },
    )
    assert r.status_code == 200, r.text
    assert sb.db["pyq_questions"][0]["reviewer_status"] == "pending"


def test_create_topic_coverage_is_forced_pending_review_even_if_caller_sends_locked():
    sb = SBStub({**_seeded_exam(), "topics": [{"id": "t1", "name": "Percentage"}]})
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/exam-topic-coverage",
        json={
            "reason": "seeding coverage row",
            "payload": {"exam_id": "exam-1", "topic_id": "t1", "reviewer_status": "locked", "is_high_yield": True},
        },
    )
    assert r.status_code == 200, r.text
    row = sb.db["exam_topic_coverage"][0]
    # The single most important assertion in this file: a seeded coverage
    # row can NEVER be born locked, so it can never reach the planner /
    # aspirant without passing through review.
    assert row["reviewer_status"] == "pending_review"
    assert row["reviewer_status"] != "locked"


def test_create_competition_metric_is_forced_draft():
    sb = SBStub(_seeded_exam())
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/exam-competition-metrics",
        json={
            "reason": "seeding competition metric",
            "payload": {"exam_id": "exam-1", "reviewer_status": "locked"},
        },
    )
    assert r.status_code == 200, r.text
    assert sb.db["exam_competition_metrics"][0]["reviewer_status"] == "draft"


# ── bulk-import forces pre-review state per entity ─────────────────────


def test_bulk_import_topic_coverage_forces_pending_review_over_caller_status():
    sb = SBStub({**_seeded_exam(), "topics": [{"id": "t1"}, {"id": "t2"}]})
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/bulk-import",
        json={
            "reason": "bulk seeding two coverage rows",
            "entity": "exam-topic-coverage",
            "rows": [
                {"exam_id": "exam-1", "topic_id": "t1", "reviewer_status": "locked"},
                {"exam_id": "exam-1", "topic_id": "t2", "reviewer_status": "reviewed"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    rows = sb.db.get("exam_topic_coverage", [])
    assert rows, "bulk import should have created coverage rows"
    # Every imported row is forced to pending_review regardless of input.
    assert all(row["reviewer_status"] == "pending_review" for row in rows), rows
    assert not any(row["reviewer_status"] in {"locked", "reviewed"} for row in rows)


def test_bulk_import_pyq_papers_forces_pending_trust():
    sb = SBStub(_seeded_exam())
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/bulk-import",
        json={
            "reason": "bulk seeding papers",
            "entity": "pyq-papers",
            "rows": [
                {"exam_id": "exam-1", "year": 2023, "trust_status": "verified"},
                {"exam_id": "exam-1", "year": 2024, "trust_status": "verified"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    rows = sb.db.get("pyq_papers", [])
    assert rows
    assert all(row["trust_status"] == "pending" for row in rows), rows


def test_bulk_import_rejects_unknown_entity():
    sb = SBStub(_seeded_exam())
    client = _build_app(sb)
    r = client.post(
        f"{_BASE}/bulk-import",
        json={"reason": "bad entity attempt", "entity": "user_topic_mastery", "rows": [{}]},
    )
    # Importing into a non-CMS table must be refused outright.
    assert r.status_code == 422, r.text
