-- 033_study_os_exam_intelligence_links.sql
-- Link existing Study OS tables to canonical exam intelligence.
-- Does not remove existing text snapshot fields: subject/topic/microtopic.

alter table public.study_plans
  add column if not exists exam_id uuid references public.exams(id) on delete set null,
  add column if not exists exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  add column if not exists active_phase_id uuid references public.exam_phases(id) on delete set null,
  add column if not exists current_plan_version_id uuid references public.study_plan_versions(id) on delete set null,
  add column if not exists generation_context jsonb not null default '{}'::jsonb;

alter table public.study_tasks
  add column if not exists exam_id uuid references public.exams(id) on delete set null,
  add column if not exists exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  add column if not exists exam_phase_id uuid references public.exam_phases(id) on delete set null,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists topic_id uuid references public.topics(id) on delete set null,
  add column if not exists exam_topic_coverage_id uuid references public.exam_topic_coverage(id) on delete set null,
  add column if not exists plan_version_id uuid references public.study_plan_versions(id) on delete set null,
  add column if not exists priority_score numeric(5,2),
  add column if not exists why_this_task jsonb not null default '{}'::jsonb,
  add column if not exists evidence_required text,
  add column if not exists completion_quality text,
  add column if not exists skipped_reason text;

alter table public.study_sessions
  add column if not exists task_id uuid references public.study_tasks(id) on delete set null,
  add column if not exists exam_id uuid references public.exams(id) on delete set null,
  add column if not exists exam_phase_id uuid references public.exam_phases(id) on delete set null,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists topic_id uuid references public.topics(id) on delete set null,
  add column if not exists distraction_count integer not null default 0,
  add column if not exists perceived_difficulty text,
  add column if not exists completion_quality text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.mock_tests
  add column if not exists exam_id uuid references public.exams(id) on delete set null,
  add column if not exists exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  add column if not exists exam_phase_id uuid references public.exam_phases(id) on delete set null,
  add column if not exists source_pyq_paper_id uuid references public.pyq_papers(id) on delete set null,
  add column if not exists analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'analyzed', 'needs_review', 'failed')),
  add column if not exists analysis_payload jsonb not null default '{}'::jsonb;

alter table public.mock_subject_breakdowns
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists accuracy_score numeric(5,2),
  add column if not exists speed_score numeric(5,2),
  add column if not exists weak_topic_ids uuid[] not null default '{}'::uuid[],
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.mock_topic_breakdowns (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid not null references public.topics(id) on delete cascade,
  total_questions integer,
  correct_answers integer,
  wrong_answers integer,
  skipped_questions integer,
  marks numeric,
  accuracy numeric,
  avg_time_sec numeric,
  error_types jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(mock_test_id, topic_id)
);

create index if not exists idx_study_plans_exam_cycle
  on public.study_plans(exam_id, exam_cycle_id);

create index if not exists idx_study_tasks_exam_phase
  on public.study_tasks(exam_id, exam_phase_id);

create index if not exists idx_study_tasks_topic
  on public.study_tasks(topic_id);

create index if not exists idx_study_tasks_priority
  on public.study_tasks(user_id, scheduled_date, priority_score desc);

create index if not exists idx_study_sessions_task
  on public.study_sessions(task_id);

create index if not exists idx_study_sessions_topic
  on public.study_sessions(user_id, topic_id, started_at desc);

create index if not exists idx_mock_tests_exam_phase
  on public.mock_tests(user_id, exam_id, exam_phase_id);

create index if not exists idx_mock_subject_breakdowns_subject
  on public.mock_subject_breakdowns(subject_id);

create index if not exists idx_mock_topic_breakdowns_mock
  on public.mock_topic_breakdowns(mock_test_id);

create index if not exists idx_mock_topic_breakdowns_topic
  on public.mock_topic_breakdowns(topic_id);

notify pgrst, 'reload schema';
