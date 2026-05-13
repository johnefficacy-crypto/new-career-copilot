"""PR2: tiny-question answers feed into the persona classifier + study policy."""
from __future__ import annotations

from app.persona.classifier import classify_persona
from app.persona.study_policy import derive_study_policy


def _signals(**overrides):
    base = {
        "profile_completeness": 0.5,
        "goal_exams_count": 1,
        "preferred_sectors_count": 0,
        "preferred_states_count": 0,
        "weekly_hours_goal": None,
        "study_mode": None,
        "target_exam_year": None,
        "task_completion_rate_14d": None,
        "missed_task_count_14d": 0,
        "skipped_task_count_14d": 0,
        "focus_minutes_7d": 0,
        "mocks_taken_30d": 0,
        "weekly_review_available": False,
        "persona_question_answers": {},
        "_career_stage": None,
        "_onboarding_completed": False,
        "_total_tasks_14d": 0,
    }
    base.update(overrides)
    return base


# ─── preparation_stage override ────────────────────────────────────────────
def test_preparation_answer_overrides_inferred_stage_to_beginner():
    sig = _signals(persona_question_answers={"preparation_stage_self_assessment": "just_starting"})
    out = classify_persona(sig)
    assert out["dimensions"]["preparation_stage"] == "beginner"


def test_preparation_answer_overrides_to_repeater():
    sig = _signals(persona_question_answers={"preparation_stage_self_assessment": "already_attempted_exam"})
    out = classify_persona(sig)
    assert out["dimensions"]["preparation_stage"] == "repeater"


def test_preparation_answer_overrides_to_restarting_aspirant():
    sig = _signals(persona_question_answers={"preparation_stage_self_assessment": "studied_before_restarting"})
    out = classify_persona(sig)
    assert out["dimensions"]["preparation_stage"] == "restarting_aspirant"


def test_preparation_answer_final_revision_phase():
    sig = _signals(persona_question_answers={"preparation_stage_self_assessment": "final_revision_phase"})
    out = classify_persona(sig)
    assert out["dimensions"]["preparation_stage"] == "final_window_aspirant"


# ─── time_constraint override ──────────────────────────────────────────────
def test_weekday_low_availability_answer_overrides_time_constraint():
    sig = _signals(
        weekly_hours_goal=40,  # would otherwise be high_availability
        persona_question_answers={"weekday_study_availability": "less_than_1_hour"},
    )
    out = classify_persona(sig)
    assert out["dimensions"]["time_constraint"] == "low_availability"


def test_weekday_high_availability_answer():
    sig = _signals(
        weekly_hours_goal=2,  # would otherwise be low_availability
        persona_question_answers={"weekday_study_availability": "4_plus_hours"},
    )
    out = classify_persona(sig)
    assert out["dimensions"]["time_constraint"] == "high_availability"


def test_working_professional_not_overridden_by_weekday_answer():
    sig = _signals(
        study_mode="working_professional",
        persona_question_answers={"weekday_study_availability": "4_plus_hours"},
    )
    out = classify_persona(sig)
    # The stronger study_mode flag wins.
    assert out["dimensions"]["time_constraint"] == "working_professional"


# ─── learning_behavior override ───────────────────────────────────────────
def test_mock_avoid_answer_sets_mock_avoider():
    sig = _signals(persona_question_answers={"mock_behavior": "avoid_mocks"})
    out = classify_persona(sig)
    assert out["dimensions"]["learning_behavior"] == "mock_avoider"


def test_mock_skip_analysis_sets_high_mock_low_review():
    sig = _signals(persona_question_answers={"mock_behavior": "take_mocks_but_skip_analysis"})
    out = classify_persona(sig)
    assert out["dimensions"]["learning_behavior"] == "high_mock_low_review"


def test_revision_rarely_sets_backlog_when_no_stronger_signal():
    sig = _signals(persona_question_answers={"revision_behavior": "rarely"})
    out = classify_persona(sig)
    assert out["dimensions"]["learning_behavior"] == "revision_backlog_heavy"


def test_revision_rarely_does_not_override_mock_avoider():
    sig = _signals(persona_question_answers={
        "mock_behavior": "avoid_mocks",
        "revision_behavior": "rarely",
    })
    out = classify_persona(sig)
    assert out["dimensions"]["learning_behavior"] == "mock_avoider"


# ─── execution_risk override ──────────────────────────────────────────────
def test_phone_distraction_raises_execution_risk_to_medium():
    sig = _signals(persona_question_answers={"study_consistency_blocker": "phone_distraction"})
    out = classify_persona(sig)
    assert out["dimensions"]["execution_risk"] in {"medium", "high"}


# ─── study_policy reacts to preferred_plan_style ─────────────────────────
def test_short_focus_blocks_yields_small_task_size():
    out = derive_study_policy(
        {
            "time_constraint": "standard_availability",
            "preparation_stage": "beginner",
            "learning_behavior": "insufficient_data",
            "execution_risk": "unknown",
            "motivation_state": "stable",
        },
        {"preferred_plan_style": "short_focus_blocks"},
    )
    assert out["preferred_task_size"] == "small"
    assert out["constraints"]["avoid_long_theory_blocks"] is True


def test_weekly_targets_only_caps_max_tasks():
    out = derive_study_policy(
        {
            "time_constraint": "high_availability",
            "preparation_stage": "beginner",
            "learning_behavior": "insufficient_data",
            "execution_risk": "low",
            "motivation_state": "stable",
        },
        {"preferred_plan_style": "weekly_targets_only"},
    )
    assert out["max_tasks_per_day"] <= 3


def test_strict_daily_schedule_sets_flag():
    out = derive_study_policy(
        {
            "time_constraint": "standard_availability",
            "preparation_stage": "beginner",
            "learning_behavior": "insufficient_data",
            "execution_risk": "low",
            "motivation_state": "stable",
        },
        {"preferred_plan_style": "strict_daily_schedule"},
    )
    assert out["constraints"]["strict_daily_schedule"] is True


def test_job_blocker_enables_weekend_catchup():
    out = derive_study_policy(
        {
            "time_constraint": "standard_availability",
            "preparation_stage": "beginner",
            "learning_behavior": "insufficient_data",
            "execution_risk": "low",
            "motivation_state": "stable",
        },
        {"study_consistency_blocker": "job_or_college_schedule"},
    )
    assert out["constraints"]["weekend_catchup_enabled"] is True


# ─── safety: budget_sensitive never inferred ──────────────────────────────
def test_budget_sensitive_still_only_from_explicit_flag_with_answers():
    sig = _signals(
        category="obc",
        persona_question_answers={"preparation_stage_self_assessment": "just_starting"},
    )
    out = classify_persona(sig)
    assert out["dimensions"]["resource_constraint"] == "unknown"
