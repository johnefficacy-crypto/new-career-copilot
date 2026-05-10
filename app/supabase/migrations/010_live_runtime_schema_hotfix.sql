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
-- RECRUITMENTS
--------------------------------------------------

alter table public.recruitments
  add column if not exists official_notification_url text,
  add column if not exists official_apply_url text,
  add column if not exists source_pdf_url text;

--------------------------------------------------
-- ELIGIBILITY RESULTS
--------------------------------------------------

alter table public.eligibility_results
  add column if not exists is_conditional boolean default false,
  add column if not exists fail_reasons text[] not null default '{}'::text[],
  add column if not exists pass_reasons text[] not null default '{}'::text[],
  add column if not exists computed_at timestamptz default now();

--------------------------------------------------
-- USER APPLICATIONS
--------------------------------------------------

alter table public.user_recruitment_applications
  add column if not exists submitted_at timestamptz,
  add column if not exists clicked_apply_at timestamptz,
  add column if not exists application_number text,
  add column if not exists fee_paid boolean default false,
  add column if not exists fee_amount numeric(10,2),
  add column if not exists documents_pending jsonb default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_user_recruitment_applications_user_updated
  on public.user_recruitment_applications(user_id, updated_at desc);

--------------------------------------------------
-- STUDY SESSIONS
--------------------------------------------------

alter table public.study_sessions
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_sessions'
      and column_name = 'starts_at'
  ) then
    update public.study_sessions
       set started_at = starts_at
     where started_at is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_sessions'
      and column_name = 'ends_at'
  ) then
    update public.study_sessions
       set ended_at = ends_at
     where ended_at is null;
  end if;
end $$;

create index if not exists idx_study_sessions_user_started
  on public.study_sessions(user_id, started_at desc);

--------------------------------------------------
-- MOCK TESTS
--------------------------------------------------

alter table public.mock_tests
  add column if not exists attempted_at timestamptz default now();

create index if not exists idx_mock_tests_user_attempted
  on public.mock_tests(user_id, attempted_at desc);

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
