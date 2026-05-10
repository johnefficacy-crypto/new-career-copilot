-- Safe Feature Migration Plan: Study OS and mock analytics.

alter table public.study_plans
  add column if not exists status text not null default 'active',
  add column if not exists target_exam text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists weekly_hours_goal numeric,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

alter table public.study_tasks
  add column if not exists day_label text,
  add column if not exists subject text,
  add column if not exists topic text,
  add column if not exists microtopic text,
  add column if not exists task_type text,
  add column if not exists duration_mins integer,
  add column if not exists planned_minutes integer,
  add column if not exists scheduled_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

alter table public.study_sessions
  add column if not exists session_type text,
  add column if not exists subject text,
  add column if not exists topic text,
  add column if not exists duration_mins integer,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists notes text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_sessions'
      and column_name = 'starts_at'
  ) then
    update public.study_sessions
       set started_at = coalesce(started_at, starts_at)
     where started_at is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_sessions'
      and column_name = 'ends_at'
  ) then
    update public.study_sessions
       set ended_at = coalesce(ended_at, ends_at)
     where ended_at is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_sessions'
      and column_name = 'duration_minutes'
  ) then
    update public.study_sessions
       set duration_mins = coalesce(duration_mins, duration_minutes)
     where duration_mins is null;
  end if;
end $$;

alter table public.mock_tests
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists plan_id uuid references public.study_plans(id) on delete set null,
  add column if not exists exam_name text,
  add column if not exists test_name text,
  add column if not exists total_marks integer,
  add column if not exists scored_marks numeric,
  add column if not exists correct_answers integer,
  add column if not exists wrong_answers integer,
  add column if not exists duration_mins integer,
  add column if not exists notes text,
  add column if not exists attempted_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.mock_tests
  alter column title drop not null;

create table if not exists public.mock_subject_breakdowns (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  subject text not null,
  total_questions integer,
  correct_answers integer,
  wrong_answers integer,
  marks numeric,
  accuracy numeric,
  created_at timestamptz default now()
);

create index if not exists idx_study_plans_user_status on public.study_plans(user_id, status);
create index if not exists idx_study_tasks_plan_date on public.study_tasks(plan_id, scheduled_date);
create index if not exists idx_study_tasks_user_status on public.study_tasks(user_id, status);
create index if not exists idx_study_sessions_user_started on public.study_sessions(user_id, started_at desc);
create index if not exists idx_mock_tests_user_attempted on public.mock_tests(user_id, attempted_at desc);
create index if not exists idx_mock_subject_breakdowns_mock on public.mock_subject_breakdowns(mock_test_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_tasks_plan_id_fkey'
      and conrelid = 'public.study_tasks'::regclass
  ) then
    alter table public.study_tasks
      add constraint study_tasks_plan_id_fkey
      foreign key (plan_id) references public.study_plans(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'study_sessions_plan_id_fkey'
      and conrelid = 'public.study_sessions'::regclass
  ) then
    alter table public.study_sessions
      add constraint study_sessions_plan_id_fkey
      foreign key (plan_id) references public.study_plans(id) on delete set null not valid;
  end if;
end $$;

alter table public.mock_tests enable row level security;
alter table public.mock_subject_breakdowns enable row level security;

notify pgrst, 'reload schema';
