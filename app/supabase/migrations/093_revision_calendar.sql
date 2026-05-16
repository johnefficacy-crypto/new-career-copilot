-- Revision Calendar runtime.
-- Unified scheduling surface that points at heterogeneous learning items
-- (notes, flashcard decks, mistakes, topics) and tracks completion + SRS
-- intervals. The view revision_calendar_v fans entries out per day for the
-- frontend calendar.

create table if not exists public.revision_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('note','flashcard_deck','mistake','topic','custom')),
  source_id uuid,
  title text not null,
  exam_slug text,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  scheduled_for date not null,
  interval_days integer not null default 1,
  ease numeric(4,2) not null default 2.50,
  repetitions integer not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','skipped','cancelled')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_revision_items_user_date
  on public.revision_items(user_id, scheduled_for);
create index if not exists idx_revision_items_user_status
  on public.revision_items(user_id, status, scheduled_for);
create index if not exists idx_revision_items_source
  on public.revision_items(source_kind, source_id);

alter table public.revision_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='revision_items'
      and policyname='ri_owner_all'
  ) then
    create policy ri_owner_all on public.revision_items
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='revision_items'
      and policyname='ri_service_role_all'
  ) then
    create policy ri_service_role_all on public.revision_items
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
