-- Community resource library runtime.
-- Marketplace courses remain in courses/lessons/reviews; this schema backs
-- free/community-contributed resources, trust provenance, voting, and reports.

create table if not exists public.community_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  resource_type text not null
    check (resource_type in ('pyq_paper','notes','strategy_guide','video_link','course_link','book')),
  exam text not null,
  subject text not null default 'Meta',
  source_url text not null,
  source_trust text not null default 'community'
    check (source_trust in ('official','community','coaching','unknown')),
  contributed_by uuid references public.profiles(id) on delete set null,
  size_label text not null default 'link',
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected','hidden','dmca_removed')),
  verified_by_topper boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  verification_notes text,
  upvote_count integer not null default 0,
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_resource_votes (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.community_resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resource_id, user_id)
);

create table if not exists public.community_resource_reports (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.community_resources(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open','dismissed','resolved','escalated')),
  moderator_id uuid references public.profiles(id) on delete set null,
  moderator_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_community_resources_status_created
  on public.community_resources(status, created_at desc);
create index if not exists idx_community_resources_exam_type
  on public.community_resources(exam, resource_type);
create index if not exists idx_community_resource_reports_status_created
  on public.community_resource_reports(status, created_at desc);

alter table public.community_resources enable row level security;
alter table public.community_resource_votes enable row level security;
alter table public.community_resource_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resources'
      and policyname = 'cr_public_read_approved'
  ) then
    create policy cr_public_read_approved on public.community_resources
      for select using (status = 'approved' or auth.uid() = contributed_by);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resources'
      and policyname = 'cr_contributor_insert'
  ) then
    create policy cr_contributor_insert on public.community_resources
      for insert with check (auth.uid() = contributed_by);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resources'
      and policyname = 'cr_service_role_all'
  ) then
    create policy cr_service_role_all on public.community_resources
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resource_votes'
      and policyname = 'crv_owner_manage'
  ) then
    create policy crv_owner_manage on public.community_resource_votes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resource_votes'
      and policyname = 'crv_public_read'
  ) then
    create policy crv_public_read on public.community_resource_votes
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resource_reports'
      and policyname = 'crr_reporter_insert'
  ) then
    create policy crr_reporter_insert on public.community_resource_reports
      for insert with check (auth.uid() = reporter_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resource_reports'
      and policyname = 'crr_reporter_read_own'
  ) then
    create policy crr_reporter_read_own on public.community_resource_reports
      for select using (auth.uid() = reporter_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_resource_reports'
      and policyname = 'crr_service_role_all'
  ) then
    create policy crr_service_role_all on public.community_resource_reports
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
