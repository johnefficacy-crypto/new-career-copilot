-- Canonical promotion contract hardening.
-- Promotion writes reviewed scrape_queue rows into organizations,
-- recruitments, recruitment_units, posts, age_criteria, and
-- education_criteria. Keep this additive and duplicate-safe: live
-- organizations may already contain repeated names, so runtime code
-- uses find-then-insert instead of requiring unique(name).

alter table public.recruitments
  add column if not exists slug text,
  add column if not exists official_apply_url text,
  add column if not exists source_pdf_url text;

alter table public.posts
  add column if not exists group_type text,
  add column if not exists pay_level text,
  add column if not exists job_type text,
  add column if not exists recruitment_unit_id uuid,
  add column if not exists language_requirements text[] not null default '{}'::text[];

alter table public.education_criteria
  add column if not exists min_qualification_level text,
  add column if not exists allowed_disciplines jsonb;

create table if not exists public.recruitment_units (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  unit_code text,
  unit_name text,
  location_state text,
  location_city text,
  preference_order integer,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'recruitment_unit_id'
  )
  and not exists (
    select 1
    from pg_constraint
    where conname = 'posts_recruitment_unit_id_fkey'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_recruitment_unit_id_fkey
      foreign key (recruitment_unit_id) references public.recruitment_units(id) on delete set null;
  end if;
end $$;

create index if not exists idx_organizations_name_lookup
  on public.organizations(name);

create index if not exists idx_organizations_name_normalized_lookup
  on public.organizations((lower(trim(name))));

create index if not exists idx_recruitments_slug
  on public.recruitments(slug);

create index if not exists idx_recruitment_units_recruitment
  on public.recruitment_units(recruitment_id);

create index if not exists idx_recruitment_units_organization
  on public.recruitment_units(organization_id);

create index if not exists idx_posts_recruitment_unit
  on public.posts(recruitment_unit_id);

notify pgrst, 'reload schema';
