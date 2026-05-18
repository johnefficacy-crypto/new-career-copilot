"""Tests for ``POST /api/profile/onboarding-answer``.

Idempotency on re-submit is the headline contract — the legacy engine
used to 400 on out-of-order keys, which caused the resolve-loop bug.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.profile import onboarding as onboarding_module
from app.persona_questions.bank import invalidate_bank_cache
from tests.persona_questions._stub import SBStub


def _seed_bank() -> list[dict]:
    return [
        {
            "id": "q1",
            "question_key": "intent",
            "question_text": "What brought you here?",
            "data_type": "single_select",
            "options": [{"value": "prepare_exam", "label": "Prepare for an exam"}],
            "profile_table": None,
            "profile_column": None,
            "is_active": True,
            "priority": 10,
        },
        {
            "id": "q2",
            "question_key": "weekly_hours_goal",
            "question_text": "Weekly hours?",
            "data_type": "number",
            "options": [],
            "profile_table": "profiles",
            "profile_column": "weekly_hours_goal",
            "is_active": True,
            "priority": 20,
        },
        {
            "id": "q3",
            "question_key": "study_mode",
            "question_text": "Mode?",
            "data_type": "single_select",
            "options": [{"value": "solo", "label": "Solo"}, {"value": "group", "label": "Group"}],
            "profile_table": "aspirant_preferences",
            "profile_column": "study_mode",
            "is_active": True,
            "priority": 30,
        },
    ]


def _build_app(user_id="user-1", is_anonymous=False):
    db = {
        "persona_question_bank": _seed_bank(),
        "profiles": [{"id": user_id, "onboarding_completed": False, "persona_seed": {}}],
    }
    sb = SBStub(db)
    invalidate_bank_cache()

    onboarding_module.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    from app.persona_questions import answers as answers_mod, events as events_mod

    answers_mod._safe = lambda call, default=None: (call() if callable(call) else default)  # noqa: SLF001
    events_mod.emit_question_signal = lambda *a, **kw: None  # silence
    from app.persona import queue as queue_mod

    queue_mod.enqueue_persona_recompute = lambda *a, **kw: True

    fake_user = {"id": user_id, "email": "u@example.com", "is_anonymous": is_anonymous}

    def _fake_user_dep() -> dict:
        return fake_user

    app = FastAPI()
    app.include_router(onboarding_module.router, prefix="/api")
    app.dependency_overrides[auth_module.get_current_user] = _fake_user_dep
    return app, sb, fake_user


def _profile(sb: SBStub) -> dict:
    return sb.db["profiles"][0]


def test_answer_writes_canonical_column_and_returns_next_question():
    app, sb, _ = _build_app()
    client = TestClient(app)
    r = client.post(
        "/api/profile/onboarding-answer",
        json={"question_key": "weekly_hours_goal", "value": 12, "skipped": False},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["onboarding_completed"] is False
    assert body["next_question"]["question_key"] == "intent" or body["next_question"]["question_key"] == "study_mode"
    p = _profile(sb)
    assert p.get("weekly_hours_goal") == 12.0
    assert p["persona_seed"]["weekly_hours_goal"] == 12.0


def test_resubmitting_an_answered_question_returns_200_and_next_question():
    # The legacy engine raised 400 here. The new endpoint must treat it
    # as an overwrite so the resolve-loop bug stays dead.
    app, sb, _ = _build_app()
    client = TestClient(app)
    r1 = client.post(
        "/api/profile/onboarding-answer",
        json={"question_key": "weekly_hours_goal", "value": 12, "skipped": False},
    )
    assert r1.status_code == 200
    r2 = client.post(
        "/api/profile/onboarding-answer",
        json={"question_key": "weekly_hours_goal", "value": 14, "skipped": False},
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["onboarding_completed"] is False
    assert body["next_question"] is not None
    assert body["next_question"]["question_key"] != "weekly_hours_goal"
    # Latest value wins.
    assert _profile(sb).get("weekly_hours_goal") == 14.0


def test_unknown_question_key_returns_404():
    app, _, _ = _build_app()
    client = TestClient(app)
    r = client.post(
        "/api/profile/onboarding-answer",
        json={"question_key": "nope", "value": "x", "skipped": False},
    )
    assert r.status_code == 404, r.text


def test_skip_records_skipped_marker_and_advances():
    app, sb, _ = _build_app()
    client = TestClient(app)
    r = client.post(
        "/api/profile/onboarding-answer",
        json={"question_key": "intent", "value": None, "skipped": True},
    )
    assert r.status_code == 200, r.text
    assert _profile(sb)["persona_seed"]["intent"] == "skipped"


def test_last_question_flips_onboarding_completed_true():
    app, sb, _ = _build_app()
    client = TestClient(app)
    for body in [
        {"question_key": "intent", "value": "prepare_exam", "skipped": False},
        {"question_key": "weekly_hours_goal", "value": 12, "skipped": False},
        {"question_key": "study_mode", "value": "solo", "skipped": False},
    ]:
        r = client.post("/api/profile/onboarding-answer", json=body)
        assert r.status_code == 200, r.text
    p = _profile(sb)
    assert p["onboarding_completed"] is True
    assert p.get("onboarding_step") is None


def test_anonymous_and_permanent_share_the_same_path():
    # The endpoint should not branch on `is_anonymous` — the flag only
    # matters for downstream gating. Same flow, same writes.
    app, sb, _ = _build_app(is_anonymous=True)
    client = TestClient(app)
    r = client.post(
        "/api/profile/onboarding-answer",
        json={"question_key": "weekly_hours_goal", "value": 8, "skipped": False},
    )
    assert r.status_code == 200, r.text
    assert _profile(sb).get("weekly_hours_goal") == 8.0
    assert r.json()["profile"]["is_anonymous"] is True


def test_onboarding_next_returns_first_question_for_fresh_user():
    app, _, _ = _build_app()
    client = TestClient(app)
    r = client.get("/api/profile/onboarding-next")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["onboarding_completed"] is False
    assert body["next_question"]["question_key"] == "intent"


def test_onboarding_next_returns_completed_when_no_questions_remain():
    app, sb, _ = _build_app()
    # Mark all bank entries as touched.
    p = _profile(sb)
    p["persona_seed"] = {"intent": "x", "weekly_hours_goal": 5, "study_mode": "solo"}
    client = TestClient(app)
    r = client.get("/api/profile/onboarding-next")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["onboarding_completed"] is True
    assert body["next_question"] is None


def test_skip_all_marks_completed_with_deferred_step():
    app, sb, _ = _build_app()
    client = TestClient(app)
    r = client.post("/api/profile/onboarding-skip-all", json={})
    assert r.status_code == 200, r.text
    p = _profile(sb)
    assert p["onboarding_completed"] is True
    assert p["onboarding_step"] == "deferred"
