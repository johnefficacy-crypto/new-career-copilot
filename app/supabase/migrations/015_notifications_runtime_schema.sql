-- Safe Feature Migration Plan: notifications governance.
-- Completes preference governance, next-action dedupe, and generation run
-- fields used by the notification API and scheduler.

alter table public.notification_preferences
  add column if not exists in_app_types_disabled text[] not null default '{}'::text[],
  add column if not exists email_types_disabled text[] not null default '{}'::text[],
  add column if not exists event_types_muted text[] not null default '{}'::text[],
  add column if not exists digest_preference text not null default 'off',
  add column if not exists quiet_hours_start integer,
  add column if not exists quiet_hours_end integer,
  add column if not exists min_priority_in_app text not null default 'low',
  add column if not exists min_priority_email text not null default 'normal',
  add column if not exists deadline_reminder_windows text[] not null default array['48h','24h','6h'];

alter table public.notification_alerts
  add column if not exists email_sent boolean not null default false,
  add column if not exists email_sent_at timestamptz,
  add column if not exists delivery_error text,
  add column if not exists source text,
  add column if not exists source_stage text,
  add column if not exists dedupe_key text,
  add column if not exists generated_at timestamptz,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notification_generation_runs
  add column if not exists triggered_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists scope text,
  add column if not exists dry_run boolean not null default true,
  add column if not exists run_limit integer,
  add column if not exists candidates_count integer not null default 0,
  add column if not exists created_count integer not null default 0,
  add column if not exists skipped_count integer not null default 0,
  add column if not exists by_type jsonb not null default '{}'::jsonb,
  add column if not exists finished_at timestamptz,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists notification_alerts_dedupe_key_uidx
  on public.notification_alerts(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notification_alerts_email_pending
  on public.notification_alerts(email_sent, priority desc, sent_at)
  where email_sent = false;

create index if not exists idx_notification_generation_runs_created_at
  on public.notification_generation_runs(created_at desc);

create index if not exists idx_notification_group_state_user_rec
  on public.notification_group_state(user_id, recruitment_id);

alter table public.notification_preferences enable row level security;
alter table public.notification_generation_runs enable row level security;

drop policy if exists "notification_preferences_read_own" on public.notification_preferences;
create policy "notification_preferences_read_own"
  on public.notification_preferences for select
  using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "notification_preferences_manage_own" on public.notification_preferences;
create policy "notification_preferences_manage_own"
  on public.notification_preferences for all
  using (user_id = auth.uid() or auth.role() = 'service_role')
  with check (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "notification_generation_runs_admin_read" on public.notification_generation_runs;
create policy "notification_generation_runs_admin_read"
  on public.notification_generation_runs for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "notification_generation_runs_service_all" on public.notification_generation_runs;
create policy "notification_generation_runs_service_all"
  on public.notification_generation_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
