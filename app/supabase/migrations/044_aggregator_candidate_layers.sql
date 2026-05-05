-- Migration 044: Aggregator discovery + candidate merge layers
--
-- Adds non-breaking tables for:
--   - discovery-only aggregator listings
--   - listing observations (raw provenance)
--   - merged recruitment candidates
--   - candidate observations from listings/sources

begin;

create table if not exists public.aggregator_listings (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references public.source_registry(id) on delete cascade,
  listing_url         text not null,
  listing_title       text not null,
  listing_hash        text not null,
  listing_published_at timestamptz null,
  status              text not null default 'discovered'
                      check (status in ('discovered','duplicate','needs_official_source','official_source_found','rejected')),
  first_seen_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source_id, listing_hash)
);

create index if not exists idx_aggregator_listings_status_seen
  on public.aggregator_listings(status, first_seen_at desc);

create table if not exists public.listing_observations (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references public.aggregator_listings(id) on delete cascade,
  source_id           uuid not null references public.source_registry(id) on delete cascade,
  observed_url        text not null,
  observed_text       text null,
  content_hash        text null,
  observed_at         timestamptz not null default now()
);

create index if not exists idx_listing_observations_listing
  on public.listing_observations(listing_id, observed_at desc);

create table if not exists public.recruitment_candidates (
  id                  uuid primary key default gen_random_uuid(),
  canonical_key       text not null unique,
  title_hint          text null,
  organization_hint   text null,
  year_hint           integer null,
  status              text not null default 'unverified'
                      check (status in ('unverified','aggregator_confirmed','official_notification_found','extraction_pending','extraction_complete','needs_review','verified','promoted','rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_recruitment_candidates_status
  on public.recruitment_candidates(status, updated_at desc);

create table if not exists public.candidate_observations (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references public.recruitment_candidates(id) on delete cascade,
  listing_id          uuid null references public.aggregator_listings(id) on delete set null,
  source_id           uuid not null references public.source_registry(id) on delete cascade,
  scrape_queue_id     uuid null references public.scrape_queue(id) on delete set null,
  confidence_score    numeric null check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  payload             jsonb not null default '{}'::jsonb,
  observed_at         timestamptz not null default now()
);

create index if not exists idx_candidate_observations_candidate
  on public.candidate_observations(candidate_id, observed_at desc);

commit;
