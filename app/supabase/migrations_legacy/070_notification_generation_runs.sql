create table if not exists public.notification_generation_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by_user_id uuid references auth.users(id) on delete set null,
  scope text not null,
  dry_run boolean not null default true,
  run_limit integer,
  candidates_count integer not null default 0,
  created_count integer not null default 0,
  skipped_count integer not null default 0,
  by_type jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_generation_runs_created_at
  on public.notification_generation_runs(created_at desc);

alter table public.notification_generation_runs enable row level security;

drop policy if exists "notification_generation_runs_admin_read" on public.notification_generation_runs;
create policy "notification_generation_runs_admin_read" on public.notification_generation_runs
for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);

drop policy if exists "notification_generation_runs_service_all" on public.notification_generation_runs;
create policy "notification_generation_runs_service_all" on public.notification_generation_runs
for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
