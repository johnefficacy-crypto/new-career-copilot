-- =============================================================================
-- 015_notification_alerts_email_sent.sql
-- Career Copilot — Phase 3C: Email Notifications
--
-- Adds email_sent flag to notification_alerts.
-- The email-dispatcher Edge Function queries WHERE email_sent = false and
-- marks rows true after successful Resend delivery.
--
-- Idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE public.notification_alerts
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notification_alerts.email_sent IS
  'True after the email-dispatcher Edge Function has successfully sent '
  'this alert to the user via Resend. Remains false for users who have '
  'email_enabled = false in notification_preferences.';

-- Index so email-dispatcher can efficiently fetch unsent rows per user.
CREATE INDEX IF NOT EXISTS idx_notification_alerts_unsent_email
  ON public.notification_alerts (user_id, email_sent, sent_at DESC)
  WHERE email_sent = false;
