-- PR 8 — Study OS comparison: accountability pairs.

create table if not exists public.accountability_pairs (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  pairing_goal text not null
    check (pairing_goal in ('discipline','same_exam','mock_review','revision')),
  exam_id uuid,
  status text not null default 'active' check (status in ('active','paused','ended')),
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique (user_a, user_b, status)
);

create index if not exists idx_ap_user_a
  on public.accountability_pairs (user_a) where status = 'active';
create index if not exists idx_ap_user_b
  on public.accountability_pairs (user_b) where status = 'active';

-- Back-fill FKs declared earlier.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'social_study_sessions_partner_pair_id_fkey'
  ) then
    alter table public.social_study_sessions
      add constraint social_study_sessions_partner_pair_id_fkey
      foreign key (partner_pair_id) references public.accountability_pairs(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'study_leaderboard_entries_pair_id_fkey'
  ) then
    alter table public.study_leaderboard_entries
      add constraint study_leaderboard_entries_pair_id_fkey
      foreign key (pair_id) references public.accountability_pairs(id) on delete cascade;
  end if;
end $$;

alter table public.accountability_pairs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_pairs'
      and policyname = 'ap_member_select'
  ) then
    create policy ap_member_select on public.accountability_pairs
      for select using (auth.uid() in (user_a, user_b));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_pairs'
      and policyname = 'ap_member_write'
  ) then
    create policy ap_member_write on public.accountability_pairs
      for insert with check (auth.uid() in (user_a, user_b));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_pairs'
      and policyname = 'ap_member_update'
  ) then
    create policy ap_member_update on public.accountability_pairs
      for update using (auth.uid() in (user_a, user_b))
      with check (auth.uid() in (user_a, user_b));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accountability_pairs'
      and policyname = 'ap_service_role_all'
  ) then
    create policy ap_service_role_all on public.accountability_pairs
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
