import os

import pytest

from app.db.supabase_client import get_supabase_admin


REQUIRED_COLUMNS = {
    "profiles": {
        "id",
        "full_name",
        "phone",
        "gender",
        "category",
        "pwbd_status",
        "domicile_state",
        "nationality",
        "ex_serviceman",
        "govt_employee",
        "dob",
        "date_of_birth",
        "service_years",
        "graduation_year",
        "target_type",
        "target_exam",
        "career_stage",
        "career_goal",
        "onboarding_step",
        "onboarding_completed",
        "is_admin",
        "plan_id",
        "avatar_url",
    },
    "recruitments": {
        "id",
        "organization_id",
        "slug",
        "name",
        "year",
        "status",
        "publish_status",
        "notification_date",
        "apply_start_date",
        "apply_end_date",
        "total_vacancies",
        "official_notification_url",
        "official_apply_url",
        "source_pdf_url",
        "published_by",
        "published_at",
        "review_notes",
    },
    "posts": {
        "id",
        "recruitment_id",
        "post_name",
        "post_code",
        "group_type",
        "pay_level",
        "job_type",
    },
    "eligibility_results": {
        "id",
        "user_id",
        "recruitment_id",
        "post_id",
        "profile_hash",
        "is_eligible",
        "is_conditional",
        "fail_reasons",
        "pass_reasons",
        "computed_at",
    },
    "eligibility_recompute_queue": {
        "id",
        "user_id",
        "recruitment_id",
        "post_id",
        "reason",
        "status",
        "queued_at",
        "claimed_at",
        "processed_at",
        "metadata",
        "next_attempt_at",
        "attempt_count",
        "last_error",
    },
    "scrape_queue": {
        "id",
        "source_id",
        "source_url",
        "source_name",
        "raw_html",
        "raw_payload",
        "extracted_data",
        "extracted_fields",
        "confidence_score",
        "data_quality_score",
        "status",
        "duplicate_of",
        "reviewer_id",
        "reviewer_notes",
        "reviewed_at",
        "field_evidence",
        "official_source_resolved",
        "official_source_host",
        "extraction_status",
        "evidence_required",
        "scraped_at",
        "notification_document_id",
        "promoted_recruitment_id",
    },
    "notification_documents": {
        "id",
        "source_id",
        "scrape_queue_id",
        "file_url",
        "storage_path",
        "content_hash",
        "document_type",
        "created_at",
    },
    "extracted_field_evidence": {
        "id",
        "scrape_queue_id",
        "document_id",
        "entity_type",
        "entity_key",
        "field_name",
        "evidence_text",
        "reviewer_status",
        "reviewed_at",
        "created_at",
    },
    "notification_alerts": {
        "id",
        "user_id",
        "recruitment_id",
        "alert_event_id",
        "alert_type",
        "priority",
        "is_read",
        "sent_at",
        "read_at",
        "explanation",
        "email_sent",
        "email_sent_at",
        "delivery_error",
        "source",
    },
    "user_recruitment_applications": {
        "id",
        "user_id",
        "recruitment_id",
        "post_id",
        "status",
        "application_number",
        "fee_paid",
        "fee_amount",
        "documents_pending",
        "notes",
        "submitted_at",
        "clicked_apply_at",
        "updated_at",
        "created_at",
    },
}


@pytest.mark.integration
@pytest.mark.parametrize(("table", "columns"), REQUIRED_COLUMNS.items())
def test_backend_required_schema_columns_exist(table, columns):
    if not (
        os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        and os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    ):
        pytest.skip("Supabase service-role credentials are not configured")

    supabase = get_supabase_admin()
    select_list = ",".join(sorted(columns))

    try:
        supabase.table(table).select(select_list).limit(0).execute()
    except Exception as exc:  # noqa: BLE001
        raise AssertionError(
            f"{table} is missing one or more backend-required columns: {select_list}"
        ) from exc
