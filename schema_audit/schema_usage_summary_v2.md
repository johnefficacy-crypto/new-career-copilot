# Schema Usage Summary v2

Root scanned: `D:\GovtExamAgent\ccp-mainbuild-v1`

Schema file: `D:\GovtExamAgent\ccp-mainbuild-v1\app\docs\supabase(Govt Exam copilot)-Schema.md`

- Tables found: 104
- Views found in schema doc: 0
- Functions found in schema doc: 0
- Total schema objects found: 104

## runtime_used (51)

- `admin_audit_logs` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/api/eligibility.py; app/backend/app/api/notifications.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_queue.py; app/backend/tests/test_eligibility_api_integration.py
- `admin_settings` (table) — runtime: app/backend/app/api/notifications.py; app/backend/app/notifications/__init__.py; app/backend/app/notifications/dispatcher.py; app/frontend/src/pages/admin/Notifications.jsx
- `age_criteria` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/app/scraping/runner.py; app/backend/tests/eligibility/test_engine.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py; app/backend/tests/test_scrape_runner_promote.py
- `aspirant_certifications` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_advanced_contract.py
- `aspirant_education` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_contract.py
- `aspirant_exam_attempts` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_advanced_contract.py
- `aspirant_exam_credentials` (table) — runtime: app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py
- `aspirant_experience` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_advanced_contract.py
- `aspirant_location` (table) — runtime: app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py
- `aspirant_preferences` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_contract.py
- `aspirant_reservations` (table) — runtime: app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py
- `attempt_limits` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/tests/eligibility/test_engine.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py
- `certification_criteria` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py
- `certifications` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/app/profile/eligibility_profile.py; app/backend/tests/test_eligibility_mapper.py; app/frontend/src/features/profile/components/CertificationsSection.jsx; app/frontend/src/features/profile/hooks/useProfileData.js; app/frontend/src/services/profileService.js
- `course_sections` (table) — runtime: app/backend/app/api/canonical.py
- `courses` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/frontend/src/pages/Marketplace.jsx
- `education_criteria` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/app/scraping/runner.py; app/backend/tests/eligibility/test_engine.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py
- `eligibility_recompute_queue` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/eligibility/recompute_queue.py; app/backend/app/notifications/recompute_worker.py; app/backend/tests/test_profile_advanced_contract.py; app/backend/tests/test_profile_contract.py; app/backend/tests/test_recompute_queue_behaviour.py
- `eligibility_results` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/recompute_worker.py; app/backend/app/scraping/alerts.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py
- `extracted_field_evidence` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/tests/test_admin_queue.py
- `forum_categories` (table) — runtime: app/backend/app/api/canonical.py
- `forum_comments` (table) — runtime: app/backend/app/api/canonical.py
- `forum_post_upvotes` (table) — runtime: app/backend/app/api/canonical.py
- `forum_posts` (table) — runtime: app/backend/app/api/canonical.py
- `lessons` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/frontend/src/pages/ResourceDetail.jsx
- `mock_tests` (table) — runtime: app/backend/app/api/canonical.py
- `notification_alerts` (table) — runtime: app/backend/app/api/notifications.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/__init__.py; app/backend/app/notifications/dispatcher.py; app/backend/app/notifications/next_actions.py; app/backend/app/notifications/recompute_worker.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/alerts.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_next_actions_engine.py
- `notification_documents` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/tests/test_admin_queue.py
- `notification_generation_runs` (table) — runtime: app/backend/app/api/notifications.py; app/backend/tests/test_notifications_api_next_actions.py
- `notification_preferences` (table) — runtime: app/backend/app/api/notifications.py; app/backend/app/notifications/__init__.py; app/backend/app/notifications/dispatcher.py; app/backend/app/notifications/next_actions.py; app/backend/tests/test_next_actions_engine.py; app/frontend/src/pages/admin/Notifications.jsx
- `organizations` (table) — runtime: app/backend/app/api/admin_trust.py; app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/dispatcher.py; app/backend/app/scraping/alerts.py; app/backend/app/scraping/runner.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_trust.py; app/backend/tests/test_applications_contract.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_recruitment_visibility.py; app/backend/tests/test_scrape_runner_promote.py; app/frontend/src/components/FAQ.jsx; app/frontend/src/pages/admin/AdminShell.jsx; app/frontend/src/pages/admin/Organizations.jsx; app/frontend/src/routes/adminRoutes.jsx; app/frontend/src/services/adminTrustService.js
- `payment_history` (table) — runtime: app/backend/app/api/payments.py
- `posts` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/scraping/extractor.py; app/backend/app/scraping/normalizer.py; app/backend/app/scraping/runner.py; app/backend/app/scraping/schemas.py; app/backend/tests/scraping/test_normalizer.py; app/backend/tests/test_admin_trust.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py; app/backend/tests/test_scrape_runner_promote.py; app/frontend/src/components/Hero.jsx; app/frontend/src/components/Pricing.jsx; app/frontend/src/components/Testimonials.jsx; app/frontend/src/pages/Dashboard.jsx; app/frontend/src/pages/ExamDetail.jsx; app/frontend/src/pages/Exams.jsx; app/frontend/src/pages/ThreadDetail.jsx; app/frontend/src/pages/admin/Recruitment.jsx
- `profiles` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/canonical.py; app/backend/app/api/notifications.py; app/backend/app/api/payments.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/server.py; app/backend/tests/test_db_utils_async.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_error_propagation_api.py; app/backend/tests/test_notifications_api_next_actions.py; app/backend/tests/test_profile_advanced_contract.py; app/backend/tests/test_profile_contract.py
- `recruitments` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/dispatcher.py; app/backend/app/notifications/recompute_worker.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/alerts.py; app/backend/app/scraping/runner.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_trust.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_recruitment_visibility.py; app/backend/tests/test_scrape_runner_promote.py; app/frontend/src/components/FAQ.jsx; app/frontend/src/components/Features.jsx; app/frontend/src/components/Hero.jsx; app/frontend/src/components/Testimonials.jsx; app/frontend/src/features/dashboard/hooks/useDashboardData.js; app/frontend/src/lib/recruitmentRanking.js; app/frontend/src/pages/Dashboard.jsx; app/frontend/src/pages/ExamDetail.jsx; app/frontend/src/pages/Exams.jsx; app/frontend/src/pages/Saved.jsx; app/frontend/src/pages/Tracker.jsx; app/frontend/src/pages/admin/AdminShell.jsx; app/frontend/src/pages/admin/Organizations.jsx; app/frontend/src/pages/admin/Overview.jsx
- `reviews` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/frontend/src/pages/ResourceDetail.jsx
- `salary_details` (table) — runtime: app/backend/app/eligibility/runner.py
- `scrape_queue` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/runner.py; app/backend/app/scraping/schemas.py; app/backend/tests/test_admin_queue.py; app/backend/tests/test_recompute_queue_behaviour.py
- `scrape_runs` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/runner.py
- `scrape_sources` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/scraping/runner.py
- `source_registry` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/runner.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_trust.py
- `study_plans` (table) — runtime: app/backend/app/api/canonical.py
- `study_sessions` (table) — runtime: app/backend/app/api/canonical.py
- `study_tasks` (table) — runtime: app/backend/app/api/canonical.py
- `subscription_plans` (table) — runtime: app/backend/app/api/payments.py
- `tracked_recruitments` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py
- `user_certifications` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/tests/test_engine.py
- `user_exam_attempts` (table) — runtime: app/backend/app/eligibility/runner.py
- `user_recruitment_applications` (table) — runtime: app/backend/app/api/canonical.py; app/backend/tests/test_applications_contract.py
- `user_subscriptions` (table) — runtime: app/backend/app/api/payments.py
- `vacancies` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/backend/app/eligibility/runner.py; app/backend/app/scraping/extractor.py; app/backend/app/scraping/schemas.py; app/frontend/src/lib/recruitmentRanking.js; app/frontend/src/pages/ExamDetail.jsx; app/frontend/src/pages/Exams.jsx

