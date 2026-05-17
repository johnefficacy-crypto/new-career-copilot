"""Tests for the aspirant trap-drill builder + endpoint."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import exam_intelligence as ei_api
from app.core.auth import get_current_user
from app.exam_intelligence.trap_drill import build_trap_drill
from tests.persona_questions._stub import SBStub


def _build_app(sb: SBStub):
    app = FastAPI()
    app.include_router(ei_api.router, prefix="/api")
    ei_api.get_supabase_admin = lambda: sb  # type: ignore[assignment]
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "u-1",
        "role": "user",
        "permissions": [],
    }
    return app


def _seed() -> dict[str, Any]:
    return {
        "exams": [{"id": "e1", "slug": "upsc-cse"}],
        "pyq_papers": [
            {"id": "p1", "exam_id": "e1", "year": 2023},
            {"id": "p2", "exam_id": "e1", "year": 2024},
        ],
        "pyq_questions": [
            # q1, q2 are annotated with patterns (priority pool)
            {"id": "q1", "pyq_paper_id": "p1", "question_text": "Consider 1...",
             "reviewer_status": "verified"},
            {"id": "q2", "pyq_paper_id": "p1", "question_text": "Consider 2...",
             "reviewer_status": "verified"},
            # q3 has no annotated options (fallback pool)
            {"id": "q3", "pyq_paper_id": "p2", "question_text": "Consider 3...",
             "reviewer_status": "verified"},
            # q4 is not verified — must be excluded
            {"id": "q4", "pyq_paper_id": "p2", "question_text": "Consider 4...",
             "reviewer_status": "pending"},
            # q5 is verified but only has 1 option (broken) — exclude
            {"id": "q5", "pyq_paper_id": "p2", "question_text": "Consider 5...",
             "reviewer_status": "verified"},
            # q6 is verified but has no correct option — exclude
            {"id": "q6", "pyq_paper_id": "p2", "question_text": "Consider 6...",
             "reviewer_status": "verified"},
        ],
        "pyq_options": [
            *(
                {"id": f"opt-{qid}-{lbl}", "question_id": qid, "option_label": lbl,
                 "option_text": txt, "is_correct": correct}
                for qid in ("q1", "q2", "q3")
                for lbl, txt, correct in [
                    ("A", "1 only", qid == "q1"),
                    ("B", "2 only", qid == "q2"),
                    ("C", "Both 1 and 2", qid == "q3"),
                    ("D", "Neither 1 nor 2", False),
                ]
            ),
            {"id": "opt-q4-A", "question_id": "q4", "option_label": "A",
             "option_text": "x", "is_correct": True},
            {"id": "opt-q4-B", "question_id": "q4", "option_label": "B",
             "option_text": "y", "is_correct": False},
            {"id": "opt-q5-A", "question_id": "q5", "option_label": "A",
             "option_text": "lonely", "is_correct": True},
            # q6: 2 options, neither correct
            {"id": "opt-q6-A", "question_id": "q6", "option_label": "A",
             "option_text": "x", "is_correct": False},
            {"id": "opt-q6-B", "question_id": "q6", "option_label": "B",
             "option_text": "y", "is_correct": False},
        ],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t1", "tag_role": "primary",
             "reviewer_status": "verified"},
            {"question_id": "q2", "topic_id": "t2", "tag_role": "primary",
             "reviewer_status": "verified"},
            {"question_id": "q3", "topic_id": "t1", "tag_role": "primary",
             "reviewer_status": "verified"},
        ],
        "pyq_option_patterns": [
            {"option_id": "opt-q1-B", "pattern_type": "common_trap",
             "metadata": {"occurrence_count": 4}},
            {"option_id": "opt-q1-C", "pattern_type": "elimination_pattern",
             "metadata": {"marker": "both_x_and_y"}},
            {"option_id": "opt-q2-A", "pattern_type": "common_trap",
             "metadata": {"occurrence_count": 3}},
        ],
    }


def test_build_trap_drill_prefers_annotated_questions():
    sb = SBStub(_seed())
    res = build_trap_drill(sb, "e1", size=2, seed=42)
    ids = [q["id"] for q in res["questions"]]
    # Annotated pool is {q1, q2}; both should appear before q3.
    assert set(ids) == {"q1", "q2"}
    assert res["trap_annotated_pool_size"] == 2
    # q4 (pending), q5 (one-option), q6 (no-correct) are excluded.
    assert res["total_pool_size"] == 3


def test_build_trap_drill_falls_back_when_size_exceeds_annotated():
    sb = SBStub(_seed())
    res = build_trap_drill(sb, "e1", size=5, seed=1)
    ids = {q["id"] for q in res["questions"]}
    # Should fan out to q3 once the annotated pool is exhausted.
    assert ids == {"q1", "q2", "q3"}


def test_build_trap_drill_topic_filter_narrows_pool():
    sb = SBStub(_seed())
    res = build_trap_drill(sb, "e1", topic_id="t2", size=5)
    assert [q["id"] for q in res["questions"]] == ["q2"]


def test_build_trap_drill_shapes_options_and_correct_id():
    sb = SBStub(_seed())
    res = build_trap_drill(sb, "e1", size=5, seed=99)
    q1 = next(q for q in res["questions"] if q["id"] == "q1")
    assert q1["year"] == 2023
    labels = [o["label"] for o in q1["options"]]
    assert labels == ["A", "B", "C", "D"]
    assert q1["correct_option_id"] == "opt-q1-A"


def test_build_trap_drill_emits_trap_insights_for_annotated_options():
    sb = SBStub(_seed())
    res = build_trap_drill(sb, "e1", size=5, seed=7)
    by_id = {q["id"]: q for q in res["questions"]}
    insights_q1 = {i["option_id"]: i for i in by_id["q1"]["trap_insights"]}
    # opt-q1-B is a common_trap with occurrence_count=4 → note includes ×4.
    assert "opt-q1-B" in insights_q1
    assert "×4" in insights_q1["opt-q1-B"]["note"]
    # opt-q1-C is an elimination_pattern (both_x_and_y) → marker name surfaces.
    assert "Both X and Y" in insights_q1["opt-q1-C"]["note"]
    # q3 has no annotations.
    assert by_id["q3"]["trap_insights"] == []


def test_build_trap_drill_empty_when_no_papers():
    sb = SBStub({"exams": [{"id": "e1", "slug": "upsc-cse"}]})
    res = build_trap_drill(sb, "e1", size=5)
    assert res["questions"] == []
    assert res["total_pool_size"] == 0


def test_endpoint_returns_drill_payload():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/exam-intelligence/exams/upsc-cse/trap-drill?size=2")
    assert r.status_code == 200
    body = r.json()
    assert body["verified_only"] is True
    assert len(body["questions"]) == 2
    # Each shape carries the contract the UI needs.
    for q in body["questions"]:
        assert q["id"] and q["correct_option_id"]
        assert q["options"] and all("text" in o for o in q["options"])
        assert "trap_insights" in q


def test_endpoint_unknown_slug_returns_empty_payload():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/exam-intelligence/exams/does-not-exist/trap-drill")
    assert r.status_code == 200
    body = r.json()
    assert body["exam_id"] is None
    assert body["questions"] == []


def test_endpoint_rejects_oversized_request():
    sb = SBStub(_seed())
    client = TestClient(_build_app(sb))
    r = client.get("/api/exam-intelligence/exams/upsc-cse/trap-drill?size=50")
    assert r.status_code == 422
