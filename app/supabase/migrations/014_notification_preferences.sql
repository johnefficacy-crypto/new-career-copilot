-- =============================================================================
-- 014_notification_preferences.sql
-- Career Copilot — Phase 3C: Email Notifications
--
-- Creates notification_preferences table.
-- Stubbed in lib/db/notifications.ts since Phase 2; this migration unblocks it.
--
-- One row per user — upsert on (user_id).
-- Defaults match a sensible opt-in: in-app on, email daily digest, no WhatsApp.
--
-- DPDP Act compliance:
--   email_enabled defaults FALSE — user must explicitly opt in.
--   whatsapp_enabled defaults FALSE — same.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled          boolean     NOT NULL DEFAULT true,
  email_enabled           boolean     NOT NULL DEFAULT false,   -- DPDP: explicit opt-in only
  email_digest_frequency  text        NOT NULL DEFAULT 'daily'
                            CHECK (email_digest_frequency IN ('instant', 'daily', 'weekly', 'off')),
  whatsapp_enabled        boolean     NOT NULL DEFAULT false,   -- DPDP: explicit opt-in only
  min_priority_in_app     text        NOT NULL DEFAULT 'low'
                            CHECK (min_priority_in_app IN ('low', 'medium', 'high', 'critical')),
  min_priority_email      text        NOT NULL DEFAULT 'medium'
                            CHECK (min_priority_email IN ('low', 'medium', 'high', 'critical')),
  event_types_muted       text[]      NOT NULL DEFAULT '{}',
  org_types_muted         text[]      NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id)
);

COMMENT ON TABLE public.notification_preferences IS
  'Per-user notification channel preferences. One row per user. '
  'email_enabled and whatsapp_enabled default FALSE for DPDP Act compliance.';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_notification_prefs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_prefs_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_prefs_updated_at();

-- Auto-create a default preferences row when a new user signs up
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_notification_prefs ON auth.users;
CREATE TRIGGER trg_create_notification_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_prefs();

-- Backfill rows for existing users who don't have preferences yet
INSERT INTO public.notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own prefs"   ON public.notification_preferences;
DROP POLICY IF EXISTS "Users upsert own prefs" ON public.notification_preferences;
DROP POLICY IF EXISTS "Service role all prefs" ON public.notification_preferences;

CREATE POLICY "Users read own prefs"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own prefs"
  ON public.notification_preferences FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role all prefs"
  ON public.notification_preferences FOR ALL
  USING      (true)
  WITH CHECK (true);

-- Index for email-dispatcher lookups (fetch users who want emails)
CREATE INDEX IF NOT EXISTS idx_notification_prefs_email_enabled
  ON public.notification_preferences (user_id)
  WHERE email_enabled = true;
