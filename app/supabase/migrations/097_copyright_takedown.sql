-- Copyright / Takedown workflow runtime.
-- Public DMCA / IP claim submissions land here; trust-ops triages and either
-- removes content (flipping the linked entity's status to dmca_removed) or
-- rejects with reason. Counter-notices are tracked on the same row.

create table if not exists public.copyright_claims (
  id uuid primary key default gen_random_uuid(),
  claim_type text not null default 'dmca'
    check (claim_type in ('dmca','trademark','patent','privacy','other')),
  claimant_name text not null,
  claimant_email text not null,
  claimant_org text,
  claimant_role text,
  work_title text not null,
  work_description text not null,
  ownership_evidence_url text,
  -- Target may be a marketplace resource, community resource, forum post, etc.
  target_entity_type text not null
    check (target_entity_type in (
      'community_resource','marketplace_resource','forum_post',
      'forum_thread','mentor_profile','other'
    )),
  target_entity_id text,
  infringing_url text not null,
  good_faith_statement boolean not null default false,
  accuracy_statement boolean not null default false,
  signature text not null,
  status text not null default 'received'
    check (status in (
      'received','triage','valid','content_removed','rejected',
      'counter_notice_received','reinstated','withdrawn'
    )),
  severity text not null default 'p2' check (severity in ('p0','p1','p2','p3')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  removal_action_at timestamptz,
  counter_notice_at timestamptz,
  counter_notice_text text,
  reinstated_at timestamptz,
  received_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.copyright_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.copyright_claims(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in (
      'submitted','triaged','status_changed','content_removed',
      'rejected','counter_notice','reinstated','note','assigned'
    )),
  from_value text,
  to_value text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_copyright_claims_status_received
  on public.copyright_claims(status, received_at desc);
create index if not exists idx_copyright_claims_target
  on public.copyright_claims(target_entity_type, target_entity_id);
create index if not exists idx_copyright_claims_email
  on public.copyright_claims(claimant_email);
create index if not exists idx_copyright_events_claim
  on public.copyright_events(claim_id, created_at desc);

alter table public.copyright_claims enable row level security;
alter table public.copyright_events enable row level security;

do $$
begin
  -- Public submission via service role only (route validates statements).
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='copyright_claims'
      and policyname='cc_service_role_all'
  ) then
    create policy cc_service_role_all on public.copyright_claims
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='copyright_events'
      and policyname='ce_service_role_all'
  ) then
    create policy ce_service_role_all on public.copyright_events
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
