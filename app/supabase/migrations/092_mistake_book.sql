-- Mistake Book runtime.
-- Captures wrong answers (manual or from mock sessions) with root-cause tags
-- and SRS-style review scheduling. Optionally promotes into a flashcard deck.

create table if not exists public.mistake_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_slug text,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  question_text text not null,
  correct_answer text,
  my_answer text,
  reason text,
  root_cause text not null default 'concept'
    check (root_cause in ('concept','silly','application','time_pressure','misread','unknown')),
  difficulty smallint check (difficulty between 1 and 5),
  source_kind text not null default 'manual'
    check (source_kind in ('manual','mock','pyq','practice')),
  source_id uuid,
  tags text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open','reviewing','mastered','archived')),
  review_count integer not null default 0,
  next_review_at timestamptz not null default now(),
  mastered_at timestamptz,
  promoted_card_id uuid references public.flashcards(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mistake_entries_user_status
  on public.mistake_entries(user_id, status, next_review_at);
create index if not exists idx_mistake_entries_user_subject
  on public.mistake_entries(user_id, subject_id);
create index if not exists idx_mistake_entries_tags
  on public.mistake_entries using gin(tags);

alter table public.mistake_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mistake_entries'
      and policyname='me_owner_all'
  ) then
    create policy me_owner_all on public.mistake_entries
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mistake_entries'
      and policyname='me_service_role_all'
  ) then
    create policy me_service_role_all on public.mistake_entries
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
