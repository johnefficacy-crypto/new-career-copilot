"""Aspirant-facing /exam-intelligence/exams/{slug}/option-insights tests."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import exam_intelligence as ei_api
from app.core.auth import get_current_user
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub, role: str = "user"):
    app = FastAPI()
    app.include_router(ei_api.router, prefix="/api")
    ei_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "u-1",
        "role": role,
        "permissions": [],
    }
    return app


def _seed_populated() -> dict[str, Any]:
    """An exam with the rollup tables populated by the admin recompute.

    Two paper/years, four questions, structural UPSC-style options. The
    elimination-pattern rows are pre-seeded so the aspirant reader
    doesn't need the live admin compute to run first.
    """
    return {
        "exams": [{"id": "e1", "slug": "upsc-cse", "name": "UPSC CSE"}],
        "pyq_papers": [
            {"id": "p1", "exam_id": "e1", "year": 2023},
            {"id": "p2", "exam_id": "e1", "year": 2024},
        ],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "p1", "reviewer_status": "verified"},
            {"id": "q2", "pyq_paper_id": "p1", "reviewer_status": "verified"},
            {"id": "q3", "pyq_paper_id": "p2", "reviewer_status": "verified"},
            {"id": "q4", "pyq_paper_id": "p2", "reviewer_status": "verified"},
        ],
        "pyq_options": [
            {"id": "o-q1-A", "question_id": "q1", "option_text": "1 only", "is_correct": False},
            {"id": "o-q1-B", "question_id": "q1", "option_text": "2 only", "is_correct": True},
            {"id": "o-q1-C", "question_id": "q1", "option_text": "Both 1 and 2", "is_correct": False},
            {"id": "o-q1-D", "question_id": "q1", "option_text": "Neither 1 nor 2", "is_correct": False},
            {"id": "o-q2-A", "question_id": "q2", "option_text": "1 only", "is_correct": False},
            {"id": "o-q2-B", "question_id": "q2", "option_text": "2 only", "is_correct": False},
            {"id": "o-q2-C", "question_id": "q2", "option_text": "Both 1 and 2", "is_correct": True},
            {"id": "o-q3-A", "question_id": "q3", "option_text": "1 only", "is_correct": False},
            {"id": "o-q3-B", "question_id": "q3", "option_text": "Neither 1 nor 2", "is_correct": False},
            {"id": "o-q4-A", "question_id": "q4", "option_text": "All of the above", "is_correct": False},
        ],
        "pyq_option_repetitions": [
            {
                "exam_id": "e1", "topic_id": "t1", "option_hash": "h1",
                "normalized_value": "1 only", "occurrence_count": 3,
                "first_seen_year": 2023, "last_seen_year": 2024,
                "metadata": {"is_correct_count": 0, "is_wrong_count": 3},
            },
            {
                "exam_id": "e1", "topic_id": "t1", "option_hash": "h2",
                "normalized_value": "2 only", "occurrence_count": 2,
                "first_seen_year": 2023, "last_seen_year": 2023,
                "metadata": {"is_correct_count": 1, "is_wrong_count": 1},
            },
            {
                "exam_id": "e1", "topic_id": "t2", "option_hash": "h3",
                "normalized_value": "Both 1 and 2", "occurrence_count": 2,
                "first_seen_year": 2023, "last_seen_year": 2023,
                "metadata": {"is_correct_count": 1, "is_wrong_count": 1},
            },
            {
                "exam_id": "e1", "topic_id": "t1", "option_hash": "h4",
                "normalized_value": "Neither 1 nor 2", "occurrence_count": 2,
                "first_seen_year": 2023, "last_seen_year": 2024,
                "metadata": {"is_correct_count": 0, "is_wrong_count": 2},
            },
        ],
        "pyq_option_patterns": [
            {"option_id": "o-q1-A", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "single_only"}, "topic_id": "t1"},
            {"option_id": "o-q1-B", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "single_only"}, "topic_id": "t1"},
            {"option_id": "o-q1-C", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "both_x_and_y"}, "topic_id": "t1"},
            {"option_id": "o-q1-D", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "neither_x_nor_y"}, "topic_id": "t1"},
            {"option_id": "o-q2-A", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "single_only"}, "topic_id": "t1"},
            {"option_id": "o-q2-B", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "single_only"}, "topic_id": "t1"},
            {"option_id": "o-q2-C", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "both_x_and_y"}, "topic_id": "t1"},
            {"option_id": "o-q3-A", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "single_only"}, "topic_id": "t1"},
            {"option_id": "o-q3-B", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "neither_x_nor_y"}, "topic_id": "t1"},
            {"option_id": "o-q4-A", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "all_of_the_above"}, "topic_id": "t1"},
        ],
    }


def test_option_insights_returns_distractors_and_elimination_tips():
    sb = SBStub(_seed_populated())
    client = TestClient(_build_app(sb))
    r = client.get("/api/exam-intelligence/exams/upsc-cse/option-insights")
    assert r.status_code == 200
    body = r.json()
    assert body["has_data"] is True
    assert body["verified_only"] is True

    distractors = body["recurring_distractors"]
    by_value = {d["normalized_value"]: d for d in distractors}
    # All four canonical groups should be present.
    assert set(by_value) == {"1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2"}
    # "1 only" is all-wrong → "almost always wrong" phrasing.
    assert "almost always wrong" in by_value["1 only"]["tip"]
    # Top of the list bias is toward wrong-leaning. "1 only" has the
    # highest wrong_count (3) so it should be first.
    assert distractors[0]["normalized_value"] == "1 only"

    tips = {t["pattern"]: t for t in body["elimination_tips"]}
    assert "single_only" in tips
    # 5 single_only occurrences (1 correct at q1.B).
    assert tips["single_only"]["occurrence_count"] == 5
    assert tips["single_only"]["correct_count"] == 1
    # all_of_the_above appears once → "never the correct answer".
    assert "never the correct answer" in tips["all_of_the_above"]["tip"]


def test_option_insights_topic_filter_narrows_results():
    sb = SBStub(_seed_populated())
    client = TestClient(_build_app(sb))
    r = client.get(
        "/api/exam-intelligence/exams/upsc-cse/option-insights?topic_id=t2"
    )
    body = r.json()
    # Only the t2 rep row should come through.
    assert [d["normalized_value"] for d in body["recurring_distractors"]] == ["Both 1 and 2"]


def test_option_insights_empty_when_rollups_not_populated():
    """Slug resolves but no rollup rows → has_data=False, empty arrays."""
    seed = _seed_populated()
    seed["pyq_option_repetitions"] = []
    seed["pyq_option_patterns"] = []
    sb = SBStub(seed)
    client = TestClient(_build_app(sb))
    body = client.get("/api/exam-intelligence/exams/upsc-cse/option-insights").json()
    assert body["has_data"] is False
    assert body["recurring_distractors"] == []
    assert body["elimination_tips"] == []
    assert body["verified_only"] is True


def test_option_insights_unknown_slug_returns_empty_payload():
    sb = SBStub(_seed_populated())
    client = TestClient(_build_app(sb))
    r = client.get("/api/exam-intelligence/exams/does-not-exist/option-insights")
    assert r.status_code == 200
    body = r.json()
    assert body["exam_id"] is None
    assert body["has_data"] is False


def test_option_insights_distractor_tip_uses_year_range():
    sb = SBStub(_seed_populated())
    client = TestClient(_build_app(sb))
    body = client.get(
        "/api/exam-intelligence/exams/upsc-cse/option-insights"
    ).json()
    by_value = {d["normalized_value"]: d for d in body["recurring_distractors"]}
    # 1 only spans 2023–2024 so the tip should reference both.
    assert "2023" in by_value["1 only"]["tip"]
    assert "2024" in by_value["1 only"]["tip"]
    # 2 only is only seen in 2023.
    assert "2023" in by_value["2 only"]["tip"]
    assert "2024" not in by_value["2 only"]["tip"]


def test_option_insights_limit_caps_results():
    sb = SBStub(_seed_populated())
    client = TestClient(_build_app(sb))
    body = client.get(
        "/api/exam-intelligence/exams/upsc-cse/option-insights?limit=2"
    ).json()
    assert len(body["recurring_distractors"]) == 2
    assert len(body["elimination_tips"]) <= 2
