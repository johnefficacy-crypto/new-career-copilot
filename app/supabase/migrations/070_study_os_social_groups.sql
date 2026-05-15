-- PR 6 — Study OS comparison: social trust schema (groups + sessions + attendance).
--
-- Reuse choice for this branch: introduce study_groups / study_group_members
-- alongside the legacy accountability_groups / accountability_group_members
-- tables (migration 019) and route the backend at /api/accountability to the
-- new tables, leaving the legacy rows in place for now. A follow-up migration
-- can copy any production rows over and drop the legacy tables.
--
-- This migration also back-fills missing RLS policies on the legacy
-- accountability tables, since migration 019 enabled RLS without policies.

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_type text not null default 'behavior'
    check (group_type in ('behavior','exam_specific')),
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  max_members int not null default 8 check (max_members between 2 and 50),
  visibility text not null default 'private'
    check (visibility in ('private','invite','public')),
  created_by uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  check (group_type = 'behavior' or exam_id is not null)
);

create table if not exists public.study_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin','owner')),
  status text not null default 'active' check (status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists idx_sgm_user on public.study_group_members (user_id);
create index if not exists idx_sgm_group_active
  on public.study_group_members (group_id) where status = 'active';

create table if not exists public.social_study_sessions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('group','partner','mentor')),
  group_id uuid references public.study_groups(id) on delete cascade,
  partner_pair_id uuid,
  mentor_session_id uuid,
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  planned_minutes int check (planned_minutes is null or planned_minutes >= 0),
  verified_presence_minutes int default 0 check (verified_presence_minutes >= 0),
  verified_focus_minutes int default 0
    check (verified_focus_minutes >= 0
           and verified_focus_minutes <= verified_presence_minutes),
  trust_source text not null
    check (trust_source in (
      'platform_verified','mentor_verified','group_focus_checked',
      'group_presence','partner_costudy','solo_timer','screenshot','self_claimed'
    )),
  trust_weight numeric not null default 0.6 check (trust_weight between 0 and 1),
  created_at timestamptz not null default now(),
  check (
    (session_type = 'group'   and group_id is not null) or
    (session_type = 'partner' and partner_pair_id is not null) or
    (session_type = 'mentor'  and mentor_session_id is not null)
  )
);

create index if not exists idx_sss_group_time
  on public.social_study_sessions (group_id, started_at desc)
  where group_id is not null;
create index if not exists idx_sss_pair_time
  on public.social_study_sessions (partner_pair_id, started_at desc)
  where partner_pair_id is not null;

create table if not exists public.social_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.social_study_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz
    check (left_at is null or joined_at is null or left_at >= joined_at),
  presence_minutes int default 0 check (presence_minutes >= 0),
  focus_check_passed int default 0 check (focus_check_passed >= 0),
  focus_check_total int default 0
    check (focus_check_total >= focus_check_passed),
  prepared boolean,
  completed_declared_task boolean,
  attendance_status text not null default 'present'
    check (attendance_status in ('present','partial','absent','left_early')),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_ssa_user_time
  on public.social_session_attendance (user_id, created_at desc);

-- Back-fill leaderboard FK declared in PR 4.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_leaderboard_entries_group_id_fkey'
  ) then
    alter table public.study_leaderboard_entries
      add constraint study_leaderboard_entries_group_id_fkey
      foreign key (group_id) references public.study_groups(id) on delete cascade;
  end if;
