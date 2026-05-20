"""StudyHome adopts /api/study/mission-control as its source of truth.

This pins the response keys StudyHome.jsx reads so a backend refactor
can't silently drop a field the page depends on. StudyHome reads:
  - plan                       (ActivePlanCard title + Open-plan link)
  - today_tasks                (ActivePlanCard count + NextActionCard)
  - focus.total_hours_7d       (FocusCard "Last 7 days")
  - focus.week                 (FocusCard per-day breakdown)
  - exam_context               (consumed by study cards)
  - competition_context        (consumed by study cards)
  - plan_reasoning             (consumed by reasoning panels)
The weekly report card is intentionally NOT in this contract — StudyHome
fetches it separately.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.study_os.mission_control import build_mission_control
from tests.persona_questions._stub import SBStub
from tests.study_os.test_mission_control import _snapshot_row


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


# Keys StudyHome.jsx reads off the mission-control response.
_STUDYHOME_TOP_LEVEL_KEYS = {
    "plan",
    "today_tasks",
    "focus",
    "exam_context",
    "competition_context",
    "plan_reasoning",
}


def test_mission_control_carries_every_key_studyhome_reads():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    missing = _STUDYHOME_TOP_LEVEL_KEYS - set(out.keys())
    assert not missing, f"mission-control dropped keys StudyHome needs: {missing}"


def test_mission_control_focus_block_has_hours_and_week():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    focus = out["focus"]
    assert "total_hours_7d" in focus
    # Per-day breakdown — 7 entries oldest→newest, each {date, minutes}.
    assert isinstance(focus["week"], list)
    assert len(focus["week"]) == 7
    for day in focus["week"]:
        assert "date" in day
        assert "minutes" in day


def test_mission_control_focus_week_sums_completed_sessions_for_today():
    today = _today()
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_sessions": [
            {
                "user_id": "u-1",
                "duration_mins": 30,
                "started_at": f"{today}T09:00:00+00:00",
                "ended_at": f"{today}T09:30:00+00:00",
            },
            {
                "user_id": "u-1",
                "duration_mins": 15,
                "started_at": f"{today}T11:00:00+00:00",
                "ended_at": f"{today}T11:15:00+00:00",
            },
            # Active (no ended_at) — must not count toward minutes.
            {
                "user_id": "u-1",
                "duration_mins": 99,
                "started_at": f"{today}T13:00:00+00:00",
                "ended_at": None,
            },
        ],
    })
    out = build_mission_control(sb, "u-1")
    week = out["focus"]["week"]
    today_row = next((d for d in week if d["date"] == today), None)
    assert today_row is not None
    assert today_row["minutes"] == 45  # 30 + 15; the active session excluded
    assert out["focus"]["total_hours_7d"] == 0.75


def test_mission_control_plan_block_shape_is_studyhome_compatible():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {
                "id": "plan-1",
                "user_id": "u-1",
                "status": "active",
                "target_exam": "ssc-cgl",
                "metadata": {"theme": "Adaptive", "target": "Cover locked topics"},
            }
        ],
    })
    out = build_mission_control(sb, "u-1")
    plan = out["plan"]
    assert plan is not None
    # ActivePlanCard title falls back to plan.target — must be present.
    assert plan.get("target")
    # today_tasks is the array ActivePlanCard counts + NextActionCard scans.
    assert isinstance(out["today_tasks"], list)
