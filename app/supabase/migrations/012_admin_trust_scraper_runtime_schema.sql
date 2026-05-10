-- Safe Feature Migration Plan: admin trust and scraper runtime schema.
-- Fixes active-schema drift for admin trust, source verification, and scraper
-- run summaries before continuing lower-priority feature capsules.

--------------------------------------------------
-- ORGANIZATION TRUST FIELDS
--------------------------------------------------

alter table public.organizations
  add column if not exists website_url text,
  add column if not exists official_domain text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists trust_tier text not null default 'unknown',
  add column if not exists verification_notes text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null;

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
end $$;

create index if not exists idx_organizations_trust_tier
  on public.organizations(trust_tier);

create index if not exists idx_organizations_is_verified
  on public.organizations(is_verified);

--------------------------------------------------
-- SOURCE REGISTRY TRUST AND ORGANIZATION LINKAGE
--------------------------------------------------

alter table public.source_registry
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists source_name text,
  add column if not exists short_code text,
  add column if not exists category text,
  add column if not exists jurisdiction text,
  add column if not exists official_url text,
  add column if not exists notification_url text,
  add column if not exists rss_url text,
  add column if not exists api_url text,
  add column if not exists pdf_bulletin_url text,
  add column if not exists adapter_type text,
  add column if not exists scrape_interval_hours integer,
  add column if not exists tier integer,
  add column if not exists trust_score numeric,
  add column if not exists anti_bot_risk text,
  add column if not exists requires_playwright boolean not null default false,
  add column if not exists requires_login boolean not null default false,
  add column if not exists has_captcha boolean not null default false,
  add column if not exists pdf_only boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists verification_status text not null default 'needs_review',
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_scraped_at timestamptz,
  add column if not exists last_error text,
  add column if not exists consecutive_fails integer not null default 0,
  add column if not exists notes text,
  add column if not exists org_state text,
  add column if not exists insecure_tls boolean not null default false,
  add column if not exists selectors jsonb,
  add column if not exists requires_official_confirmation boolean not null default false;

update public.source_registry
   set official_url = coalesce(official_url, source_url),
       source_name = coalesce(source_name, source_url)
 where official_url is null
    or source_name is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_registry_organization_id_fkey'
      and conrelid = 'public.source_registry'::regclass
  ) then
    alter table public.source_registry
      add constraint source_registry_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'source_registry_trust_score_check'
      and conrelid = 'public.source_registry'::regclass
  ) then
    alter table public.source_registry
      add constraint source_registry_trust_score_check
      check (trust_score is null or (trust_score >= 0 and trust_score <= 1));
  end if;
end $$;

create index if not exists idx_source_registry_organization_id
  on public.source_registry(organization_id);

create index if not exists idx_source_registry_verification_status
  on public.source_registry(verification_status);

--------------------------------------------------
-- SCRAPE RUN SUMMARIES
--------------------------------------------------

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

create index if not exists idx_scrape_runs_started_at
  on public.scrape_runs(started_at desc);

create index if not exists idx_scrape_runs_triggered_by_user
  on public.scrape_runs(triggered_by_user);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scrape_runs_triggered_by_user_fkey'
      and conrelid = 'public.scrape_runs'::regclass
  ) then
    alter table public.scrape_runs
      add constraint scrape_runs_triggered_by_user_fkey
      foreign key (triggered_by_user) references public.profiles(id) on delete set null not valid;
  end if;
end $$;

--------------------------------------------------
-- SCRAPE QUEUE AND FIELD EVIDENCE RUNTIME FIELDS
--------------------------------------------------

alter table public.scrape_queue
  add column if not exists source_id uuid references public.source_registry(id) on delete set null,
  add column if not exists source_url text,
  add column if not exists source_name text,
  add column if not exists raw_html text,
  add column if not exists raw_payload jsonb,
  add column if not exists extracted_fields jsonb,
  add column if not exists duplicate_of uuid references public.scrape_queue(id) on delete set null,
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists field_evidence jsonb,
  add column if not exists official_source_resolved boolean not null default false,
  add column if not exists official_source_host text,
  add column if not exists extraction_status text,
  add column if not exists evidence_required boolean,
  add column if not exists scraped_at timestamptz,
  add column if not exists notification_document_id uuid references public.notification_documents(id) on delete set null,
  add column if not exists promoted_recruitment_id uuid references public.recruitments(id) on delete set null;

alter table public.extracted_field_evidence
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_notes text,
  add column if not exists extraction_method text,
  add column if not exists extracted_value jsonb,
  add column if not exists corrected_value jsonb;

create index if not exists idx_scrape_queue_status_scraped_at
  on public.scrape_queue(status, scraped_at desc);

create index if not exists idx_extracted_field_evidence_queue_status
  on public.extracted_field_evidence(scrape_queue_id, reviewer_status);

notify pgrst, 'reload schema';
