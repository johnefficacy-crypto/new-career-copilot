"""Tests for the universal /api/evidence/{kind}/{id} endpoint.

Admin-permission gated. Returns the canonical source row plus a trust
envelope (status / confidence / reviewed_at). Used by EvidenceDrawer to
deep-link any TrustStamp to its source.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import evidence as evidence_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _admin_user() -> dict:
    return {
        "id": "admin-1",
        "role": "admin",
        "permissions": [evidence_api.EVIDENCE_PERM],
    }


def _client(sb: SBStub, *, admin: bool = True) -> TestClient:
    app = FastAPI()
    app.include_router(evidence_api.router, prefix="/api")
    evidence_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    if admin:
        app.dependency_overrides[get_current_user] = _admin_user
    return TestClient(app, raise_server_exceptions=False)


def test_evidence_returns_row_and_trust_envelope():
    sb = SBStub({
        "exam_topic_coverage": [
            {"id": "cov-1", "exam_id": "exam-1", "topic_id": "t1",
             "is_high_yield": True, "confidence_score": 0.92,
             "reviewer_status": "locked", "reviewed_at": "2026-04-01"}
        ]
    })
    r = _client(sb).get("/api/evidence/exam_topic_coverage/cov-1")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "exam_topic_coverage"
    assert body["id"] == "cov-1"
    assert body["row"]["is_high_yield"] is True
    assert body["trust"]["status"] == "locked"
    assert body["trust"]["confidence_score"] == 0.92
    assert body["trust"]["reviewed_at"] == "2026-04-01"


def test_evidence_pyq_option_kind_returns_row():
    """pyq_option is now a registered evidence kind so the review-queue
    EvidenceDrawer can deep-link to it like every other reviewable kind.
    """
    sb = SBStub({
        "pyq_options": [
            {
                "id": "opt-1",
                "question_id": "q-1",
                "option_label": "B",
                "option_text": "1 and 3 only",
                "is_correct": True,
                "reviewer_status": "verified",
                "reviewed_at": "2026-04-02",
            }
        ]
    })
    r = _client(sb).get("/api/evidence/pyq_option/opt-1")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "pyq_option"
    assert body["id"] == "opt-1"
    assert body["row"]["option_label"] == "B"
    assert body["row"]["is_correct"] is True
    assert body["trust"]["status"] == "verified"
    # pyq_option carries no confidence column.
    assert body["trust"]["confidence_score"] is None


def test_evidence_400_for_unknown_kind():
    sb = SBStub({})
    r = _client(sb).get("/api/evidence/nonsense_kind/abc")
    assert r.status_code == 400


def test_evidence_404_for_missing_row():
    sb = SBStub({"exam_topic_coverage": []})
    r = _client(sb).get("/api/evidence/exam_topic_coverage/does-not-exist")
    assert r.status_code == 404


def test_evidence_requires_admin_permission():
    sb = SBStub({})
    # Override the user to a non-admin so require_permission rejects.
    app = FastAPI()
    app.include_router(evidence_api.router, prefix="/api")
    evidence_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "u-1",
        "role": "user",
        "permissions": [],
    }
    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/api/evidence/exam_topic_coverage/x")
    assert r.status_code == 403
