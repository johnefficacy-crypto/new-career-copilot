-- PR 2 — Study OS comparison: per-exam daily snapshots.

create table if not exists public.study_exam_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  snapshot_date date not null,

  planned_tasks int not null default 0 check (planned_tasks >= 0),
  completed_tasks int not null default 0
    check (completed_tasks >= 0 and completed_tasks <= planned_tasks),
  planned_minutes int not null default 0 check (planned_minutes >= 0),
  completed_minutes int not null default 0 check (completed_minutes >= 0),

  plan_adherence_score numeric
    check (plan_adherence_score is null or plan_adherence_score between 0 and 1),
  completion_score numeric
    check (completion_score is null or completion_score between 0 and 1),
  revision_coverage_score numeric
    check (revision_coverage_score is null or revision_coverage_score between 0 and 1),
  exam_priority_alignment_score numeric
    check (exam_priority_alignment_score is null or exam_priority_alignment_score between 0 and 1),

  created_at timestamptz not null default now(),

  unique (user_id, exam_id, exam_cycle_id, exam_phase_id, snapshot_date)
);

create index if not exists idx_seds_user_exam_date
  on public.study_exam_daily_snapshots (user_id, exam_id, snapshot_date desc);
create index if not exists idx_seds_exam_phase_date
  on public.study_exam_daily_snapshots (exam_id, exam_phase_id, snapshot_date desc);

alter table public.study_exam_daily_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_exam_daily_snapshots'
      and policyname = 'seds_owner_select'
  ) then
    create policy seds_owner_select on public.study_exam_daily_snapshots
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_exam_daily_snapshots'
      and policyname = 'seds_service_role_all'
  ) then
    create policy seds_service_role_all on public.study_exam_daily_snapshots
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
