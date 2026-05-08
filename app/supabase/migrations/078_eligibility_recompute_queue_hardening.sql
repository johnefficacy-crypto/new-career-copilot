begin;

alter table if exists public.eligibility_recompute_queue
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists queued_at timestamptz not null default now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

create unique index if not exists uq_recompute_queue_active
  on public.eligibility_recompute_queue (user_id, recruitment_id)
  where status in ('pending','processing');

commit;
