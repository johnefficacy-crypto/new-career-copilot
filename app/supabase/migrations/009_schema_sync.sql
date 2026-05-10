-- Canonical schema sync migration
-- Align Supabase DB with backend expectations

--------------------------------------------------
-- PROFILES
--------------------------------------------------
alter table profiles add column if not exists gender text;
alter table profiles add column if not exists category text;
alter table profiles add column if not exists pwbd_status boolean default false;
alter table profiles add column if not exists domicile_state text;
alter table profiles add column if not exists nationality text;
alter table profiles add column if not exists ex_serviceman boolean default false;
alter table profiles add column if not exists govt_employee boolean default false;
alter table profiles add column if not exists dob date;
alter table profiles add column if not exists date_of_birth date;
alter table profiles add column if not exists service_years int;
alter table profiles add column if not exists graduation_year int;
alter table profiles add column if not exists target_type text;
alter table profiles add column if not exists target_exam text;
alter table profiles add column if not exists career_stage text;
alter table profiles add column if not exists career_goal text;
alter table profiles add column if not exists onboarding_step int default 0;
alter table profiles add column if not exists onboarding_completed boolean default false;
alter table profiles add column if not exists is_admin boolean default false;
alter table profiles add column if not exists plan_id text;
alter table profiles add column if not exists avatar_url text;

create unique index if not exists profiles_id_idx on profiles(id);

--------------------------------------------------
-- RECRUITMENTS
--------------------------------------------------
alter table recruitments add column if not exists slug text;
alter table recruitments add column if not exists publish_status text default 'draft';
alter table public.recruitments
  add column if not exists official_notification_url text,
  add column if not exists official_apply_url text,
  add column if not exists source_pdf_url text;

create unique index if not exists recruitments_slug_idx on recruitments(slug);

update recruitments
set slug = lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', '-', 'g'))
  || '-' || coalesce(year::text, extract(year from now())::text)
  || '-' || left(id::text, 8)
where slug is null;

--------------------------------------------------
-- ELIGIBILITY RESULTS
--------------------------------------------------
alter table eligibility_results
add column if not exists is_conditional boolean default false;
alter table public.eligibility_results
  add column if not exists fail_reasons text[] not null default '{}'::text[],
  add column if not exists pass_reasons text[] not null default '{}'::text[],
  add column if not exists computed_at timestamptz default now();

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

--------------------------------------------------
-- STUDY SESSIONS (safe rename)
--------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='study_sessions' AND column_name='duration_minutes'
    ) THEN
        ALTER TABLE study_sessions
        RENAME COLUMN duration_minutes TO duration_mins;
    END IF;
END $$;

alter table study_sessions add column if not exists subject text;
alter table study_sessions add column if not exists topic text;
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
-- STUDY PLANS
--------------------------------------------------
alter table study_plans add column if not exists status text default 'active';

--------------------------------------------------
-- USER APPLICATIONS
--------------------------------------------------
alter table user_recruitment_applications add column if not exists status text default 'started';
alter table public.user_recruitment_applications
  add column if not exists submitted_at timestamptz,
  add column if not exists clicked_apply_at timestamptz,
  add column if not exists application_number text,
  add column if not exists fee_paid boolean default false,
  add column if not exists fee_amount numeric(10,2),
  add column if not exists documents_pending jsonb default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz default now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_user_apps_recruitment'
    ) THEN
        ALTER TABLE user_recruitment_applications
        ADD CONSTRAINT fk_user_apps_recruitment
        FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE;
    END IF;
END $$;

create index if not exists idx_user_recruitment_applications_user_updated
  on public.user_recruitment_applications(user_id, updated_at desc);

--------------------------------------------------
-- MOCK TESTS
--------------------------------------------------
alter table mock_tests add column if not exists user_id uuid;
alter table public.mock_tests
  add column if not exists attempted_at timestamptz default now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'mock_tests_user_id_fkey'
    ) THEN
        ALTER TABLE mock_tests
        ADD CONSTRAINT mock_tests_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;
    END IF;
END $$;

create index if not exists idx_mock_tests_user_attempted
  on public.mock_tests(user_id, attempted_at desc);

--------------------------------------------------
-- NOTIFICATIONS
--------------------------------------------------
alter table public.notification_alerts
  add column if not exists email_sent boolean not null default false,
  add column if not exists email_sent_at timestamptz,
  add column if not exists delivery_error text;

create index if not exists idx_notification_alerts_email_pending
  on public.notification_alerts(email_sent, priority desc, sent_at)
  where email_sent = false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_alerts_recruitment'
    ) THEN
        ALTER TABLE notification_alerts
        ADD CONSTRAINT fk_alerts_recruitment
        FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE;
    END IF;
END $$;

--------------------------------------------------
-- REFRESH RPC AFTER REQUIRED COLUMNS EXIST
--------------------------------------------------

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
