"""End-to-end-ish tests for build_mission_control (PR3).

Uses the in-memory Supabase stub created in PR2 (tests/persona_questions/_stub).
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.study_os.mission_control import build_mission_control
from tests.persona_questions._stub import SBStub


def _today():
    return datetime.now(timezone.utc).date().isoformat()


def _snapshot_row(user_id="u-1", **overrides):
    base = {
        "user_id": user_id,
        "persona_version": "v1",
        "primary_persona": "beginner_aspirant",
        "dimensions": {
            "discovery_stage": "targeted_exam_aspirant",
            "preparation_stage": "beginner",
            "time_constraint": "low_availability",
            "learning_behavior": "insufficient_data",
            "execution_risk": "low",
            "motivation_state": "stable",
            "resource_constraint": "unknown",
        },
        "scores": {"profile_completeness": 0.7, "execution": 0.4},
        "study_policy": {
            "daily_minutes_target": 45,
            "max_tasks_per_day": 2,
            "preferred_task_size": "small",
            "task_mix": {"concept_learning": 0.5, "retrieval_practice": 0.3, "revision": 0.2, "mock_correction": 0.0},
            "constraints": {
                "weekend_catchup_enabled": True,
                "avoid_long_theory_blocks": True,
                "require_mock_review_before_next_mock": False,
            },
            "nudge_style": "direct_non_shaming",
        },
        "computed_at": "2026-05-01T00:00:00+00:00",
    }
    base.update(overrides)
    return base


def test_mission_control_safe_when_no_persona_snapshot():
    sb = SBStub({})
    out = build_mission_control(sb, "u-1")
    # Endpoint never raises; returns the full shape.
    assert "user_context" in out
    assert "study_policy" in out
    assert "today_tasks" in out
    assert "metrics" in out
    assert "next_best_action" in out
    assert "engine_trace" in out
    # Without persona it still computes a default empty shape.
    assert out["user_context"]["persona_version"] == "v1"


def test_mission_control_uses_existing_persona_snapshot():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert out["study_policy"]["preferred_task_size"] == "small"
    assert out["user_context"]["dimensions"]["preparation_stage"] == "beginner"


def test_mission_control_returns_metadata_theme_and_target():
    # theme/target live in study_plans.metadata jsonb, not at the row top level.
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active",
             "metadata": {"theme": "SSC adaptive plan", "target": "Cover locked topics"}},
        ],
    })
    out = build_mission_control(sb, "u-1")
    assert out["plan"]["theme"] == "SSC adaptive plan"
    assert out["plan"]["target"] == "Cover locked topics"


def test_mission_control_plan_falls_back_when_metadata_missing():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "metadata": {}},
        ],
    })
    out = build_mission_control(sb, "u-1")
    # Defaults must still surface so the UI never reads None for these fields.
    assert out["plan"]["theme"] == "Adaptive weekly plan"
    assert out["plan"]["target"] == "Complete planned blocks"


def test_mission_control_handles_missing_study_plan():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert out["plan"] is None
    assert out["today_tasks"] == []
    assert "no_active_study_plan" in out["meta"]["preview_flags"]


def test_mission_control_handles_missing_weekly_review():
    # No study_sessions / mock_tests / study_tasks rows.
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    metrics = out["metrics"]
    assert metrics["tasks_total"] == 0
    assert metrics["mocks_taken"] == 0
    assert metrics["backlog_count"] == 0


def test_mission_control_includes_study_policy_block():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert "task_mix" in out["study_policy"]
    assert out["study_policy"]["nudge_style"] == "direct_non_shaming"


def test_incomplete_task_becomes_next_best_action():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "metadata": {"theme": "T", "target": "X"}}
        ],
        "study_tasks": [
            {"id": "task-1", "plan_id": "plan-1", "title": "Revise quant",
             "task_type": "revision", "status": "planned", "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    nba = out["next_best_action"]
    assert nba["action_type"] == "study_task"
    assert nba["task_id"] == "task-1"


def test_progressive_question_becomes_next_best_action_when_no_tasks():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "persona_question_bank": [
            {
                "question_key": "mock_behavior",
                "question_text": "How do you handle mocks?",
                "data_type": "single_select",
                "options": [{"value": "avoid_mocks", "label": "Avoid"}],
                "priority": 50,
                "target_dimension": "learning_behavior",
                "is_active": True,
            }
        ],
    })
    out = build_mission_control(sb, "u-1")
    nba = out["next_best_action"]
    assert nba["action_type"] == "progressive_question"
    assert nba.get("question_key") == "mock_behavior"


def test_next_best_action_falls_through_to_focus_when_no_focus_minutes():
    # Has a plan with no scheduled-today tasks and no progressive question.
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "metadata": {"theme": "T", "target": "X"}}
        ],
        "study_tasks": [],
        "persona_question_bank": [],
    })
    out = build_mission_control(sb, "u-1")
    nba = out["next_best_action"]
    assert nba["action_type"] in {"focus_session", "study_plan"}


def test_task_reasoning_is_attached_to_each_task():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "metadata": {"theme": "T", "target": "X"}}
        ],
        "study_tasks": [
            {"id": "task-1", "plan_id": "plan-1", "title": "Revise quant",
             "task_type": "revision", "status": "planned", "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    assert out["today_tasks"][0]["reasoning"]["summary"]
    assert "active_study_plan" in out["today_tasks"][0]["reasoning"]["evidence"]


def test_task_reasoning_falls_back_when_metadata_missing():
    sb = SBStub({
        "aspirant_persona_snapshots": [],  # no persona
        "study_plans": [
            {"id": "plan-1", "user_id": "u-1", "status": "active", "metadata": {"theme": "T", "target": "X"}}
        ],
        "study_tasks": [
            {"id": "task-1", "plan_id": "plan-1", "title": "Untitled",
             "task_type": None, "status": "planned", "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    reasoning = out["today_tasks"][0]["reasoning"]
    # The mission_control auto-computes a persona snapshot on first read
    # via compute_persona_snapshot, so we get *some* user signal copy or
    # the explicit fallback string.
    assert reasoning["summary"]


def test_engine_trace_marks_exam_intelligence_not_connected():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    labels = {step["label"]: step for step in out["engine_trace"]}
    assert "Exam intelligence" in labels
    assert labels["Exam intelligence"]["status"] == "not_connected"


def test_no_fake_exam_intelligence_claims_in_response():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    import json
    blob = json.dumps(out).lower()
    # No marketing / claim-style phrases anywhere.
    for forbidden in ("high-yield", "official update", "exam intelligence updated"):
        assert forbidden not in blob
    # When no verified exam intelligence exists, the engine_trace must
    # explicitly mark it as not_connected and the response must report
    # zero verified counts.
    intel_steps = [s for s in out["engine_trace"] if s["label"] == "Exam intelligence"]
    assert intel_steps and intel_steps[0]["status"] == "not_connected"
    ei = out.get("exam_intelligence") or {}
    assert ei.get("available") is False
    assert ei.get("verified_pyq_tags", 0) == 0
    assert ei.get("verified_syllabus_mentions", 0) == 0


def test_meta_preview_flags_marked():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    assert "exam_intelligence_not_connected" in out["meta"]["preview_flags"]


def test_mission_control_includes_contract_blocks():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    # New Phase 5 contract blocks are present and well-shaped.
    assert out["date"]
    assert "safe_user_explanation" in out["user_context"]
    assert isinstance(out["user_context"]["safe_user_explanation"], list)
    assert out["user_context"]["safe_user_explanation"]  # never empty
    ec = out["exam_context"]
    assert set(ec) >= {
        "exam_id", "exam", "verified_intelligence_status", "high_yield_topics",
        "days_remaining", "exam_family", "cycle", "phase",
    }
    uc = out["update_context"]
    assert uc["official_updates"] == []
    assert uc["affects_plan"] is False
    assert uc["affects_deadline"] is False
    assert uc["affects_eligibility"] is False
    assert isinstance(out["plan_reasoning"], list)
    for entry in out["plan_reasoning"]:
        assert entry["reason_type"] in {"persona", "exam_intelligence", "progress", "update"}
        assert entry["summary"]


def test_exam_context_high_yield_only_from_locked():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [
            {"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
             "exam_type": "recruitment", "is_active": True}
        ],
        "exam_topic_coverage": [
            {"id": "c1", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 84, "is_high_yield": True,
             "confidence_score": 0.78, "reviewer_status": "locked"},
            {"id": "c2", "exam_id": "exam-1", "topic_id": "t2",
             "exam_priority_score": 60, "is_high_yield": True,
             "confidence_score": 0.6, "reviewer_status": "reviewed"},
            {"id": "c3", "exam_id": "exam-1", "topic_id": "t3",
             "exam_priority_score": 90, "is_high_yield": True,
             "confidence_score": 0.9, "reviewer_status": "draft"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "slug": "percentage", "is_active": True},
            {"id": "t2", "name": "Ratios", "slug": "ratios", "is_active": True},
            {"id": "t3", "name": "Time & Work", "slug": "tw", "is_active": True},
        ],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "exam-1", "reviewer_status": "verified"}
        ],
    })
    out = build_mission_control(sb, "u-1")
    hy = out["exam_context"]["high_yield_topics"]
    # Only the locked row reaches the aspirant — reviewed/draft are excluded.
    assert [t["topic"] for t in hy] == ["Percentage"]
    assert hy[0]["status"] == "locked"
    assert out["exam_context"]["verified_intelligence_status"] == "verified"


def test_safe_user_explanation_never_contains_raw_persona_labels():
    sb = SBStub({"aspirant_persona_snapshots": [_snapshot_row()]})
    out = build_mission_control(sb, "u-1")
    blob = " ".join(out["user_context"]["safe_user_explanation"]).lower()
    # Raw dimension labels must stay internal.
    for label in (
        "low_availability", "beginner_aspirant", "insufficient_data",
        "targeted_exam_aspirant", "high_mock_low_review",
    ):
        assert label not in blob


def test_plan_reasoning_separates_persona_and_progress():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [{"id": "p1", "user_id": "u-1", "status": "active"}],
        "study_tasks": [
            {"id": f"t{i}", "plan_id": "p1", "title": f"Task {i}",
             "status": "missed"} for i in range(4)
        ],
    })
    out = build_mission_control(sb, "u-1")
    types = {e["reason_type"] for e in out["plan_reasoning"]}
    assert "persona" in types
    # 4 missed tasks → backlog → a progress reason.
    assert "progress" in types


def test_truth_panel_summary_reflects_today_completion():
    sb = SBStub({
        "aspirant_persona_snapshots": [_snapshot_row()],
        "study_plans": [{"id": "p1", "user_id": "u-1", "status": "active"}],
        "study_tasks": [
            {"id": "t1", "plan_id": "p1", "title": "A", "status": "completed",
             "scheduled_date": _today(), "completed_at": _today()},
            {"id": "t2", "plan_id": "p1", "title": "B", "status": "planned",
             "scheduled_date": _today()},
        ],
    })
    out = build_mission_control(sb, "u-1")
    summary = out["truth_panel"]["summary"]
    assert "1 of 2" in summary


# ── Per-request read cache: each logical table read once per call ─────────


def _seed_full_world():
    return {
        "aspirant_persona_snapshots": [_snapshot_row()],
        "profiles": [{"id": "u-1", "target_exam": "ssc-cgl"}],
        "exams": [{"id": "exam-1", "slug": "ssc-cgl", "name": "SSC CGL",
                   "exam_type": "recruitment", "is_active": True,
                   "exam_family_id": "fam-1"}],
        "exam_families": [{"id": "fam-1", "name": "SSC"}],
        "exam_topic_coverage": [
            {"id": "c1", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 80, "is_high_yield": True,
             "confidence_score": 0.8, "reviewer_status": "locked"},
        ],
        "topics": [{"id": "t1", "name": "Percentage", "slug": "percentage",
                    "is_active": True, "subject_id": "s1", "level": "core"}],
        "subjects": [{"id": "s1", "name": "Quant", "slug": "quant",
                      "subject_group": "core", "is_active": True}],
        "study_plans": [{"id": "p1", "user_id": "u-1", "status": "active",
                         "metadata": {"theme": "Adaptive", "target": "Cover"}}],
    }


def test_mission_control_caches_repeat_reads_within_one_call():
    # Without the cache, the following tables are read twice per call:
    #   - study_plans      (active-plan + fallback id)
    #   - exam_topic_coverage / topics (status summary + context locked)
    #   - exams            (resolve_by_slug + resolve_by_id)
    #   - aspirant_persona_snapshots (latest + recompute fallback)
    # The wrapper exposes `reads_per_table()` so we can assert ≤1.
    from app.study_os.mission_control import _RequestReadCache

    wrapped = _RequestReadCache(SBStub(_seed_full_world()))
    build_mission_control(wrapped, "u-1")
    reads = wrapped.reads_per_table()
    for table in (
        "study_plans",
        "exam_topic_coverage",
        "topics",
        "exams",
        "aspirant_persona_snapshots",
    ):
        assert reads.get(table, 0) <= 1, (
            f"{table} read {reads.get(table)}× (expected ≤1); counts={reads}"
        )


# ── Item 1: async sub-loader fan-out runs reads concurrently ───────────────


def test_async_mission_control_returns_same_shape_as_sync():
    import asyncio

    from app.study_os.mission_control import build_mission_control_async

    seed = _seed_full_world()
    sync_out = build_mission_control(SBStub(seed), "u-1")
    async_out = asyncio.run(build_mission_control_async(SBStub(_seed_full_world()), "u-1"))

    # Same keys at the top level (modulo `meta.generated_at`, which is
    # a wall-clock timestamp).
    assert set(sync_out.keys()) == set(async_out.keys())
    assert async_out["plan"] == sync_out["plan"]
    assert async_out["metrics"] == sync_out["metrics"]
    assert async_out["exam_intelligence"]["exam_id"] == sync_out["exam_intelligence"]["exam_id"]


def test_async_mission_control_runs_independent_loaders_concurrently():
    # Stage 1 has five independent reads. If they're serialised, the
    # total elapsed time of mission-control will be ≥ 5×T where T is
    # per-sub-loader sleep. If they run via asyncio.gather + to_thread,
    # total ≈ T (plus a couple of stage 2/3 hops).
    import asyncio
    import time

    from app.study_os.mission_control import (
        _RequestReadCache,
        build_mission_control_async,
    )

    delay = 0.10

    class _SlowSB:
        def __init__(self, inner):
            self._inner = inner

        def __getattr__(self, attr):
            return getattr(self._inner, attr)

        def table(self, name):
            q = self._inner.table(name)
            real_execute = q.execute

            def _slow_execute():
                time.sleep(delay)
                return real_execute()

            q.execute = _slow_execute  # type: ignore[assignment]
            return q

    slow = _SlowSB(SBStub(_seed_full_world()))
    started = time.monotonic()
    asyncio.run(build_mission_control_async(slow, "u-1"))
    elapsed = time.monotonic() - started

    # Strictly serial mission-control fires ~24 reads × 0.10s ≈ 2.4s.
    # Stage-1 fan-out should overlap the heaviest sub-loaders so the
    # observed latency is clearly under that baseline. We assert
    # improvement here, not a hard perf-budget number.
    serial_baseline_seconds = 24 * delay
    assert elapsed < serial_baseline_seconds * 0.75, (
        f"expected concurrent execution; elapsed={elapsed:.2f}s "
        f"(serial baseline ~{serial_baseline_seconds:.2f}s)"
    )
