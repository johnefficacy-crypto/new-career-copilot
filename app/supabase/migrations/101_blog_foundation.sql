-- Phase 1 blog foundation: schema + core relations + indexes.

create table if not exists public.blog_categories (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_tags (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  category_id bigint references public.blog_categories(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  cover_image_url text,
  seo_title text,
  seo_description text,
  canonical_url text,
  robots_index boolean not null default true,
  related_recruitment_id uuid references public.recruitments(id) on delete set null,
  related_organization_id uuid references public.organizations(id) on delete set null,
  primary_intent text,
  primary_cta_label text,
  primary_cta_url text,
  secondary_cta_label text,
  secondary_cta_url text,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.blog_post_tags (
  blog_post_id bigint not null references public.blog_posts(id) on delete cascade,
  tag_id bigint not null references public.blog_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blog_post_id, tag_id)
);

create table if not exists public.blog_ctas (
  id bigserial primary key,
  blog_post_id bigint not null references public.blog_posts(id) on delete cascade,
  cta_type text not null,
  label text not null,
  target_url text not null,
  placement text not null default 'inline',
  priority int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_recruitment_links (
  blog_post_id bigint not null references public.blog_posts(id) on delete cascade,
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  exam_id bigint,
  post_id bigint,
  created_at timestamptz not null default now(),
  primary key (blog_post_id, recruitment_id)
);

create index if not exists idx_blog_posts_status on public.blog_posts(status);
create index if not exists idx_blog_posts_category on public.blog_posts(category_id);
create index if not exists idx_blog_posts_related_recruitment on public.blog_posts(related_recruitment_id);
create index if not exists idx_blog_posts_published_at on public.blog_posts(published_at desc);
create index if not exists idx_blog_posts_updated_at on public.blog_posts(updated_at desc);
