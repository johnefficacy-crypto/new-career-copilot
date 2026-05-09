-- Migration 034: Mock test tracker
-- Tracks user mock test attempts with subject-level breakdowns

create table if not exists public.mock_tests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan_id         uuid references public.study_plans(id) on delete set null,
  exam_name       text not null,
  test_name       text,
  attempted_at    timestamptz not null default now(),
  total_marks     integer,
  scored_marks    numeric(6,2),
  total_questions integer,
  attempted_questions integer,
  correct_answers integer,
  wrong_answers   integer,
  unattempted     integer,
  duration_mins   integer,
  percentile      numeric(5,2),
  rank_in_series  integer,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.mock_subject_breakdowns (
  id          uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  subject     text not null,
  total_marks integer,
  scored_marks numeric(6,2),
  total_questions integer,
  correct_answers integer,
  wrong_answers   integer,
  unattempted     integer,
  time_spent_mins integer
);

create index if not exists idx_mock_tests_user_id on public.mock_tests(user_id);
create index if not exists idx_mock_tests_plan_id on public.mock_tests(plan_id);

alter table public.mock_tests enable row level security;
alter table public.mock_subject_breakdowns enable row level security;

create policy "mock_tests_own" on public.mock_tests
  for all using (auth.uid() = user_id);

create policy "mock_breakdowns_own" on public.mock_subject_breakdowns
  for all using (
    mock_test_id in (select id from public.mock_tests where user_id = auth.uid())
  );
