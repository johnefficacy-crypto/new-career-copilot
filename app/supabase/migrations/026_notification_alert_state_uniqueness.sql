-- Migration 026: Normalize notification_alerts unique constraint name and add upsert support
--
-- Migration 010 added a unique constraint named 'uq_notification_alert' on
-- (user_id, recruitment_id, alert_type). This migration renames it to the
-- canonical name used by TypeScript upsert calls:
--   onConflict: "user_id,recruitment_id,alert_type"
--
-- The canonical constraint name lets Supabase's upsert correctly target the
-- conflict and UPDATE the row (updating priority, explanation, sent_at) rather
-- than silently ignoring the duplicate with ON CONFLICT DO NOTHING.
--
-- The dedup DELETE is a safety net in case any duplicates were inserted before
-- the unique constraint existed.

begin;

-- Safety dedup: remove older duplicate rows (keep the most recent ctid)
delete from public.notification_alerts a
using public.notification_alerts b
where a.ctid < b.ctid
  and a.user_id        = b.user_id
  and a.recruitment_id = b.recruitment_id
  and a.alert_type     = b.alert_type;

-- Drop both possible constraint names (idempotent)
alter table public.notification_alerts
  drop constraint if exists notification_alerts_user_recruitment_type_key;

alter table public.notification_alerts
  drop constraint if exists uq_notification_alert;

-- Add canonical name used by TypeScript onConflict
alter table public.notification_alerts
  add constraint notification_alerts_user_recruitment_type_key
  unique (user_id, recruitment_id, alert_type);

commit;