end $$;

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.social_study_sessions enable row level security;
alter table public.social_session_attendance enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_groups'
      and policyname = 'sg_member_or_public_select'
  ) then
    create policy sg_member_or_public_select on public.study_groups
      for select using (
        visibility = 'public'
        or auth.uid() = created_by
        or exists (
          select 1 from public.study_group_members m
          where m.group_id = study_groups.id
            and m.user_id = auth.uid()
            and m.status = 'active'
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_groups'
      and policyname = 'sg_creator_write'
  ) then
    create policy sg_creator_write on public.study_groups
      for insert with check (auth.uid() = created_by);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_groups'
      and policyname = 'sg_creator_update'
  ) then
    create policy sg_creator_update on public.study_groups
      for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_groups'
      and policyname = 'sg_service_role_all'
  ) then
    create policy sg_service_role_all on public.study_groups
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_group_members'
      and policyname = 'sgm_member_select'
  ) then
    create policy sgm_member_select on public.study_group_members
      for select using (
        auth.uid() = user_id
        or exists (
          select 1 from public.study_group_members m2
          where m2.group_id = study_group_members.group_id
            and m2.user_id = auth.uid()
            and m2.status = 'active'
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_group_members'
      and policyname = 'sgm_self_join'
  ) then
    create policy sgm_self_join on public.study_group_members
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_group_members'
      and policyname = 'sgm_service_role_all'
  ) then
    create policy sgm_service_role_all on public.study_group_members
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_study_sessions'
      and policyname = 'sss_member_select'
  ) then
    create policy sss_member_select on public.social_study_sessions
      for select using (
        exists (
          select 1 from public.social_session_attendance a
          where a.session_id = social_study_sessions.id
            and a.user_id = auth.uid()
        )
        or (group_id is not null and exists (
          select 1 from public.study_group_members m
          where m.group_id = social_study_sessions.group_id
            and m.user_id = auth.uid()
            and m.status = 'active'
        ))
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_study_sessions'
      and policyname = 'sss_service_role_all'
  ) then
    create policy sss_service_role_all on public.social_study_sessions
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_session_attendance'
      and policyname = 'ssa_owner_or_co_select'
  ) then
    create policy ssa_owner_or_co_select on public.social_session_attendance
      for select using (
        auth.uid() = user_id
        or exists (
          select 1 from public.social_session_attendance a2
          where a2.session_id = social_session_attendance.session_id
            and a2.user_id = auth.uid()
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_session_attendance'
      and policyname = 'ssa_owner_write'
  ) then
    create policy ssa_owner_write on public.social_session_attendance
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_session_attendance'
      and policyname = 'ssa_owner_update'
  ) then
    create policy ssa_owner_update on public.social_session_attendance
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_session_attendance'
      and policyname = 'ssa_service_role_all'
  ) then
    create policy ssa_service_role_all on public.social_session_attendance
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Backfill the missing RLS policies on migration 019 legacy tables.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_groups'
      and policyname = 'ag_authenticated_select'
  ) then
    create policy ag_authenticated_select on public.accountability_groups
      for select to authenticated using (is_active = true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_groups'
      and policyname = 'ag_service_role_all'
  ) then
    create policy ag_service_role_all on public.accountability_groups
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_group_members'
      and policyname = 'agm_self_select'
  ) then
    create policy agm_self_select on public.accountability_group_members
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_group_members'
      and policyname = 'agm_self_join'
  ) then
    create policy agm_self_join on public.accountability_group_members
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_group_members'
      and policyname = 'agm_service_role_all'
  ) then
    create policy agm_service_role_all on public.accountability_group_members
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_partner_requests'
      and policyname = 'apr_self_select'
  ) then
    create policy apr_self_select on public.accountability_partner_requests
      for select using (auth.uid() = requester_id or auth.uid() = partner_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_partner_requests'
      and policyname = 'apr_requester_write'
  ) then
    create policy apr_requester_write on public.accountability_partner_requests
      for insert with check (auth.uid() = requester_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_partner_requests'
      and policyname = 'apr_service_role_all'
  ) then
    create policy apr_service_role_all on public.accountability_partner_requests
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mentor_bookings'
      and policyname = 'mb_self_select'
  ) then
    create policy mb_self_select on public.mentor_bookings
      for select using (auth.uid() = user_id or auth.uid() = mentor_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mentor_bookings'
      and policyname = 'mb_self_book'
  ) then
    create policy mb_self_book on public.mentor_bookings
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mentor_bookings'
      and policyname = 'mb_service_role_all'
  ) then
    create policy mb_service_role_all on public.mentor_bookings
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
