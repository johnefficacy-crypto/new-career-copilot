"""Phase 6 — user-topic mastery derivation + topic-granular mock ingestion."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canonical
from app.core.auth import get_current_user
from app.study_os.mastery import recompute_topic_mastery
from tests.persona_questions._stub import SBStub


# ─── recompute_topic_mastery (unit) ───────────────────────────────────────
def test_recompute_empty_when_no_breakdowns():
    sb = SBStub({"mock_tests": [{"id": "m1", "user_id": "u-1"}]})
    out = recompute_topic_mastery(sb, "u-1")
    assert out == {"mastery_rows": 0, "error_pattern_rows": 0}


def test_recompute_aggregates_accuracy_across_mocks():
    sb = SBStub({
        "mock_tests": [
            {"id": "m1", "user_id": "u-1", "exam_id": None, "exam_phase_id": None,
             "attempted_at": "2026-05-01T00:00:00+00:00"},
            {"id": "m2", "user_id": "u-1", "exam_id": None, "exam_phase_id": None,
             "attempted_at": "2026-05-05T00:00:00+00:00"},
        ],
        "mock_topic_breakdowns": [
            {"mock_test_id": "m1", "topic_id": "t1", "correct_answers": 6, "wrong_answers": 4},
            {"mock_test_id": "m2", "topic_id": "t1", "correct_answers": 9, "wrong_answers": 1},
        ],
    })
    out = recompute_topic_mastery(sb, "u-1")
    assert out["mastery_rows"] == 1
    row = sb.db["user_topic_mastery"][0]
    # 15 correct / 20 attempted = 75.0
    assert row["accuracy_score"] == 75.0
    assert row["mastery_score"] == 75.0
    # 2 mocks of evidence → confidence 2/3
    assert row["confidence_score"] == round(2 / 3, 3)
    assert row["evidence_count"] == 2
    # last practiced is the later mock; next revision is scheduled after it.
    assert row["last_practiced_at"] == "2026-05-05T00:00:00+00:00"
    assert row["next_revision_at"] > row["last_practiced_at"]


def test_recompute_is_idempotent():
    db = {
        "mock_tests": [
            {"id": "m1", "user_id": "u-1", "exam_id": None, "exam_phase_id": None,
             "attempted_at": "2026-05-01T00:00:00+00:00"},
        ],
        "mock_topic_breakdowns": [
            {"mock_test_id": "m1", "topic_id": "t1", "correct_answers": 5, "wrong_answers": 5},
        ],
    }
    sb = SBStub(db)
    recompute_topic_mastery(sb, "u-1")
    recompute_topic_mastery(sb, "u-1")
    # Recomputing must update the same row, not append a duplicate.
    assert len(sb.db["user_topic_mastery"]) == 1
    assert sb.db["user_topic_mastery"][0]["accuracy_score"] == 50.0


def test_recompute_separates_exam_scoped_groups():
    sb = SBStub({
        "mock_tests": [
            {"id": "m1", "user_id": "u-1", "exam_id": "e1", "exam_phase_id": "ph1",
             "attempted_at": "2026-05-01T00:00:00+00:00"},
            {"id": "m2", "user_id": "u-1", "exam_id": None, "exam_phase_id": None,
             "attempted_at": "2026-05-02T00:00:00+00:00"},
        ],
        "mock_topic_breakdowns": [
            {"mock_test_id": "m1", "topic_id": "t1", "correct_answers": 8, "wrong_answers": 2},
            {"mock_test_id": "m2", "topic_id": "t1", "correct_answers": 2, "wrong_answers": 8},
        ],
    })
    out = recompute_topic_mastery(sb, "u-1")
    # Same topic under two scopes → two distinct mastery rows.
    assert out["mastery_rows"] == 2
    by_scope = {(r.get("exam_id"), r["accuracy_score"]) for r in sb.db["user_topic_mastery"]}
    assert ("e1", 80.0) in by_scope
    assert (None, 20.0) in by_scope


def test_recompute_writes_error_patterns_with_valid_types():
    sb = SBStub({
        "mock_tests": [
            {"id": "m1", "user_id": "u-1", "exam_id": None, "exam_phase_id": None,
             "attempted_at": "2026-05-01T00:00:00+00:00"},
        ],
        "mock_topic_breakdowns": [
            {"mock_test_id": "m1", "topic_id": "t1", "correct_answers": 3, "wrong_answers": 7,
             "error_types": {"careless": 2, "concept_gap": 4, "made_up_type": 1}},
        ],
    })
    out = recompute_topic_mastery(sb, "u-1")
    assert out["error_pattern_rows"] == 3  # careless, concept_gap, unknown
    patterns = {r["error_type"]: r["frequency_count"] for r in sb.db["user_topic_error_patterns"]}
    assert patterns["careless"] == 2
    assert patterns["concept_gap"] == 4
    # An unrecognised error type is bucketed into 'unknown', never dropped.
    assert patterns["unknown"] == 1


# ─── add_mock ingestion (integration) ─────────────────────────────────────
def _mock_app(sb: SBStub, user_id: str = "u-1"):
    app = FastAPI()
    app.include_router(canonical.router_study, prefix="/api")
    canonical.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id, "role": "user"}
    return app


def test_add_mock_without_breakdowns_still_works():
    sb = SBStub({})
    client = TestClient(_mock_app(sb))
    r = client.post("/api/study/mocks", json={"exam_name": "SSC CGL", "score": 120})
    assert r.status_code == 200
    assert len(sb.db["mock_tests"]) == 1
    # No breakdowns supplied → no topic intelligence side effects.
    assert "mock_topic_breakdowns" not in sb.db or not sb.db["mock_topic_breakdowns"]


def test_add_mock_with_breakdowns_persists_and_updates_mastery():
    sb = SBStub({})
    client = TestClient(_mock_app(sb))
    r = client.post(
        "/api/study/mocks",
        json={
            "exam_name": "SSC CGL",
            "exam_id": "e1",
            "exam_phase_id": "ph1",
            "score": 120,
            "topic_breakdowns": [
                {"topic_id": "t1", "correct_answers": 7, "wrong_answers": 3,
                 "error_types": {"careless": 3}},
                {"topic_id": "t2", "correct_answers": 2, "wrong_answers": 8},
            ],
        },
    )
    assert r.status_code == 200
    # Per-topic rows persisted, with accuracy backfilled.
    breakdowns = sb.db["mock_topic_breakdowns"]
    assert len(breakdowns) == 2
    t1 = next(b for b in breakdowns if b["topic_id"] == "t1")
    assert t1["accuracy"] == 70.0
    # Mastery recompute ran off the freshly-inserted breakdowns.
    mastery = {m["topic_id"]: m for m in sb.db["user_topic_mastery"]}
    assert mastery["t1"]["accuracy_score"] == 70.0
    assert mastery["t2"]["accuracy_score"] == 20.0
    # Error pattern captured for the topic that reported one.
    errs = sb.db["user_topic_error_patterns"]
    assert any(e["topic_id"] == "t1" and e["error_type"] == "careless" for e in errs)
