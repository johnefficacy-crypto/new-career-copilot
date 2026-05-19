-- Admin Study OS — 4-eyes content access flow + mock breakdown recompute audit.
--
-- 1. ``content_access_requests`` — request/approve workflow for opening
--    user-owned artifact content. The Phase 3 single-operator flow
--    landed under ``study_os.ops``; a lower role (``study_os.viewer``)
--    can only OPEN content after a second operator with the higher
--    ``study_os.ops`` permission approves the request. This separates
--    the request and approve identities for incident review.
--
-- 2. ``mock_breakdown_recompute_runs`` — durable log of mock subject
--    breakdown recomputes. The Phase 2 follow-up deferred a recompute
--    service; this PR introduces one and records every run.

create table if not exists public.content_access_requests (
  id uuid primary key default gen_random_uuid(),
  -- The operator who requested access.
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_email text,
  -- The subject of the access (whose artifact is being opened).
  user_id uuid not null references public.profiles(id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('note','flashcard','mistake')),
  artifact_id uuid not null,
  -- The reason supplied at request time.
  request_reason text not null check (char_length(request_reason) >= 8),
  -- Lifecycle: pending → approved → consumed (content opened once); or denied.
  status text not null default 'pending'
    check (status in ('pending','approved','consumed','denied','expired')),
  -- The second operator who approves or denies.
  approved_by uuid references public.profiles(id) on delete set null,
  approved_by_email text,
  approve_reason text,
  approved_at timestamptz,
  consumed_at timestamptz,
  -- Auto-expire pending/approved requests so a stale token can't be redeemed weeks later.
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create index if not exists content_access_requests_user_idx
  on public.content_access_requests (user_id, created_at desc);
create index if not exists content_access_requests_status_idx
  on public.content_access_requests (status, created_at desc);
create index if not exists content_access_requests_requester_idx
  on public.content_access_requests (requested_by, created_at desc);

-- Enforce: a request can only be approved by a different operator than
-- the one who requested. The application layer also checks this with a
-- friendlier error message, but the DB constraint is the source of truth.
create or replace function content_access_requests_check_4_eyes()
  returns trigger language plpgsql as $$
begin
  if NEW.status = 'approved' and NEW.approved_by is not null
     and NEW.approved_by = NEW.requested_by then
    raise exception '4-eyes violation: approver must differ from requester';
  end if;
  return NEW;
end;
$$;

drop trigger if exists content_access_requests_4_eyes_trg on public.content_access_requests;
create trigger content_access_requests_4_eyes_trg
  before insert or update on public.content_access_requests
  for each row execute function content_access_requests_check_4_eyes();


create table if not exists public.mock_breakdown_recompute_runs (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  trigger text not null check (trigger in ('admin','auto')),
  reason text,
  breakdowns_before int,
  breakdowns_after int,
  outcome text not null check (outcome in ('ok','no_change','error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists mock_breakdown_recompute_runs_mock_idx
  on public.mock_breakdown_recompute_runs (mock_test_id, created_at desc);
