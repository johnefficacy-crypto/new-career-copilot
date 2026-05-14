"""Anonymous → authenticated session stitching tests."""
from __future__ import annotations

from app.onboarding_unified.anonymous_stitching import stitch_anonymous_sessions
from tests.onboarding_unified._seed import SBStub


def _world():
    return {
        "funnel_sessions": [
            {"id": "fs-1", "anonymous_id": "anon-7", "user_id": None}
        ],
        "onboarding_sessions": [
            {
                "id": "os-1",
                "anonymous_id": "anon-7",
                "user_id": None,
                "entry_mode": "cold",
                "intent": "prepare_exam",
                "status": "active",
                "question_count": 2,
                "asked_question_keys": ["session_intent", "mock_behavior"],
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        ],
        "onboarding_session_answers": [
            {
                "id": "a-1",
                "session_id": "os-1",
                "anonymous_id": "anon-7",
                "user_id": None,
                "question_source": "intent_picker",
                "question_key": "session_intent",
                "answer_value": "prepare_exam",
                "normalized_value": "prepare_exam",
                "skipped": False,
            },
            {
                "id": "a-2",
                "session_id": "os-1",
                "anonymous_id": "anon-7",
                "user_id": None,
                "question_source": "persona_question_bank",
                "question_key": "mock_behavior",
                "answer_value": "avoid_mocks",
                "normalized_value": "avoid_mocks",
                "skipped": False,
            },
        ],
        "persona_question_answers": [],
    }


def test_stitch_attaches_sessions_to_user_id():
    sb = SBStub(_world())
    result = stitch_anonymous_sessions(sb, "anon-7", "u-99")
    assert result["stitched"] is True
    assert result["claimed"]["onboarding_sessions"] == 1
    assert result["claimed"]["funnel_sessions"] == 1
    # Every claimed row now carries the user_id.
    assert all(
        r["user_id"] == "u-99" for r in sb.db["onboarding_sessions"]
    )
    assert all(r["user_id"] == "u-99" for r in sb.db["onboarding_session_answers"])
    assert result["session"]["id"] == "os-1"


def test_stitch_fans_persona_answers_into_persona_table():
    sb = SBStub(_world())
    stitch_anonymous_sessions(sb, "anon-7", "u-99")
    persona_rows = sb.db["persona_question_answers"]
    keys = {r["question_key"] for r in persona_rows}
    assert "mock_behavior" in keys
    # The intent-picker answer stays session-only.
    assert "session_intent" not in keys


def test_stitch_does_not_duplicate_existing_persona_answers():
    world = _world()
    world["persona_question_answers"] = [
        {"user_id": "u-99", "question_key": "mock_behavior", "skipped": False}
    ]
    sb = SBStub(world)
    result = stitch_anonymous_sessions(sb, "anon-7", "u-99")
    # Already present → not written again.
    assert result["persona_answers_written"] == 0
    mock_rows = [
        r
        for r in sb.db["persona_question_answers"]
        if r["question_key"] == "mock_behavior"
    ]
    assert len(mock_rows) == 1


def test_stitch_is_noop_without_anonymous_id():
    sb = SBStub(_world())
    result = stitch_anonymous_sessions(sb, "", "u-99")
    assert result["stitched"] is False