## migration_only_or_indirect (37)

- `aggregator_listings` (table) — migrations: app/supabase/migrations/044_aggregator_candidate_layers.sql
- `ai_action_policies` (table) — migrations: app/supabase/migrations/035_ai_action_policies.sql
- `ai_jobs` (table) — migrations: app/supabase/migrations/020_ai_infrastructure.sql
- `ai_prompt_versions` (table) — migrations: app/supabase/migrations/020_ai_infrastructure.sql
- `ai_review_queue` (table) — migrations: app/supabase/migrations/020_ai_infrastructure.sql
- `alert_events` (table) — migrations: app/supabase/migrations/003_v_notification_feed.sql; app/supabase/migrations/010_notification_alerts_unique_fanout.sql
- `candidate_observations` (table) — migrations: app/supabase/migrations/044_aggregator_candidate_layers.sql
- `chat_sessions` (table) — migrations: app/supabase/migrations/039_ai_chat_setup.sql
- `community_channels` (table) — migrations: app/supabase/migrations/050_community_foundation.sql
- `community_replies` (table) — migrations: app/supabase/migrations/050_community_foundation.sql
- `community_reports` (table) — migrations: app/supabase/migrations/050_community_foundation.sql
- `community_spaces` (table) — migrations: app/supabase/migrations/050_community_foundation.sql
- `community_threads` (table) — migrations: app/supabase/migrations/050_community_foundation.sql
- `community_votes` (table) — migrations: app/supabase/migrations/050_community_foundation.sql
- `education_authorities` (table) — migrations: app/supabase/migrations/047_education_authority_grading.sql
- `embeddings` (table) — migrations: app/supabase/migrations/030_embeddings.sql
- `enrollments` (table) — migrations: app/supabase/migrations/049_marketplace_setup.sql
- `form_submissions` (table) — migrations: app/supabase/migrations/027_user_events_and_form_submissions.sql
- `forum_comment_upvotes` (table) — migrations: app/supabase/migrations/040_forum_setup.sql
- `forum_reports` (table) — migrations: app/supabase/migrations/041_forum_moderation_queue.sql
- `forum_reputation` (table) — migrations: app/supabase/migrations/040_forum_setup.sql
- `forum_saved_posts` (table) — migrations: app/supabase/migrations/040_forum_setup.sql
- `grading_conversion_rules` (table) — migrations: app/supabase/migrations/047_education_authority_grading.sql
- `instructor_payouts` (table) — migrations: app/supabase/migrations/049_marketplace_setup.sql
- `lesson_progress` (table) — migrations: app/supabase/migrations/049_marketplace_setup.sql
- `listing_observations` (table) — migrations: app/supabase/migrations/044_aggregator_candidate_layers.sql
- `mock_subject_breakdowns` (table) — migrations: app/supabase/migrations/034_mock_tests.sql
- `notification_group_state` (table) — migrations: app/supabase/migrations/048_notification_group_state.sql
- `notification_templates` (table) — migrations: app/supabase/migrations/037_runbook_schema.sql
- `recruitment_candidates` (table) — migrations: app/supabase/migrations/044_aggregator_candidate_layers.sql
- `recruitment_events` (table) — migrations: app/supabase/migrations/076_recruitment_events.sql
- `source_observations` (table) — migrations: app/supabase/migrations/009_v_admin_queue_review.sql; app/supabase/migrations/018_admin_queue_evidence_view.sql
- `study_weeks` (table) — migrations: app/supabase/migrations/020_ai_infrastructure.sql
- `user_events` (table) — migrations: app/supabase/migrations/027_user_events_and_form_submissions.sql; app/supabase/migrations/028_user_recruitment_state.sql; app/supabase/migrations/031_apply_tracker.sql
- `user_next_actions` (table) — migrations: app/supabase/migrations/020_ai_infrastructure.sql
- `user_recruitment_feedback` (table) — migrations: app/supabase/migrations/045_user_recruitment_feedback.sql
- `user_targets` (table) — migrations: app/supabase/migrations/028_user_recruitment_state.sql

