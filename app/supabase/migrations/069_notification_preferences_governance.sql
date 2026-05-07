-- P1.8: notification preferences + delivery governance fields
ALTER TABLE IF EXISTS public.notification_preferences
  ADD COLUMN IF NOT EXISTS in_app_types_disabled text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS email_types_disabled text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS digest_preference text NOT NULL DEFAULT 'off'
    CHECK (digest_preference IN ('off','daily','weekly')),
  ADD COLUMN IF NOT EXISTS quiet_hours_start smallint,
  ADD COLUMN IF NOT EXISTS quiet_hours_end smallint,
  ADD COLUMN IF NOT EXISTS deadline_reminder_windows text[] NOT NULL DEFAULT '{48h,24h,6h}';

ALTER TABLE IF EXISTS public.notification_preferences
  ADD CONSTRAINT notification_prefs_quiet_hours_bounds
  CHECK (
    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
    OR (quiet_hours_start BETWEEN 0 AND 23 AND quiet_hours_end BETWEEN 0 AND 23)
  );
