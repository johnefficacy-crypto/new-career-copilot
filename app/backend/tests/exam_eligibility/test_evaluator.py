"""Pure-function unit tests for the exam eligibility evaluator (PR-D1)."""
from __future__ import annotations

from datetime import date

from app.exam_eligibility.evaluator import (
    evaluate_exam_for_user,
    summarize_user_eligibility,
)
from tests.persona_questions._stub import SBStub


# ── Pure evaluator ────────────────────────────────────────────────────────


def _upsc_rules() -> list[dict]:
    """A trimmed-down UPSC CSE rule set covering all of the evaluator's
    branches: age min/max with category scopes, education_min_level,
    nationality, attempts_max."""
    return [
        {"scope": "all",     "rule_type": "age_min",             "value_num": 21, "value_text": None, "is_knockout": True},
        {"scope": "general", "rule_type": "age_max",             "value_num": 32, "value_text": None, "is_knockout": True},
        {"scope": "obc",     "rule_type": "age_max",             "value_num": 35, "value_text": None, "is_knockout": True},
        {"scope": "sc",      "rule_type": "age_max",             "value_num": 37, "value_text": None, "is_knockout": True},
        {"scope": "pwd",     "rule_type": "age_max",             "value_num": 42, "value_text": None, "is_knockout": True},
        {"scope": "all",     "rule_type": "education_min_level", "value_num": None, "value_text": "graduation", "is_knockout": True},
        {"scope": "all",     "rule_type": "nationality",         "value_num": None, "value_text": "Indian",     "is_knockout": True},
        {"scope": "general", "rule_type": "attempts_max",        "value_num": 6,  "value_text": None, "is_knockout": True},
    ]


REF = date(2026, 1, 1)


def test_complete_profile_passes_all_rules():
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "2000-01-01",  # 26 years old on REF
            "category": "general",
            "nationality": "Indian",
            "education_level": "graduation",
            "attempts_used": 0,
        },
        reference_date=REF,
    )
    assert result["status"] == "eligible"
    assert result["reasons"] == []
    assert result["missing_fields"] == []


def test_missing_dob_is_conditional_not_failure():
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "category": "general",
            "nationality": "Indian",
            "education_level": "graduation",
        },
        reference_date=REF,
    )
    assert result["status"] == "conditional"
    assert "date_of_birth" in result["missing_fields"]


def test_over_age_general_user_is_not_eligible():
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "1985-01-01",  # 41 on REF
            "category": "general",
            "nationality": "Indian",
            "education_level": "graduation",
        },
        reference_date=REF,
    )
    assert result["status"] == "not_eligible"
    assert any("at most 32" in r for r in result["reasons"])


def test_category_relaxation_picks_obc_scope():
    """A 34-year-old OBC user fails the general age cap but passes the OBC one."""
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "1991-06-01",  # 34 on REF
            "category": "obc",
            "nationality": "Indian",
            "education_level": "graduation",
        },
        reference_date=REF,
    )
    assert result["status"] == "eligible"


def test_pwd_overrides_category():
    """PWD scope is more lenient than category — the evaluator must
    prefer it over the user's reservation category."""
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "1985-01-01",  # 41 on REF
            "category": "general",
            "pwbd_status": "visual",
            "nationality": "Indian",
            "education_level": "graduation",
        },
        reference_date=REF,
    )
    assert result["status"] == "eligible"


def test_education_below_required_fails():
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "2000-01-01",
            "category": "general",
            "nationality": "Indian",
            "education_level": "12th",
        },
        reference_date=REF,
    )
    assert result["status"] == "not_eligible"
    assert any("graduation" in r for r in result["reasons"])


def test_under_age_min_fails():
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "2010-01-01",  # 16 on REF
            "category": "general",
            "nationality": "Indian",
            "education_level": "graduation",
        },
        reference_date=REF,
    )
    assert result["status"] == "not_eligible"
    assert any("at least 21" in r for r in result["reasons"])


def test_wrong_nationality_fails():
    result = evaluate_exam_for_user(
        _upsc_rules(),
        {
            "date_of_birth": "2000-01-01",
            "category": "general",
            "nationality": "American",
            "education_level": "graduation",
        },
        reference_date=REF,
    )
    assert result["status"] == "not_eligible"
    assert any("indian" in r.lower() for r in result["reasons"])


def test_attempts_exceeded_fails_only_for_user_with_data():
    profile = {
        "date_of_birth": "2000-01-01",
        "category": "general",
        "nationality": "Indian",
        "education_level": "graduation",
    }
    # No attempts_used in profile — rule cannot fire, user stays eligible.
    assert evaluate_exam_for_user(_upsc_rules(), profile, reference_date=REF)["status"] == "eligible"

    profile_with = {**profile, "attempts_used": 6}
    out = evaluate_exam_for_user(_upsc_rules(), profile_with, reference_date=REF)
    assert out["status"] == "not_eligible"
    assert any("attempts" in r for r in out["reasons"])


def test_no_rules_returns_unknown():
    out = evaluate_exam_for_user([], {"date_of_birth": "2000-01-01"}, reference_date=REF)
    assert out["status"] == "unknown"


