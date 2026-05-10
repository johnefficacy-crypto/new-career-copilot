# Safe Feature Migration Plan

This plan converts the remaining legacy migration chain into safe, additive migrations for the current clean baseline in `app/supabase/migrations`.

Primary references:

- `schema_audit/schema_usage_summary_v2.md`
- `app/supabase/migrations/001-011`
- `app/supabase/migrations_legacy/**`
- Current backend and frontend runtime usage

## Why the direct legacy replay is unsafe

The current project uses a clean baseline, not the old legacy chain. Some tables already exist with smaller placeholder shapes. A legacy migration such as `049_marketplace_setup.sql` uses `CREATE TABLE IF NOT EXISTS public.courses (...)`; because `public.courses` already exists, PostgreSQL skips the richer table definition and does not add missing columns such as `instructor_id`. A later FK then fails.

Rule for all remaining work:

- Prefer `alter table ... add column if not exists` for existing tables.
- Use `create table if not exists` only for genuinely absent tables.
- Add FKs only inside guarded `do $$` blocks that verify both referenced and referencing columns exist.
- Add indexes after columns exist.
- Avoid `not null` on new live columns unless a default/backfill makes it safe.
- Keep each feature capsule independently runnable.
- End each schema migration with `notify pgrst, 'reload schema';`.

## Priority 0: unblock current runtime

Status: partially covered by `011_verified_domain_gap_p1.sql`; keep this first.

Feature areas and legacy sources:

- Notifications: `068_notification_next_action_dedupe.sql`, `069_notification_preferences_governance.sql`, `070_notification_generation_runs.sql`
- Payments: `054_razorpay_subscriptions.sql`
- Marketplace relationship fix: `049_marketplace_setup.sql`

Required shape:

- `notification_alerts`: `source`, `source_stage`, `dedupe_key`, `generated_at`, `title`, `body`, `metadata`
- `notification_generation_runs`: `created_at`, `triggered_by_user_id`, `scope`, `dry_run`, counters, status/error fields
- `subscription_plans`: `price_inr`, `description`, `currency`, `interval`, `features`, `sort_order`, timestamps
- `user_subscriptions`: Razorpay order/payment columns, `amount_paid_inr`, `currency`, `cancelled_at`
- `payment_history`: `plan_id`, `method`, `source`, `event`, `raw_event`, Razorpay identifiers if missing
- `profiles`: `is_instructor`, `instructor_bio`
- `courses`: widen existing placeholder table before adding `courses.instructor_id -> profiles.id`

Safe apply notes:

- Fix `011` before retrying. It must add `courses.instructor_id` before the FK.
- If `011` succeeds, run schema contract tests with Supabase service credentials.
- If `011` fails again, inspect the exact statement number and patch only that feature capsule; do not repair migration history until SQL has been validated on the live schema.

## Priority 1: marketplace and mentor/course runtime

Legacy sources:

- `049_marketplace_setup.sql`
- payment pieces from `054_razorpay_subscriptions.sql`

Runtime usage:

- `app/backend/app/api/canonical.py`
- `app/frontend/src/pages/Marketplace.jsx`
- `app/frontend/src/pages/ResourceDetail.jsx`
- `app/frontend/src/pages/Mentors.jsx`
- `app/frontend/src/pages/MentorDetail.jsx`
- admin marketplace/mentor pages

Create a dedicated migration after `011`, for example:

- `012_marketplace_runtime_schema.sql`

Actions:

- Widen `courses`, `course_sections`, `lessons`, and `reviews` additively.
- Create missing marketplace tables: `enrollments`, `lesson_progress`, `instructor_payouts`.
- Add guarded FKs and indexes:
  - `courses.instructor_id -> profiles.id`
  - `course_sections.course_id -> courses.id`
  - `lessons.section_id -> course_sections.id`
  - `reviews.course_id -> courses.id`
  - `reviews.user_id -> profiles.id`
- Avoid replacing existing `reviews.comment`; add `body` and keep both names until code is normalized.

Acceptance checks:

