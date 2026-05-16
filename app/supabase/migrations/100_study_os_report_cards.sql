create table if not exists public.study_report_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_type text not null check (period_type in ('daily','weekly','monthly')),
  period_start date not null,
  period_end date not null,
  plan_id uuid references public.study_plans(id) on delete set null,
  planned_tasks int not null default 0,
  completed_tasks int not null default 0,
  missed_tasks int not null default 0,
  skipped_tasks int not null default 0,
  carried_forward_tasks int not null default 0,
  planned_minutes int not null default 0,
  completed_minutes int not null default 0,
  focus_minutes int not null default 0,
  active_study_days int not null default 0,
  planned_study_days int not null default 0,
  mocks_taken int not null default 0,
  mocks_reviewed int not null default 0,
  correction_tasks_created int not null default 0,
  correction_tasks_completed int not null default 0,
  backlog_start int,
  backlog_end int,
  scores jsonb not null default '{}'::jsonb,
  highlights jsonb not null default '[]'::jsonb,
  corrections jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique(user_id, period_type, period_start)
);

create index if not exists idx_study_report_cards_user_period
  on public.study_report_cards(user_id, period_type, period_start desc);