def test_unknown_when_no_profile_data_matches_any_rule():
    """Rule list exists but the profile carries no data the rules read.
    The result is ``conditional`` because every applicable rule asked for
    a field that's missing — not ``unknown`` (we have rules to check)."""
    out = evaluate_exam_for_user(_upsc_rules(), {}, reference_date=REF)
    assert out["status"] == "conditional"
    assert set(out["missing_fields"]) >= {"date_of_birth", "education_level", "nationality"}


# ── DB-aware summary ──────────────────────────────────────────────────────


EXAM_A = "11111111-1111-4111-8111-111111111111"
EXAM_B = "22222222-2222-4222-8222-222222222222"


def _summary_world():
    return {
        "profiles": [
            {
                "id": "u-1",
                "date_of_birth": "2000-01-01",
                "category": "general",
                "pwbd_status": "none",
                "nationality": "Indian",
                "gender": None,
                "ex_serviceman": False,
                "govt_employee": False,
            }
        ],
        "aspirant_education": [
            {"user_id": "u-1", "level": "graduation", "is_completed": True},
        ],
        "exams": [
            {"id": EXAM_A, "slug": "ssc-cgl", "name": "SSC CGL", "is_active": True, "exam_family_id": None},
            {"id": EXAM_B, "slug": "upsc-cse", "name": "UPSC CSE", "is_active": True, "exam_family_id": None},
        ],
        "exam_eligibility_rules": [
            # SSC CGL — minimal but passing for our seeded user.
            {"id": "r1", "exam_id": EXAM_A, "scope": "all",     "rule_type": "age_min",             "value_num": 18,   "value_text": None,         "is_knockout": True, "reviewer_status": "verified"},
            {"id": "r2", "exam_id": EXAM_A, "scope": "general", "rule_type": "age_max",             "value_num": 32,   "value_text": None,         "is_knockout": True, "reviewer_status": "verified"},
            {"id": "r3", "exam_id": EXAM_A, "scope": "all",     "rule_type": "education_min_level", "value_num": None, "value_text": "graduation", "is_knockout": True, "reviewer_status": "verified"},
            {"id": "r4", "exam_id": EXAM_A, "scope": "all",     "rule_type": "nationality",         "value_num": None, "value_text": "Indian",     "is_knockout": True, "reviewer_status": "verified"},
            # UPSC — same shape but stricter age max so the user passes too.
            {"id": "r5", "exam_id": EXAM_B, "scope": "all",     "rule_type": "age_min",             "value_num": 21,   "value_text": None,         "is_knockout": True, "reviewer_status": "verified"},
            {"id": "r6", "exam_id": EXAM_B, "scope": "general", "rule_type": "age_max",             "value_num": 32,   "value_text": None,         "is_knockout": True, "reviewer_status": "verified"},
            {"id": "r7", "exam_id": EXAM_B, "scope": "all",     "rule_type": "education_min_level", "value_num": None, "value_text": "graduation", "is_knockout": True, "reviewer_status": "verified"},
            {"id": "r8", "exam_id": EXAM_B, "scope": "all",     "rule_type": "nationality",         "value_num": None, "value_text": "Indian",     "is_knockout": True, "reviewer_status": "verified"},
        ],
    }


def test_summary_buckets_eligible_exams_for_complete_profile():
    sb = SBStub(_summary_world())
    out = summarize_user_eligibility(sb, "u-1")
    eligible_slugs = sorted(item["slug"] for item in out["eligible"])
    assert eligible_slugs == ["ssc-cgl", "upsc-cse"]
    assert out["not_eligible"] == []
    assert out["conditional"] == []
    assert out["rule_count"] == 8


def test_summary_uses_education_from_aspirant_education_join():
    world = _summary_world()
    world["aspirant_education"] = [
        {"user_id": "u-1", "level": "12th", "is_completed": True}
    ]
    sb = SBStub(world)
    out = summarize_user_eligibility(sb, "u-1")
    # Both seeded exams require graduation — both must move to not_eligible.
    assert out["eligible"] == []
    assert len(out["not_eligible"]) == 2


def test_summary_partial_profile_lands_in_conditional():
    world = _summary_world()
    world["profiles"][0]["date_of_birth"] = None
    world["aspirant_education"] = []
    sb = SBStub(world)
    out = summarize_user_eligibility(sb, "u-1")
    assert out["eligible"] == []
    assert out["not_eligible"] == []
    assert len(out["conditional"]) == 2
    # Reasons stay empty; missing_fields lists what we'd need.
    for item in out["conditional"]:
        assert "date_of_birth" in item["missing_fields"]
        assert "education_level" in item["missing_fields"]


def test_summary_only_picks_verified_rules():
    world = _summary_world()
    # Flip every UPSC rule to draft so the exam appears with no rules.
    for r in world["exam_eligibility_rules"]:
        if r["exam_id"] == EXAM_B:
            r["reviewer_status"] = "draft"
    sb = SBStub(world)
    out = summarize_user_eligibility(sb, "u-1")
    # SSC stays eligible; UPSC is omitted entirely (no verified rules → no signal).
    assert [item["slug"] for item in out["eligible"]] == ["ssc-cgl"]
    all_slugs = {
        item["slug"]
        for bucket in ("eligible", "conditional", "not_eligible", "unknown")
        for item in out[bucket]
    }
    assert "upsc-cse" not in all_slugs
