-- Migration 024: Atomic eligibility queue claiming with retry metadata
--
-- Problem: the eligibility-consumer Edge Function previously fetched pending rows
-- and updated them to 'processing' in two separate statements. Under concurrent
-- invocations this caused double-processing: both functions could fetch the same
-- row before either marked it as processing.
--
-- Fix: a single SQL function using SELECT … FOR UPDATE SKIP LOCKED atomically
-- claims a batch, increments attempt_count, and stamps claimed_at — all in one
-- transaction. Concurrent consumers never see the same row.
--
-- New columns added to eligibility_recompute_queue:
--   claimed_at      — when this attempt started
--   attempt_count   — total tries (for exponential backoff)
--   last_error      — message from last failure
--   next_attempt_at — earliest time to retry (NULL = retry immediately)

begin;

alter table if exists public.eligibility_recompute_queue
  add column if not exists claimed_at      timestamptz,
  add column if not exists attempt_count   integer not null default 0,
  add column if not exists last_error      text,
  add column if not exists next_attempt_at timestamptz;

create or replace function public.claim_eligibility_queue(p_limit integer default 50)
returns setof public.eligibility_recompute_queue
language plpgsql
security definer
as $$
begin
  return query
  with picked as (
    select id
    from public.eligibility_recompute_queue
    where status = 'pending'
      and (next_attempt_at is null or next_attempt_at <= now())
    order by queued_at
    for update skip locked
    limit p_limit
  )
  update public.eligibility_recompute_queue q
     set status        = 'processing',
         claimed_at    = now(),
         attempt_count = q.attempt_count + 1
    from picked
   where q.id = picked.id
   returning q.*;
end;
$$;

comment on function public.claim_eligibility_queue(integer) is
  'Atomically claims up to p_limit pending eligibility jobs using FOR UPDATE SKIP LOCKED. '
  'Safe for concurrent Edge Function consumers.';

commit;
