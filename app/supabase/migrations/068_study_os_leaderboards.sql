-- PR 4 — Study OS comparison: opt-in leaderboard entries.
-- Subject is user|group|pair; check constraint enforces exactly one FK populated.
-- group_id / pair_id FKs are back-filled by later migrations.

create table if not exists public.study_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  board_type text not null
    check (board_type in ('behavior','exam_plan','mock_score','group','partner')),
  subject_type text not null check (subject_type in ('user','group','pair')),
  cohort_key text not null,
  metric_key text not null,

  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid,
  pair_id uuid,

  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,

  score numeric not null,
  percentile numeric check (percentile is null or percentile between 0 and 100),
  rank int check (rank is null or rank >= 1),
  rank_band text check (rank_band is null or rank_band in ('ahead','on_track','behind')),
  trust_tier text not null
    check (trust_tier in ('tier_1','tier_1_5','tier_2','tier_3')),

  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),

  check (period_end >= period_start),
  check (
    (subject_type = 'user'  and user_id  is not null and group_id is null and pair_id is null) or
    (subject_type = 'group' and group_id is not null and user_id  is null and pair_id is null) or
    (subject_type = 'pair'  and pair_id  is not null and user_id  is null and group_id is null)
  )
);

create index if not exists idx_sle_board_cohort_period
  on public.study_leaderboard_entries (board_type, cohort_key, period_end desc, score desc);
create index if not exists idx_sle_user_period
  on public.study_leaderboard_entries (user_id, period_end desc)
  where subject_type = 'user';
create index if not exists idx_sle_group_period
  on public.study_leaderboard_entries (group_id, period_end desc)
  where subject_type = 'group';
create index if not exists idx_sle_pair_period
  on public.study_leaderboard_entries (pair_id, period_end desc)
  where subject_type = 'pair';

alter table public.study_leaderboard_entries enable row level security;

-- Note: group/pair member predicates require study_group_members /
-- accountability_pairs to exist. The predicate uses `exists` against those
-- tables; PRs 6 and 8 create them. Until then the predicate evaluates to
-- false for those subject_types, which is the safe default.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_leaderboard_entries'
      and policyname = 'sle_visible_select'
  ) then
    create policy sle_visible_select on public.study_leaderboard_entries
      for select using (
        (subject_type = 'user' and auth.uid() = user_id)
        or exists (
          select 1 from public.study_comparison_settings s
          where s.user_id = study_leaderboard_entries.user_id
            and s.public_leaderboard_enabled = true
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'study_leaderboard_entries'
      and policyname = 'sle_service_role_all'
  ) then
    create policy sle_service_role_all on public.study_leaderboard_entries
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
