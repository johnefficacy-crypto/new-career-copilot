from pathlib import Path


def test_active_migration_adds_eligibility_relationship_fks():
    sql = Path("../../app/supabase/migrations/027_eligibility_relationship_fks.sql").read_text().lower()

    for constraint in (
        "age_criteria_post_id_fkey",
        "education_criteria_post_id_fkey",
        "attempt_limits_post_id_fkey",
        "certification_criteria_post_id_fkey",
        "post_disability_requirements_post_id_fkey",
        "age_relaxation_rules_post_id_fkey",
        "posts_recruitment_id_fkey",
        "recruitments_organization_id_fkey",
    ):
        assert constraint in sql

    assert "not valid" in sql
    assert "notify pgrst, 'reload schema';" in sql
