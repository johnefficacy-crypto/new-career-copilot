-- 084_persona_snapshots_and_signal_events.sql
--
-- PR1: Internal Aspirant Persona foundation.
--
-- Adds three persona-specific tables that back the deterministic Persona
-- Snapshot v1 layer described in docs/engineering/persona-layer-v1.md.
-- This migration intentionally does NOT touch any existing onboarding/chat
-- runtime tables introduced in migration 016 (candidate_field_registry,
-- recruitment_question_requirements, funnel_sessions, onboarding_sessions,
-- onboarding_answers, funnel_events). Persona is a derived layer that
-- reads from profile + onboarding + study signals and writes immutable
-- snapshots here.
--
--  A. aspirant_persona_snapshots   - immutable computed persona snapshots
--  B. user_signal_events           - append-only signal log for triggers
--  C. persona_recompute_queue      - work queue for backend recomputation
--
-- All access is via the backend service role (Supabase admin client).
-- RLS is enabled with no policies so direct anon/auth queries are blocked
-- and only the backend can read/write. This mirrors how other
-- backend-owned tables (e.g. eligibility_recompute_queue) are accessed in
-- this project.

-- ─── A. aspirant_persona_snapshots ────────────────────────────────────────
create table if not exists public.aspirant_persona_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  persona_version text not null default 'v1',
  primary_persona text,
  dimensions jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  study_policy jsonb not null default '{}'::jsonb,

  source_hash text,
  computed_at timestamptz not null default now(),
  expires_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_aspirant_persona_snapshots_user_latest
  on public.aspirant_persona_snapshots(user_id, computed_at desc);

comment on table public.aspirant_persona_snapshots is
  'Immutable computed persona snapshots derived from profile/onboarding/study signals. Backend-only; persona is internal and never shown to users as an identity label.';

-- ─── B. user_signal_events ────────────────────────────────────────────────
create table if not exists public.user_signal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_signal_events_user_created
  on public.user_signal_events(user_id, created_at desc);

create index if not exists idx_user_signal_events_unprocessed
  on public.user_signal_events(processed_at)
  where processed_at is null;

comment on table public.user_signal_events is
  'Append-only signal/event log for downstream persona recomputation triggers. Generic event_type lets future PRs (onboarding/study/focus/mock/eligibility) emit without schema changes.';

-- ─── C. persona_recompute_queue ───────────────────────────────────────────
create table if not exists public.persona_recompute_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  attempts int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'persona_recompute_queue_status_check'
  ) then
    alter table public.persona_recompute_queue
      add constraint persona_recompute_queue_status_check
      check (status in ('pending', 'processing', 'completed', 'failed'));
  end if;
end $$;

create index if not exists idx_persona_recompute_queue_pending
  on public.persona_recompute_queue(status, created_at)
  where status = 'pending';

create index if not exists idx_persona_recompute_queue_user_created
  on public.persona_recompute_queue(user_id, created_at desc);

comment on table public.persona_recompute_queue is
  'Backend work queue: rows are enqueued after profile/study/focus/mock/eligibility events and drained by the persona recompute worker.';

-- ─── RLS: backend-only access ─────────────────────────────────────────────
-- Persona is internal; no end-user policies are added. The backend uses
-- the service role which bypasses RLS. Enabling RLS without policies
-- blocks anon/auth direct access.
alter table public.aspirant_persona_snapshots enable row level security;
alter table public.user_signal_events enable row level security;
alter table public.persona_recompute_queue enable row level security;

notify pgrst, 'reload schema';
