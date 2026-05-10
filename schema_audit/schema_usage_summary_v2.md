# Schema Usage Summary v2

Root scanned: `D:\GovtExamAgent\ccp-mainbuild-v1`

Schema file: `D:\GovtExamAgent\ccp-mainbuild-v1\docs\schema\supabase(Govt Exam copilot)-Schema.md`

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
- `aspirant_location` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_contract.py
- `aspirant_preferences` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_contract.py; app/backend/tests/test_schema_contract.py
- `aspirant_reservations` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/profile/eligibility_mapper.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_profile_contract.py; app/backend/tests/test_schema_contract.py
- `attempt_limits` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/tests/eligibility/test_engine.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py
- `certification_criteria` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py
- `certifications` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/app/profile/eligibility_profile.py; app/backend/tests/test_eligibility_mapper.py; app/frontend/src/features/profile/components/CertificationsSection.jsx; app/frontend/src/features/profile/hooks/useProfileData.js; app/frontend/src/services/profileService.js
- `course_sections` (table) — runtime: app/backend/app/api/canonical.py
- `courses` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/frontend/src/pages/Marketplace.jsx
- `education_criteria` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/eligibility/schemas.py; app/backend/app/scraping/runner.py; app/backend/tests/eligibility/test_engine.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py; app/backend/tests/test_schema_contract.py
- `eligibility_recompute_queue` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/eligibility/recompute_queue.py; app/backend/app/notifications/recompute_worker.py; app/backend/tests/test_profile_advanced_contract.py; app/backend/tests/test_profile_contract.py; app/backend/tests/test_recompute_queue_behaviour.py; app/backend/tests/test_schema_contract.py
- `eligibility_results` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/recompute_worker.py; app/backend/app/scraping/alerts.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_schema_contract.py
- `extracted_field_evidence` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/tests/test_admin_queue.py; app/backend/tests/test_schema_contract.py
- `forum_categories` (table) — runtime: app/backend/app/api/canonical.py
- `forum_comments` (table) — runtime: app/backend/app/api/canonical.py
- `forum_post_upvotes` (table) — runtime: app/backend/app/api/canonical.py
- `forum_posts` (table) — runtime: app/backend/app/api/canonical.py
- `lessons` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/frontend/src/pages/ResourceDetail.jsx
- `mock_tests` (table) — runtime: app/backend/app/api/canonical.py
- `notification_alerts` (table) — runtime: app/backend/app/api/notifications.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/__init__.py; app/backend/app/notifications/dispatcher.py; app/backend/app/notifications/next_actions.py; app/backend/app/notifications/recompute_worker.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/alerts.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_next_actions_engine.py; app/backend/tests/test_notification_dispatcher_schema_fallback.py; app/backend/tests/test_schema_contract.py
- `notification_documents` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/tests/test_admin_queue.py; app/backend/tests/test_schema_contract.py
- `notification_generation_runs` (table) — runtime: app/backend/app/api/notifications.py; app/backend/tests/test_notifications_api_next_actions.py; app/backend/tests/test_schema_contract.py
- `notification_preferences` (table) — runtime: app/backend/app/api/notifications.py; app/backend/app/notifications/__init__.py; app/backend/app/notifications/dispatcher.py; app/backend/app/notifications/next_actions.py; app/backend/tests/test_next_actions_engine.py; app/frontend/src/pages/admin/Notifications.jsx
- `organizations` (table) — runtime: app/backend/app/api/admin_trust.py; app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/dispatcher.py; app/backend/app/scraping/alerts.py; app/backend/app/scraping/runner.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_trust.py; app/backend/tests/test_applications_contract.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_recruitment_visibility.py; app/backend/tests/test_scrape_runner_promote.py; app/frontend/src/components/FAQ.jsx; app/frontend/src/pages/admin/AdminShell.jsx; app/frontend/src/pages/admin/Organizations.jsx; app/frontend/src/routes/adminRoutes.jsx; app/frontend/src/services/adminTrustService.js
- `payment_history` (table) — runtime: app/backend/app/api/payments.py
- `posts` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/app/scraping/extractor.py; app/backend/app/scraping/normalizer.py; app/backend/app/scraping/runner.py; app/backend/app/scraping/schemas.py; app/backend/tests/scraping/test_normalizer.py; app/backend/tests/test_admin_trust.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_engine.py; app/backend/tests/test_schema_contract.py; app/backend/tests/test_scrape_runner_promote.py; app/frontend/src/components/Hero.jsx; app/frontend/src/components/Pricing.jsx; app/frontend/src/components/Testimonials.jsx; app/frontend/src/pages/Dashboard.jsx; app/frontend/src/pages/ExamDetail.jsx; app/frontend/src/pages/Exams.jsx; app/frontend/src/pages/ThreadDetail.jsx; app/frontend/src/pages/admin/Recruitment.jsx
- `profiles` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/canonical.py; app/backend/app/api/notifications.py; app/backend/app/api/payments.py; app/backend/app/eligibility/runner.py; app/backend/app/profile/eligibility_mapper.py; app/backend/server.py; app/backend/tests/test_db_utils_async.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_eligibility_mapper.py; app/backend/tests/test_error_propagation_api.py; app/backend/tests/test_notifications_api_next_actions.py; app/backend/tests/test_profile_advanced_contract.py; app/backend/tests/test_profile_contract.py; app/backend/tests/test_schema_contract.py
- `recruitments` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/backend/app/eligibility/runner.py; app/backend/app/notifications/dispatcher.py; app/backend/app/notifications/recompute_worker.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/alerts.py; app/backend/app/scraping/runner.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_trust.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py; app/backend/tests/test_recruitment_visibility.py; app/backend/tests/test_schema_contract.py; app/backend/tests/test_scrape_runner_promote.py; app/frontend/src/components/FAQ.jsx; app/frontend/src/components/Features.jsx; app/frontend/src/components/Hero.jsx; app/frontend/src/components/Testimonials.jsx; app/frontend/src/features/dashboard/hooks/useDashboardData.js; app/frontend/src/lib/recruitmentRanking.js; app/frontend/src/pages/Dashboard.jsx; app/frontend/src/pages/ExamDetail.jsx; app/frontend/src/pages/Exams.jsx; app/frontend/src/pages/Saved.jsx; app/frontend/src/pages/Tracker.jsx; app/frontend/src/pages/admin/AdminShell.jsx; app/frontend/src/pages/admin/Organizations.jsx
- `reviews` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/frontend/src/pages/ResourceDetail.jsx
- `salary_details` (table) — runtime: app/backend/app/eligibility/runner.py; app/backend/tests/test_schema_contract.py
- `scrape_queue` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/runner.py; app/backend/app/scraping/schemas.py; app/backend/tests/test_admin_queue.py; app/backend/tests/test_recompute_queue_behaviour.py; app/backend/tests/test_schema_contract.py
- `scrape_runs` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/runner.py
- `scrape_sources` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/scraping/runner.py
- `source_registry` (table) — runtime: app/backend/app/api/admin_scrape.py; app/backend/app/api/admin_trust.py; app/backend/app/scraping/__init__.py; app/backend/app/scraping/runner.py; app/backend/tests/test_admin_mutations.py; app/backend/tests/test_admin_trust.py
- `study_plans` (table) — runtime: app/backend/app/api/canonical.py
- `study_sessions` (table) — runtime: app/backend/app/api/canonical.py
- `study_tasks` (table) — runtime: app/backend/app/api/canonical.py
- `subscription_plans` (table) — runtime: app/backend/app/api/payments.py; app/backend/tests/test_schema_contract.py
- `tracked_recruitments` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/eligibility/runner.py; app/backend/tests/test_eligibility_api_integration.py; app/backend/tests/test_eligibility_incremental_hash.py
- `user_certifications` (table) — runtime: app/backend/app/eligibility/engine.py; app/backend/app/eligibility/runner.py; app/backend/tests/test_engine.py
- `user_exam_attempts` (table) — runtime: app/backend/tests/test_eligibility_incremental_hash.py
- `user_recruitment_applications` (table) — runtime: app/backend/app/api/canonical.py; app/backend/tests/test_applications_contract.py; app/backend/tests/test_schema_contract.py
- `user_subscriptions` (table) — runtime: app/backend/app/api/payments.py
- `vacancies` (table) — runtime: app/backend/app/api/canonical.py; app/backend/app/api/placeholders.py; app/backend/app/eligibility/runner.py; app/backend/app/scraping/extractor.py; app/backend/app/scraping/schemas.py; app/frontend/src/lib/recruitmentRanking.js; app/frontend/src/pages/ExamDetail.jsx; app/frontend/src/pages/Exams.jsx

