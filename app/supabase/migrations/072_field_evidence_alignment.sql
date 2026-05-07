begin;

alter table if exists public.extracted_field_evidence
  add column if not exists corrected_value jsonb;

alter table if exists public.scrape_queue
  add column if not exists promoted_recruitment_id uuid references public.recruitments(id) on delete set null;

create index if not exists idx_scrape_queue_promoted_recruitment_id on public.scrape_queue(promoted_recruitment_id);

commit;
