# Clean Supabase Baseline (Proposed)

This folder contains a **proposed clean baseline chain** for bootstrapping a new Supabase project from scratch.

It does **not** automatically replace `app/supabase/migrations` yet.

## Files
- `001_extensions_and_types.sql`
- `002_core_runtime_schema.sql`
- `003_security_helpers.sql`
- `004_core_rls_policies.sql`
- `005_core_indexes.sql`
- `006_core_views.sql`
- `007_core_triggers_and_functions.sql`

## How to test on a new Supabase project (manual review-safe)
1. Create a fresh Supabase project.
2. Apply these files sequentially in SQL editor or scripted psql execution.
3. Run validation queries from `docs/schema/clean-supabase-baseline-plan.md`.
4. Verify `v_notification_feed` and `v_admin_queue_review` compile.
5. Verify trigger/function behavior for eligibility queue (`queued_at` ordering).

> This chain is intentionally reviewable and idempotent where practical (`IF NOT EXISTS`, etc.).

## Optional modules intentionally excluded
- AI: `ai_jobs`, `ai_prompt_versions`, `ai_review_queue`, `ai_action_policies`, `chat_sessions`
- Embeddings: `embeddings`
- Community: `community_*`
- Aggregator candidate layer: `aggregator_listings`, `recruitment_candidates`, `listing_observations`, `candidate_observations`
- Marketplace extras: `enrollments`, `instructor_payouts`, `lesson_progress`
- Forum extras: `forum_saved_posts`, `forum_reputation`, `forum_reports`, `forum_comment_upvotes`
- Education grading: `education_authorities`, `grading_conversion_rules`

## Deferred/docs-only review tables
- `alert_deliveries`
- `career_progression`
- `educational_qualifications`
- `exam_stages`
- `probation_details`
- `recruitment_versions`
- `scrape_pdf_cache`
- `scrape_source_etags`
- `service_bonds`
- `source_health_metrics`
- `source_registry_backup_before_bulk_merge`
- `source_registry_conflict_backup`
- `study_logs`
- `training_details`
- `user_notification_prefs`

## Known issues carried forward as explicit fixes
- Existing migration 080: avoid uniqueness only on `(scrape_queue_id, field_name)`.
- Existing migration 082: use `eligibility_recompute_queue(status, queued_at)` (not `created_at`).
- Existing migration 003 fails on blank DB unless baseline tables exist first.
