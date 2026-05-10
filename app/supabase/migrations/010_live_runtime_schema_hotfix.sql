-- Live runtime schema hotfix.
-- Applies columns required by current backend jobs/endpoints even when 009 was
-- already marked applied before these runtime-sync fixes were added.

--------------------------------------------------
-- PROFILES
--------------------------------------------------

alter table public.profiles
  add column if not exists pwbd_status text default 'none';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'pwbd_status'
      and data_type = 'boolean'
  ) then
    alter table public.profiles
      alter column pwbd_status drop default;

    alter table public.profiles
      alter column pwbd_status type text
      using case
        when pwbd_status is true then 'other'
        when pwbd_status is false then 'none'
        else null
      end;

    alter table public.profiles
      alter column pwbd_status set default 'none';
  end if;
end $$;

--------------------------------------------------
-- ELIGIBILITY RECOMPUTE QUEUE
--------------------------------------------------

alter table public.eligibility_recompute_queue
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

create index if not exists idx_eligibility_recompute_queue_claim
  on public.eligibility_recompute_queue(status, next_attempt_at, queued_at);

drop function if exists public.claim_eligibility_queue(integer);

create function public.claim_eligibility_queue(p_limit integer default 25)
returns setof public.eligibility_recompute_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
    from public.eligibility_recompute_queue
    where status in ('pending', 'queued')
      and (next_attempt_at is null or next_attempt_at <= now())
      and coalesce(attempt_count, 0) < 5
    order by queued_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.eligibility_recompute_queue q
  set
    status = 'processing',
    claimed_at = now(),
    attempt_count = coalesce(q.attempt_count, 0) + 1,
    last_error = null
  from candidate
  where q.id = candidate.id
  returning q.*;
end;
$$;

grant execute on function public.claim_eligibility_queue(integer) to service_role;

--------------------------------------------------
-- NOTIFICATION DISPATCHER
--------------------------------------------------

alter table public.notification_alerts
  add column if not exists email_sent boolean not null default false,
  add column if not exists email_sent_at timestamptz,
  add column if not exists delivery_error text;

create index if not exists idx_notification_alerts_email_pending
  on public.notification_alerts(email_sent, priority desc, sent_at)
  where email_sent = false;

notify pgrst, 'reload schema';
