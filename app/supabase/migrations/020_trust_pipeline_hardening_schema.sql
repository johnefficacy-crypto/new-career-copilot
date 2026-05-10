-- Safe Feature Migration Plan: scraper trust, source intelligence, and queue
-- hardening. This migration keeps changes additive and avoids destructive
-- retention/cleanup helpers.

alter table public.source_registry
  add column if not exists intelligence_policy jsonb not null default '{}'::jsonb,
  add column if not exists crawl_budget_per_day integer,
  add column if not exists priority_score integer not null default 0,
  add column if not exists priority_reason jsonb not null default '{}'::jsonb,
  add column if not exists last_policy_decision text,
  add column if not exists policy_updated_at timestamptz;

alter table public.scrape_queue
  add column if not exists priority_score integer not null default 0,
  add column if not exists priority_reason jsonb not null default '{}'::jsonb,
  add column if not exists promoted_status text,
  add column if not exists promoted_at timestamptz,
  add column if not exists warnings jsonb,
  add column if not exists duplicate_candidates jsonb,
  add column if not exists error_message text;

alter table public.extracted_field_evidence
  add column if not exists source_page integer,
  add column if not exists source_bbox jsonb,
  add column if not exists confidence numeric,
  add column if not exists alignment_status text;

create table if not exists public.recruitment_events (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  event_type text not null,
  event_date date,
  source_id uuid references public.source_registry(id) on delete set null,
  scrape_queue_id uuid references public.scrape_queue(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_extracted_field_evidence_queue_entity_field
  on public.extracted_field_evidence (
    scrape_queue_id,
    entity_type,
    coalesce(entity_key, ''),
    field_name
  )
  where scrape_queue_id is not null;

create index if not exists idx_scrape_queue_status on public.scrape_queue(status);
create index if not exists idx_scrape_queue_reviewed_at on public.scrape_queue(reviewed_at);
create index if not exists idx_scrape_queue_priority on public.scrape_queue(priority_score desc, scraped_at desc);
create index if not exists idx_extracted_field_evidence_scrape_queue_id on public.extracted_field_evidence(scrape_queue_id);
create index if not exists idx_recruitment_events_recruitment on public.recruitment_events(recruitment_id, event_type, created_at desc);
create index if not exists idx_source_registry_priority on public.source_registry(priority_score desc, is_active);

notify pgrst, 'reload schema';
