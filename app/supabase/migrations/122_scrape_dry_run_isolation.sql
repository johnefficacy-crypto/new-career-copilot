-- 122_scrape_dry_run_isolation.sql
-- Dry-run isolation for the scraper.
--
-- `/admin/scrape/run-dry` calls the same run_scraping_pass and writes to the
-- same scrape_queue as the real `/run`, with mock rows distinguishable only
-- by `extraction_provider`. A single dry-run on 2026-05-16 persisted 96
-- synthetic mock rows into the live review queue as status='pending' —
-- promotable and indistinguishable from real data.
--
-- This adds an explicit `is_dry_run` flag to scrape_runs and scrape_queue so
-- dry-run output can be filtered out of every review / promotion / dedup
-- path. Going forward the runner also stamps dry-run queue rows with
-- status='dry_run' (a value the existing status='pending' filters already
-- exclude); `is_dry_run` is the durable, indexed dimension used for the
-- belt-and-suspenders promotion-gate block and the admin preview view.

alter table public.scrape_queue
  add column if not exists is_dry_run boolean not null default false;

alter table public.scrape_runs
  add column if not exists is_dry_run boolean not null default false;

-- Partial index: dry-run rows are a small minority; we only ever query for
-- them explicitly (the admin preview view) or filter them out, so index just
-- the `true` partition.
create index if not exists idx_scrape_queue_dry_run
  on public.scrape_queue(is_dry_run)
  where is_dry_run = true;

-- Backfill: every existing synthetic row (and the run that produced it) is a
-- dry-run leak. `extraction_provider` is the authoritative marker — 'mock'
-- (explicit mock=True) and 'deterministic_no_ai' (missing-key fallback) are
-- the only synthetic providers. Their status is left untouched (the leaked
-- rows were already quarantined to 'rejected').
update public.scrape_queue
   set is_dry_run = true
 where extraction_provider in ('mock', 'deterministic_no_ai');

update public.scrape_runs
   set is_dry_run = true
 where id in (
   select distinct scrape_run_id
     from public.scrape_queue
    where extraction_provider in ('mock', 'deterministic_no_ai')
      and scrape_run_id is not null
 );
