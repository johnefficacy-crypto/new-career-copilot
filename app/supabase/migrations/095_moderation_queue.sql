-- Moderation Queue runtime.
-- Cross-surface queue for reports against forum threads/posts, community
-- resources, mentor profiles, marketplace listings, and AI outputs.
-- Severity rubric is versioned so audits can replay the policy applied at
-- the time of decision.

create table if not exists public.moderation_severity_rubric (
  version text primary key,
  rubric jsonb not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.moderation_severity_rubric (version, rubric, is_active)
values (
  'v1',
  $${
    "p0": "Imminent harm, doxxing, CSAM, credible threats, large-scale spam waves",
    "p1": "Misinformation about exam policy/dates, harassment, mentor fraud, copyright",
    "p2": "Off-topic, low-quality, soft-spam, civility issues",
    "p3": "Minor formatting, tone, taxonomy fixes"
  }$$::jsonb,
  true
)
on conflict (version) do nothing;

create table if not exists public.moderation_items (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in (
      'forum_thread','forum_post','community_resource',
      'mentor_profile','marketplace_listing','ai_response','user_profile'
    )),
  entity_id text not null,
  severity text not null default 'p2' check (severity in ('p0','p1','p2','p3')),
  severity_rubric_version text not null default 'v1'
    references public.moderation_severity_rubric(version),
  reason text not null,
  reason_code text,
  reporter_id uuid references public.profiles(id) on delete set null,
  reporter_role text,
  status text not null default 'open'
    check (status in ('open','in_review','resolved','dismissed','escalated')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  resolution text
    check (resolution is null or resolution in (
      'no_action','content_removed','user_warned','user_suspended','user_banned',
      'edit_required','escalated_legal','duplicate'
    )),
  resolution_notes text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.moderation_items(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in ('created','claimed','reassigned','note','status_changed','escalated','resolved','reopened')),
  from_value text,
  to_value text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_items_status_severity
  on public.moderation_items(status, severity, created_at desc);
create index if not exists idx_moderation_items_assigned
  on public.moderation_items(assigned_to, status);
create index if not exists idx_moderation_items_entity
  on public.moderation_items(entity_type, entity_id);
create index if not exists idx_moderation_events_item
  on public.moderation_events(item_id, created_at desc);

alter table public.moderation_severity_rubric enable row level security;
alter table public.moderation_items enable row level security;
alter table public.moderation_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='moderation_severity_rubric'
      and policyname='msr_public_read_active'
  ) then
    create policy msr_public_read_active on public.moderation_severity_rubric
      for select using (is_active = true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='moderation_severity_rubric'
      and policyname='msr_service_role_all'
  ) then
    create policy msr_service_role_all on public.moderation_severity_rubric
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='moderation_items'
      and policyname='mi_reporter_insert'
  ) then
    create policy mi_reporter_insert on public.moderation_items
      for insert with check (auth.uid() = reporter_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='moderation_items'
      and policyname='mi_reporter_read_own'
  ) then
    create policy mi_reporter_read_own on public.moderation_items
      for select using (auth.uid() = reporter_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='moderation_items'
      and policyname='mi_service_role_all'
  ) then
    create policy mi_service_role_all on public.moderation_items
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='moderation_events'
      and policyname='me_service_role_all'
  ) then
    create policy me_service_role_all on public.moderation_events
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
