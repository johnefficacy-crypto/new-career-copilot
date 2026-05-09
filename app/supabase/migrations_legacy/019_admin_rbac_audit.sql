-- =============================================================================
-- 019_admin_rbac_audit.sql
-- Career Copilot — Admin RBAC + Audit Log
--
-- Part A: admin_role column on profiles (replaces binary is_admin)
--   Roles: super_admin · ops_admin · content_admin · scraper_admin · support_admin
--   is_admin kept as legacy; code that still checks it continues to work.
--   Backfill: existing is_admin=true users get super_admin.
--
-- Part B: admin_audit_logs table
--   Append-only record of every admin mutation: who, what, when, old/new value.
--   Service role inserts (from server actions); admins can only SELECT.
-- =============================================================================

-- ── Part A: admin_role on profiles ────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role TEXT
  CHECK (admin_role IN (
    'super_admin',
    'ops_admin',
    'content_admin',
    'scraper_admin',
    'support_admin'
  ));

COMMENT ON COLUMN public.profiles.admin_role IS
  'Granular admin role. NULL = regular user. '
  'super_admin has full access. '
  'ops_admin: scrape + queue + sources + recruitments + orgs. '
  'content_admin: recruitments + orgs + posts only. '
  'scraper_admin: scrape + queue + sources only. '
  'support_admin: user management + notifications only.';

-- Backfill: anyone with is_admin=true becomes super_admin if not already assigned
UPDATE public.profiles
SET admin_role = 'super_admin'
WHERE is_admin = true
  AND admin_role IS NULL;

-- Index for fast role lookups (auth guard in every server action)
CREATE INDEX IF NOT EXISTS idx_profiles_admin_role
  ON public.profiles (admin_role)
  WHERE admin_role IS NOT NULL;

-- ── Part B: admin_audit_logs table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT        NOT NULL,   -- e.g. 'approve_scrape_item', 'update_source'
  entity_type TEXT        NOT NULL,   -- e.g. 'scrape_queue', 'source_registry'
  entity_id   TEXT,                   -- UUID or short-code of the affected row
  old_value   JSONB,                  -- snapshot before mutation (nullable)
  new_value   JSONB,                  -- snapshot after mutation (nullable)
  notes       TEXT,                   -- free-form reviewer notes / reason
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_audit_logs IS
  'Append-only admin action log. Never UPDATE or DELETE rows. '
  'Inserted by server actions via service role. Admins can only SELECT.';

-- Index: actor lookup (who did what)
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON public.admin_audit_logs (actor_id, created_at DESC);

-- Index: entity lookup (what happened to this row)
CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON public.admin_audit_logs (entity_type, entity_id, created_at DESC);

-- Index: time-based log browsing
CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON public.admin_audit_logs (created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Super admins and ops admins can read the full log
DROP POLICY IF EXISTS "Admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins read audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          is_admin = true
          OR admin_role IN ('super_admin', 'ops_admin')
        )
    )
  );

-- Scraper admins can read scrape-related entries only
DROP POLICY IF EXISTS "Scraper admins read scrape audit" ON public.admin_audit_logs;
CREATE POLICY "Scraper admins read scrape audit"
  ON public.admin_audit_logs
  FOR SELECT
  USING (
    entity_type IN ('scrape_queue', 'source_registry', 'scrape_run')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND admin_role = 'scraper_admin'
    )
  );

-- Service role can INSERT (server actions use service role key)
DROP POLICY IF EXISTS "Service role insert audit" ON public.admin_audit_logs;
CREATE POLICY "Service role insert audit"
  ON public.admin_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE policies — log is append-only
