-- Study OS Weekly Review — persisted snapshots + derived improved/declined
-- /next-change items. Computed deterministically from study_sessions,
-- study_tasks and mock_tests — no AI is used to derive these rows.

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  hours_studied numeric not null default 0,
  hours_planned numeric not null default 0,
  adherence numeric,
  tasks_completed integer not null default 0,
  tasks_planned integer not null default 0,
  mocks_taken integer not null default 0,
  mock_trend jsonb not null default '[]'::jsonb,
  backlog_start integer,
  backlog_end integer,
  revision_coverage numeric,
  computed_at timestamptz not null default now()
);

create unique index if not exists uidx_weekly_reviews_user_week
  on public.weekly_reviews(user_id, week_start);

create index if not exists idx_weekly_reviews_user_recent
  on public.weekly_reviews(user_id, week_start desc);

create table if not exists public.weekly_review_items (
  id uuid primary key default gen_random_uuid(),
  weekly_review_id uuid not null references public.weekly_reviews(id) on delete cascade,
  kind text not null,
  position integer not null default 0,
  label text not null,
  delta text,
  note text,
  source text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weekly_review_items_kind_check'
      and conrelid = 'public.weekly_review_items'::regclass
  ) then
    alter table public.weekly_review_items
      add constraint weekly_review_items_kind_check
      check (kind in ('improved', 'declined', 'next_change'));
  end if;
end $$;

create index if not exists idx_weekly_review_items_review
  on public.weekly_review_items(weekly_review_id, kind);

alter table public.weekly_reviews enable row level security;
alter table public.weekly_review_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_reviews'
      and policyname = 'weekly_reviews_owner_select'
  ) then
    create policy weekly_reviews_owner_select
      on public.weekly_reviews
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_reviews'
      and policyname = 'weekly_reviews_service_role_all'
  ) then
    create policy weekly_reviews_service_role_all
      on public.weekly_reviews
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_review_items'
      and policyname = 'weekly_review_items_owner_select'
  ) then
    create policy weekly_review_items_owner_select
      on public.weekly_review_items
      for select
      using (
        exists (
          select 1 from public.weekly_reviews wr
          where wr.id = weekly_review_id and wr.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_review_items'
      and policyname = 'weekly_review_items_service_role_all'
  ) then
    create policy weekly_review_items_service_role_all
      on public.weekly_review_items
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
