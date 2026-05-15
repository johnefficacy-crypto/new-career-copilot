-- PR 3 — Study OS comparison: cohort definitions, memberships, percentile snapshots.

create table if not exists public.study_cohort_definitions (
  cohort_key text primary key,
  exam_id uuid,
  exam_phase_id uuid,
  preparation_stage text
    check (preparation_stage is null or preparation_stage in
           ('beginner','intermediate','advanced','final_window')),
  availability_bucket text
    check (availability_bucket is null or availability_bucket in
           ('<1h','1-2h','2-4h','4-6h','6h+')),
  study_mode text
    check (study_mode is null or study_mode in
           ('full_time','working','student','other')),
  fallback_level int not null default 0 check (fallback_level between 0 and 3),
  min_sample_size int not null default 30 check (min_sample_size > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.study_cohort_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_key text not null references public.study_cohort_definitions(cohort_key) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (user_id, cohort_key)
);

create index if not exists idx_scm_user on public.study_cohort_memberships (user_id);
create index if not exists idx_scm_cohort on public.study_cohort_memberships (cohort_key);

create table if not exists public.study_cohort_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  cohort_key text not null references public.study_cohort_definitions(cohort_key) on delete cascade,
  metric_key text not null,
  period_type text not null check (period_type in ('daily','weekly','monthly')),
  period_start date not null,
  period_end date not null,

  sample_size int not null check (sample_size >= 0),
  p10 numeric, p25 numeric, p50 numeric, p75 numeric, p90 numeric,

  created_at timestamptz not null default now(),

  unique (cohort_key, metric_key, period_type, period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists idx_scms_cohort_metric_period
  on public.study_cohort_metric_snapshots (cohort_key, metric_key, period_type, period_end desc);

alter table public.study_cohort_definitions enable row level security;
alter table public.study_cohort_memberships enable row level security;
alter table public.study_cohort_metric_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_cohort_definitions'
      and policyname = 'scd_authenticated_select'
  ) then
    create policy scd_authenticated_select on public.study_cohort_definitions
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_cohort_definitions'
      and policyname = 'scd_service_role_all'
  ) then
    create policy scd_service_role_all on public.study_cohort_definitions
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_cohort_memberships'
      and policyname = 'scm_owner_select'
  ) then
    create policy scm_owner_select on public.study_cohort_memberships
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_cohort_memberships'
      and policyname = 'scm_service_role_all'
  ) then
    create policy scm_service_role_all on public.study_cohort_memberships
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_cohort_metric_snapshots'
      and policyname = 'scms_authenticated_select'
  ) then
    create policy scms_authenticated_select on public.study_cohort_metric_snapshots
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_cohort_metric_snapshots'
      and policyname = 'scms_service_role_all'
  ) then
    create policy scms_service_role_all on public.study_cohort_metric_snapshots
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