## migration_only_or_indirect (5)

- `alert_events` (table) — migrations: app/supabase/migrations/002_core_runtime_schema.sql; app/supabase/migrations/006_core_views.sql; app/supabase/migrations/007_core_triggers_and_functions.sql
- `embeddings` (table) — migrations: app/supabase/migrations/001_extensions_and_types.sql
- `notification_group_state` (table) — migrations: app/supabase/migrations/002_core_runtime_schema.sql
- `recruitment_field_diffs` (table) — migrations: app/supabase/migrations/002_core_runtime_schema.sql
- `source_observations` (table) — migrations: app/supabase/migrations/002_core_runtime_schema.sql; app/supabase/migrations/006_core_views.sql

## docs_only_review (48)

- `aggregator_listings` (table) — docs: docs/engineering/aggregator-first-ingestion-strategy.md; docs/engineering/source-intelligence.md; docs/schema/clean-supabase-baseline-plan.md
- `ai_action_policies` (table) — docs: docs/engineering/admin-strategy.md; docs/engineering/ai-strategy.md; docs/product/roadmap.md; docs/schema/clean-supabase-baseline-plan.md
- `ai_jobs` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `ai_prompt_versions` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `ai_review_queue` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `alert_deliveries` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `candidate_observations` (table) — docs: docs/engineering/aggregator-first-ingestion-strategy.md; docs/engineering/source-intelligence.md; docs/schema/clean-supabase-baseline-plan.md
- `career_progression` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `chat_sessions` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `community_channels` (table) — docs: docs/product/roadmap.md
- `community_replies` (table) — docs: docs/product/roadmap.md
- `community_reports` (table) — docs: docs/product/roadmap.md
- `community_spaces` (table) — docs: docs/product/roadmap.md
- `community_threads` (table) — docs: docs/product/roadmap.md
- `community_votes` (table) — docs: docs/product/roadmap.md
- `education_authorities` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `educational_qualifications` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `enrollments` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `exam_stages` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `form_submissions` (table) — docs: docs/00-ai-context.md; docs/engineering/domain-model.md; docs/product/roadmap.md
- `forum_comment_upvotes` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `forum_reports` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `forum_reputation` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `forum_saved_posts` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `grading_conversion_rules` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `instructor_payouts` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `lesson_progress` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `listing_observations` (table) — docs: docs/engineering/aggregator-first-ingestion-strategy.md; docs/engineering/source-intelligence.md; docs/schema/clean-supabase-baseline-plan.md
- `mock_subject_breakdowns` (table)
- `notification_templates` (table) — docs: docs/engineering/admin-strategy.md; docs/feature-registry.md
- `probation_details` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `recruitment_candidates` (table) — docs: docs/engineering/aggregator-first-ingestion-strategy.md; docs/engineering/source-intelligence.md; docs/schema/clean-supabase-baseline-plan.md
- `recruitment_events` (table) — docs: docs/engineering/aggregator-first-ingestion-strategy.md
- `recruitment_versions` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `scrape_pdf_cache` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `scrape_source_etags` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `service_bonds` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `source_health_metrics` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `source_registry_backup_before_bulk_merge` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `source_registry_conflict_backup` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `study_logs` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `study_weeks` (table)
- `training_details` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `user_events` (table) — docs: docs/00-ai-context.md; docs/engineering/domain-model.md; docs/product/roadmap.md
- `user_next_actions` (table)
- `user_notification_prefs` (table) — docs: docs/schema/clean-supabase-baseline-plan.md
- `user_recruitment_feedback` (table)
- `user_targets` (table) — docs: docs/engineering/domain-model.md

## schema_only_candidate (0)


