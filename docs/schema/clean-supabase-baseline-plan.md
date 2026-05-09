# Clean Supabase Baseline Plan (Fresh Project Bootstrapping)

## Why current migrations fail on a blank Supabase project
The current historical chain was developed incrementally against an already-evolving database. On a fresh database, early objects can reference tables/functions that are not created yet.

Most visible failure: historical migration `003_v_notification_feed.sql` creates `public.v_notification_feed`, but that view depends on `notification_alerts`, `alert_events`, `recruitments`, `organizations`, and `tracked_recruitments`. In a blank project these tables may not exist yet, so `supabase db push` fails before later migrations can repair state.

## Why the schema snapshot is source-of-truth but not executable as-is
The table shape source is `app/docs/supabase(Govt Exam copilot)-Schema.md` and it should drive column definitions/check constraints/defaults. However, the snapshot is an unordered schema dump and can include:
- FK references before parent tables are created,
- non-runtime tables that should be deferred,
- environment-specific objects not safe for first-pass bootstrap.

So this plan uses the snapshot as a **shape reference**, while rebuilding an **execution-safe migration order**.

## Proposed clean migration structure
`app/supabase/migrations_clean` introduces a reviewable baseline chain:

1. `001_extensions_and_types.sql` — required extensions and type placeholders.
2. `002_core_runtime_schema.sql` — ordered core runtime tables, then FKs.
3. `003_security_helpers.sql` — `public.is_admin(uid uuid)` helper.
4. `004_core_rls_policies.sql` — minimum safe RLS for core tables.
5. `005_core_indexes.sql` — operational/query indexes.
6. `006_core_views.sql` — `v_notification_feed`, `v_admin_queue_review`.
7. `007_core_triggers_and_functions.sql` — queue/alert helper functions and trigger.

## Runtime scope used for baseline
Per audit classification (`schema_audit/schema_usage_summary_v2.md`):
- 104 total tables
- 51 runtime-used tables
- 37 migration-only/indirect tables
- 16 docs-only review tables

The clean baseline targets the runtime-critical set plus minimal dependency tables needed to avoid broken references.

## Core runtime tables included
- Profile & identity: `profiles`, `aspirant_*`, `certifications`
- Recruitment & eligibility: `organizations`, `recruitments`, `posts`, `vacancies`, criteria tables, eligibility tables, tracking/application tables
- Scraper/admin ops: `source_registry`, `scrape_sources`, `scrape_runs`, `scrape_queue`, `source_observations`, `notification_documents`, `extracted_field_evidence`, `admin_audit_logs`, `admin_settings`
- Notifications: `alert_events`, `notification_alerts`, `notification_preferences`, `notification_generation_runs`, `notification_group_state`
- Payments/product surfaces: subscriptions/payments, study plan tables, courses, lessons, reviews, mock tests, forum core tables

## Indirect DB dependency tables
- Minimal `recruitment_field_diffs` is included to satisfy `alert_events.diff_id` FK safely.
- `source_observations` included because `v_admin_queue_review` depends on it.

## Optional feature modules intentionally deferred
Keep separate migration modules for:
- AI: `ai_jobs`, `ai_prompt_versions`, `ai_review_queue`, `ai_action_policies`, `chat_sessions`
- Embeddings: `embeddings` (and `vector` extension)
- Community: `community_*`
- Aggregator candidate layer: `aggregator_listings`, `recruitment_candidates`, `listing_observations`, `candidate_observations`
- Marketplace extras: `enrollments`, `instructor_payouts`, `lesson_progress`
- Forum extras: `forum_saved_posts`, `forum_reputation`, `forum_reports`, `forum_comment_upvotes`
- Education grading: `education_authorities`, `grading_conversion_rules`

## Deferred / docs-only review tables
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

## Required views, functions, triggers, RLS helpers, indexes
- Views: `v_notification_feed`, `v_admin_queue_review`
- Security helper: `public.is_admin(uid uuid)` (SECURITY DEFINER)
- Queue helpers: enqueue + claim functions and recruitment insert trigger
- Optional fanout helper retained: `fn_fanout_alert_event(uuid)`
- RLS: minimum table-level policies for user-owned rows and admin/service operations
- Indexes: recruitment filtering, eligibility queue claims, scrape queue review, evidence lookup, notification feeds

## Known migration fixes to preserve
- **080 fix**: never enforce uniqueness only on `(scrape_queue_id, field_name)` for `extracted_field_evidence`; use entity-scoped uniqueness.
- **082 fix**: recompute queue indexes/claims must use `(status, queued_at)` not `created_at`.
- **003 failure context**: views must be created only after baseline tables exist.

## Validation SQL checks
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

select viewname, definition
from pg_views
where schemaname = 'public'
order by viewname;

select event_object_table, trigger_name, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

select conrelid::regclass as source_table,
       confrelid::regclass as referenced_table,
       conname,
       pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where contype = 'f'
  and connamespace = 'public'::regnamespace
order by source_table::text, referenced_table::text;
```
