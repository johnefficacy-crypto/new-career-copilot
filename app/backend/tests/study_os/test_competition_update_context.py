"""Competition + policy-update context helpers and mission-control wiring."""
from __future__ import annotations

from app.study_os.competition_context import competition_context
from app.study_os.mission_control import build_mission_control
from app.study_os.update_context import policy_update_context
from tests.persona_questions._stub import SBStub


# ─── competition_context ──────────────────────────────────────────────────
def test_competition_context_empty_without_exam():
    out = competition_context(SBStub({}), None)
    assert out["available"] is False
    assert out["cycle_pressure"]["pressure_level"] == "unknown"


def test_competition_context_ignores_unreviewed_rows():
    sb = SBStub({
        "exam_competition_metrics": [
            {"id": "cm1", "exam_id": "e1", "reviewer_status": "draft",
             "competition_pressure_score": 90, "created_at": "2026-05-01"},
            {"id": "cm2", "exam_id": "e1", "reviewer_status": "pending_review",
             "competition_pressure_score": 80, "created_at": "2026-05-02"},
        ],
    })
    out = competition_context(sb, "e1")
    assert out["available"] is False


def test_competition_context_prefers_locked_and_derives_pressure():
    sb = SBStub({
        "exam_competition_metrics": [
            {"id": "cm1", "exam_id": "e1", "reviewer_status": "reviewed",
             "competition_pressure_score": 20, "vacancy_total": 100,
             "selection_ratio": 0.01, "created_at": "2026-05-03"},
            {"id": "cm2", "exam_id": "e1", "reviewer_status": "locked",
             "competition_pressure_score": 70, "vacancy_total": 17727,
             "vacancy_by_category": {"UR": 7500}, "applicant_count": 2400000,
             "selection_ratio": 0.0073, "created_at": "2026-05-01"},
        ],
    })
    out = competition_context(sb, "e1", days_remaining=120)
    # Locked row wins over the more-recent reviewed row.
    assert out["available"] is True
    assert out["vacancy_total"] == 17727
    assert out["trust"]["reviewer_status"] == "locked"
    # score 70 → high; far exam date keeps it at high.
    assert out["cycle_pressure"]["pressure_level"] == "high"
    assert out["cycle_pressure"]["days_remaining"] == 120


def test_competition_context_near_exam_bumps_pressure_bucket():
    sb = SBStub({
        "exam_competition_metrics": [
            {"id": "cm1", "exam_id": "e1", "reviewer_status": "locked",
             "competition_pressure_score": 40, "created_at": "2026-05-01"},
        ],
    })
    far = competition_context(sb, "e1", days_remaining=120)
    near = competition_context(sb, "e1", days_remaining=20)
    assert far["cycle_pressure"]["pressure_level"] == "medium"
    assert near["cycle_pressure"]["pressure_level"] == "high"


# ─── policy_update_context ────────────────────────────────────────────────
def test_policy_update_context_empty_without_exam():
    out = policy_update_context(SBStub({}), None)
    assert out["official_updates"] == []
    assert out["needs_verification"] == []
    assert out["affects_plan"] is False


def test_policy_update_context_splits_official_and_discovery():
    sb = SBStub({
        "exam_policy_updates": [
            {"id": "u1", "exam_id": "e1", "update_type": "vacancy_change",
             "title": "Vacancies revised", "source_type": "official",
             "reviewer_status": "verified", "affects_plan": True,
             "affects_vacancy": True, "published_at": "2026-05-12"},
            {"id": "u2", "exam_id": "e1", "update_type": "date_change",
             "title": "Possible date update", "source_type": "aggregator",
             "reviewer_status": "pending"},
            {"id": "u3", "exam_id": "e1", "update_type": "notification_change",
             "title": "Pending official notice", "source_type": "official",
             "reviewer_status": "pending", "affects_plan": True},
            {"id": "u4", "exam_id": "e1", "update_type": "other",
             "title": "Rejected rumor", "source_type": "research",
             "reviewer_status": "rejected"},
        ],
    })
    out = policy_update_context(sb, "e1")
    official_ids = {u["id"] for u in out["official_updates"]}
    discovery_ids = {u["id"] for u in out["needs_verification"]}
    # Only the verified official row is official + drives affects_*.
    assert official_ids == {"u1"}
    assert out["affects_plan"] is True
    assert out["affects_vacancy"] is True
    # Aggregator pending row is surfaced as discovery; can never affect plan.
    assert discovery_ids == {"u2"}
    assert all(u["can_affect_plan"] is False for u in out["needs_verification"])
    # Pending official + rejected research rows are dropped entirely.
    assert "u3" not in official_ids and "u3" not in discovery_ids
    assert "u4" not in discovery_ids


# ─── mission-control wiring ───────────────────────────────────────────────
def _persona_row():
    return {
        "user_id": "u-1",
        "persona_version": "v1",
        "primary_persona": "beginner_aspirant",
        "dimensions": {"time_constraint": "standard_availability"},
        "scores": {"execution": 0.4},
        "study_policy": {"preferred_task_size": "medium"},
        "computed_at": "2026-05-01T00:00:00+00:00",
    }


def test_mission_control_exposes_competition_and_policy_blocks():
    sb = SBStub({
        "aspirant_persona_snapshots": [_persona_row()],
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
                   "exam_type": "recruitment", "is_active": True}],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "exam-1", "reviewer_status": "verified"}
        ],
        "exam_competition_metrics": [
            {"id": "cm1", "exam_id": "exam-1", "reviewer_status": "locked",
             "competition_pressure_score": 75, "vacancy_total": 17727,
             "created_at": "2026-05-01"},
        ],
        "exam_policy_updates": [
            {"id": "u1", "exam_id": "exam-1", "update_type": "vacancy_change",
             "title": "Vacancies revised", "source_type": "official",
             "reviewer_status": "verified", "affects_plan": True,
             "affects_vacancy": True, "published_at": "2026-05-12"},
        ],
    })
    out = build_mission_control(sb, "u-1")

    comp = out["competition_context"]
    assert comp["available"] is True
    assert comp["vacancy_total"] == 17727
    assert comp["cycle_pressure"]["pressure_level"] == "high"

    policy = out["policy_update_context"]
    assert policy["affects_vacancy"] is True
    assert len(policy["official_updates"]) == 1
    # Backward-compatible alias still present and identical.
    assert out["update_context"] == policy

    reason_types = {r["reason_type"] for r in out["plan_reasoning"]}
    assert "competition_pressure" in reason_types
    assert "policy_update" in reason_types


def test_mission_control_competition_block_safe_empty_without_data():
    sb = SBStub({
        "aspirant_persona_snapshots": [_persona_row()],
        "profiles": [{"id": "u-1", "target_exam": None}],
    })
    out = build_mission_control(sb, "u-1")
    assert out["competition_context"]["available"] is False
    assert out["policy_update_context"]["official_updates"] == []
    reason_types = {r["reason_type"] for r in out["plan_reasoning"]}
    assert "competition_pressure" not in reason_types
    assert "policy_update" not in reason_types
