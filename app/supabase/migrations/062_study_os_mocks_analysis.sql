-- Study OS Mocks — analysis surface (review state, weak topics, error
-- patterns) and correction-task linkage. Extends the existing mock_tests +
-- mock_subject_breakdowns tables introduced in migration 017.

-- ── Analysis columns on mock_tests ──────────────────────────────────────────
alter table public.mock_tests
  add column if not exists review_state text not null default 'unreviewed',
  add column if not exists weak_topics jsonb not null default '[]'::jsonb,
  add column if not exists error_patterns jsonb not null default '{}'::jsonb,
  add column if not exists questions_attempted integer;

-- review_state must be one of the documented states.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mock_tests_review_state_check'
      and conrelid = 'public.mock_tests'::regclass
  ) then
    alter table public.mock_tests
      add constraint mock_tests_review_state_check
      check (review_state in (
        'scheduled', 'unreviewed', 'reviewed', 'correction_drafted'
      ));
  end if;
end $$;

-- ── Correction tasks drafted from a reviewed mock ───────────────────────────
create table if not exists public.mock_correction_tasks (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  topic text,
  source_questions jsonb not null default '[]'::jsonb,
  state text not null default 'drafted',
  study_task_id uuid references public.study_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mock_correction_tasks_category_check'
      and conrelid = 'public.mock_correction_tasks'::regclass
  ) then
    alter table public.mock_correction_tasks
      add constraint mock_correction_tasks_category_check
      check (category in (
        'concept_gap', 'memory_gap', 'careless', 'speed_issue', 'option_trap'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'mock_correction_tasks_state_check'
      and conrelid = 'public.mock_correction_tasks'::regclass
  ) then
    alter table public.mock_correction_tasks
      add constraint mock_correction_tasks_state_check
      check (state in ('drafted', 'applied', 'dismissed'));
  end if;
end $$;

create index if not exists idx_mock_correction_tasks_mock
  on public.mock_correction_tasks(mock_test_id);
create index if not exists idx_mock_correction_tasks_user
  on public.mock_correction_tasks(user_id, state);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.mock_correction_tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mock_correction_tasks'
      and policyname = 'mock_correction_tasks_owner_select'
  ) then
    create policy mock_correction_tasks_owner_select
      on public.mock_correction_tasks
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mock_correction_tasks'
      and policyname = 'mock_correction_tasks_service_role_all'
  ) then
    create policy mock_correction_tasks_service_role_all
      on public.mock_correction_tasks
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