- `/api/marketplace/resources`
- `/api/marketplace/mentors`
- `/api/marketplace/mentors/{id}`
- PostgREST embedded relationship `profiles -> courses!instructor_id`

## Priority 2: payments and subscriptions

Legacy source:

- `054_razorpay_subscriptions.sql`

Runtime usage:

- `app/backend/app/api/payments.py`
- `app/frontend/src/pages/Pricing.jsx`
- `app/frontend/src/pages/admin/Plans.jsx`

Create:

- `013_payments_runtime_schema.sql`

Actions:

- Complete additive widening not already covered by `011`.
- Preserve old `subscription_plans.id uuid` if already present; do not blindly convert to `text`.
- Add a compatible `plan_code`/slug strategy if UUID IDs are live and frontend expects `free`, `pro`, `elite`.
- Seed default plans only with conflict-safe logic that supports both `id` and `plan_code`.
- Add payment indexes and RLS after table shape is stable.

High-risk mismatch:

- Legacy comments assume `subscription_plans.id` is text, but clean baseline defines it as uuid. Do not run the legacy migration as-is.

Acceptance checks:

- `/api/plans`
- `/api/admin/plans`
- create/update/disable plan
- payment order creation against the active plan identifier strategy

## Priority 3: notifications governance

Legacy sources:

- `014_notification_preferences.sql`
- `015_notification_alerts_email_sent.sql`
- `048_notification_group_state.sql`
- `068_notification_next_action_dedupe.sql`
- `069_notification_preferences_governance.sql`
- `070_notification_generation_runs.sql`

Runtime usage:

- `app/backend/app/api/notifications.py`
- `app/backend/app/notifications/dispatcher.py`
- `app/backend/app/notifications/next_actions.py`
- `app/frontend/src/pages/Notifications.jsx`
- `app/frontend/src/pages/NotificationPreferences.jsx`
- `app/frontend/src/pages/admin/Notifications.jsx`

Create:

- `014_notifications_runtime_schema.sql`

Actions:

- Finish preference governance fields: disabled types, min priority, quiet hours, digest preference.
- Add next-action dedupe unique index.
- Add generation run fields and RLS policies.
- Verify dispatcher still tolerates `email_sent` and delivery fields.

Acceptance checks:

- `/api/admin/notifications`
- `/api/notifications/generate-next-actions`
- `/api/notifications/preferences/me`
- scheduler dispatch dry run

## Priority 4: AI chat and AI governance

Legacy sources:

- `020_ai_infrastructure.sql`
- `035_ai_action_policies.sql`
- `039_ai_chat_setup.sql`

Runtime usage:

- `app/frontend/src/pages/AIChat.jsx`
- `app/frontend/src/pages/admin/AIPolicy.jsx`
- API routes referenced as `/api/ai/guidance`, `/api/ai/history`, `/api/ai/chat`

Create:

- `015_ai_runtime_schema.sql`

Actions:

- Create `ai_prompt_versions`, `ai_jobs`, `ai_review_queue`, `ai_action_policies`, `chat_sessions`.
- Use `gen_random_uuid()` rather than `uuid_generate_v4()` to match the active baseline.
- Seed conservative AI policies.
- Add RLS using current role model: `profiles.is_admin` and/or current backend role claims. Avoid legacy-only `admin_role` unless the column exists.

Acceptance checks:

- AI chat history load
- AI chat send
- admin AI policy page

## Priority 5: Study OS and mock analytics

Legacy sources:

- `020_ai_infrastructure.sql`
- `034_mock_tests.sql`

Runtime usage:

- `app/backend/app/api/canonical.py`
- `app/frontend/src/pages/study/Focus.jsx`
- `app/frontend/src/pages/study/Mocks.jsx`
- `app/frontend/src/pages/study/WeeklyReview.jsx`
- `app/frontend/src/pages/StudyPlan.jsx`

Create:

- `016_study_os_runtime_schema.sql`

Actions:

- Widen `study_plans`, `study_tasks`, `study_sessions` additively.
- Keep compatibility aliases: `starts_at`/`started_at`, `ends_at`/`ended_at`, `duration_minutes`/`duration_mins`.
- Widen `mock_tests` with user attempt fields and create `mock_subject_breakdowns`.
- Add guarded FKs after columns exist.

