from app.onboarding_unified.session import get_or_create_session
from tests.onboarding_unified._seed import SBStub


def test_onboarding_resumes_anonymous_session_after_login():
    sb = SBStub({
        "onboarding_sessions": [
            {
                "id": "os-1",
                "anonymous_id": "anon-1",
                "user_id": None,
                "status": "active",
                "entry_mode": "cold",
                "recruitment_id": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        ],
        "funnel_sessions": [{"id": "fs-1", "anonymous_id": "anon-1", "user_id": None}],
        "onboarding_session_answers": [],
        "persona_question_answers": [],
    })
    out = get_or_create_session(sb, user_id="u-1", anonymous_id="anon-1", entry_mode="cold")
    assert out["id"] == "os-1"
    assert sb.db["onboarding_sessions"][0]["user_id"] == "u-1"
