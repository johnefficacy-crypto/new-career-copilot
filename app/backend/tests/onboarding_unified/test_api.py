"""API-level tests for the unified onboarding router (stubbed Supabase)."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import onboarding_unified as api_mod
from app.core.auth import get_current_user, get_optional_user
from tests.onboarding_unified._seed import SBStub, persona_bank


@pytest.fixture
def ctx(monkeypatch):
    sb = SBStub({"persona_question_bank": persona_bank()})
    monkeypatch.setattr(api_mod, "get_supabase_admin", lambda: sb)

    app = FastAPI()
    app.include_router(api_mod.router, prefix="/api")
    # Default: anonymous caller.
    app.dependency_overrides[get_optional_user] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: {"id": "u-auth"}
    return TestClient(app), sb, app


def _resolve_cold(client, anonymous_id="anon-1"):
    return client.get(
        "/api/onboarding-unified/resolve",
        params={"mode": "discovery", "anonymous_id": anonymous_id},
    )


def test_cold_resolve_returns_intent_picker_as_q1(ctx):
    client, _sb, _app = ctx
    r = _resolve_cold(client)
    assert r.status_code == 200
    data = r.json()
    assert data["entry_mode"] == "discovery"
    assert data["question_source"] == "intent_picker"
    assert data["question"]["question_key"] == "session_intent"
    assert data["progress"]["position"] == 1
    assert data["progress"]["total"] == 7
    # 5 intent options, tap-first.
    assert len(data["question"]["options"]) == 5


def test_answer_intent_picker_advances_to_persona_question(ctx):
    client, _sb, _app = ctx
    session_id = _resolve_cold(client).json()["session_id"]
    r = client.post(
        "/api/onboarding-unified/answer",
        json={
            "session_id": session_id,
            "question_source": "intent_picker",
            "question_key": "session_intent",
            "answer_value": "prepare_exam",
            "anonymous_id": "anon-1",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "prepare_exam"
    assert data["question_source"] == "persona_question_bank"
    assert data["progress"]["position"] == 2


def test_answer_with_wrong_question_key_is_rejected(ctx):
    client, _sb, _app = ctx
    session_id = _resolve_cold(client).json()["session_id"]
    r = client.post(
        "/api/onboarding-unified/answer",
        json={
            "session_id": session_id,
            "question_source": "intent_picker",
            "question_key": "totally_unknown_key",
            "answer_value": "prepare_exam",
            "anonymous_id": "anon-1",
        },
    )
    assert r.status_code == 400


def test_answer_invalid_single_select_option_is_rejected(ctx):
    client, _sb, _app = ctx
    session_id = _resolve_cold(client).json()["session_id"]
    r = client.post(
        "/api/onboarding-unified/answer",
        json={
            "session_id": session_id,
            "question_source": "intent_picker",
            "question_key": "session_intent",
            "answer_value": "not_a_listed_intent",
            "anonymous_id": "anon-1",
        },
    )
    assert r.status_code == 400


def test_caller_cannot_answer_a_session_they_do_not_own(ctx):
    client, _sb, _app = ctx
    session_id = _resolve_cold(client, anonymous_id="anon-1").json()["session_id"]
    r = client.post(
        "/api/onboarding-unified/answer",
        json={
            "session_id": session_id,
            "question_source": "intent_picker",
            "question_key": "session_intent",
            "answer_value": "prepare_exam",
            "anonymous_id": "anon-someone-else",
        },
    )
    assert r.status_code == 403


def test_hard_cap_blocks_answering_beyond_seven(ctx):
    client, sb, _app = ctx
    # Pre-seed a capped session owned by anon-cap.
    sb.db["onboarding_sessions"] = [
        {
            "id": "sess-capped",
            "anonymous_id": "anon-cap",
            "user_id": None,
            "entry_mode": "cold",
            "intent": "prepare_exam",
            "status": "active",
            "asked_question_keys": [f"q{i}" for i in range(7)],
            "question_count": 7,
        }
    ]
    r = client.post(
        "/api/onboarding-unified/answer",
        json={
            "session_id": "sess-capped",
            "question_source": "persona_question_bank",
            "question_key": "mock_behavior",
            "answer_value": "avoid_mocks",
            "anonymous_id": "anon-cap",
        },
    )
    assert r.status_code == 409


def test_complete_does_not_enqueue_recompute_for_anonymous_caller(ctx):
    client, sb, _app = ctx
    session_id = _resolve_cold(client).json()["session_id"]
    # Make the intent eligibility-flavoured.
    client.post(
        "/api/onboarding-unified/answer",
        json={
            "session_id": session_id,
            "question_source": "intent_picker",
            "question_key": "session_intent",
            "answer_value": "check_eligibility",
            "anonymous_id": "anon-1",
        },
    )
    r = client.post(
        "/api/onboarding-unified/complete",
        json={"session_id": session_id, "anonymous_id": "anon-1"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["completed"] is True
    assert data["recompute_enqueued"] is False  # anonymous → never enqueued
    assert data["next_action"] == "view_eligibility"
    # The blocking answer path never touched the eligibility queue.
    assert not sb.db.get("eligibility_recompute_queue")


def test_complete_enqueues_recompute_only_for_authenticated_eligibility(ctx):
    client, sb, app = ctx
    app.dependency_overrides[get_optional_user] = lambda: {"id": "u-auth"}
    r = client.get(
        "/api/onboarding-unified/resolve",
        params={"intent": "check_eligibility"},
    )
    session_id = r.json()["session_id"]
    done = client.post(
        "/api/onboarding-unified/complete",
        json={"session_id": session_id},
    )
    assert done.status_code == 200
    assert done.json()["recompute_enqueued"] is True


def test_stitch_anonymous_requires_auth_and_claims_session(ctx):
    client, sb, app = ctx
    # Build an anonymous session first.
    session_id = _resolve_cold(client, anonymous_id="anon-stitch").json()["session_id"]
    # Now "log in" and stitch.
    app.dependency_overrides[get_optional_user] = lambda: {"id": "u-auth"}
    r = client.post(
        "/api/onboarding-unified/stitch-anonymous",
        json={"anonymous_id": "anon-stitch"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["stitched"] is True
    assert data["claimed"]["onboarding_sessions"] == 1
    claimed = [s for s in sb.db["onboarding_sessions"] if s["id"] == session_id][0]
    assert claimed["user_id"] == "u-auth"
