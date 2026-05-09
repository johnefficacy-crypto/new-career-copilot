begin;

-- A queue item can have multiple evidence rows for the same field_name
-- when each row belongs to a different entity_key, e.g. multiple posts
-- with field_name = 'post_name'.
--
-- Therefore uniqueness must be scoped by entity_type + entity_key.

drop index if exists public.uq_extracted_field_evidence_queue_field;

create unique index if not exists uq_extracted_field_evidence_queue_entity_field
on public.extracted_field_evidence (
  scrape_queue_id,
  entity_type,
  coalesce(entity_key, ''),
  field_name
)
where scrape_queue_id is not null;

commit;