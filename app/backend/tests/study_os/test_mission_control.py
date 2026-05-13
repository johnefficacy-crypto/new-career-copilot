"""End-to-end-ish tests for build_mission_control (PR3).

Uses the in-memory Supabase stub created in PR2 (tests/persona_questions/_stub).
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.study_os.mission_control import build_mission_control
from tests.persona_questions._stub import SBStub


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def _snapshot_row(user_id="u-1", **overrides):
    base = {
        "user_id": user_id,
        "persona_version": "v1",
        "primary_persona": "beginner_aspirant",
        "dimensions": {
            "discovery_stage": "targeted_exam_aspirant",
            "preparation_stage": "beginner",
            "time_constraint": "low_availability",
            "learning_behavior": "insufficient_data",
            "execution_risk": "low",
            "motivation_state": "stable",
            "resource_constraint": "unknown",
        },
        "scores": {"profile_completeness": 0.7, "execution": 0.4},
        "study_policy": {
            "daily_minutes_target": 45,
            "max_tasks_per_day": 2,
            "preferred_task_size": "small",
            "task_mix": {"concept_learning": 0.5, "retrieval_practice": 0.3, "revision": 0.2, "mock_correction": 0.0},
            "constraints": {
                "weekend_catchup_enabled": True,
                "avoid_long_theory_blocks": True,
                "require_mock_review_before_next_mock": False,
            },
            "nudge_style": "direct_non_shaming",
        },
        "computed_at": "2026-05-01T00:00:00+00:00",
    }
    base.update(overrides)
    return base


def test_mission_control_safe_when_no_persona_snapshot():
    sb = SBStub({})
    out = build_mission_control(sb, "u-1")
    # Endpoint never raises; returns the full shape.
    assert "user_context" in out
    assert "study_policy" in out
    assert "today_tasks" in out
    assert "metrics" in out
    assert "next_best_action" in out
    assert "engine_trace" in out
    # Without persona it still computes a default empty shape.
    assert out["user_context"]["persona_version"] == "v1"


def test_mission_control_uses_existing_persona_snapshot():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert out["study_policy"]["preferred_task_size"] == "small"
    assert out["user_context"]["dimensions"]["preparation_stage"] == "beginner"


def test_mission_control_handles_missing_study_plan():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert out["plan"] is None
    assert out["today_tasks"] == []
    assert "no_active_study_plan" in out["meta"]["preview_flags"]


def test_mission_control_handles_missing_weekly_review():
    # No study_sessions / mock_tests / study_tasks rows.
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    metrics = out["metrics"]
    assert metrics["tasks_total"] == 0
    assert metrics["mocks_taken"] == 0
    assert metrics["backlog_count"] == 0


def test_mission_control_includes_study_policy_block():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert "task_mix" in out["study_policy"]
    assert out["study_policy"]["nudge_style"] == "direct_non_shaming"


def test_incomplete_task_becomes_next_best_action():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "theme": "T", "target": "X"}
        ],
        "study_tasks": [
            {"id": "task-1", "plan_id": "plan-1", "title": "Revise quant",
             "task_type": "revision", "status": "planned", "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    nba = out["next_best_action"]
    assert nba["action_type"] == "study_task"
    assert nba["task_id"] == "task-1"


def test_progressive_question_becomes_next_best_action_when_no_tasks():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "persona_question_bank": [
            {
                "question_key": "mock_behavior",
                "question_text": "How do you handle mocks?",
                "data_type": "single_select",
                "options": [{"value": "avoid_mocks", "label": "Avoid"}],
                "priority": 50,
                "target_dimension": "learning_behavior",
                "is_active": True,
            }
        ],
    })
    out = build_mission_control(sb, "u-1")
    nba = out["next_best_action"]
    assert nba["action_type"] == "progressive_question"
    assert nba.get("question_key") == "mock_behavior"


def test_next_best_action_falls_through_to_focus_when_no_focus_minutes():
    # Has a plan with no scheduled-today tasks and no progressive question.
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "theme": "T", "target": "X"}
        ],
        "study_tasks": [],
        "persona_question_bank": [],
    })
    out = build_mission_control(sb, "u-1")
    nba = out["next_best_action"]
    assert nba["action_type"] in {"focus_session", "study_plan"}


def test_task_reasoning_is_attached_to_each_task():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "theme": "T", "target": "X"}
        ],
        "study_tasks": [
            {"id": "task-1", "plan_id": "plan-1", "title": "Revise quant",
             "task_type": "revision", "status": "planned", "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    assert out["today_tasks"][0]["reasoning"]["summary"]
    assert "active_study_plan" in out["today_tasks"][0]["reasoning"]["evidence"]


def test_task_reasoning_falls_back_when_metadata_missing():
    sb = SBStub({
        "aspirant_persona_snapshots": [],  # no persona
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "theme": "T", "target": "X"}
        ],
        "study_tasks": [
            {"id": "task-1", "plan_id": "plan-1", "title": "Untitled",
             "task_type": None, "status": "planned", "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    reasoning = out["today_tasks"][0]["reasoning"]
    # The mission_control auto-computes a persona snapshot on first read
    # via compute_persona_snapshot, so we get *some* user signal copy or
    # the explicit fallback string.
    assert reasoning["summary"]


def test_engine_trace_marks_exam_intelligence_not_connected():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    labels = {step["label"]: step for step in out["engine_trace"]}
    assert "Exam intelligence" in labels
    assert labels["Exam intelligence"]["status"] == "not_connected"


def test_no_fake_exam_intelligence_in_response():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    # Stringify the entire response and assert no forbidden phrases.
    import json
    blob = json.dumps(out).lower()
    for forbidden in ("pyq", "high-yield", "official update", "verified exam", "exam intelligence updated"):
        assert forbidden not in blob


def test_meta_preview_flags_marked():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert "exam_intelligence_not_connected" in out["meta"]["preview_flags"]


def test_truth_panel_summary_reflects_today_completion():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [{"id": "p1", "user_id": "u-1", "status": "active"}],
        "study_tasks": [
            {"id": "t1", "plan_id": "p1", "title": "A", "status": "completed",
             "scheduled_date": _today(), "completed_at": _today()},
            {"id": "t2", "plan_id": "p1", "title": "B", "status": "planned",
             "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    summary = out["truth_panel"]["summary"]
    assert "1 of 2" in summary
