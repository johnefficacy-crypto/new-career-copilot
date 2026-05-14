-- 056_exam_policy_updates.sql
-- Policy / Update Intelligence layer for Study OS.
-- Official notification / cycle / syllabus / vacancy / eligibility changes,
-- plus unverified aggregator discoveries.
--
-- Two independent axes are tracked deliberately:
--   reviewer_status — operator workflow (pending/verified/rejected/needs_correction)
--   claim_status    — source-trust state (unverified/official_confirmed/superseded)
--
-- Trust rule, enforced at the DB level: only `official` source rows may
-- carry any affects_* = true. Aggregator / research / opportunity rows are
-- discovery-only and can never silently rewrite a plan, deadline or
-- eligibility. The verified-gate (reviewer_status='verified') is applied by
-- the backend reader before any affects_* flag reaches the planner.

create table if not exists public.exam_policy_updates (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete cascade,
  source_id uuid references public.source_registry(id) on delete set null,

  update_type text not null
    check (update_type in (
      'notification_change', 'cycle_change', 'date_change', 'syllabus_change',
      'pattern_change', 'vacancy_change', 'eligibility_change',
      'reservation_change', 'document_rule_change', 'other'
    )),
  title text not null,
  summary text,
  source_url text,
  source_type text not null default 'unknown'
    check (source_type in ('official', 'aggregator', 'research', 'opportunity', 'unknown')),

  claim_status text not null default 'unverified'
    check (claim_status in ('unverified', 'official_confirmed', 'superseded')),
  reviewer_status text not null default 'pending'
    check (reviewer_status in ('pending', 'verified', 'rejected', 'needs_correction')),

  affects_plan boolean not null default false,
  affects_deadline boolean not null default false,
  affects_eligibility boolean not null default false,
  affects_documents boolean not null default false,
  affects_syllabus boolean not null default false,
  affects_vacancy boolean not null default false,

  change_summary jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  effective_from date,

  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exam_policy_updates_non_official_no_effect check (
    source_type = 'official'
    or (
      affects_plan = false
      and affects_deadline = false
      and affects_eligibility = false
      and affects_documents = false
      and affects_syllabus = false
      and affects_vacancy = false
    )
  )
);

create index if not exists idx_exam_policy_updates_exam
  on public.exam_policy_updates(exam_id, exam_cycle_id, published_at desc);

create index if not exists idx_exam_policy_updates_verified_official
  on public.exam_policy_updates(exam_id, published_at desc)
  where source_type = 'official' and reviewer_status = 'verified';

create index if not exists idx_exam_policy_updates_discovery
  on public.exam_policy_updates(exam_id, created_at desc)
  where source_type <> 'official';

notify pgrst, 'reload schema';
