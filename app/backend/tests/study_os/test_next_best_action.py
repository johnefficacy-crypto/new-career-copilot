"""Deterministic next-best-action rules (PR3)."""
from __future__ import annotations

from app.study_os.mission_control import _build_next_best_action


def _empty_metrics():
    return {
        "tasks_total": 0,
        "tasks_completed": 0,
        "task_completion_rate": 0,
        "hours_studied_7d": 0.0,
        "hours_planned_week": 0.0,
        "adherence": None,
        "backlog_count": 0,
        "mocks_taken": 0,
    }


def _snapshot(**dims):
    return {
        "dimensions": dims,
        "scores": {},
        "study_policy": {"preferred_task_size": "small"},
    }


def test_rule1_incomplete_task_wins():
    tasks = [
        {"id": "t1", "title": "A", "status": "completed", "done": True},
        {"id": "t2", "title": "B", "status": "planned", "done": False},
    ]
    nba = _build_next_best_action(
        tasks, None, _empty_metrics(), {"total_minutes_7d": 30}, _snapshot(), {}
    )
    assert nba["action_type"] == "study_task"
    assert nba["task_id"] == "t2"


def test_rule2_progressive_question_when_no_tasks():
    nba = _build_next_best_action(
        [],
        {"question_key": "mock_behavior", "question_text": "?", "data_type": "single_select"},
        _empty_metrics(),
        {"total_minutes_7d": 30},
        _snapshot(),
        {},
    )
    assert nba["action_type"] == "progressive_question"
    assert nba["question_key"] == "mock_behavior"


def test_rule5_no_focus_minutes_suggests_focus_session():
    nba = _build_next_best_action(
        [], None, _empty_metrics(), {"total_minutes_7d": 0}, _snapshot(), {}
    )
    assert nba["action_type"] == "focus_session"


def test_rule6_high_mock_low_review_suggests_mock_review():
    snap = _snapshot(learning_behavior="high_mock_low_review")
    nba = _build_next_best_action(
        [], None, _empty_metrics(), {"total_minutes_7d": 60}, snap, {}
    )
    assert nba["action_type"] == "mock_review"


def test_rule3_low_adherence_suggests_focus_block():
    metrics = _empty_metrics()
    metrics["adherence"] = 0.2
    metrics["hours_planned_week"] = 10
    nba = _build_next_best_action(
        [], None, metrics, {"total_minutes_7d": 60}, _snapshot(), {}
    )
    assert nba["action_type"] == "focus_session"


def test_rule4_all_complete_suggests_review():
    tasks = [
        {"id": "t1", "title": "A", "status": "completed", "done": True},
        {"id": "t2", "title": "B", "status": "completed", "done": True},
    ]
    metrics = _empty_metrics()
    metrics["tasks_total"] = 2
    metrics["tasks_completed"] = 2
    metrics["adherence"] = 0.9
    nba = _build_next_best_action(
        tasks, None, metrics, {"total_minutes_7d": 120}, _snapshot(), {}
    )
    assert nba["action_type"] == "weekly_review"


def test_fallback_action_when_no_strong_signal():
    metrics = _empty_metrics()
    metrics["adherence"] = 0.8
    nba = _build_next_best_action(
        [], None, metrics, {"total_minutes_7d": 200}, _snapshot(), {}
    )
    assert nba["action_type"] == "study_plan"
    assert nba["title"]


def test_nba_never_uses_shame_language():
    bad_words = ("lazy", "failure", "weak", "bad student", "shame", "wasted")
    snap = _snapshot(learning_behavior="planner_poor_executor")
    metrics = _empty_metrics()
    metrics["adherence"] = 0.1
    nba = _build_next_best_action(
        [], None, metrics, {"total_minutes_7d": 0}, snap, {}
    )
    blob = " ".join(str(v) for v in nba.values()).lower()
    for w in bad_words:
        assert w not in blob
