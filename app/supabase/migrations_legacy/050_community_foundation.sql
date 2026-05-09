-- Migration: 044_community_foundation
-- Purpose: Phase 8 governance-first community foundation.
-- Adds community schema + moderation primitives with strict official_updates separation.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'community_channel_type'
      and n.nspname = 'public'
  ) then
    create type public.community_channel_type as enum (
      'official_updates',
      'form_help',
      'preparation',
      'pyq_discussion'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'community_report_status'
      and n.nspname = 'public'
  ) then
    create type public.community_report_status as enum (
      'pending',
      'reviewing',
      'resolved',
      'dismissed'
    );
  end if;
end
$$;

create table if not exists public.community_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_channels (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  channel_type public.community_channel_type not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(space_id, slug),
  unique(space_id, channel_type)
);

create table if not exists public.community_threads (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  channel_id uuid not null references public.community_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  upvote_count int not null default 0,
  reply_count int not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  upvote_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, thread_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.community_threads(id) on delete set null,
  reply_id uuid references public.community_replies(id) on delete set null,
  reason text not null,
  details text,
  status public.community_report_status not null default 'pending',
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  moderation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((thread_id is not null) <> (reply_id is not null))
);

create index if not exists idx_community_channels_space_type on public.community_channels(space_id, channel_type);
create index if not exists idx_community_threads_channel_created on public.community_threads(channel_id, created_at desc);
create index if not exists idx_community_reports_status_created on public.community_reports(status, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bump_thread_reply_activity()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.community_threads
    set reply_count = reply_count + 1,
        last_activity_at = now(),
        updated_at = now()
    where id = new.thread_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_threads
    set reply_count = greatest(reply_count - 1, 0),
        updated_at = now()
    where id = old.thread_id;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.bump_thread_vote_activity()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.community_threads
    set upvote_count = upvote_count + 1,
        last_activity_at = now(),
        updated_at = now()
    where id = new.thread_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_threads
    set upvote_count = greatest(upvote_count - 1, 0),
        updated_at = now()
    where id = old.thread_id;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.community_channel_is_official_updates(p_channel_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.community_channels c
    where c.id = p_channel_id
      and c.channel_type = 'official_updates'
  );
$$;

create or replace function public.current_user_is_community_admin()
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.is_admin = true or p.admin_role in ('super_admin','ops_admin','content_admin','support_admin'))
  );
$$;

alter table public.community_spaces enable row level security;
alter table public.community_channels enable row level security;
alter table public.community_threads enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_votes enable row level security;
alter table public.community_reports enable row level security;

-- Read access
drop policy if exists "Community spaces are readable" on public.community_spaces;
create policy "Community spaces are readable"
on public.community_spaces for select using (is_active = true or public.current_user_is_community_admin());

drop policy if exists "Community channels are readable" on public.community_channels;
create policy "Community channels are readable"
on public.community_channels for select using (is_active = true or public.current_user_is_community_admin());

drop policy if exists "Community threads are readable" on public.community_threads;
create policy "Community threads are readable"
on public.community_threads for select using (true);

drop policy if exists "Community replies are readable" on public.community_replies;
create policy "Community replies are readable"
on public.community_replies for select using (true);

drop policy if exists "Community reports readable by moderators" on public.community_reports;
create policy "Community reports readable by moderators"
on public.community_reports for select using (public.current_user_is_community_admin());

-- Write access with governance constraints
drop policy if exists "Community admins manage spaces" on public.community_spaces;
create policy "Community admins manage spaces"
on public.community_spaces for all using (public.current_user_is_community_admin()) with check (public.current_user_is_community_admin());

drop policy if exists "Community admins manage channels" on public.community_channels;
create policy "Community admins manage channels"
on public.community_channels for all using (public.current_user_is_community_admin()) with check (public.current_user_is_community_admin());

drop policy if exists "Users create non-official threads" on public.community_threads;
create policy "Users create non-official threads"
on public.community_threads for insert
with check (
  auth.uid() = user_id
  and not public.community_channel_is_official_updates(channel_id)
);

drop policy if exists "Users update own non-locked threads" on public.community_threads;
create policy "Users update own non-locked threads"
on public.community_threads for update
using (auth.uid() = user_id and is_locked = false)
with check (auth.uid() = user_id);

drop policy if exists "Community admins update any thread" on public.community_threads;
create policy "Community admins update any thread"
on public.community_threads for update
using (public.current_user_is_community_admin())
with check (public.current_user_is_community_admin());

drop policy if exists "Community admins delete any thread" on public.community_threads;
create policy "Community admins delete any thread"
on public.community_threads for delete
using (public.current_user_is_community_admin());

drop policy if exists "Users create replies on non-official threads" on public.community_replies;
create policy "Users create replies on non-official threads"
on public.community_replies for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.community_threads t
    where t.id = thread_id
      and t.is_locked = false
      and not public.community_channel_is_official_updates(t.channel_id)
  )
);

drop policy if exists "Users update own replies" on public.community_replies;
create policy "Users update own replies"
on public.community_replies for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Community admins delete replies" on public.community_replies;
create policy "Community admins delete replies"
on public.community_replies for delete
using (public.current_user_is_community_admin());

drop policy if exists "Users manage own thread votes" on public.community_votes;
create policy "Users manage own thread votes"
on public.community_votes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users create reports" on public.community_reports;
create policy "Users create reports"
on public.community_reports for insert
with check (auth.uid() = reporter_id);

drop policy if exists "Community admins moderate reports" on public.community_reports;
create policy "Community admins moderate reports"
on public.community_reports for update
using (public.current_user_is_community_admin())
with check (public.current_user_is_community_admin());

-- Triggers
drop trigger if exists trg_community_spaces_updated_at on public.community_spaces;
create trigger trg_community_spaces_updated_at
before update on public.community_spaces
for each row execute function public.set_updated_at();

drop trigger if exists trg_community_channels_updated_at on public.community_channels;
create trigger trg_community_channels_updated_at
before update on public.community_channels
for each row execute function public.set_updated_at();

drop trigger if exists trg_community_threads_updated_at on public.community_threads;
create trigger trg_community_threads_updated_at
before update on public.community_threads
for each row execute function public.set_updated_at();

drop trigger if exists trg_community_replies_updated_at on public.community_replies;
create trigger trg_community_replies_updated_at
before update on public.community_replies
for each row execute function public.set_updated_at();

drop trigger if exists trg_community_reports_updated_at on public.community_reports;
create trigger trg_community_reports_updated_at
before update on public.community_reports
for each row execute function public.set_updated_at();

drop trigger if exists trg_community_replies_count on public.community_replies;
create trigger trg_community_replies_count
after insert or delete on public.community_replies
for each row execute function public.bump_thread_reply_activity();

drop trigger if exists trg_community_votes_count on public.community_votes;
create trigger trg_community_votes_count
after insert or delete on public.community_votes
for each row execute function public.bump_thread_vote_activity();
