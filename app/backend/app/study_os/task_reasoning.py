"""Deterministic per-task reasoning strings (PR3).

The reasoning attached to each task is a short, plain-language
explanation derived from:

- persona dimensions (time_constraint, learning_behavior, ...),
- study policy (`preferred_task_size`, constraints),
- task metadata (task_type, planned_minutes, status),
- presence of the active study plan.

No AI. No exam / PYQ / update intelligence claims. When inputs are
missing we return a clearly-marked fallback string so the UI can still
render.
"""
from __future__ import annotations

from typing import Any


_FALLBACK_SUMMARY = (
    "Reasoning metadata is limited. This task comes from your active "
    "study plan."
)


def _user_signal_copy(dimensions: dict[str, Any] | None) -> str | None:
    if not dimensions:
        return None
    time_c = dimensions.get("time_constraint")
    behavior = dimensions.get("learning_behavior")
    if time_c == "working_professional":
        return (
            "Your current signals suggest short, work-friendly study "
            "blocks."
        )
    if time_c == "low_availability":
        return "Your current signals suggest short focused tasks."
    if time_c == "high_availability":
        return "Your current signals support a fuller study window today."
    if behavior == "mock_avoider":
        return (
            "You've been studying without mocks recently — short "
            "retrieval-style tasks help bridge that gap."
        )
    if behavior == "planner_poor_executor":
        return (
            "Recent signals show planned tasks not getting closed — "
            "starting small helps rebuild a streak."
        )
    if behavior == "revision_backlog_heavy":
        return "You have a revision backlog — revision blocks are prioritised."
    if behavior == "high_mock_low_review":
        return (
            "You've taken mocks but the next step is reviewing them — "
            "this task fits that gap."
        )
    return None


def _policy_signal_copy(policy: dict[str, Any] | None) -> str | None:
    if not policy:
        return None
    size = policy.get("preferred_task_size")
    if size == "small":
        return "Preferred task size is small."
    if size == "large":
        return "Preferred task size is large."
    if size == "medium":
        return "Preferred task size is medium."
    return None


def _plan_signal_copy(task: dict[str, Any] | None) -> str | None:
    if not task:
        return None
    task_type = (task.get("task_type") or "").lower()
    if task_type == "revision":
        return "Marked as a revision task in your plan."
    if task_type == "mock_correction":
        return "Marked as a mock correction follow-up."
    if task_type == "retrieval_practice":
        return "Marked as a retrieval practice task."
    if task_type == "concept_learning":
        return "Marked as a concept learning block."
    return None


def _summary_copy(
    task: dict[str, Any] | None,
    user_signal: str | None,
    policy_signal: str | None,
) -> str:
    if not task and not user_signal and not policy_signal:
        return _FALLBACK_SUMMARY
    bits: list[str] = []
    if task and task.get("title"):
        bits.append("This task is from your active study plan.")
    if policy_signal:
        bits.append(policy_signal)
    if user_signal:
        bits.append(user_signal)
    if not bits:
        return _FALLBACK_SUMMARY
    return " ".join(bits)


def build_task_reasoning(
    task: dict[str, Any] | None,
    *,
    dimensions: dict[str, Any] | None = None,
    study_policy: dict[str, Any] | None = None,
    has_active_plan: bool = False,
) -> dict[str, Any]:
    """Return ``{summary, user_signal, study_policy_signal, plan_signal, evidence}``.

    Always returns a dict — never raises. Missing inputs degrade
    gracefully to the fallback summary.
    """
    user_signal = _user_signal_copy(dimensions)
    policy_signal = _policy_signal_copy(study_policy)
    plan_signal = _plan_signal_copy(task)

    evidence: list[str] = []
    if has_active_plan:
        evidence.append("active_study_plan")
    if dimensions:
        evidence.append("persona_snapshot")
    if study_policy:
        evidence.append("study_policy")
    if task and task.get("task_type"):
        evidence.append("task_type_metadata")

    summary = _summary_copy(task, user_signal, policy_signal)

    return {
        "summary": summary,
        "user_signal": user_signal,
        "study_policy_signal": policy_signal,
        "plan_signal": plan_signal,
        "evidence": evidence,
    }
