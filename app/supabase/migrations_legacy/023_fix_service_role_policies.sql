-- Migration 023: Tighten service-role RLS policies
--
-- Three tables had overly-broad or missing RLS policies:
--   notification_preferences — no explicit service_role policy
--   notification_alerts      — service_role could UPDATE (needed for email_sent flag)
--                              but no explicit policy existed
--   admin_audit_log          — any authenticated user could potentially insert
--
-- After this migration:
--   • notification_preferences: authenticated users manage their own row;
--     service_role has full access for Edge Function writes.
--   • notification_alerts: authenticated users read own rows;
--     service_role can INSERT and UPDATE (for email_sent flag).
--   • admin_audit_log: service_role inserts; only admin roles can select.

begin;

-- ── notification_preferences ──────────────────────────────────────────────────

alter table if exists public.notification_preferences enable row level security;

drop policy if exists "Service role all prefs"   on public.notification_preferences;
drop policy if exists "Users manage own prefs"   on public.notification_preferences;

create policy "Users manage own prefs"
on public.notification_preferences
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Service role all prefs"
on public.notification_preferences
for all
to service_role
using (true)
with check (true);

-- ── notification_alerts ───────────────────────────────────────────────────────

alter table if exists public.notification_alerts enable row level security;

drop policy if exists "Users read own alerts"       on public.notification_alerts;
drop policy if exists "Service role insert alerts"  on public.notification_alerts;
drop policy if exists "Service role update alerts"  on public.notification_alerts;

create policy "Users read own alerts"
on public.notification_alerts
for select
to authenticated
using (auth.uid() = user_id);

create policy "Service role insert alerts"
on public.notification_alerts
for insert
to service_role
with check (true);

create policy "Service role update alerts"
on public.notification_alerts
for update
to service_role
using (true)
with check (true);

-- ── admin_audit_logs ──────────────────────────────────────────────────────────
-- Table name is admin_audit_logs (with 's') — created by migration 019.

alter table if exists public.admin_audit_logs enable row level security;

drop policy if exists "Service role insert audit log" on public.admin_audit_logs;
drop policy if exists "Admins read audit log"         on public.admin_audit_logs;

create policy "Service role insert audit log"
on public.admin_audit_logs
for insert
to service_role
with check (true);

create policy "Admins read audit log"
on public.admin_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.admin_role in (
        'super_admin', 'ops_admin', 'content_admin', 'scraper_admin', 'support_admin'
      )
  )
);

commit;
