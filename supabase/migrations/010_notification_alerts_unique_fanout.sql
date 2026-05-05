-- Migration 010: unique constraint on notification_alerts + fn_fanout_alert_event stub
--
-- Two fixes:
--
-- 1. UNIQUE constraint on (user_id, recruitment_id, alert_type)
--    The trigger fn_notify_recruitment_opened uses ON CONFLICT DO NOTHING
--    but no constraint was ever explicitly created. Without it, each trigger
--    fire inserts a duplicate row. This also enables upsert from TypeScript.
--    Note: multiple alert_types per (user, recruitment) are valid —
--    e.g. new_match + deadline_3day + deadline_1day for the same recruitment.
--
-- 2. fn_fanout_alert_event(p_event_id uuid) — was called in approveScrapeItem()
--    but never defined in any migration. Created as a no-op stub so existing
--    calls don't throw "function does not exist". The actual fanout is now done
--    in TypeScript in lib/db/notifications.ts approveScrapeItem().

-- ── 1. Unique constraint ──────────────────────────────────────────────────────
-- PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS — use a DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_notification_alert'
      AND conrelid = 'public.notification_alerts'::regclass
  ) THEN
    ALTER TABLE public.notification_alerts
      ADD CONSTRAINT uq_notification_alert
      UNIQUE (user_id, recruitment_id, alert_type);
  END IF;
END;
$$;

-- ── 2. fn_fanout_alert_event stub ────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_fanout_alert_event(uuid);

CREATE FUNCTION public.fn_fanout_alert_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Stub: actual fanout is performed in TypeScript (lib/db/notifications.ts).
  -- This function exists so that any legacy RPC calls don't throw
  -- "function does not exist". It simply marks the event as completed
  -- if it exists and is still pending.
  UPDATE public.alert_events
  SET    fanout_status = 'completed'
  WHERE  id = p_event_id
    AND  fanout_status = 'pending';
END;
$$;

COMMENT ON FUNCTION public.fn_fanout_alert_event(uuid) IS
  'Stub: marks alert_event as completed. Real fanout is done in TypeScript.
   Created by migration 010 to prevent "function does not exist" errors.';
