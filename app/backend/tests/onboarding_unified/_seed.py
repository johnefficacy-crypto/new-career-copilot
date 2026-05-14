"""Shared in-memory seed data for unified onboarding tests.

Reuses the persona_questions SBStub (a tiny in-memory Supabase double).
"""
from __future__ import annotations

from typing import Any

from tests.persona_questions._stub import SBStub  # noqa: F401  (re-exported)


def persona_bank() -> list[dict[str, Any]]:
    """Three safe persona questions + one deliberately sensitive one."""
    return [
        {
            "id": "pb-1",
            "question_key": "preparation_stage_self_assessment",
            "question_text": "Where are you currently in your preparation?",
            "help_text": "Helps us choose the right starting point.",
            "data_type": "single_select",
            "options": [
                {"value": "just_starting", "label": "Just starting"},
                {"value": "currently_preparing", "label": "Currently preparing"},
            ],
            "target_dimension": "preparation_stage",
            "priority": 10,
            "is_active": True,
        },
        {
            "id": "pb-2",
            "question_key": "weekday_study_availability",
            "question_text": "How much time can you study on a weekday?",
            "help_text": None,
            "data_type": "single_select",
            "options": [
                {"value": "less_than_1_hour", "label": "Less than 1 hour"},
                {"value": "1_to_2_hours", "label": "1 to 2 hours"},
            ],
            "target_dimension": "time_constraint",
            "priority": 20,
            "is_active": True,
        },
        {
            "id": "pb-3",
            "question_key": "mock_behavior",
            "question_text": "How do you handle mock tests?",
            "help_text": None,
            "data_type": "single_select",
            "options": [
                {"value": "avoid_mocks", "label": "Avoid"},
                {"value": "analyze_every_mock", "label": "Analyze every"},
            ],
            "target_dimension": "learning_behavior",
            "priority": 30,
            "is_active": True,
        },
        {
            # Deliberately sensitive — must NEVER surface in cold onboarding.
            "id": "pb-sensitive",
            "question_key": "reservation_category_pick",
            "question_text": "Which reservation category applies to you?",
            "help_text": None,
            "data_type": "single_select",
            "options": [{"value": "gen", "label": "General"}],
            "target_dimension": "reservation",
            "priority": 5,
            "is_active": True,
        },
    ]


def field_registry() -> list[dict[str, Any]]:
    return [
        {
            "field_key": "has_marathi_knowledge",
            "canonical_label": "Adequate knowledge of Marathi",
            "user_facing_label": "Marathi language knowledge",
            "data_type": "boolean",
            "profile_group": "language",
            "profile_table": None,
            "profile_column": None,
            "question_template": "Do you know Marathi?",
            "help_text": None,
            "allowed_values": [],
            "is_active": True,
        },
        {
            "field_key": "date_of_birth",
            "canonical_label": "Date of birth",
            "user_facing_label": "Date of birth",
            "data_type": "date",
            "profile_group": "identity",
            "profile_table": "profiles",
            "profile_column": "date_of_birth",
            "question_template": "What is your date of birth?",
            "help_text": None,
            "allowed_values": [],
            "is_active": True,
        },
    ]


def cta_world() -> dict[str, list[dict[str, Any]]]:
    """A recruitment + post + verified/pending/rejected requirement rows."""
    return {
        "recruitments": [
            {
                "id": "rec-1",
                "slug": "cnp-nashik-2026",
                "name": "CNP Nashik Recruitment 2026",
                "publish_status": "published",
                "status": "active",
            }
        ],
        "posts": [
            {
                "id": "post-1",
                "recruitment_id": "rec-1",
                "post_name": "Safety Officer",
                "post_code": "safety-officer",
            }
        ],
        "candidate_field_registry": field_registry(),
        "recruitment_question_requirements": [
            {
                "id": "rqr-verified",
                "recruitment_id": "rec-1",
                "post_id": "post-1",
                "field_key": "has_marathi_knowledge",
                "requirement_type": "language",
                "required_for": "eligibility",
                "priority": 10,
                "question_text": "Do you possess adequate knowledge of Marathi?",
                "help_text": "Required by the recruitment's language rule.",
                "options": [],
                "is_knockout": True,
                "reviewer_status": "verified",
            },
            {
                "id": "rqr-pending",
                "recruitment_id": "rec-1",
                "post_id": "post-1",
                "field_key": "date_of_birth",
                "requirement_type": "age",
                "required_for": "eligibility",
                "priority": 20,
                "question_text": "Unverified generated question — must not appear.",
                "help_text": None,
                "options": [],
                "is_knockout": True,
                "reviewer_status": "pending",
            },
            {
                "id": "rqr-rejected",
                "recruitment_id": "rec-1",
                "post_id": "post-1",
                "field_key": "date_of_birth",
                "requirement_type": "age",
                "required_for": "eligibility",
                "priority": 30,
                "question_text": "Rejected question — must not appear.",
                "help_text": None,
                "options": [],
                "is_knockout": True,
                "reviewer_status": "rejected",
            },
        ],
    }
