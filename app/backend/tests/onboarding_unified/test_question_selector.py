"""Deterministic next-question selection tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.onboarding_unified.entry_resolver import INTENT_PICKER_KEY
from app.onboarding_unified.question_selector import (
    is_sensitive_question,
    select_next_question,
)
from tests.onboarding_unified._seed import SBStub, cta_world, persona_bank


def _cold_session(**overrides):
    base = {
        "id": "sess-cold",
        "user_id": None,
        "anonymous_id": "anon-1",
        "entry_mode": "cold",
        "intent": None,
        "recruitment_id": None,
        "post_id": None,
        "asked_question_keys": [],
        "question_count": 0,
        "status": "active",
    }
    base.update(overrides)
    return base


def test_cold_session_with_unknown_intent_returns_intent_picker_first():
    sb = SBStub({"persona_question_bank": persona_bank()})
    result = select_next_question(sb, _cold_session())
    assert result is not None
    assert result["source"] == "intent_picker"
    assert result["question"]["question_key"] == INTENT_PICKER_KEY


def test_anonymous_session_skips_persona_snapshot_lookup():
    # Anonymous sessions must never issue a Supabase read against
    # ``aspirant_persona_snapshots`` with a null user_id.
    seen_tables: list[str] = []

    class _TrackingSB(SBStub):
        def table(self, name):  # type: ignore[override]
            seen_tables.append(name)
            return super().table(name)

    sb = _TrackingSB({"persona_question_bank": persona_bank()})
    select_next_question(sb, _cold_session(intent="prepare_exam"))
    assert "aspirant_persona_snapshots" not in seen_tables


def test_cold_session_with_intent_returns_persona_question():
    sb = SBStub({"persona_question_bank": persona_bank()})
    result = select_next_question(sb, _cold_session(intent="prepare_exam"))
    assert result["source"] == "persona_question_bank"
    # Sensitive question (priority 5) is skipped; first safe one (priority 10) wins.
    assert result["question"]["question_key"] == "preparation_stage_self_assessment"


def test_sensitive_persona_questions_are_not_asked_in_cold_mode():
    sb = SBStub({"persona_question_bank": persona_bank()})
    # Walk the whole cold flow: no sensitive key may ever be presented.
    session = _cold_session(intent="prepare_exam")
    seen = []
    for _ in range(10):
        result = select_next_question(sb, session)
        if result is None:
            break
        key = result["question"]["question_key"]
        seen.append(key)
        session["asked_question_keys"].append(key)
        session["question_count"] += 1
    assert "reservation_category_pick" not in seen


def test_sensitive_question_helper_flags_reservation_fields():
    assert is_sensitive_question({"field_key": "reservation_category"}) is True
    assert is_sensitive_question({"question_key": "pwbd_status"}) is True
    assert is_sensitive_question({"question_key": "weekday_study_availability"}) is False


def test_already_answered_question_is_skipped():
    sb = SBStub(
        {
            "persona_question_bank": persona_bank(),
            "onboarding_session_answers": [
                {
                    "session_id": "sess-cold",
                    "question_source": "persona_question_bank",
                    "question_key": "preparation_stage_self_assessment",
                    "skipped": False,
                    "created_at": "2026-01-01T00:00:00+00:00",
                }
            ],
        }
    )
    session = _cold_session(
        intent="prepare_exam",
        asked_question_keys=["preparation_stage_self_assessment"],
        question_count=1,
    )
    result = select_next_question(sb, session)
    assert result["question"]["question_key"] == "weekday_study_availability"


def test_dismissed_persona_question_is_skipped():
    future = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    sb = SBStub(
        {
            "persona_question_bank": persona_bank(),
            "persona_question_dismissals": [
                {
                    "user_id": "u-1",
                    "question_key": "preparation_stage_self_assessment",
                    "dismissed_until": future,
                }
            ],
        }
    )
    session = _cold_session(id="sess-u", user_id="u-1", intent="prepare_exam")
    result = select_next_question(sb, session)
    assert result["question"]["question_key"] == "weekday_study_availability"


def test_hard_cap_prevents_more_than_seven_questions():
    sb = SBStub({"persona_question_bank": persona_bank()})
    session = _cold_session(
        intent="prepare_exam",
        asked_question_keys=[f"q{i}" for i in range(7)],
        question_count=7,
    )
    assert select_next_question(sb, session) is None


def test_cta_session_returns_verified_recruitment_question():
    sb = SBStub(cta_world())
    session = {
        "id": "sess-cta",
        "user_id": None,
        "anonymous_id": "anon-cta",
        "entry_mode": "cta",
        "intent": "check_eligibility",
        "recruitment_id": "rec-1",
        "post_id": "post-1",
        "asked_question_keys": [],
        "question_count": 0,
        "status": "active",
    }
    result = select_next_question(sb, session)
    assert result["source"] == "recruitment_question_requirements"
    assert result["question"]["question_key"] == "has_marathi_knowledge"


def test_persona_questions_targeting_unknown_dimensions_are_boosted():
    bank = [
        {
            "question_key": "higher_priority_known",
            "question_text": "Known dim",
            "data_type": "single_select",
            "options": [{"value": "x", "label": "X"}],
            "target_dimension": "study_policy",
            "priority": 10,
            "is_active": True,
        },
        {
            "question_key": "lower_priority_unknown",
            "question_text": "Unknown dim",
            "data_type": "single_select",
            "options": [{"value": "y", "label": "Y"}],
            "target_dimension": "execution_risk",
            "priority": 80,
            "is_active": True,
        },
    ]
    sb = SBStub({
        "persona_question_bank": bank,
        "aspirant_persona_snapshots": [
            {
                "user_id": "u-1",
                "is_current": True,
                "dimensions": {"execution_risk": "unknown", "study_policy": "structured"},
            }
        ],
    })
    session = _cold_session(id="sess-u", user_id="u-1", intent="prepare_exam")
    result = select_next_question(sb, session)
    assert result["question"]["question_key"] == "lower_priority_unknown"
