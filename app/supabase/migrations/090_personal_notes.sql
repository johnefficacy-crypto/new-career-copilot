-- Personal Notes runtime.
-- User-owned notes attached to subject/topic/exam metadata. Free tier limited
-- to 25 notes via application logic; Pro is unlimited.

create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  exam_slug text,
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  source_url text,
  tags text[] not null default '{}',
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_notes_user_updated
  on public.personal_notes(user_id, updated_at desc);
create index if not exists idx_personal_notes_user_subject
  on public.personal_notes(user_id, subject_id);
create index if not exists idx_personal_notes_user_pinned
  on public.personal_notes(user_id, is_pinned) where is_pinned = true;
create index if not exists idx_personal_notes_tags
  on public.personal_notes using gin(tags);

alter table public.personal_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'personal_notes'
      and policyname = 'pn_owner_all'
  ) then
    create policy pn_owner_all on public.personal_notes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'personal_notes'
      and policyname = 'pn_service_role_all'
  ) then
    create policy pn_service_role_all on public.personal_notes
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
