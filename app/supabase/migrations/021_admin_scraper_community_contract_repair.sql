-- Contract repair after live schema drift: admin trust, scraper runs, and forum embeds.
-- Kept idempotent so it is safe when 012/018 already applied cleanly.

alter table public.organizations
  add column if not exists website_url text,
  add column if not exists official_domain text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists trust_tier text not null default 'unknown',
  add column if not exists verification_notes text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null;

alter table public.scrape_runs
  add column if not exists triggered_by text,
  add column if not exists triggered_by_user uuid references public.profiles(id) on delete set null,
  add column if not exists finished_at timestamptz,
  add column if not exists sources_checked integer not null default 0,
  add column if not exists items_found integer not null default 0,
  add column if not exists items_new integer not null default 0,
  add column if not exists items_duplicate integer not null default 0,
  add column if not exists error_log jsonb not null default '[]'::jsonb,
  add column if not exists providers_health jsonb,
  add column if not exists function_version text;

update public.scrape_runs
   set finished_at = coalesce(finished_at, completed_at)
 where finished_at is null
   and completed_at is not null;

alter table public.forum_categories
  add column if not exists slug text,
  add column if not exists exam_tag text,
  add column if not exists post_count integer not null default 0,
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists order_index integer not null default 0,
  add column if not exists is_active boolean not null default true;

alter table public.forum_posts
  add column if not exists reply_count integer not null default 0,
  add column if not exists upvote_count integer not null default 0,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists exam_tags text[] not null default '{}'::text[];

alter table public.forum_comments
  add column if not exists upvote_count integer not null default 0,
  add column if not exists is_accepted boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_trust_tier_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_trust_tier_check
      check (trust_tier in ('verified','trusted','unknown','unverified'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scrape_runs_triggered_by_user_fkey'
      and conrelid = 'public.scrape_runs'::regclass
  ) then
    alter table public.scrape_runs
      add constraint scrape_runs_triggered_by_user_fkey
      foreign key (triggered_by_user) references public.profiles(id) on delete set null not valid;
  end if;

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

create index if not exists idx_organizations_is_verified on public.organizations(is_verified);
create index if not exists idx_scrape_runs_triggered_by_user on public.scrape_runs(triggered_by_user);
create index if not exists idx_forum_categories_is_active_order on public.forum_categories(is_active, order_index);

notify pgrst, 'reload schema';
