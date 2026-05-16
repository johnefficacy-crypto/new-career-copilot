"""Tests for the PYQ paper list + difficulty heatmap."""
from __future__ import annotations

from app.exam_intelligence.pyq_papers import (
    difficulty_heatmap,
    verified_pyq_papers,
)
from tests.persona_questions._stub import SBStub


def _seed():
    return {
        "pyq_papers": [
            {"id": "p-2023", "exam_id": "exam-1", "exam_phase_id": "ph-prelims",
             "year": 2023, "paper_date": "2023-05-28", "shift": "I", "paper_code": "GS-1",
             "source_url": "https://upsc.gov.in/p23.pdf", "source_type": "official",
             "trust_status": "verified"},
            {"id": "p-2022", "exam_id": "exam-1", "exam_phase_id": "ph-prelims",
             "year": 2022, "paper_date": "2022-06-05", "shift": "I", "paper_code": "GS-1",
             "source_type": "official", "trust_status": "verified"},
            {"id": "p-2024-pending", "exam_id": "exam-1", "exam_phase_id": "ph-prelims",
             "year": 2024, "trust_status": "pending"},  # must be excluded
        ],
        "exam_phases": [
            {"id": "ph-prelims", "phase_name": "Prelims", "phase_slug": "prelims"},
        ],
        "pyq_questions": [
            # 2023 verified questions
            {"id": "q1", "pyq_paper_id": "p-2023", "observed_difficulty": "easy", "reviewer_status": "verified"},
            {"id": "q2", "pyq_paper_id": "p-2023", "observed_difficulty": "Medium", "reviewer_status": "verified"},
            {"id": "q3", "pyq_paper_id": "p-2023", "observed_difficulty": "hard", "reviewer_status": "verified"},
            {"id": "q4", "pyq_paper_id": "p-2023", "observed_difficulty": None, "reviewer_status": "verified"},
            # 2022 verified
            {"id": "q5", "pyq_paper_id": "p-2022", "observed_difficulty": "medium", "reviewer_status": "verified"},
            # Unverified — excluded
            {"id": "q6", "pyq_paper_id": "p-2023", "observed_difficulty": "easy", "reviewer_status": "pending"},
        ],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t-quant", "tag_role": "primary", "reviewer_status": "verified"},
            {"question_id": "q2", "topic_id": "t-quant", "tag_role": "primary", "reviewer_status": "verified"},
            {"question_id": "q3", "topic_id": "t-poli", "tag_role": "primary", "reviewer_status": "verified"},
            {"question_id": "q4", "topic_id": "t-quant", "tag_role": "primary", "reviewer_status": "verified"},
            {"question_id": "q5", "topic_id": "t-poli", "tag_role": "primary", "reviewer_status": "verified"},
            # Secondary tag — must not be counted as the primary subject row
            {"question_id": "q1", "topic_id": "t-poli", "tag_role": "secondary", "reviewer_status": "verified"},
        ],
        "topics": [
            {"id": "t-quant", "subject_id": "s-quant", "is_active": True},
            {"id": "t-poli", "subject_id": "s-poli", "is_active": True},
        ],
        "subjects": [
            {"id": "s-quant", "name": "Quantitative Aptitude", "slug": "quant", "is_active": True},
            {"id": "s-poli", "name": "Polity", "slug": "polity", "is_active": True},
        ],
    }


def test_verified_pyq_papers_sorted_newest_first_and_filters_pending():
    sb = SBStub(_seed())
    papers = verified_pyq_papers(sb, "exam-1")
    assert [p["id"] for p in papers] == ["p-2023", "p-2022"]
    assert papers[0]["phase_name"] == "Prelims"
    assert papers[0]["source_url"].endswith("p23.pdf")


def test_verified_pyq_papers_empty_when_no_exam():
    assert verified_pyq_papers(SBStub({}), "") == []


def test_difficulty_heatmap_groups_by_subject_and_difficulty():
    sb = SBStub(_seed())
    heatmap = difficulty_heatmap(sb, "exam-1")
    assert heatmap["verified_question_count"] == 5
    rows = {r["subject_slug"]: r for r in heatmap["rows"]}
    assert rows["quant"]["counts"] == {"easy": 1, "medium": 1, "hard": 0, "unknown": 1}
    assert rows["quant"]["total"] == 3
    assert rows["poli" if "poli" in rows else "polity"]["counts"]["hard"] == 1
    assert rows["polity"]["counts"]["medium"] == 1


def test_difficulty_heatmap_empty_when_no_verified_questions():
    db = _seed()
    for q in db["pyq_questions"]:
        q["reviewer_status"] = "pending"
    heatmap = difficulty_heatmap(SBStub(db), "exam-1")
    assert heatmap == {
        "buckets": ["easy", "medium", "hard", "unknown"],
        "rows": [],
        "verified_question_count": 0,
    }
