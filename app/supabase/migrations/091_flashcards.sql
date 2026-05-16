-- Flashcards runtime.
-- Decks own cards; SM-2-lite scheduling lives on flashcards directly.
-- Reviews are append-only for analytics + AI weekly review.

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  exam_slug text,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  is_shared boolean not null default false,
  card_count integer not null default 0,
  due_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.flashcard_decks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  front text not null,
  back text not null,
  hint text,
  -- SM-2-lite state
  ease numeric(4,2) not null default 2.50,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.flashcards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 0 and 5),
  duration_ms integer,
  prev_interval_days integer,
  new_interval_days integer,
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_flashcard_decks_user
  on public.flashcard_decks(user_id, updated_at desc);
create index if not exists idx_flashcards_deck
  on public.flashcards(deck_id);
create index if not exists idx_flashcards_user_due
  on public.flashcards(user_id, due_at) where is_suspended = false;
create index if not exists idx_flashcard_reviews_user_time
  on public.flashcard_reviews(user_id, reviewed_at desc);

alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcard_decks'
      and policyname='fd_owner_all'
  ) then
    create policy fd_owner_all on public.flashcard_decks
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcard_decks'
      and policyname='fd_shared_read'
  ) then
    create policy fd_shared_read on public.flashcard_decks
      for select using (is_shared = true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcard_decks'
      and policyname='fd_service_role_all'
  ) then
    create policy fd_service_role_all on public.flashcard_decks
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcards'
      and policyname='fc_owner_all'
  ) then
    create policy fc_owner_all on public.flashcards
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcards'
      and policyname='fc_service_role_all'
  ) then
    create policy fc_service_role_all on public.flashcards
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcard_reviews'
      and policyname='fr_owner_all'
  ) then
    create policy fr_owner_all on public.flashcard_reviews
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='flashcard_reviews'
      and policyname='fr_service_role_all'
  ) then
    create policy fr_service_role_all on public.flashcard_reviews
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
