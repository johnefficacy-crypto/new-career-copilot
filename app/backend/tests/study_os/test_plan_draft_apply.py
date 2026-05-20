"""Tests for ``/api/study/plan/draft`` and ``/api/study/plan/apply`` —
the two endpoints that split deterministic plan compute from persistence.

The shared deterministic planner is already exercised by ``test_planner``;
these tests focus on the contract guarantees this PR adds:
  - ``draft`` must not mutate the active plan
  - ``apply`` is idempotent
  - ``apply`` always emits a ``study_plan_versions`` + ``study_adaptation_events`` row
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os.planner import apply_plan, compute_draft_plan
from tests.persona_questions._stub import SBStub
from tests.study_os.test_planner import _seed


def _app(sb: SBStub, user_id: str = "u-1") -> FastAPI:
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


# ─── compute_draft_plan ───────────────────────────────────────────────────
def test_draft_does_not_mutate_active_plan():
    sb = SBStub(_seed())
    out = compute_draft_plan(sb, "u-1")
    assert out["generated"] is True
    assert out["applied"] is False
    # No write rows of any kind from a draft call.
    assert sb.db.get("study_plans", []) == []
    assert sb.db.get("study_plan_versions", []) == []
    assert sb.db.get("study_tasks", []) == []
    assert sb.db.get("study_adaptation_events", []) == []
    # The contract diff fields are present.
    assert "before_tasks" in out
    assert "after_tasks" in out
    assert "changes" in out
    assert out["risk_level"] in {"low", "medium", "high"}


def test_draft_diff_shows_added_when_no_active_plan():
    sb = SBStub(_seed())
    out = compute_draft_plan(sb, "u-1")
    # First-time draft → everything is "added" relative to nothing.
    assert out["changes"]["added_count"] == 3
    assert out["changes"]["removed_count"] == 0
    assert out["changes"]["unchanged_count"] == 0
    # Risk is low when there's no incumbent plan to disrupt.
    assert out["risk_level"] == "low"


def test_draft_after_apply_shows_unchanged():
    sb = SBStub(_seed())
    apply_plan(sb, "u-1")
    out = compute_draft_plan(sb, "u-1")
    # Deterministic planner — replaying the draft against an already-applied
    # plan shows the same set of topics, all unchanged.
    assert out["changes"]["added_count"] == 0
    assert out["changes"]["removed_count"] == 0
    assert out["changes"]["unchanged_count"] == 3


# ─── apply_plan ───────────────────────────────────────────────────────────
def test_apply_creates_version_and_adaptation_event():
    sb = SBStub(_seed())
    out = apply_plan(sb, "u-1")
    assert out["generated"] is True
    assert out["applied"] is True
    assert len(sb.db["study_plans"]) == 1
    assert len(sb.db["study_plan_versions"]) == 1
    assert len(sb.db["study_adaptation_events"]) == 1
    assert sb.db["study_adaptation_events"][0]["event_type"] == "manual_regeneration"
    assert out["version_number"] == 1


def test_apply_is_idempotent_versions_increment():
    sb = SBStub(_seed())
    apply_plan(sb, "u-1")
    second = apply_plan(sb, "u-1")
    assert second["applied"] is True
    assert second["version_number"] == 2
    # active plan reused; today's planned tasks replaced, not piled up.
    assert len(sb.db["study_plans"]) == 1
    assert len(sb.db["study_tasks"]) == 3
    # one version + one adaptation event per apply call.
    assert len(sb.db["study_plan_versions"]) == 2
    assert len(sb.db["study_adaptation_events"]) == 2


# ─── HTTP routes ──────────────────────────────────────────────────────────
def test_plan_draft_route_returns_diff():
    sb = SBStub(_seed())
    client = TestClient(_app(sb))
    r = client.get("/api/study/plan/draft")
    assert r.status_code == 200
    body = r.json()
    assert body["generated"] is True
    assert body["applied"] is False
    assert "changes" in body
    # no write rows from the draft call
    assert sb.db.get("study_tasks", []) == []


def test_plan_apply_route_persists():
    sb = SBStub(_seed())
    client = TestClient(_app(sb))
    r = client.post("/api/study/plan/apply")
    assert r.status_code == 200
    body = r.json()
    assert body["applied"] is True
    assert len(sb.db["study_plans"]) == 1
    assert len(sb.db["study_plan_versions"]) == 1
    assert len(sb.db["study_adaptation_events"]) == 1


def test_plan_changelog_route_returns_events():
    sb = SBStub(_seed())
    client = TestClient(_app(sb))
    client.post("/api/study/plan/apply")
    r = client.get("/api/study/plan/changelog")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert body["items"][0]["event_type"] == "manual_regeneration"
