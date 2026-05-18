-- Marketplace delivery split (PR1).
-- Adds a ``delivery_model`` to public.courses so the marketplace can
-- distinguish affiliate / external partner products from courses we deliver
-- on-platform. Introduces an ``affiliate_partners`` registry plus the
-- domain allowlist used by API enforcement.  Existing rows are backfilled
-- from ``is_affiliate`` so nothing in the purchase / refund / enrollment
-- pipeline shifts: ``enrollments.status`` is still the entitlement source,
-- ``lessons.content_url`` behaviour is unchanged, and PR2+ (assets, tokens,
-- versions, tests, bundles) are intentionally out of scope here.

--------------------------------------------------
-- Affiliate partner registry
--------------------------------------------------

create table if not exists public.affiliate_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  allowed_domains text[] not null default '{}'::text[],
  disclosure_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_affiliate_partners_name
  on public.affiliate_partners (lower(name));

create index if not exists affiliate_partners_status_idx
  on public.affiliate_partners (status);

drop trigger if exists affiliate_partners_updated_at on public.affiliate_partners;
create trigger affiliate_partners_updated_at
before update on public.affiliate_partners
for each row execute function public.tg_set_updated_at();

--------------------------------------------------
-- Courses: delivery model + partner link + external URL
--------------------------------------------------

alter table public.courses
  add column if not exists delivery_model text not null default 'platform_course',
  add column if not exists affiliate_partner_id uuid,
  add column if not exists external_product_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'courses_delivery_model_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_delivery_model_check
      check (delivery_model in (
        'affiliate_external',
        'platform_course',
        'platform_download',
        'platform_test',
        'platform_bundle'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'courses_affiliate_partner_fkey'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_affiliate_partner_fkey
      foreign key (affiliate_partner_id)
      references public.affiliate_partners(id)
      on delete restrict;
  end if;
end $$;

create index if not exists courses_delivery_model_idx
  on public.courses (delivery_model);

create index if not exists courses_affiliate_partner_idx
  on public.courses (affiliate_partner_id)
  where affiliate_partner_id is not null;

--------------------------------------------------
-- Backfill delivery_model from legacy is_affiliate flag
--------------------------------------------------

update public.courses
   set delivery_model = 'affiliate_external'
 where is_affiliate is true
   and delivery_model = 'platform_course';

--------------------------------------------------
-- Admin review view: courses whose lessons still point at internal storage
-- (i.e. they look platform-delivered but were never re-classified).  Used
-- by ops to triage rows before flipping delivery_model.
--------------------------------------------------

create or replace view public.admin_courses_needing_delivery_review as
select
  c.id              as course_id,
  c.title           as course_title,
  c.delivery_model  as delivery_model,
  c.status          as course_status,
  count(l.id)       as internal_lesson_count
from public.courses c
join public.course_sections s on s.course_id = c.id
join public.lessons l         on l.section_id = s.id
where l.content_url is not null
  and (
        l.content_url ilike '%supabase.co/storage/%'
     or l.content_url ilike '%/storage/v1/object/%'
     or l.content_url ilike '/storage/%'
     or l.content_url ilike 'storage://%'
  )
group by c.id, c.title, c.delivery_model, c.status;

comment on view public.admin_courses_needing_delivery_review is
  'Lists courses whose lessons reference internal / Supabase Storage URLs. '
  'PR1 uses this to triage which rows should keep delivery_model=platform_* '
  'versus those that were mis-flagged as affiliate.';

--------------------------------------------------
-- RLS: affiliate_partners
--------------------------------------------------

alter table public.affiliate_partners enable row level security;

do $$
begin
  -- Service role: full access (admin code paths use the service client).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'affiliate_partners'
      and policyname = 'ap_service_role_all'
  ) then
    create policy ap_service_role_all on public.affiliate_partners
      for all to service_role using (true) with check (true);
  end if;

  -- Authenticated users: read-only on active partners' public-safe fields.
  -- Column-level filtering happens in the API; row-level we restrict to
  -- status='active' so suspended/archived partners stay hidden.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'affiliate_partners'
      and policyname = 'ap_auth_select_active'
  ) then
    create policy ap_auth_select_active on public.affiliate_partners
      for select to authenticated
      using (status = 'active');
  end if;
end $$;

notify pgrst, 'reload schema';
