import pytest
from pydantic import ValidationError

from app.scraping.schemas import (
    ExtractedPost,
    ExtractedRecruitment,
    RawExtractedRecruitment,
    VerifiedRecruitmentForPromotion,
)


def test_extracted_recruitment_aliases_raw_shape():
    """``ExtractedRecruitment`` is the back-compat alias of the permissive shape."""
    assert ExtractedRecruitment is RawExtractedRecruitment


def test_raw_shape_accepts_partial_extractions():
    rec = RawExtractedRecruitment(
        title="t",
        organization_name="o",
        org_type="Other",
        year=2026,
        official_notification_url="https://x",
    )
    assert rec.apply_end_date is None
    assert rec.posts == []


def test_verified_shape_requires_apply_end_date():
    with pytest.raises(ValidationError):
        VerifiedRecruitmentForPromotion(
            title="t",
            organization_name="o",
            org_type="Other",
            year=2026,
            official_notification_url="https://x",
            posts=[{"post_name": "p"}],
        )


def test_verified_shape_requires_at_least_one_post():
    with pytest.raises(ValidationError):
        VerifiedRecruitmentForPromotion(
            title="t",
            organization_name="o",
            org_type="Other",
            year=2026,
            official_notification_url="https://x",
            apply_end_date="2026-12-31",
            posts=[],
        )


def test_verified_shape_accepts_minimal_complete_payload():
    rec = VerifiedRecruitmentForPromotion(
        title="t",
        organization_name="o",
        org_type="Other",
        year=2026,
        official_notification_url="https://x",
        apply_end_date="2026-12-31",
        posts=[{"post_name": "p"}],
    )
    assert rec.apply_end_date == "2026-12-31"


def test_extracted_post_accepts_new_eligibility_fields():
    post = ExtractedPost(
        post_name="Inspector",
        age_cutoff_date="2026-08-01",
        raw_requirement_text="Bachelor's degree from a recognised university",
        fees={"general": 100, "obc": 100, "sc": 0},
        selection_process=["tier_1", "tier_2", "interview"],
        category_vacancies={"UR": 50, "SC": 15, "ST": 7, "OBC": 25, "EWS": 3},
        age_relaxation={"SC": 5, "OBC": 3, "PwBD": 10},
        exam_pattern=[{"section": "GA", "questions": 25}],
        skill_tests=[{"type": "typing", "wpm": 35}],
        certificates=["caste", "domicile"],
        job_location="Pan India",
        source_evidence={"page": 3, "section": "Eligibility"},
    )
    # All new fields round-trip through model_dump.
    dumped = post.model_dump()
    assert dumped["age_cutoff_date"] == "2026-08-01"
    assert dumped["raw_requirement_text"].startswith("Bachelor")
    assert dumped["category_vacancies"]["UR"] == 50
