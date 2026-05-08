begin;

-- Queue ordering/filter optimization for admin queue paths.
create index if not exists idx_scrape_queue_status_scraped_at_desc
  on public.scrape_queue(status, scraped_at desc);

create index if not exists idx_scrape_queue_status_data_quality
  on public.scrape_queue(status, data_quality_score);

create index if not exists idx_scrape_queue_status_reviewed_at_desc
  on public.scrape_queue(status, reviewed_at desc);

create index if not exists idx_eligibility_recompute_queue_status_created_at
  on public.eligibility_recompute_queue(status, created_at);

commit;
