"""Per-feature readiness cards."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.profile import readiness as readiness_module
from tests.persona_questions._stub import SBStub


def _build_app(db):
    sb = SBStub(db)
    readiness_module.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    fake = {"id": "u-1", "email": "u@example.com", "is_anonymous": False}
    app = FastAPI()
    app.include_router(readiness_module.router, prefix="/api")
    app.dependency_overrides[auth_module.get_current_user] = lambda: fake
    return app


def test_fresh_user_has_everything_locked_with_explicit_missing_fields():
    app = _build_app({"profiles": [{"id": "u-1"}]})
    client = TestClient(app)
    r = client.get("/api/profile/readiness")
    assert r.status_code == 200, r.text
    features = {f["key"]: f for f in r.json()["features"]}
    assert all(not f["unlocked"] for f in features.values())
    assert "date_of_birth" in features["exam_eligibility"]["missing_fields"]
    assert "target_exam" in features["study_community"]["missing_fields"]
    assert "photo_doc" in features["auto_fill_applications"]["missing_fields"]
    assert "weekly_hours_goal" in features["personalized_strategy"]["missing_fields"]


def test_seeded_profile_unlocks_relevant_features_only():
    # weekly_hours_goal now derives from aspirant_preferences.study_hours_per_day.
    db = {
        "profiles": [
            {
                "id": "u-1",
                "full_name": "A",
                "phone": "9",
                "date_of_birth": "2000-01-01",
                "target_exam": "ssc",
            }
        ],
        "aspirant_preferences": [
            {
                "user_id": "u-1",
                "target_exams": ["ssc"],
                "study_mode": "solo",
                "study_hours_per_day": 2.0,
            }
        ],
        "aspirant_location": [{"user_id": "u-1", "state": "Karnataka"}],
        "aspirant_reservations": [{"user_id": "u-1", "category": "general"}],
        "aspirant_documents": [],
    }
    app = _build_app(db)
    client = TestClient(app)
    r = client.get("/api/profile/readiness")
    features = {f["key"]: f for f in r.json()["features"]}
    assert features["exam_eligibility"]["unlocked"] is True
    assert features["study_community"]["unlocked"] is True
    assert features["personalized_strategy"]["unlocked"] is True
    # Documents still missing — that capability stays locked.
    assert features["auto_fill_applications"]["unlocked"] is False
    assert features["auto_fill_applications"]["missing_fields"] == [
        "photo_doc",
        "signature_doc",
        "category_certificate",
    ]


def test_personalized_strategy_locked_when_prefs_lacks_study_hours():
    # Same shape as above minus study_hours_per_day → personalized_strategy
    # must report weekly_hours_goal as missing (no synthesised 0).
    db = {
        "profiles": [
            {
                "id": "u-1",
                "full_name": "A",
                "phone": "9",
                "date_of_birth": "2000-01-01",
                "target_exam": "ssc",
            }
        ],
        "aspirant_preferences": [
            {"user_id": "u-1", "target_exams": ["ssc"], "study_mode": "solo"}
        ],
        "aspirant_location": [{"user_id": "u-1", "state": "Karnataka"}],
        "aspirant_reservations": [{"user_id": "u-1", "category": "general"}],
        "aspirant_documents": [],
    }
    app = _build_app(db)
    r = TestClient(app).get("/api/profile/readiness")
    features = {f["key"]: f for f in r.json()["features"]}
    assert features["personalized_strategy"]["unlocked"] is False
    assert "weekly_hours_goal" in features["personalized_strategy"]["missing_fields"]


def test_empty_string_and_empty_list_count_as_missing_not_present():
    db = {
        "profiles": [
            {"id": "u-1", "full_name": "  ", "phone": "", "date_of_birth": "2000-01-01"}
        ],
        "aspirant_preferences": [{"user_id": "u-1", "target_exams": [], "study_mode": ""}],
        "aspirant_location": [{"user_id": "u-1", "state": "KA"}],
        "aspirant_reservations": [{"user_id": "u-1", "category": "general"}],
    }
    app = _build_app(db)
    features = {f["key"]: f for f in TestClient(app).get("/api/profile/readiness").json()["features"]}
    # exam_eligibility's three fields are all filled → unlocked.
    assert features["exam_eligibility"]["unlocked"] is True
    # target_exam (preferences.target_exams) is an empty list → missing.
    assert "target_exam" in features["study_community"]["missing_fields"]
