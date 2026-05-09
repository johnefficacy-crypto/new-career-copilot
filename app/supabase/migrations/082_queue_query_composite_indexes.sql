begin;

-- Queue ordering/filter optimization for admin queue paths.

create index if not exists idx_scrape_queue_status_scraped_at_desc
  on public.scrape_queue(status, scraped_at desc);

create index if not exists idx_scrape_queue_status_data_quality
  on public.scrape_queue(status, data_quality_score);

create index if not exists idx_scrape_queue_status_reviewed_at_desc
  on public.scrape_queue(status, reviewed_at desc);

-- eligibility_recompute_queue uses queued_at, not created_at.
create index if not exists idx_eligibility_recompute_queue_status_queued_at
  on public.eligibility_recompute_queue(status, queued_at);

commit;