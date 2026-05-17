"""Phase 6 — user-topic mastery derivation (unit tests on the service).

Integration tests that drove the deleted canonical-py mock-ingestion
endpoint were removed in Phase 5; the public route is now owned by
``app/api/study_os.py`` and covered in ``tests/study_os/test_mocks.py``.
"""
from __future__ import annotations

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


# Phase 5: POST /api/study/mocks integration tests that previously
# pinned canonical.py's add_mock handler have been removed. That
# handler was a duplicate of app/api/study_os.py and was the loser at
# runtime via router precedence. Coverage of the surviving
# study_os.py implementation lives in tests/study_os/test_mocks.py
# (test_api_create_then_list, test_create_mock_persists_row_and_
# breakdowns). The unit-level mastery recompute tests above stay —
# they exercise the recompute service directly, not the route.
