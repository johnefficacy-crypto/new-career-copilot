"""Persona-derived Study OS policy (v1).

This module converts persona dimensions into a minimal Study OS policy
payload. The Study OS UI is NOT changed in PR1 — this layer only computes
the policy and stores it inside the persona snapshot. Future PRs will
consume `study_policy` from the latest snapshot.

The policy is deliberately conservative: small daily targets, gentle
non-shaming nudges, and explicit constraints rather than implicit copy
changes.
"""
from __future__ import annotations

from typing import Any

NUDGE_STYLE = "direct_non_shaming"


def _base_targets(time_constraint: str) -> tuple[int, int, str]:
    """Return (daily_minutes_target, max_tasks_per_day, preferred_task_size)."""
    if time_constraint == "low_availability":
        return 45, 2, "small"
    if time_constraint == "working_professional":
        return 60, 3, "small"
    if time_constraint == "high_availability":
        return 240, 6, "medium"
    if time_constraint == "standard_availability":
        return 120, 4, "medium"
    return 90, 3, "medium"


def _base_task_mix(preparation: str) -> dict[str, float]:
    if preparation == "beginner":
        return {
            "concept_learning": 0.55,
            "retrieval_practice": 0.20,
            "revision": 0.15,
            "mock_correction": 0.10,
        }
    if preparation == "intermediate":
        return {
            "concept_learning": 0.30,
            "retrieval_practice": 0.30,
            "revision": 0.25,
            "mock_correction": 0.15,
        }
    if preparation in {"repeater", "final_window_aspirant"}:
        return {
            "concept_learning": 0.15,
            "retrieval_practice": 0.30,
            "revision": 0.30,
            "mock_correction": 0.25,
        }
    return {
        "concept_learning": 0.40,
        "retrieval_practice": 0.25,
        "revision": 0.20,
        "mock_correction": 0.15,
    }


def _normalize(mix: dict[str, float]) -> dict[str, float]:
    total = sum(mix.values()) or 1.0
    return {k: round(v / total, 3) for k, v in mix.items()}


def derive_study_policy(
    dimensions: dict[str, str] | None,
    answers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure function: persona dimensions (+ tiny-question answers) -> Study OS policy."""
    dims = dimensions or {}
    answers = answers or {}
    time_constraint = dims.get("time_constraint") or "unknown"
    preparation = dims.get("preparation_stage") or "unknown"
    behavior = dims.get("learning_behavior") or "insufficient_data"
    motivation = dims.get("motivation_state") or "unknown"
    execution_risk = dims.get("execution_risk") or "unknown"

    daily_minutes, max_tasks, task_size = _base_targets(time_constraint)
    task_mix = _base_task_mix(preparation)

    weekend_catchup = time_constraint in {"working_professional", "low_availability"}
    avoid_long_theory = time_constraint in {"low_availability", "working_professional"} or (
        behavior == "planner_poor_executor"
    )
    require_mock_review_before_next_mock = behavior == "high_mock_low_review"

    # Working-professional / family-responsibilities blockers also flip
    # weekend catchup on. We keep this explicit so it's auditable.
    blocker = answers.get("study_consistency_blocker")
    if blocker in {"job_or_college_schedule", "family_responsibilities"}:
        weekend_catchup = True

    # Behaviour-specific adjustments. These keep the policy conservative
    # rather than aspirational — non-shaming nudges, not heroics.
    if behavior == "planner_poor_executor":
        max_tasks = max(1, max_tasks - 1)
        task_size = "small"
        # Reduce concept blocks, lean on short retrieval to rebuild streak.
        task_mix["concept_learning"] = task_mix.get("concept_learning", 0.0) * 0.6
        task_mix["retrieval_practice"] = task_mix.get("retrieval_practice", 0.0) + 0.15
    if behavior == "mock_avoider":
        # Make sure the mix surfaces retrieval/mock practice meaningfully.
        task_mix["retrieval_practice"] = max(task_mix.get("retrieval_practice", 0.0), 0.30)
        task_mix["mock_correction"] = max(task_mix.get("mock_correction", 0.0), 0.10)
    if behavior == "high_mock_low_review":
        task_mix["mock_correction"] = max(task_mix.get("mock_correction", 0.0), 0.30)
    if behavior == "revision_backlog_heavy":
        task_mix["revision"] = max(task_mix.get("revision", 0.0), 0.40)
        task_mix["concept_learning"] = task_mix.get("concept_learning", 0.0) * 0.5

    if execution_risk == "high":
        max_tasks = max(1, max_tasks - 1)
        task_size = "small"
    if motivation == "deadline_sensitive":
        # Lean retrieval + mock correction, keep theory short.
        task_mix["retrieval_practice"] = task_mix.get("retrieval_practice", 0.0) + 0.10
        task_mix["mock_correction"] = task_mix.get("mock_correction", 0.0) + 0.10
        avoid_long_theory = True

    # PR2: preferred_plan_style answer overrides for task shape.
    plan_style = answers.get("preferred_plan_style")
    strict_daily_schedule = False
    if plan_style == "short_focus_blocks":
        task_size = "small"
        avoid_long_theory = True
    elif plan_style == "weekly_targets_only":
        # Avoid too many daily microtasks; keep the day's surface small.
        max_tasks = min(max_tasks, 3)
        task_size = "medium" if task_size != "small" else task_size
    elif plan_style == "strict_daily_schedule":
        strict_daily_schedule = True
    elif plan_style == "flexible_task_list":
        strict_daily_schedule = False

    return {
        "daily_minutes_target": daily_minutes,
        "max_tasks_per_day": max_tasks,
        "preferred_task_size": task_size,
        "task_mix": _normalize(task_mix),
        "constraints": {
            "weekend_catchup_enabled": bool(weekend_catchup),
            "avoid_long_theory_blocks": bool(avoid_long_theory),
            "require_mock_review_before_next_mock": bool(require_mock_review_before_next_mock),
            "strict_daily_schedule": bool(strict_daily_schedule),
        },
        "nudge_style": NUDGE_STYLE,
    }
