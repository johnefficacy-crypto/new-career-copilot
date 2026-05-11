-- Field evidence operability for legacy scrape_queue rows.
-- New scrape rows attach notification_document_id upfront. Older rows may not
-- have a usable notification_documents row, so document_id must remain nullable
-- for admin verify/reject/correct actions to proceed.

alter table public.extracted_field_evidence
  alter column document_id drop not null,
  alter column extracted_value drop not null,
  alter column extraction_method set default 'manual',
  alter column entity_type set default 'other',
  alter column reviewer_status set default 'unverified';

notify pgrst, 'reload schema';
