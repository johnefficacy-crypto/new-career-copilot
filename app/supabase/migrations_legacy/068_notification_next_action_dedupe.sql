-- P1.6-B: durable dedupe + source metadata for next-action notifications
ALTER TABLE IF EXISTS notification_alerts
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_stage TEXT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS notification_alerts_dedupe_key_uidx
  ON notification_alerts(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
