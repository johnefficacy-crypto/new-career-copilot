"""PR5: mission-control surfaces verified exam intelligence when present."""
from __future__ import annotations

from app.study_os.mission_control import build_mission_control
from tests.persona_questions._stub import SBStub


def _persona_row():
    return {
        "user_id": "u-1",
        "persona_version": "v1",
        "primary_persona": "beginner_aspirant",
        "dimensions": {
            "discovery_stage": "targeted_exam_aspirant",
            "preparation_stage": "beginner",
            "time_constraint": "standard_availability",
            "learning_behavior": "insufficient_data",
            "execution_risk": "low",
            "motivation_state": "stable",
            "resource_constraint": "unknown",
        },
        "scores": {"profile_completeness": 0.7, "execution": 0.4},
        "study_policy": {"preferred_task_size": "medium"},
        "computed_at": "2026-05-01T00:00:00+00:00",
    }


def test_mission_control_engine_trace_is_not_connected_when_user_has_no_target_exam():
    sb = SBStub({
        "aspirant_persona_snapshots": [_persona_row()],
        "profiles": [{"id": "u-1", "target_exam": None}],
    })
    out = build_mission_control(sb, "u-1")
    intel = out["exam_intelligence"]
    assert intel["available"] is False
    intel_step = next(s for s in out["engine_trace"] if s["label"] == "Exam intelligence")
    assert intel_step["status"] == "not_connected"
    assert "exam_intelligence_not_connected" in out["meta"]["preview_flags"]


def test_mission_control_flips_engine_trace_to_available_with_verified_data():
    sb = SBStub({
        "aspirant_persona_snapshots": [_persona_row()],
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True}
        ],
        "exam_topic_coverage": [
            {"exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 80, "is_high_yield": True,
             "confidence_score": 0.8, "reviewer_status": "locked"}
        ],
        "topics": [
            {"id": "t1", "slug": "p", "name": "Percentages", "level": "topic", "is_active": True, "subject_id": "s1"}
        ],
        "subjects": [{"id": "s1", "name": "Quant", "is_active": True}],
        "pyq_papers": [{"id": "paper-1", "exam_id": "exam-1", "trust_status": "verified"}],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "paper-1", "reviewer_status": "verified"}
        ],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t1", "reviewer_status": "verified", "tag_role": "primary"}
        ],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "exam-1", "reviewer_status": "verified"}
        ],
    })
    out = build_mission_control(sb, "u-1")
    intel = out["exam_intelligence"]
    assert intel["available"] is True
    assert intel["exam_slug"] == "ssc-cgl"
    assert intel["verified_topics"] == 1
    assert intel["verified_pyq_tags"] == 1
    assert intel["verified_syllabus_mentions"] == 1
    intel_step = next(s for s in out["engine_trace"] if s["label"] == "Exam intelligence")
    assert intel_step["status"] == "available"
    assert "SSC CGL" in intel_step["details"]
    # And the preview flag disappears once available.
    assert "exam_intelligence_not_connected" not in out["meta"]["preview_flags"]


def test_mission_control_ignores_unverified_pyq_tags():
    sb = SBStub({
        "aspirant_persona_snapshots": [_persona_row()],
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True}],
        "pyq_papers": [{"id": "paper-1", "exam_id": "exam-1", "trust_status": "verified"}],
        "pyq_questions": [{"id": "q1", "pyq_paper_id": "paper-1", "reviewer_status": "pending"}],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t1", "reviewer_status": "verified", "tag_role": "primary"}
        ],
        # No verified topic coverage, no verified syllabus mentions.
    })
    out = build_mission_control(sb, "u-1")
    intel = out["exam_intelligence"]
    # Tag is verified but question is pending → tag is excluded from count.
    assert intel["verified_pyq_tags"] == 0
    assert intel["available"] is False
    intel_step = next(s for s in out["engine_trace"] if s["label"] == "Exam intelligence")
    assert intel_step["status"] == "not_connected"


def test_mission_control_falls_back_to_preferences_target_exams():
    sb = SBStub({
        "aspirant_persona_snapshots": [_persona_row()],
        "profiles": [{"id": "u-1", "target_exam": None}],
        "aspirant_preferences": [{"user_id": "u-1", "target_exams": ["ssc-cgl"]}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL", "exam_type": "recruitment", "is_active": True}],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "exam-1", "reviewer_status": "verified"}
        ],
    })
    out = build_mission_control(sb, "u-1")
    assert out["exam_intelligence"]["available"] is True
    assert out["exam_intelligence"]["exam_slug"] == "ssc-cgl"
