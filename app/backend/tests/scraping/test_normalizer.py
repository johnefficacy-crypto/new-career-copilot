from app.scraping.normalizer import normalize_recruitment
from app.scraping.schemas import ExtractedPost, ExtractedRecruitment


def _rec(**overrides):
    base = dict(
        title="T",
        organization_name="Org",
        org_type="SSC",
        year=2026,
        official_notification_url="https://x",
        posts=[],
    )
    base.update(overrides)
    return ExtractedRecruitment(**base)


def test_normalizer_scores_missing_fields():
    out = normalize_recruitment(_rec())
    assert out.data_quality_score < 1.0
    assert "missing_posts" in out.warnings
    assert "missing_apply_end_date" in out.warnings


def test_whitespace_title_treated_as_missing():
    out = normalize_recruitment(_rec(title="   ", organization_name="   "))
    assert "missing_title" in out.warnings
    assert "missing_organization" in out.warnings
    # Normalised fields collapse the whitespace to "".
    assert out.normalized_fields["title"] == ""
    assert out.normalized_fields["organization_name"] == ""


def test_post_level_readiness_bonus_for_complete_post():
    fully_described = ExtractedPost(
        post_name="Inspector",
        min_age=18,
        max_age=32,
        education_required="Bachelor's degree",
        vacancies=100,
    )
    out = normalize_recruitment(_rec(
        apply_end_date="2026-12-31",
        total_vacancies=100,
        posts=[fully_described],
    ))
    # With every required field present we hit the post-level bonus.
    assert out.data_quality_score >= 1.0


def test_post_missing_eligibility_warned():
    weak = ExtractedPost(post_name="Junior Assistant")
    out = normalize_recruitment(_rec(
        apply_end_date="2026-12-31",
        total_vacancies=100,
        posts=[weak],
    ))
    assert any(w.startswith("posts_missing_eligibility") for w in out.warnings)


def test_date_order_invalid_warning():
    out = normalize_recruitment(_rec(
        apply_start_date="2026-12-31",
        apply_end_date="2026-12-01",
        total_vacancies=10,
        posts=[ExtractedPost(post_name="X", min_age=18, max_age=30, education_required="bachelor", vacancies=10)],
    ))
    assert "date_order_invalid" in out.warnings


def test_notification_after_apply_end_warning():
    out = normalize_recruitment(_rec(
        notification_date="2026-12-15",
        apply_end_date="2026-12-01",
        total_vacancies=10,
        posts=[ExtractedPost(post_name="X", min_age=18, max_age=30, education_required="bachelor", vacancies=10)],
    ))
    assert "notification_after_apply_end" in out.warnings


def test_age_range_invalid_warning():
    out = normalize_recruitment(_rec(
        apply_end_date="2026-12-31",
        total_vacancies=10,
        posts=[ExtractedPost(post_name="X", min_age=40, max_age=30)],
    ))
    assert "age_range_invalid" in out.warnings


def test_vacancy_sum_mismatch_warning():
    out = normalize_recruitment(_rec(
        apply_end_date="2026-12-31",
        total_vacancies=10,
        posts=[
            ExtractedPost(post_name="A", vacancies=8),
            ExtractedPost(post_name="B", vacancies=8),
        ],
    ))
    assert "vacancy_sum_mismatch" in out.warnings


def test_year_date_mismatch_warning():
    out = normalize_recruitment(_rec(
        year=2026,
        apply_start_date="2024-01-01",
        apply_end_date="2024-02-01",
        notification_date="2023-12-01",
        total_vacancies=10,
        posts=[ExtractedPost(post_name="X", min_age=18, max_age=30, education_required="bachelor", vacancies=10)],
    ))
    assert "year_date_mismatch" in out.warnings


def test_clean_recruitment_has_no_contradictions():
    out = normalize_recruitment(_rec(
        notification_date="2026-01-01",
        apply_start_date="2026-01-15",
        apply_end_date="2026-02-15",
        total_vacancies=100,
        posts=[ExtractedPost(post_name="X", min_age=18, max_age=30, education_required="bachelor", vacancies=100)],
    ))
    contradictions = {"date_order_invalid", "notification_after_apply_end", "age_range_invalid", "vacancy_sum_mismatch", "year_date_mismatch"}
    assert not contradictions.intersection(out.warnings)
