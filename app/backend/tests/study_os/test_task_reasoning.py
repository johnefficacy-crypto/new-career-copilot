"""Deterministic per-task reasoning (PR3)."""
from __future__ import annotations

from app.study_os.task_reasoning import build_task_reasoning


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
