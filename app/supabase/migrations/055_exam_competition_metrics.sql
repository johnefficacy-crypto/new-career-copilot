-- 055_exam_competition_metrics.sql
-- Competition Intelligence layer for Study OS.
-- Reviewed competition signals (vacancy, applicant ratio, cutoff and
-- difficulty trends) per exam cycle / phase. Rows are versioned by
-- created_at; only `locked` rows are planner-ready and only
-- `reviewed`/`locked` rows are readable by aspirants.

create table if not exists public.exam_competition_metrics (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete cascade,
  exam_phase_id uuid references public.exam_phases(id) on delete set null,

  vacancy_total integer check (vacancy_total is null or vacancy_total >= 0),
  vacancy_by_category jsonb not null default '{}'::jsonb,
  applicant_count integer check (applicant_count is null or applicant_count >= 0),
  selection_ratio numeric(8,6)
    check (selection_ratio is null or (selection_ratio >= 0 and selection_ratio <= 1)),

  cutoff_trend jsonb not null default '{}'::jsonb,
  difficulty_trend jsonb not null default '{}'::jsonb,
  competition_pressure_score numeric(5,2)
    check (competition_pressure_score is null
      or (competition_pressure_score >= 0 and competition_pressure_score <= 100)),

  source_basis text not null default 'manual'
    check (source_basis in ('manual', 'official', 'reviewed_analysis', 'derived', 'model_generated')),
  confidence_score numeric(4,3) not null default 0
    check (confidence_score >= 0 and confidence_score <= 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  reviewer_status text not null default 'draft'
    check (reviewer_status in ('draft', 'pending_review', 'reviewed', 'locked', 'rejected')),

  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exam_competition_metrics_exam
  on public.exam_competition_metrics(exam_id, exam_cycle_id, exam_phase_id);

create index if not exists idx_exam_competition_metrics_planner_ready
  on public.exam_competition_metrics(exam_id, exam_phase_id, created_at desc)
  where reviewer_status in ('reviewed', 'locked');

notify pgrst, 'reload schema';
