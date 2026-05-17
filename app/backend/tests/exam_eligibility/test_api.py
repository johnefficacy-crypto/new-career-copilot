"""HTTP contract for ``GET /api/exams/eligibility-summary`` (PR-D1)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import exam_eligibility as eligibility_api
from app.core.auth import get_current_user
from tests.exam_eligibility.test_evaluator import _summary_world


def _app(sb, user_id: str = "u-1") -> FastAPI:
    app = FastAPI()
    app.include_router(eligibility_api.router, prefix="/api")
    eligibility_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


def test_summary_endpoint_returns_four_buckets():
    from tests.persona_questions._stub import SBStub

    sb = SBStub(_summary_world())
    body = TestClient(_app(sb)).get("/api/exams/eligibility-summary").json()
    assert set(body) >= {"eligible", "conditional", "not_eligible", "unknown", "rule_count"}
    eligible_slugs = sorted(item["slug"] for item in body["eligible"])
    assert eligible_slugs == ["ssc-cgl", "upsc-cse"]


def test_summary_endpoint_swallows_db_errors_returns_empty_buckets():
    """The endpoint must never 500 a brand-new user. Per-call DB failures
    are swallowed by the evaluator's ``_safe`` wrapper and the four
    buckets come back empty rather than raising into the request."""

    class _BrokenSB:
        def table(self, *_a, **_k):
            raise RuntimeError("boom")

    r = TestClient(_app(_BrokenSB())).get("/api/exams/eligibility-summary")
    assert r.status_code == 200
    body = r.json()
    assert body["eligible"] == []
    assert body["conditional"] == []
    assert body["not_eligible"] == []
    assert body["unknown"] == []
    assert body["rule_count"] == 0
