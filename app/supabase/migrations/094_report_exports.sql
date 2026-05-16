-- Downloadable Reports runtime.
-- Tracks user-initiated report exports (weekly summary, mistake book PDF,
-- flashcard performance, mock analytics, full study log). Generation is
-- handled by a worker; this table is the durable job ledger.

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_type text not null
    check (report_type in (
      'weekly_summary',
      'mistake_book',
      'flashcard_performance',
      'mock_analytics',
      'study_log',
      'subject_mastery'
    )),
  format text not null default 'pdf' check (format in ('pdf','csv','json')),
  params jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed','expired')),
  file_url text,
  file_size_bytes bigint,
  error_message text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_report_exports_user_status
  on public.report_exports(user_id, status, requested_at desc);
create index if not exists idx_report_exports_status_requested
  on public.report_exports(status, requested_at) where status in ('pending','generating');

alter table public.report_exports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='report_exports'
      and policyname='re_owner_read'
  ) then
    create policy re_owner_read on public.report_exports
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='report_exports'
      and policyname='re_owner_insert'
  ) then
    create policy re_owner_insert on public.report_exports
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='report_exports'
      and policyname='re_service_role_all'
  ) then
    create policy re_service_role_all on public.report_exports
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
