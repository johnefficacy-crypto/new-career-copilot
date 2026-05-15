-- PR 1 — Study OS comparison: private behavior analytics foundation.
-- Three tables, self-view only. No cohort, no leaderboard, no social.
-- See docs/engineering/study-os-comparison-spec.md.

create table if not exists public.study_behavior_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,

  total_study_minutes int not null default 0 check (total_study_minutes >= 0),
  focus_minutes int not null default 0
    check (focus_minutes >= 0 and focus_minutes <= total_study_minutes),
  focus_session_count int not null default 0 check (focus_session_count >= 0),
  avg_focus_session_minutes numeric
    check (avg_focus_session_minutes is null or avg_focus_session_minutes >= 0),
  active_study_day boolean not null default false,

  planned_tasks int not null default 0 check (planned_tasks >= 0),
  completed_tasks int not null default 0
    check (completed_tasks >= 0 and completed_tasks <= planned_tasks),
  missed_tasks int not null default 0 check (missed_tasks >= 0),
  skipped_tasks int not null default 0 check (skipped_tasks >= 0),
  backlog_count int not null default 0 check (backlog_count >= 0),

  mock_count int not null default 0 check (mock_count >= 0),
  mock_review_count int not null default 0
    check (mock_review_count >= 0 and mock_review_count <= mock_count),
  correction_tasks_completed int not null default 0 check (correction_tasks_completed >= 0),

  behavior_adherence_score numeric
    check (behavior_adherence_score is null or behavior_adherence_score between 0 and 1),
  consistency_score numeric
    check (consistency_score is null or consistency_score between 0 and 1),
  focus_depth_score numeric
    check (focus_depth_score is null or focus_depth_score between 0 and 1),
  discipline_score numeric
    check (discipline_score is null or discipline_score between 0 and 1),

  source_trust text not null default 'platform_tracked',
  created_at timestamptz not null default now(),

  unique (user_id, snapshot_date)
);

create index if not exists idx_sbds_user_date
  on public.study_behavior_daily_snapshots (user_id, snapshot_date desc);

create table if not exists public.study_comparison_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  comparison_enabled boolean not null default true,
  public_leaderboard_enabled boolean not null default false,
  friends_leaderboard_enabled boolean not null default true,
  visibility text not null default 'private'
    check (visibility in ('private','anonymous','group','public')),
  anonymous_display_name text,
  solo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_exam_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  exam_phase_id uuid,
  priority_rank int not null check (priority_rank >= 1),
  weekly_weight_pct numeric not null check (weekly_weight_pct >= 0 and weekly_weight_pct <= 100),
  status text not null default 'active' check (status in ('active','paused','completed')),
  target_date date,
  created_at timestamptz not null default now(),
  unique (user_id, exam_id, exam_phase_id)
);

create index if not exists idx_user_exam_goals_user
  on public.user_exam_goals (user_id) where status = 'active';

alter table public.study_behavior_daily_snapshots enable row level security;
alter table public.study_comparison_settings enable row level security;
alter table public.user_exam_goals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_behavior_daily_snapshots'
      and policyname = 'sbds_owner_select'
  ) then
    create policy sbds_owner_select on public.study_behavior_daily_snapshots
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_behavior_daily_snapshots'
      and policyname = 'sbds_service_role_all'
  ) then
    create policy sbds_service_role_all on public.study_behavior_daily_snapshots
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_comparison_settings'
      and policyname = 'scs_owner_select'
  ) then
    create policy scs_owner_select on public.study_comparison_settings
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_comparison_settings'
      and policyname = 'scs_owner_upsert'
  ) then
    create policy scs_owner_upsert on public.study_comparison_settings
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_comparison_settings'
      and policyname = 'scs_owner_update'
  ) then
    create policy scs_owner_update on public.study_comparison_settings
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_comparison_settings'
      and policyname = 'scs_service_role_all'
  ) then
    create policy scs_service_role_all on public.study_comparison_settings
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_exam_goals'
      and policyname = 'ueg_owner_select'
  ) then
    create policy ueg_owner_select on public.user_exam_goals
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_exam_goals'
      and policyname = 'ueg_owner_write'
  ) then
    create policy ueg_owner_write on public.user_exam_goals
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_exam_goals'
      and policyname = 'ueg_service_role_all'
  ) then
    create policy ueg_service_role_all on public.user_exam_goals
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
