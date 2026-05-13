"""End-to-end-ish API tests against the FastAPI app with stubbed Supabase."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import persona_questions as persona_questions_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


@pytest.fixture
def client_and_sb(monkeypatch):
    sb = SBStub({
        "persona_question_bank": [
            {
                "question_key": "mock_behavior",
                "question_text": "How do you usually handle mock tests?",
                "data_type": "single_select",
                "options": [
                    {"value": "avoid_mocks", "label": "Avoid"},
                    {"value": "analyze_every_mock", "label": "Analyze"},
                ],
                "priority": 50,
                "target_dimension": "learning_behavior",
                "is_active": True,
            }
        ],
        "persona_question_answers": [],
        "persona_question_dismissals": [],
        "user_signal_events": [],
        "persona_recompute_queue": [],
        "aspirant_persona_snapshots": [],
    })

    def _stub_admin():
        return sb

    # Patch every supabase admin import site touched by this router.
    monkeypatch.setattr(persona_questions_api, "get_supabase_admin", _stub_admin)
    import app.persona_questions.events as ev_mod
    import app.persona.queue as queue_mod
    # The queue helper uses the passed-in supabase, so no patch needed.

    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(persona_questions_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: {"id": "u-test"}
    return TestClient(app), sb


def test_next_returns_seeded_question(client_and_sb):
    client, _sb = client_and_sb
    r = client.get("/api/persona/questions/next")
    assert r.status_code == 200
    data = r.json()
    assert data["question"]["question_key"] == "mock_behavior"
    assert isinstance(data["question"]["options"], list)


def test_answer_validates_against_options(client_and_sb):
    client, sb = client_and_sb
    bad = client.post(
        "/api/persona/questions/answer",
        json={"question_key": "mock_behavior", "answer_value": "nonsense"},
    )
    assert bad.status_code == 400
    good = client.post(
        "/api/persona/questions/answer",
        json={"question_key": "mock_behavior", "answer_value": "avoid_mocks"},
    )
    assert good.status_code == 200
    body = good.json()
    assert body["saved"] is True
    # Recompute either queued or failed string — but answer was persisted.
    assert len(sb.db["persona_question_answers"]) == 1
    assert sb.db["persona_question_answers"][0]["normalized_value"] == "avoid_mocks"


def test_answer_rejects_unknown_question_key(client_and_sb):
    client, _sb = client_and_sb
    r = client.post(
        "/api/persona/questions/answer",
        json={"question_key": "no_such_question", "answer_value": "x"},
    )
    assert r.status_code == 400


def test_skip_creates_dismissal_row(client_and_sb):
    client, sb = client_and_sb
    r = client.post(
        "/api/persona/questions/skip",
        json={"question_key": "mock_behavior", "dismissed_until_days": 7, "reason": "not_now"},
    )
    assert r.status_code == 200
    assert r.json()["skipped"] is True
    assert len(sb.db["persona_question_dismissals"]) == 1


def test_history_returns_recent_rows(client_and_sb):
    client, sb = client_and_sb
    sb.db["persona_question_answers"].append(
        {
            "user_id": "u-test",
            "question_key": "mock_behavior",
            "normalized_value": "avoid_mocks",
            "answer_value": "avoid_mocks",
            "skipped": False,
            "source": "persona_tiny_question",
            "created_at": "2026-05-01T00:00:00+00:00",
        }
    )
    r = client.get("/api/persona/questions/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["history"], list)
    assert data["history"][0]["question_key"] == "mock_behavior"