## docs_only_review (16)

- `alert_deliveries` (table) — docs: docs/schema/supabase -Schema.md
- `career_progression` (table) — docs: docs/schema/supabase -Schema.md
- `educational_qualifications` (table) — docs: docs/schema/supabase -Schema.md
- `exam_stages` (table) — docs: docs/schema/supabase -Schema.md
- `probation_details` (table) — docs: docs/schema/supabase -Schema.md
- `recruitment_field_diffs` (table) — docs: docs/schema/supabase -Schema.md
- `recruitment_versions` (table) — docs: docs/schema/supabase -Schema.md
- `scrape_pdf_cache` (table) — docs: docs/schema/supabase -Schema.md
- `scrape_source_etags` (table) — docs: docs/schema/supabase -Schema.md
- `service_bonds` (table) — docs: docs/schema/supabase -Schema.md
- `source_health_metrics` (table) — docs: docs/schema/supabase -Schema.md
- `source_registry_backup_before_bulk_merge` (table) — docs: docs/schema/supabase -Schema.md
- `source_registry_conflict_backup` (table) — docs: docs/schema/supabase -Schema.md
- `study_logs` (table) — docs: docs/schema/supabase -Schema.md
- `training_details` (table) — docs: docs/schema/supabase -Schema.md
- `user_notification_prefs` (table) — docs: docs/schema/supabase -Schema.md

## schema_only_candidate (0)


