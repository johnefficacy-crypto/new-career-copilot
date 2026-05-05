-- Migration 022: Drop legacy blind-notification trigger
--
-- trg_notify_recruitment_opened fires on every INSERT into recruitments and
-- blindly fans out an alert to every user in notification_alerts regardless of
-- eligibility. This bypasses the eligibility engine entirely and sends stale,
-- incorrect notifications.
--
-- Alerts must now only be created by the eligibility engine path:
--   runEligibilityForUser → upsertNotificationAlerts
--
-- The function definition is also dropped — it has no legitimate callers once
-- the trigger is removed. Idempotent — safe to re-run.

begin;

drop trigger if exists trg_notify_recruitment_opened on public.recruitments;
drop function if exists public.fn_notify_recruitment_opened();

comment on schema public is 'Legacy blind alert trigger removed (migration 022); alerts must come from eligibility engine only.';

commit;
