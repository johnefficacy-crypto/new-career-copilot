"""Trust boundary for ``verified_pyq_topic_counts``.

The function used to filter ``pyq_questions.reviewer_status='verified'``
and ``pyq_question_topic_tags.reviewer_status='verified'``, but the paper
select was scoped to ``exam_id`` only — never filtering
``pyq_papers.trust_status='verified'``. A misconfigured ingest pipeline
that left a verified question under an unverified paper would still
feed planner counts.

This suite pins the corrected behaviour: only tags attached to questions
whose parent paper is itself ``trust_status='verified'`` are counted.
"""
from __future__ import annotations

from app.exam_intelligence.coverage import verified_pyq_topic_counts
from tests.persona_questions._stub import SBStub


def _seed_mixed_trust() -> dict:
    """Two papers under one exam: one verified, one unverified.

    Both papers carry verified question rows and verified tag rows. Only
    the rows attached to the verified paper should contribute.
    """
    return {
        "pyq_papers": [
            {
                "id": "paper-verified",
                "exam_id": "exam-1",
                "trust_status": "verified",
            },
            {
                "id": "paper-unverified",
                "exam_id": "exam-1",
                "trust_status": "pending",
            },
        ],
        "pyq_questions": [
            {
                "id": "q-from-verified-paper",
                "pyq_paper_id": "paper-verified",
                "reviewer_status": "verified",
            },
            {
                "id": "q-from-unverified-paper",
                "pyq_paper_id": "paper-unverified",
                "reviewer_status": "verified",
            },
        ],
        "pyq_question_topic_tags": [
            {
                "id": "tag-1",
                "question_id": "q-from-verified-paper",
                "topic_id": "topic-A",
                "reviewer_status": "verified",
                "tag_role": "primary",
            },
            {
                "id": "tag-2",
                "question_id": "q-from-unverified-paper",
                "topic_id": "topic-B",
                "reviewer_status": "verified",
                "tag_role": "primary",
            },
        ],
    }


def test_counts_only_include_tags_under_verified_papers():
    sb = SBStub(_seed_mixed_trust())
    counts = verified_pyq_topic_counts(sb, "exam-1")
    # Only topic-A should appear; topic-B's tag sat under an unverified paper.
    assert counts == {"topic-A": 1}, counts
    assert "topic-B" not in counts


def test_counts_empty_when_no_verified_papers():
    sb = SBStub(
        {
            "pyq_papers": [
                {
                    "id": "p1",
                    "exam_id": "exam-1",
                    "trust_status": "pending",
                }
            ],
            "pyq_questions": [
                {
                    "id": "q1",
                    "pyq_paper_id": "p1",
                    "reviewer_status": "verified",
                }
            ],
            "pyq_question_topic_tags": [
                {
                    "id": "t1",
                    "question_id": "q1",
                    "topic_id": "topic-X",
                    "reviewer_status": "verified",
                    "tag_role": "primary",
                }
            ],
        }
    )
    assert verified_pyq_topic_counts(sb, "exam-1") == {}


def test_counts_aggregate_across_two_verified_papers():
    sb = SBStub(
        {
            "pyq_papers": [
                {"id": "p1", "exam_id": "exam-1", "trust_status": "verified"},
                {"id": "p2", "exam_id": "exam-1", "trust_status": "verified"},
            ],
            "pyq_questions": [
                {"id": "q1", "pyq_paper_id": "p1", "reviewer_status": "verified"},
                {"id": "q2", "pyq_paper_id": "p2", "reviewer_status": "verified"},
            ],
            "pyq_question_topic_tags": [
                {
                    "id": "t1",
                    "question_id": "q1",
                    "topic_id": "topic-A",
                    "reviewer_status": "verified",
                    "tag_role": "primary",
                },
                {
                    "id": "t2",
                    "question_id": "q2",
                    "topic_id": "topic-A",
                    "reviewer_status": "verified",
                    "tag_role": "secondary",
                },
            ],
        }
    )
    counts = verified_pyq_topic_counts(sb, "exam-1")
    assert counts == {"topic-A": 2}, counts
