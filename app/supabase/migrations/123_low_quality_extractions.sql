-- 123_low_quality_extractions.sql
-- Park sub-threshold scraper extractions instead of polluting scrape_queue.
--
-- The runner's low-confidence gate (confidence < MIN_CONFIDENCE_TO_QUEUE)
-- skips the scrape_queue insert — a reviewer would discard the row anyway.
-- It records the skipped extraction here for triage / tuning. Until this
-- table existed the runner fell back to a WARNING log; with it applied the
-- skipped rows are queryable per source.

-- up
create table if not exists public.low_quality_extractions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scrape_runs(id) on delete set null,
  source_id uuid references public.source_registry(id) on delete set null,
  source_url text not null,
  confidence_score numeric(4,3),
  data_quality_score numeric(4,3),
  extracted_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_low_quality_extractions_source_created
  on public.low_quality_extractions(source_id, created_at desc);
create index if not exists idx_low_quality_extractions_run
  on public.low_quality_extractions(run_id);

-- down (manual only — do not auto-run on rollback)
-- drop table if exists public.low_quality_extractions cascade;
