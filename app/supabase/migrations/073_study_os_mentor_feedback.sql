-- PR 10 — Study OS comparison: mentor session feedback (private, persona-feed).

create table if not exists public.mentor_session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  mentee_id uuid not null references public.profiles(id) on delete cascade,
  discipline_rating int check (discipline_rating between 1 and 5),
  preparation_rating int check (preparation_rating between 1 and 5),
  follow_through_rating int check (follow_through_rating between 1 and 5),
  feedback_private jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (mentor_id <> mentee_id)
);

create index if not exists idx_msf_mentee_time
  on public.mentor_session_feedback (mentee_id, created_at desc);
create index if not exists idx_msf_mentor_time
  on public.mentor_session_feedback (mentor_id, created_at desc);

alter table public.mentor_session_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mentor_session_feedback'
      and policyname = 'msf_party_select'
  ) then
    create policy msf_party_select on public.mentor_session_feedback
      for select using (auth.uid() in (mentor_id, mentee_id));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mentor_session_feedback'
      and policyname = 'msf_mentor_insert'
  ) then
    create policy msf_mentor_insert on public.mentor_session_feedback
      for insert with check (auth.uid() = mentor_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mentor_session_feedback'
      and policyname = 'msf_service_role_all'
  ) then
    create policy msf_service_role_all on public.mentor_session_feedback
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
