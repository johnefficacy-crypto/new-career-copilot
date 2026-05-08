begin;

create unique index if not exists uq_extracted_field_evidence_queue_field
on public.extracted_field_evidence (scrape_queue_id, field_name);

commit;
