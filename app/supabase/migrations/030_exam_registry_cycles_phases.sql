-- 029_exam_registry_cycles_phases.sql
-- Reusable exam registry and exam-specific coverage overlays.
-- This does not replace existing post-scoped public.exam_patterns.

create table if not exists public.exam_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  exam_family_id uuid references public.exam_families(id) on delete set null,
  slug text not null unique,
  name text not null,
  exam_type text not null default 'recruitment'
    check (exam_type in ('recruitment', 'entrance', 'certification', 'opportunity', 'other')),
  default_difficulty_level text,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_cycles (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  year integer,
  cycle_name text not null,
  status text not null default 'expected'
    check (status in ('expected', 'open', 'active', 'closed', 'completed', 'cancelled')),
  notification_date date,
  application_start date,
  application_end date,
  exam_start date,
  exam_end date,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_id, year, cycle_name)
);

create table if not exists public.exam_phases (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete cascade,
  phase_name text not null,
  phase_slug text not null,
  phase_order integer not null default 0,
  mode text,
  duration_mins integer,
  total_questions integer,
  total_marks numeric,
  negative_marking text,
  status text not null default 'active'
    check (status in ('expected', 'active', 'completed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists exam_phases_exam_cycle_slug_uidx
  on public.exam_phases(exam_id, exam_cycle_id, phase_slug)
  where exam_cycle_id is not null;

create unique index if not exists exam_phases_exam_slug_no_cycle_uidx
  on public.exam_phases(exam_id, phase_slug)
  where exam_cycle_id is null;

create table if not exists public.exam_phase_sections (
  id uuid primary key default gen_random_uuid(),
  exam_phase_id uuid not null references public.exam_phases(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  section_label text not null,
  question_count integer,
  marks numeric,
  duration_mins integer,
  negative_marking text,
  difficulty_level text,
  weightage_percent numeric,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_phase_id, subject_id, section_label)
);

create table if not exists public.exam_topic_coverage (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete cascade,
  exam_phase_id uuid references public.exam_phases(id) on delete cascade,
  section_id uuid references public.exam_phase_sections(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete restrict,

  coverage_depth text not null default 'unknown'
    check (coverage_depth in ('unknown', 'none', 'mentioned', 'light', 'normal', 'deep', 'core')),
  expected_difficulty text,
  exam_priority_score numeric(5,2) not null default 0 check (exam_priority_score >= 0 and exam_priority_score <= 100),
  is_high_yield boolean not null default false,
  confidence_score numeric(4,3) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),

  source_basis text not null default 'manual'
    check (source_basis in ('official_syllabus', 'pyq_analysis', 'admin_review', 'hybrid', 'manual', 'model_generated')),
  model_version text,
  reviewer_status text not null default 'draft'
    check (reviewer_status in ('draft', 'pending_review', 'reviewed', 'locked', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists exam_topic_coverage_cycle_phase_topic_uidx
  on public.exam_topic_coverage(exam_id, exam_cycle_id, exam_phase_id, topic_id)
  where exam_cycle_id is not null and exam_phase_id is not null;

create unique index if not exists exam_topic_coverage_exam_phase_topic_uidx
  on public.exam_topic_coverage(exam_id, exam_phase_id, topic_id)
  where exam_cycle_id is null and exam_phase_id is not null;

create index if not exists idx_exam_families_active
  on public.exam_families(is_active);

create index if not exists idx_exams_family
  on public.exams(exam_family_id);

create index if not exists idx_exams_active
  on public.exams(is_active);

create index if not exists idx_exam_cycles_exam_status
  on public.exam_cycles(exam_id, status);

create index if not exists idx_exam_cycles_dates
  on public.exam_cycles(application_end, exam_start);

create index if not exists idx_exam_phases_exam_cycle
  on public.exam_phases(exam_id, exam_cycle_id);

create index if not exists idx_exam_phase_sections_phase
  on public.exam_phase_sections(exam_phase_id);

create index if not exists idx_exam_phase_sections_subject
  on public.exam_phase_sections(subject_id);

create index if not exists idx_exam_topic_coverage_exam_phase
  on public.exam_topic_coverage(exam_id, exam_phase_id);

create index if not exists idx_exam_topic_coverage_topic
  on public.exam_topic_coverage(topic_id);

create index if not exists idx_exam_topic_coverage_priority
  on public.exam_topic_coverage(exam_id, exam_phase_id, exam_priority_score desc);

create index if not exists idx_exam_topic_coverage_high_yield
  on public.exam_topic_coverage(exam_id, exam_phase_id, is_high_yield);

-- Compatibility: keep existing aspirant_exam_attempts.exam_id untouched.
-- Add a nullable canonical link that can be backfilled safely.
alter table public.aspirant_exam_attempts
  add column if not exists exam_ref_id uuid references public.exams(id) on delete set null;

create index if not exists idx_aspirant_exam_attempts_exam_ref
  on public.aspirant_exam_attempts(exam_ref_id);

notify pgrst, 'reload schema';
