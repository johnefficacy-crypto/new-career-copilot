-- Source registry seed compatibility for legacy workbook-style source records.
-- This keeps source_registry able to store scraper policy/provenance metadata
-- without changing the current runner, which still reads scrape_sources.

alter table public.source_registry
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists short_code text,
  add column if not exists category text,
  add column if not exists jurisdiction text,
  add column if not exists parent_org text,
  add column if not exists official_url text,
  add column if not exists notification_url text,
  add column if not exists rss_url text,
  add column if not exists api_url text,
  add column if not exists pdf_bulletin_url text,
  add column if not exists adapter_type text,
  add column if not exists parser_config jsonb not null default '{}'::jsonb,
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
  add column if not exists last_scraped_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists consecutive_fails integer not null default 0,
  add column if not exists last_error text,
  add column if not exists notes text,
  add column if not exists org_state text,
  add column if not exists insecure_tls boolean not null default false,
  add column if not exists selectors jsonb,
  add column if not exists requires_official_confirmation boolean not null default false,
  add column if not exists last_changed_at timestamptz,
  add column if not exists added_by text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists is_official_source boolean not null default false,
  add column if not exists can_publish_directly boolean not null default false,
  add column if not exists discovery_only boolean not null default false;

create unique index if not exists source_registry_short_code_uidx
  on public.source_registry(short_code)
  where short_code is not null;

create index if not exists idx_source_registry_discovery_only
  on public.source_registry(discovery_only, is_active);

notify pgrst, 'reload schema';
