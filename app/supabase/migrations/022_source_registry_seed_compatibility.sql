-- Source registry seed compatibility for legacy workbook-style source records.
-- This keeps source_registry able to store scraper policy/provenance metadata
-- without changing the current runner, which still reads scrape_sources.

alter table public.source_registry
  add column if not exists parser_config jsonb not null default '{}'::jsonb,
  add column if not exists parent_org text,
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
