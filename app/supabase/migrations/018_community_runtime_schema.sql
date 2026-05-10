-- Safe Feature Migration Plan: community and moderation.
-- Current runtime uses forum_* tables; community_* is added for the future
-- product surface without switching routes yet.

alter table public.forum_categories
  add column if not exists slug text,
  add column if not exists exam_tag text,
  add column if not exists post_count integer not null default 0,
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists order_index integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.forum_posts
  add column if not exists slug text,
  add column if not exists reply_count integer not null default 0,
  add column if not exists upvote_count integer not null default 0,
  add column if not exists is_locked boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists exam_tags text[] not null default '{}'::text[],
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists status text not null default 'visible',
  add column if not exists search_vector tsvector,
  add column if not exists updated_at timestamptz default now();

alter table public.forum_comments
  add column if not exists upvote_count integer not null default 0,
  add column if not exists is_accepted boolean not null default false,
  add column if not exists status text not null default 'visible',
  add column if not exists updated_at timestamptz default now();

create table if not exists public.forum_comment_upvotes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.forum_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (comment_id, user_id)
);

create table if not exists public.forum_saved_posts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

create table if not exists public.forum_reputation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  points integer not null default 0,
  posts_count integer not null default 0,
  comments_count integer not null default 0,
  upvotes_received integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  post_id uuid references public.forum_posts(id) on delete cascade,
  comment_id uuid references public.forum_comments(id) on delete cascade,
  reason text not null,
  severity text not null default 'p2_spam_noise',
  status text not null default 'open',
  moderator_id uuid references public.profiles(id) on delete set null,
  moderator_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists public.community_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.community_channels (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  name text not null,
  slug text not null,
  channel_type text not null default 'discussion',
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (space_id, slug)
);

create table if not exists public.community_threads (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  channel_id uuid not null references public.community_channels(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text,
  status text not null default 'visible',
  is_locked boolean not null default false,
  reply_count integer not null default 0,
  vote_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  status text not null default 'visible',
  vote_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.community_threads(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote integer not null default 1,
  created_at timestamptz default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  thread_id uuid references public.community_threads(id) on delete set null,
  reply_id uuid references public.community_replies(id) on delete set null,
  reason text,
  status text not null default 'pending',
  moderator_id uuid references public.profiles(id) on delete set null,
  moderator_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists forum_categories_slug_uidx on public.forum_categories(slug) where slug is not null;
create index if not exists forum_posts_category_created_idx on public.forum_posts(category_id, created_at desc);
create index if not exists forum_posts_search_idx on public.forum_posts using gin(search_vector);
create index if not exists idx_forum_reports_status_created on public.forum_reports(status, created_at desc);
create index if not exists idx_community_threads_channel_created on public.community_threads(channel_id, created_at desc);
create index if not exists idx_community_reports_status_created on public.community_reports(status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'forum_posts_category_id_fkey'
      and conrelid = 'public.forum_posts'::regclass
  ) then
    alter table public.forum_posts
      add constraint forum_posts_category_id_fkey
      foreign key (category_id) references public.forum_categories(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'forum_posts_user_id_fkey'
      and conrelid = 'public.forum_posts'::regclass
  ) then
    alter table public.forum_posts
      add constraint forum_posts_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'forum_comments_post_id_fkey'
      and conrelid = 'public.forum_comments'::regclass
  ) then
    alter table public.forum_comments
      add constraint forum_comments_post_id_fkey
      foreign key (post_id) references public.forum_posts(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'forum_comments_user_id_fkey'
      and conrelid = 'public.forum_comments'::regclass
  ) then
    alter table public.forum_comments
      add constraint forum_comments_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete set null not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
