-- 061_user_study_plan_preferences.sql
-- Follow-up layer — user autonomy over the Study OS plan.
-- One row per user: lets an aspirant steer the deterministic planner
-- (the weighting "focus", task count / size, pinned + muted topics) and
-- opt out of event-driven regeneration. The planner reads this row and
-- treats every field as an override on top of the persona study policy.

create table if not exists public.user_study_plan_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,

  -- Weighting profile — how the planner blends exam priority vs. the
  -- user's own weak areas vs. high-yield bias.
  focus text not null default 'balanced'
    check (focus in ('balanced', 'weak_areas', 'exam_priority', 'high_yield')),

  -- Plan shape overrides (null = fall back to the persona study policy).
  max_tasks_per_day integer
    check (max_tasks_per_day is null or (max_tasks_per_day between 1 and 8)),
  preferred_task_size text
    check (preferred_task_size is null
      or preferred_task_size in ('small', 'medium', 'large')),

  -- Explicit topic control. Pinned topics are boosted + guaranteed a slot;
  -- muted topics are dropped from the candidate set entirely.
  pinned_topic_ids uuid[] not null default '{}'::uuid[],
  muted_topic_ids uuid[] not null default '{}'::uuid[],

  -- When false, event-driven regeneration skips this user.
  auto_regenerate boolean not null default true,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_study_plan_preferences_user
  on public.user_study_plan_preferences(user_id);

-- RLS — user-owned data, mirroring the owner policies in migration 035.
alter table public.user_study_plan_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_study_plan_preferences'
      and policyname = 'user_study_plan_preferences_owner_select'
  ) then
    create policy user_study_plan_preferences_owner_select
      on public.user_study_plan_preferences
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_study_plan_preferences'
      and policyname = 'user_study_plan_preferences_owner_insert'
  ) then
    create policy user_study_plan_preferences_owner_insert
      on public.user_study_plan_preferences
      for insert to authenticated with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_study_plan_preferences'
      and policyname = 'user_study_plan_preferences_owner_update'
  ) then
    create policy user_study_plan_preferences_owner_update
      on public.user_study_plan_preferences
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';
