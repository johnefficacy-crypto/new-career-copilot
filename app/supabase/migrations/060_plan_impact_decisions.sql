-- 060_plan_impact_decisions.sql
-- Phase 8 — Plan Impact rollout-gate decisions.
-- Records an operator's hold / stage / approve decision on a candidate
-- exam_topic_coverage row before it is locked into the Study OS planner.
-- The impact_summary snapshot is the server-computed before/after diff at
-- the time of the decision, kept for audit.

create table if not exists public.plan_impact_decisions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_topic_coverage_id uuid references public.exam_topic_coverage(id) on delete cascade,

  decision text not null
    check (decision in ('hold', 'stage', 'approve')),
  risk_level text
    check (risk_level is null or risk_level in ('low', 'medium', 'high')),
  impact_summary jsonb not null default '{}'::jsonb,
  notes text,

  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_impact_decisions_coverage
  on public.plan_impact_decisions(exam_topic_coverage_id, decided_at desc);

create index if not exists idx_plan_impact_decisions_exam
  on public.plan_impact_decisions(exam_id, decided_at desc);

-- RLS — admin-only surface, mirroring migration 057.
alter table public.plan_impact_decisions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'plan_impact_decisions'
      and policyname = 'plan_impact_decisions_admin_all'
  ) then
    create policy plan_impact_decisions_admin_all on public.plan_impact_decisions
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
  end if;
end $$;

notify pgrst, 'reload schema';
