-- PR 7 — Study OS comparison: trust-adjusted hour source breakdown.

create table if not exists public.study_behavior_source_breakdown (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  source text not null
    check (source in (
      'platform_verified','mentor_verified','group_focus_checked',
      'group_presence','partner_costudy','solo_timer','screenshot','self_claimed'
    )),
  raw_minutes int not null default 0 check (raw_minutes >= 0),
  trust_weight numeric not null check (trust_weight between 0 and 1),
  trust_adjusted_minutes numeric generated always as
    (raw_minutes * trust_weight) stored,
  created_at timestamptz not null default now(),

  unique (user_id, snapshot_date, source),
  foreign key (user_id, snapshot_date)
    references public.study_behavior_daily_snapshots(user_id, snapshot_date)
    on delete cascade
);

create index if not exists idx_sbsb_user_date
  on public.study_behavior_source_breakdown (user_id, snapshot_date desc);

alter table public.study_behavior_daily_snapshots
  add column if not exists raw_total_minutes int not null default 0,
  add column if not exists trust_adjusted_minutes numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sbds_raw_total_minutes_nonneg'
      and conrelid = 'public.study_behavior_daily_snapshots'::regclass
  ) then
    alter table public.study_behavior_daily_snapshots
      add constraint sbds_raw_total_minutes_nonneg
      check (raw_total_minutes >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sbds_trust_adjusted_minutes_nonneg'
      and conrelid = 'public.study_behavior_daily_snapshots'::regclass
  ) then
    alter table public.study_behavior_daily_snapshots
      add constraint sbds_trust_adjusted_minutes_nonneg
      check (trust_adjusted_minutes >= 0);
  end if;
end $$;

alter table public.study_behavior_source_breakdown enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_behavior_source_breakdown'
      and policyname = 'sbsb_owner_select'
  ) then
    create policy sbsb_owner_select on public.study_behavior_source_breakdown
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_behavior_source_breakdown'
      and policyname = 'sbsb_service_role_all'
  ) then
    create policy sbsb_service_role_all on public.study_behavior_source_breakdown
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
