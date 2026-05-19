"""Canonical-exam enforcement on plan endpoints + ``/target-exam`` contract.

Covers:
  - ``GET /api/study/target-exam`` hydration contract used by the frontend.
  - ``PUT /api/study/target-exam`` body validation via Pydantic.
  - ``STUDY_OS_REQUIRE_CANONICAL_EXAM`` enforcement on the three plan
    endpoints (GET /plan/draft, POST /plan/draft, POST /plan/apply) so the
    enforcement shape is identical across the surface.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub
from tests.study_os.test_planner import _seed


def _app(sb: SBStub, user_id: str = "u-1") -> FastAPI:
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


# ── GET /target-exam ───────────────────────────────────────────────────────
def test_get_target_exam_returns_none_when_unset():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    body = TestClient(_app(sb)).get("/api/study/target-exam").json()
    assert body == {"selected_exam": None}


def test_get_target_exam_returns_exam_when_set():
    sb = SBStub({
        "profiles": [{"id": "u-1", "target_exam": "exam-1"}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True}],
    })
    body = TestClient(_app(sb)).get("/api/study/target-exam").json()
    assert body["selected_exam"] == {
        "id": "exam-1",
        "slug": "ssc-cgl",
        "name": "SSC CGL",
        "is_active": True,
    }


# ── PUT /target-exam body validation ───────────────────────────────────────
def test_set_target_exam_rejects_non_uuid_body():
    sb = SBStub({
        "profiles": [{"id": "u-1", "target_exam": None}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True}],
    })
    r = TestClient(_app(sb)).put("/api/study/target-exam", json={"exam_id": "not-a-uuid"})
    # Pydantic rejects malformed UUIDs at the validation layer (422).
    assert r.status_code == 422


def test_set_target_exam_rejects_missing_exam_id():
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    r = TestClient(_app(sb)).put("/api/study/target-exam", json={})
    assert r.status_code == 422


def test_set_target_exam_happy_path_accepts_uuid():
    exam_id = "11111111-1111-4111-8111-111111111111"
    sb = SBStub({
        "profiles": [{"id": "u-1", "target_exam": None}],
        "exams": [{"id": exam_id, "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True}],
        "aspirant_preferences": [],
    })
    r = TestClient(_app(sb)).put("/api/study/target-exam", json={"exam_id": exam_id})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["selected_exam"]["id"] == exam_id


# ── canonical-exam enforcement on plan endpoints ───────────────────────────
@pytest.fixture
def _flag_on(monkeypatch):
    monkeypatch.setenv("STUDY_OS_REQUIRE_CANONICAL_EXAM", "true")


@pytest.fixture
def _flag_off(monkeypatch):
    monkeypatch.setenv("STUDY_OS_REQUIRE_CANONICAL_EXAM", "false")


def _expect_target_exam_required(response):
    assert response.status_code == 400
    detail = response.json().get("detail")
    assert isinstance(detail, dict), f"expected structured detail, got {detail!r}"
    assert detail.get("code") == "TARGET_EXAM_REQUIRED"
    assert detail.get("message")


def test_get_plan_draft_enforces_canonical_target_when_flag_on(_flag_on):
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    r = TestClient(_app(sb)).get("/api/study/plan/draft")
    _expect_target_exam_required(r)


def test_post_plan_draft_enforces_canonical_target_when_flag_on(_flag_on):
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    r = TestClient(_app(sb)).post("/api/study/plan/draft")
    _expect_target_exam_required(r)


def test_post_plan_apply_enforces_canonical_target_when_flag_on(_flag_on):
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    r = TestClient(_app(sb)).post("/api/study/plan/apply")
    _expect_target_exam_required(r)


def test_plan_endpoints_skip_enforcement_when_flag_off(_flag_off):
    # With the flag off, the three endpoints fall through to compute_draft_plan /
    # apply_plan, which gracefully report ``generated: False`` when there is no
    # target exam — they do not 400.
    sb = SBStub({"profiles": [{"id": "u-1", "target_exam": None}]})
    client = TestClient(_app(sb))
    assert client.get("/api/study/plan/draft").status_code == 200
    assert client.post("/api/study/plan/draft").status_code == 200
    assert client.post("/api/study/plan/apply").status_code == 200


def test_post_plan_apply_succeeds_when_target_is_set(_flag_on):
    # Sanity: enforcement does not regress the happy path.
    sb = SBStub(_seed())
    r = TestClient(_app(sb)).post("/api/study/plan/apply")
    assert r.status_code == 200
    assert r.json()["applied"] is True
