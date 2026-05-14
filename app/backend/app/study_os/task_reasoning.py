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


# ─── Per-task-id detail (GET /api/study/task-reasoning/:task_id) ───────────
_PLANNER_ACTION = {
    "retrieval_practice": "retrieval quiz selected over new theory",
    "revision": "spaced revision block scheduled",
    "mock_correction": "mock correction prioritized before the next mock",
    "mock_review": "mock review prioritized before the next mock",
    "concept_learning": "concept-learning block scheduled",
}


def _detail_safe_copy(
    task: dict[str, Any], matched_topic: dict[str, Any] | None, task_type: str
) -> str:
    """One-line, aspirant-safe explanation. Never contains persona labels."""
    topic = task.get("topic")
    if matched_topic and task_type == "retrieval_practice":
        return (
            f"This task is prioritized because {topic} is important for your exam "
            "and your recent practice shows it needs recall work."
        )
    if matched_topic:
        return f"This task focuses on {topic}, a verified priority topic for your exam."
    if task_type == "revision":
        return "This revision task is scheduled to keep earlier topics fresh."
    if task_type in {"mock_correction", "mock_review"}:
        return (
            "This task is prioritized so mistakes from your last mock get resolved "
            "before the next one."
        )
    if topic:
        return f"This task comes from your active study plan and focuses on {topic}."
    return "This task comes from your active study plan."


def build_task_reasoning_detail(
    task: dict[str, Any] | None,
    *,
    dimensions: dict[str, Any] | None = None,
    study_policy: dict[str, Any] | None = None,
    exam_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure builder for the standalone task-reasoning endpoint.

    Splits reasoning into four independent channels —
    ``user_signals`` (progress facts), ``persona_signals`` (safe phrases,
    never raw dimension labels), ``exam_signals`` (verified/locked topics
    only), ``update_signals`` — plus a ``planner_action`` string, an
    ``evidence`` list, and a single aspirant-safe ``safe_user_copy``.

    Always returns a dict — never raises.
    """
    task = task or {}
    dimensions = dimensions or {}
    study_policy = study_policy or {}
    exam_context = exam_context or {}

    task_type = (task.get("task_type") or "").lower()
    topic = task.get("topic")
    status = (task.get("status") or "planned").lower()

    # exam signals — match the task topic against verified/locked topics only.
    matched_topic: dict[str, Any] | None = None
    for t in exam_context.get("high_yield_topics") or []:
        t_topic = t.get("topic")
        if topic and t_topic and str(t_topic).strip().lower() == str(topic).strip().lower():
            matched_topic = t
            break
    exam_signals: list[str] = []
    if matched_topic:
        exam = exam_context.get("exam")
        suffix = f" for {exam}" if exam else ""
        exam_signals.append(
            f"{matched_topic.get('topic')} is a verified priority topic{suffix}."
        )

    # persona signals — safe phrases only, never raw dimension labels.
    persona_signals: list[str] = []
    size = study_policy.get("preferred_task_size")
    if size:
        persona_signals.append(f"Your study policy favors {size} study blocks.")
    constraints = study_policy.get("constraints") or {}
    if constraints.get("require_mock_review_before_next_mock") and task_type in {
        "mock_correction",
        "mock_review",
    }:
        persona_signals.append("A mock review is required before your next full mock.")
    if not persona_signals:
        persona_signals.append("This task fits your current study policy.")

    # user signals — concrete progress facts about the task.
    user_signals: list[str] = [f"This task is currently {status}."]
    planned = task.get("planned_minutes") or task.get("duration_mins")
    if planned:
        user_signals.append(f"Planned for about {planned} minutes.")

    update_signals: list[str] = []

    planner_action = _PLANNER_ACTION.get(
        task_type, "task scheduled from your active study plan"
    )

    evidence: list[dict[str, Any]] = [
        {"type": "task", "label": "Task type", "value": task_type or "unspecified"}
    ]
    if size:
        evidence.append(
            {"type": "persona", "label": "Preferred task size", "value": size}
        )
    if matched_topic:
        evidence.append(
            {
                "type": "exam_intelligence",
                "label": "Topic priority score",
                "value": matched_topic.get("priority_score"),
                "status": matched_topic.get("status") or "locked",
            }
        )

    return {
        "task_id": task.get("id"),
        "task_title": (
            task.get("title")
            or task.get("topic")
            or task.get("subject")
            or "Study task"
        ),
        "task_type": task.get("task_type"),
        "reasoning": {
            "user_signals": user_signals,
            "persona_signals": persona_signals,
            "exam_signals": exam_signals,
            "update_signals": update_signals,
            "planner_action": planner_action,
        },
        "evidence": evidence,
        "safe_user_copy": _detail_safe_copy(task, matched_topic, task_type),
    }
