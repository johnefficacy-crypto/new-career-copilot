-- 032_exam_topic_analytics_snapshots.sql
-- Versioned analytical outputs and user-specific overlays.
-- Raw subjective fields are stored as score snapshots, not hard truth.

create table if not exists public.exam_topic_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete cascade,
  exam_phase_id uuid references public.exam_phases(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,

  model_version text not null,
  computed_at timestamptz not null default now(),

  coverage_depth text not null default 'unknown'
    check (coverage_depth in ('unknown', 'none', 'mentioned', 'light', 'normal', 'deep', 'core')),
  expected_difficulty text,
  difficulty_observed text,
  exam_priority_score numeric(5,2) not null default 0 check (exam_priority_score >= 0 and exam_priority_score <= 100),
  is_high_yield boolean not null default false,
  confidence_score numeric(4,3) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),

  evidence_count integer not null default 0,
  input_summary jsonb not null default '{}'::jsonb,
  score_components jsonb not null default '{}'::jsonb,

  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'locked', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,

  created_at timestamptz not null default now()
);

create table if not exists public.user_topic_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  exam_phase_id uuid references public.exam_phases(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,

  mastery_score numeric(5,2) not null default 0 check (mastery_score >= 0 and mastery_score <= 100),
  accuracy_score numeric(5,2) check (accuracy_score >= 0 and accuracy_score <= 100),
  speed_score numeric(5,2) check (speed_score >= 0 and speed_score <= 100),
  retention_score numeric(5,2) check (retention_score >= 0 and retention_score <= 100),
  confidence_score numeric(4,3) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  perceived_difficulty text,

  last_practiced_at timestamptz,
  next_revision_at timestamptz,
  evidence_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_topic_mastery_user_exam_phase_topic_uidx
  on public.user_topic_mastery(user_id, exam_id, exam_phase_id, topic_id)
  where exam_id is not null and exam_phase_id is not null;

create unique index if not exists user_topic_mastery_user_topic_no_exam_uidx
  on public.user_topic_mastery(user_id, topic_id)
  where exam_id is null and exam_phase_id is null;

create table if not exists public.user_topic_error_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  exam_phase_id uuid references public.exam_phases(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  question_id uuid references public.pyq_questions(id) on delete set null,

  error_type text not null
    check (error_type in ('concept_gap', 'memory_gap', 'careless', 'speed_issue', 'misread_question', 'option_trap', 'formula_confusion', 'time_management', 'unknown')),
  frequency_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_topic_error_patterns_user_exam_phase_topic_error_uidx
  on public.user_topic_error_patterns(user_id, exam_id, exam_phase_id, topic_id, error_type)
  where exam_id is not null and exam_phase_id is not null;

create table if not exists public.study_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null,
  generator_version text,
  reason text,
  input_context jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(plan_id, version_number)
);

create table if not exists public.study_adaptation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.study_plans(id) on delete cascade,
  plan_version_id uuid references public.study_plan_versions(id) on delete set null,

  event_type text not null
    check (event_type in ('mock_logged', 'task_missed', 'task_completed', 'focus_session_completed', 'deadline_changed', 'exam_update', 'revision_overdue', 'manual_regeneration', 'weekly_review')),
  trigger_source text,
  trigger_payload jsonb not null default '{}'::jsonb,
  change_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_exam_topic_score_snapshots_lookup
  on public.exam_topic_score_snapshots(exam_id, exam_phase_id, topic_id, status, computed_at desc);

create index if not exists idx_exam_topic_score_snapshots_priority
  on public.exam_topic_score_snapshots(exam_id, exam_phase_id, exam_priority_score desc);

create index if not exists idx_exam_topic_score_snapshots_locked
  on public.exam_topic_score_snapshots(exam_id, exam_phase_id, topic_id, computed_at desc)
  where status in ('reviewed', 'locked');

create index if not exists idx_user_topic_mastery_user_exam
  on public.user_topic_mastery(user_id, exam_id, exam_phase_id);

create index if not exists idx_user_topic_mastery_revision
  on public.user_topic_mastery(user_id, next_revision_at);

create index if not exists idx_user_topic_error_patterns_user_topic
  on public.user_topic_error_patterns(user_id, topic_id);

create index if not exists idx_study_plan_versions_plan
  on public.study_plan_versions(plan_id, version_number desc);

create index if not exists idx_study_adaptation_events_user
  on public.study_adaptation_events(user_id, created_at desc);

notify pgrst, 'reload schema';
