-- Migration 052: scraper concurrency lock.
--
-- The runner now caches per-source HTTP headers (last_listing_etag /
-- last_listing_modified) and per-pass success state. Two concurrent
-- workers on the same source can race on those columns, the
-- aggregator_listings dedupe, and the candidate observations.
--
-- A typed claim column lets the runner take an exclusive in-flight
-- lock per source: a worker stamps ``currently_scraping_at = now()``
-- before running the pass and clears it on completion. A stale lock
-- (older than the configurable threshold) is treated as crashed and
-- can be claimed by a fresh worker.

alter table public.source_registry
  add column if not exists currently_scraping_at timestamptz;

-- Sparse index — most rows are NULL. Lets admin spot stuck claims.
create index if not exists idx_source_registry_currently_scraping_at
  on public.source_registry(currently_scraping_at)
  where currently_scraping_at is not null;

notify pgrst, 'reload schema';