Acceptance checks:

- `/api/study/plan`
- `/api/study/focus/start`
- `/api/study/focus/stop`
- `/api/study/focus/summary`
- `/api/study/mocks`
- `/api/study/weekly-review`

## Priority 6: community and moderation

Legacy sources:

- `040_forum_setup.sql`
- `041_forum_moderation_queue.sql`
- `050_community_foundation.sql`

Runtime usage:

- `app/backend/app/api/canonical.py`
- `app/frontend/src/pages/Community.jsx`
- `app/frontend/src/pages/CreateThread.jsx`
- `app/frontend/src/pages/ThreadDetail.jsx`
- `app/frontend/src/pages/admin/Community.jsx`

Create:

- `017_community_runtime_schema.sql`

Actions:

- For current runtime, first widen existing `forum_*` tables and add missing moderation tables only if code uses them.
- Treat `community_*` tables as a later product surface unless backend routes are switched from `forum_*` to `community_*`.
- Do not apply both forum and community systems as if they were one model; they are parallel legacy concepts.

Acceptance checks:

- `/api/community/categories`
- `/api/community/threads`
- `/api/community/threads/{slug}`
- `/api/admin/community/flags`

## Priority 7: accountability, telemetry, and user state

Legacy sources:

- `027_user_events_and_form_submissions.sql`
- `028_user_recruitment_state.sql`
- `045_user_recruitment_feedback.sql`

Runtime usage:

- `app/frontend/src/pages/Accountability.jsx`
- user journey analytics and recruitment state pages

Create:

- `018_accountability_telemetry_schema.sql`

Actions:

- Create `user_events` and `form_submissions` additively.
- Delay `user_recruitment_state` materialized view until its dependencies exist (`user_targets`, event columns, final eligibility columns).
- Add accountability-specific tables only after confirming backend routes persist them rather than using placeholders.

Acceptance checks:

- `/api/accountability/partners`
- `/api/accountability/groups`
- `/api/accountability/mentors/bookings`
- analytics inserts from application and recruitment flows

## Priority 8: scraper trust, source intelligence, and queue hardening

Legacy sources:

- `006_source_registry_org_state.sql`
- `007_scrape_queue_data_quality.sql`
- `012_scraper_p0_observability.sql`
- `013_scraper_p2_provenance_and_playwright.sql`
- `017_scraper_trust_evidence.sql`
- `043_aggregator_official_source_gate.sql`
- `071_trust_pipeline_hardening.sql`
- `072_field_evidence_alignment.sql`
- `073_scrape_queue_promoted_status.sql`
- `075_source_intelligence_policy.sql`
- `076_recruitment_events.sql`
- `080-082 queue indexes`

Runtime usage:

- admin scrape, admin trust, scraper runner, evidence review

Create:

- `019_trust_pipeline_schema.sql`

Actions:

- Keep additive columns already in `011`; move optional intelligence tables into a later migration.
- Add indexes after validating live table sizes.
- Avoid cleanup/delete helpers until retention policy is approved.

Acceptance checks:

- admin scrape queue list
- evidence verify/reject/correct
- promote/reject scrape item
- source verification workflow

## Execution checklist

For each migration:

1. Run against a disposable linked Supabase project or local Postgres clone first.
2. Run `supabase db push --include-all` only after migration history is sane; otherwise use SQL editor for the specific migration body.
3. Run:
   - `pytest tests/test_schema_contract.py --run-integration` or equivalent integration marker command with service-role env vars.
   - affected backend tests.
   - frontend build for pages touched by the feature.
4. Confirm PostgREST reload:
   - `notify pgrst, 'reload schema';`
   - restart backend if schema cache errors persist.
5. Only then move to the next feature capsule.

## Immediate recommendation

Do not keep expanding `011` indefinitely. Use it only to unblock P0/P1 and the current logged 500s. After it applies cleanly, create `012_marketplace_runtime_schema.sql` and continue feature-by-feature in the order above.
