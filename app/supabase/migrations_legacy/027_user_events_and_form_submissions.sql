-- 027_user_events_and_form_submissions_telemetry.sql

create extension if not exists pgcrypto;

create table if not exists public.user_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.profiles(id) on delete cascade,

  -- Keep both names for compatibility with frontend / analytics naming.
  event_name text,
  event_type text,

  -- Generic entity tracking.
  entity_type text,
  entity_id uuid,

  -- Canonical Career Copilot domain links.
  recruitment_id uuid references public.recruitments(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,

  -- Legacy compatibility only.
  -- Do NOT add FK to public.exams because public.exams does not exist.
  exam_id uuid,

  page_path text,
  source text,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint user_events_has_event_name
    check (coalesce(event_name, event_type) is not null)
);

create index if not exists idx_user_events_user_time
  on public.user_events(user_id, occurred_at desc);

create index if not exists idx_user_events_recruitment_time
  on public.user_events(recruitment_id, occurred_at desc);

create index if not exists idx_user_events_exam_legacy_time
  on public.user_events(exam_id, occurred_at desc);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.profiles(id) on delete cascade,

  form_key text not null,
  form_name text,

  -- Canonical relation.
  recruitment_id uuid references public.recruitments(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,

  -- Legacy compatibility only.
  exam_id uuid,

  status text not null default 'submitted'
    check (status in ('started', 'submitted', 'failed', 'abandoned')),

  payload jsonb not null default '{}'::jsonb,
  errors jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_form_submissions_user_time
  on public.form_submissions(user_id, submitted_at desc);

create index if not exists idx_form_submissions_recruitment
  on public.form_submissions(recruitment_id);

alter table public.user_events enable row level security;
alter table public.form_submissions enable row level security;

drop policy if exists "Users can insert own events" on public.user_events;
create policy "Users can insert own events"
on public.user_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can read own events" on public.user_events;
create policy "Users can read own events"
on public.user_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own form submissions" on public.form_submissions;
create policy "Users can insert own form submissions"
on public.form_submissions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can read own form submissions" on public.form_submissions;
create policy "Users can read own form submissions"
on public.form_submissions
for select
to authenticated
using (auth.uid() = user_id);