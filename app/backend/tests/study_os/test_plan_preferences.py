"""Follow-up layer — user plan autonomy + event-driven regeneration."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import study_os as study_os_api
from app.core.auth import get_current_user
from app.study_os.plan_preferences import (
    DEFAULT_PREFERENCES,
    focus_weights,
    get_plan_preferences,
    upsert_plan_preferences,
)
from app.study_os.planner import generate_plan
from app.study_os.regen import regenerate_on_signal, regenerate_stale_plans
from tests.persona_questions._stub import SBStub


def _planner_seed() -> dict:
    """exam e1 with three locked topics; t1 well-mastered, t2 weak, t3 fresh."""
    return {
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "e1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "exam_cycles": [{"id": "cyc-1", "exam_id": "e1", "exam_start": "2026-09-15"}],
        "exam_topic_coverage": [
            {"id": "c1", "exam_id": "e1", "exam_cycle_id": "cyc-1", "exam_phase_id": "ph1",
             "topic_id": "t1", "exam_priority_score": 88, "is_high_yield": True,
             "reviewer_status": "locked"},
            {"id": "c2", "exam_id": "e1", "exam_cycle_id": "cyc-1", "exam_phase_id": "ph1",
             "topic_id": "t2", "exam_priority_score": 60, "is_high_yield": False,
             "reviewer_status": "locked"},
            {"id": "c3", "exam_id": "e1", "exam_cycle_id": "cyc-1", "exam_phase_id": "ph1",
             "topic_id": "t3", "exam_priority_score": 50, "is_high_yield": False,
             "reviewer_status": "locked"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "subject_id": "s1", "is_active": True},
            {"id": "t2", "name": "Data Interpretation", "subject_id": "s1", "is_active": True},
            {"id": "t3", "name": "Vocabulary", "subject_id": "s2", "is_active": True},
        ],
        "subjects": [{"id": "s1", "name": "Quant"}, {"id": "s2", "name": "English"}],
        "user_topic_mastery": [
            {"user_id": "u-1", "topic_id": "t1", "exam_id": "e1", "mastery_score": 90},
            {"user_id": "u-1", "topic_id": "t2", "exam_id": "e1", "mastery_score": 10},
        ],
    }


# ─── plan_preferences module ──────────────────────────────────────────────
def test_get_preferences_defaults_when_none_saved():
    out = get_plan_preferences(SBStub({}), "u-1")
    assert out["focus"] == "balanced"
    assert out["auto_regenerate"] is True
    assert out["pinned_topic_ids"] == [] and out["muted_topic_ids"] == []


def test_upsert_inserts_then_updates():
    sb = SBStub({})
    upsert_plan_preferences(sb, "u-1", focus="weak_areas", max_tasks_per_day=2)
    assert len(sb.db["user_study_plan_preferences"]) == 1
    out = upsert_plan_preferences(sb, "u-1", preferred_task_size="small")
    # still one row — updated in place
    assert len(sb.db["user_study_plan_preferences"]) == 1
    assert out["focus"] == "weak_areas"
    assert out["max_tasks_per_day"] == 2
    assert out["preferred_task_size"] == "small"


def test_upsert_falls_back_on_invalid_focus():
    sb = SBStub({})
    out = upsert_plan_preferences(sb, "u-1", focus="nonsense")
    # invalid enum value is ignored, not raised
    assert out["focus"] == DEFAULT_PREFERENCES["focus"]


def test_focus_weights_profiles_differ():
    assert focus_weights("weak_areas")["mastery_w"] > focus_weights("balanced")["mastery_w"]
    assert focus_weights("exam_priority")["coverage_w"] > focus_weights("balanced")["coverage_w"]
    assert focus_weights("high_yield")["high_yield_bonus"] > focus_weights("balanced")["high_yield_bonus"]
    # unknown focus → balanced
    assert focus_weights("???") == focus_weights("balanced")


# ─── planner honours preferences ──────────────────────────────────────────
def test_focus_weak_areas_reranks_toward_weak_topics():
    sb_balanced = SBStub(_planner_seed())
    out_balanced = generate_plan(sb_balanced, "u-1")
    order_balanced = [t["topic"] for t in out_balanced["tasks"]]
    # balanced: the high-priority, well-mastered topic leads.
    assert order_balanced[0] == "Percentage"

    seed = _planner_seed()
    seed["user_study_plan_preferences"] = [
        {"user_id": "u-1", "focus": "weak_areas", "auto_regenerate": True,
         "pinned_topic_ids": [], "muted_topic_ids": []}
    ]
    out_weak = generate_plan(SBStub(seed), "u-1")
    order_weak = [t["topic"] for t in out_weak["tasks"]]
    # weak_areas focus pushes the low-mastery topic ahead of the mastered one.
    assert order_weak.index("Data Interpretation") < order_weak.index("Percentage")
    assert out_weak["focus"] == "weak_areas"


def test_muted_topic_is_excluded():
    seed = _planner_seed()
    seed["user_study_plan_preferences"] = [
        {"user_id": "u-1", "focus": "balanced", "auto_regenerate": True,
         "pinned_topic_ids": [], "muted_topic_ids": ["t1"]}
    ]
    out = generate_plan(SBStub(seed), "u-1")
    assert out["generated"] is True
    assert all(t["topic"] != "Percentage" for t in out["tasks"])


def test_all_topics_muted_is_reported():
    seed = _planner_seed()
    seed["user_study_plan_preferences"] = [
        {"user_id": "u-1", "focus": "balanced", "auto_regenerate": True,
         "pinned_topic_ids": [], "muted_topic_ids": ["t1", "t2", "t3"]}
    ]
    out = generate_plan(SBStub(seed), "u-1")
    assert out == {"generated": False, "reason": "all_topics_muted", "exam": "ssc-cgl"}


def test_pinned_topic_is_boosted_to_the_top():
    seed = _planner_seed()
    seed["user_study_plan_preferences"] = [
        {"user_id": "u-1", "focus": "balanced", "auto_regenerate": True,
         "pinned_topic_ids": ["t3"], "muted_topic_ids": []}
    ]
    out = generate_plan(SBStub(seed), "u-1")
    # t3 is the lowest-priority topic but pinning boosts it to rank 1.
    assert out["tasks"][0]["topic"] == "Vocabulary"
    assert out["tasks"][0]["why_this_task"]["pinned"] is True


def test_max_tasks_preference_overrides_persona():
    seed = _planner_seed()
    seed["user_study_plan_preferences"] = [
        {"user_id": "u-1", "focus": "balanced", "max_tasks_per_day": 1,
         "auto_regenerate": True, "pinned_topic_ids": [], "muted_topic_ids": []}
    ]
    out = generate_plan(SBStub(seed), "u-1")
    assert out["task_count"] == 1


# ─── event-driven regeneration ────────────────────────────────────────────
def test_regenerate_on_signal_skips_without_active_plan():
    out = regenerate_on_signal(
        SBStub(_planner_seed()), "u-1", event_type="mock_logged", reason="mock_logged"
    )
    assert out == {"regenerated": False, "reason": "no_active_plan"}


def test_regenerate_on_signal_respects_opt_out():
    seed = _planner_seed()
    seed["study_plans"] = [{"id": "p-1", "user_id": "u-1", "status": "active"}]
    seed["user_study_plan_preferences"] = [
        {"user_id": "u-1", "focus": "balanced", "auto_regenerate": False,
         "pinned_topic_ids": [], "muted_topic_ids": []}
    ]
    out = regenerate_on_signal(
        SBStub(seed), "u-1", event_type="mock_logged", reason="mock_logged"
    )
    assert out == {"regenerated": False, "reason": "auto_regenerate_off"}


def test_regenerate_on_signal_refreshes_active_plan():
    seed = _planner_seed()
    seed["study_plans"] = [{"id": "p-1", "user_id": "u-1", "status": "active"}]
    sb = SBStub(seed)
    out = regenerate_on_signal(
        sb, "u-1", event_type="mock_logged", reason="mock_logged"
    )
    assert out["regenerated"] is True
    # the adaptation event records the triggering signal, not "manual".
    events = sb.db["study_adaptation_events"]
    assert events and events[-1]["event_type"] == "mock_logged"


def test_regenerate_stale_plans_skips_fresh_and_opt_out():
    seed = _planner_seed()
    seed["study_plans"] = [
        {"id": "p-1", "user_id": "u-1", "status": "active",
         "updated_at": "2020-01-01T00:00:00+00:00"},  # stale → regenerate
        {"id": "p-2", "user_id": "u-2", "status": "active",
         "updated_at": "2099-01-01T00:00:00+00:00"},  # fresh → skip
    ]
    out = regenerate_stale_plans(SBStub(seed))
    assert out["checked"] == 2
    assert out["regenerated"] == 1
    assert out["skipped_fresh"] == 1


# ─── API ──────────────────────────────────────────────────────────────────
def _app(sb: SBStub, user_id: str = "u-1"):
    app = FastAPI()
    app.include_router(study_os_api.router, prefix="/api")
    study_os_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


def test_preferences_api_get_then_put_roundtrip():
    sb = SBStub({})
    client = TestClient(_app(sb))
    assert client.get("/api/study/plan/preferences").json()["focus"] == "balanced"
    r = client.put(
        "/api/study/plan/preferences",
        json={"focus": "high_yield", "max_tasks_per_day": 5},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["focus"] == "high_yield"
    assert body["max_tasks_per_day"] == 5
    # persisted — a fresh GET reflects it
    assert client.get("/api/study/plan/preferences").json()["focus"] == "high_yield"


def test_preferences_api_rejects_bad_focus():
    sb = SBStub({})
    client = TestClient(_app(sb))
    r = client.put("/api/study/plan/preferences", json={"focus": "turbo"})
    assert r.status_code == 422
