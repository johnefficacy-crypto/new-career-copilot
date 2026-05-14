"""Deterministic per-task reasoning (PR3)."""
from __future__ import annotations

from app.study_os.task_reasoning import (
    build_task_reasoning,
    build_task_reasoning_detail,
)


def test_reasoning_with_no_inputs_uses_fallback():
    out = build_task_reasoning(None)
    assert "Reasoning metadata is limited" in out["summary"]
    assert out["user_signal"] is None
    assert out["study_policy_signal"] is None
    assert out["plan_signal"] is None
    assert out["evidence"] == []


def test_reasoning_includes_plan_evidence_when_active_plan():
    task = {"id": "t1", "title": "Revise quant", "task_type": "revision"}
    out = build_task_reasoning(
        task,
        dimensions={"time_constraint": "low_availability"},
        study_policy={"preferred_task_size": "small"},
        has_active_plan=True,
    )
    assert "active study plan" in out["summary"]
    assert out["study_policy_signal"] == "Preferred task size is small."
    assert out["user_signal"] == "Your current signals suggest short focused tasks."
    assert out["plan_signal"] == "Marked as a revision task in your plan."
    assert "active_study_plan" in out["evidence"]
    assert "persona_snapshot" in out["evidence"]
    assert "study_policy" in out["evidence"]
    assert "task_type_metadata" in out["evidence"]


def test_reasoning_working_professional_copy():
    out = build_task_reasoning(
        {"id": "t", "title": "Read"},
        dimensions={"time_constraint": "working_professional"},
        study_policy={},
    )
    assert out["user_signal"] is not None and "work" in out["user_signal"].lower()


def test_reasoning_mock_avoider_copy():
    out = build_task_reasoning(
        {"id": "t", "title": "Quant set"},
        dimensions={"learning_behavior": "mock_avoider"},
        study_policy={},
    )
    assert out["user_signal"] is not None and "mock" in out["user_signal"].lower()


def test_reasoning_does_not_claim_exam_intelligence():
    out = build_task_reasoning(
        {"id": "t", "title": "Revise quant", "task_type": "revision"},
        dimensions={"time_constraint": "low_availability"},
        study_policy={"preferred_task_size": "small"},
        has_active_plan=True,
    )
    summary_blob = " ".join(
        [out["summary"], out.get("user_signal") or "", out.get("study_policy_signal") or "", out.get("plan_signal") or ""]
    ).lower()
    for forbidden in ("pyq", "high-yield", "official update", "verified exam"):
        assert forbidden not in summary_blob


# ─── build_task_reasoning_detail (GET /api/study/task-reasoning/:task_id) ──
def test_detail_with_no_inputs_returns_safe_shape():
    out = build_task_reasoning_detail(None)
    assert out["task_id"] is None
    assert out["task_title"] == "Study task"
    r = out["reasoning"]
    assert set(r) == {
        "user_signals", "persona_signals", "exam_signals",
        "update_signals", "planner_action",
    }
    assert r["exam_signals"] == []
    assert r["update_signals"] == []
    assert out["safe_user_copy"]


def test_detail_channels_are_separated():
    task = {
        "id": "t1", "title": "35 min Retrieval Quiz", "task_type": "retrieval_practice",
        "topic": "Percentage", "status": "planned", "planned_minutes": 35,
    }
    out = build_task_reasoning_detail(
        task,
        dimensions={"learning_behavior": "high_mock_low_review"},
        study_policy={"preferred_task_size": "small"},
        exam_context={
            "exam": "SSC CGL",
            "high_yield_topics": [
                {"topic": "Percentage", "priority_score": 84,
                 "confidence_score": 0.78, "status": "locked"},
            ],
        },
    )
    r = out["reasoning"]
    # Exam channel matched the locked topic.
    assert any("Percentage" in s for s in r["exam_signals"])
    # Persona channel carries a safe phrase, not a raw label.
    assert r["persona_signals"]
    blob = " ".join(r["persona_signals"]).lower()
    assert "high_mock_low_review" not in blob
    # User channel has concrete task facts.
    assert any("planned" in s.lower() for s in r["user_signals"])
    assert r["planner_action"] == "retrieval quiz selected over new theory"
    # Evidence includes the locked exam-intelligence entry.
    ei = [e for e in out["evidence"] if e["type"] == "exam_intelligence"]
    assert ei and ei[0]["status"] == "locked" and ei[0]["value"] == 84


def test_detail_unmatched_topic_has_no_exam_signals():
    task = {"id": "t2", "title": "Algebra set", "task_type": "concept_learning",
            "topic": "Algebra", "status": "planned"}
    out = build_task_reasoning_detail(
        task,
        exam_context={
            "exam": "SSC CGL",
            "high_yield_topics": [
                {"topic": "Percentage", "priority_score": 84, "status": "locked"},
            ],
        },
    )
    assert out["reasoning"]["exam_signals"] == []
    assert not any(e["type"] == "exam_intelligence" for e in out["evidence"])
