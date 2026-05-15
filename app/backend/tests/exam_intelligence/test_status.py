"""Tests for exam_intelligence status + summary helpers (PR5)."""
from __future__ import annotations

from app.exam_intelligence.coverage import locked_topic_coverage
from app.exam_intelligence.status import (
    exam_intelligence_status,
    exam_intelligence_summary,
)
from tests.persona_questions._stub import SBStub


def test_locked_topic_coverage_excludes_non_locked_rows():
    sb = SBStub({
        "exam_topic_coverage": [
            {"id": "c1", "exam_id": "exam-1", "topic_id": "t1",
             "exam_priority_score": 84, "is_high_yield": True,
             "confidence_score": 0.78, "reviewer_status": "locked"},
            {"id": "c2", "exam_id": "exam-1", "topic_id": "t2",
             "exam_priority_score": 95, "is_high_yield": True,
             "confidence_score": 0.9, "reviewer_status": "reviewed"},
            {"id": "c3", "exam_id": "exam-1", "topic_id": "t3",
             "exam_priority_score": 50, "is_high_yield": False,
             "confidence_score": 0.4, "reviewer_status": "draft"},
        ],
        "topics": [
            {"id": "t1", "name": "Percentage", "slug": "pct", "is_active": True},
            {"id": "t2", "name": "Ratios", "slug": "ratios", "is_active": True},
            {"id": "t3", "name": "Algebra", "slug": "alg", "is_active": True},
        ],
    })
    rows = locked_topic_coverage(sb, "exam-1")
    assert [r["topic"] for r in rows] == ["Percentage"]
    assert rows[0]["status"] == "locked"
    assert rows[0]["priority_score"] == 84


def test_locked_topic_coverage_empty_when_no_exam():
    assert locked_topic_coverage(SBStub({}), "") == []


_EXAM = {
    "id": "exam-1",
    "slug": "ssc-cgl",
    "name": "SSC CGL",
    "exam_type": "recruitment",
    "is_active": True,
}


def _seed_empty():
    return {"exams": [_EXAM]}


def _seed_verified():
    return {
        "exams": [_EXAM],
        "exam_topic_coverage": [
            {"exam_id": "exam-1", "topic_id": "t1", "priority": 1, "is_active": True},
            {"exam_id": "exam-1", "topic_id": "t2", "priority": 2, "is_active": True},
        ],
        "topics": [
            {"id": "t1", "slug": "percentages", "name": "Percentages", "level": "topic", "is_active": True, "subject_id": "subj-quant"},
            {"id": "t2", "slug": "ratios", "name": "Ratios", "level": "topic", "is_active": True, "subject_id": "subj-quant"},
        ],
        "subjects": [
            {"id": "subj-quant", "slug": "quant", "name": "Quant", "is_active": True},
        ],
        "pyq_papers": [{"id": "paper-1", "exam_id": "exam-1"}],
        "pyq_questions": [
            {"id": "q1", "pyq_paper_id": "paper-1", "reviewer_status": "verified"},
            {"id": "q2", "pyq_paper_id": "paper-1", "reviewer_status": "verified"},
            {"id": "q3", "pyq_paper_id": "paper-1", "reviewer_status": "pending"},
        ],
        "pyq_question_topic_tags": [
            {"question_id": "q1", "topic_id": "t1", "reviewer_status": "verified", "tag_role": "primary"},
            {"question_id": "q2", "topic_id": "t1", "reviewer_status": "verified", "tag_role": "primary"},
            {"question_id": "q3", "topic_id": "t2", "reviewer_status": "verified", "tag_role": "primary"},  # tag verified but question wasn't, so excluded
        ],
        "syllabus_topic_mentions": [
            {"id": "m1", "exam_id": "exam-1", "reviewer_status": "verified"},
            {"id": "m2", "exam_id": "exam-1", "reviewer_status": "pending"},
        ],
    }


# ─── status ────────────────────────────────────────────────────────────────
def test_status_returns_not_available_when_nothing_verified():
    sb = SBStub(_seed_empty())
    out = exam_intelligence_status(sb, "ssc-cgl")
    assert out["available"] is False
    assert out["exam_id"] == "exam-1"
    assert out["verified_topics"] == 0
    assert out["verified_pyq_tags"] == 0
    assert out["verified_syllabus_mentions"] == 0


def test_status_returns_available_when_verified_data_exists():
    sb = SBStub(_seed_verified())
    out = exam_intelligence_status(sb, "ssc-cgl")
    assert out["available"] is True
    assert out["verified_topics"] == 2
    # Only q1 + q2 are verified questions; q3 (whose tag was verified) is excluded.
    assert out["verified_pyq_tags"] == 2
    assert out["verified_syllabus_mentions"] == 1


def test_status_handles_unknown_exam_slug():
    sb = SBStub(_seed_empty())
    out = exam_intelligence_status(sb, "no-such-exam")
    assert out["available"] is False
    assert out["exam_id"] is None
    assert out["exam_slug"] == "no-such-exam"


def test_status_handles_none_input():
    sb = SBStub(_seed_empty())
    out = exam_intelligence_status(sb, None)
    assert out["available"] is False


def test_status_safe_when_tables_missing():
    class _Broken:
        def table(self, name):
            raise RuntimeError(f"{name} not deployed")

    out = exam_intelligence_status(_Broken(), "ssc-cgl")
    assert out["available"] is False


# ─── summary ───────────────────────────────────────────────────────────────
def test_summary_includes_verified_topic_coverage_with_pyq_counts():
    sb = SBStub(_seed_verified())
    out = exam_intelligence_summary(sb, "ssc-cgl")
    assert out["exam"]["slug"] == "ssc-cgl"
    assert out["available"] is True
    assert out["verified_only"] is True
    topic_ids = {t["topic_id"]: t for t in out["topics"]}
    assert "t1" in topic_ids and topic_ids["t1"]["verified_pyq_count"] == 2
    assert "t2" in topic_ids and topic_ids["t2"]["verified_pyq_count"] == 0
    assert out["verified_pyq_counts"]["t1"] == 2


def test_summary_does_not_invent_intelligence_for_unknown_exam():
    sb = SBStub({"exams": []})
    out = exam_intelligence_summary(sb, "ghost-exam")
    assert out["exam"] is None
    assert out["topics"] == []
    assert out["available"] is False
    assert out["verified_only"] is True
