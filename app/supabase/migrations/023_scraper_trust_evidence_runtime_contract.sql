-- Scraper trust/evidence runtime contract.
-- Promotes the legacy notification_documents + extracted_field_evidence contract
-- into the active migration path as one domain repair.

alter table public.notification_documents
  add column if not exists source_id uuid references public.source_registry(id) on delete set null,
  add column if not exists scrape_run_id uuid references public.scrape_runs(id) on delete set null,
  add column if not exists source_url text,
  add column if not exists final_url text,
  add column if not exists content_hash text,
  add column if not exists fetched_at timestamptz not null default now(),
  add column if not exists http_status integer,
  add column if not exists etag text,
  add column if not exists last_modified text,
  add column if not exists raw_text text,
  add column if not exists storage_path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.notification_documents
   set source_url = coalesce(source_url, file_url, 'manual://unknown')
 where source_url is null;

update public.notification_documents
   set document_type = coalesce(document_type, 'unknown')
 where document_type is null;

update public.notification_documents
   set content_hash = coalesce(
     content_hash,
     encode(digest(coalesce(source_url, file_url, id::text), 'sha256'), 'hex')
   )
 where content_hash is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_documents_document_type_check'
      and conrelid = 'public.notification_documents'::regclass
  ) then
    alter table public.notification_documents
      add constraint notification_documents_document_type_check
      check (document_type in ('html','pdf','rss','json','unknown'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from public.notification_documents
    where content_hash is not null
    group by content_hash
    having count(*) > 1
  ) then
    create unique index if not exists uq_notification_documents_hash
      on public.notification_documents(content_hash)
      where content_hash is not null;
  else
    raise notice 'Skipping uq_notification_documents_hash: duplicate content_hash rows exist';
  end if;
end $$;

create index if not exists idx_notification_documents_content_hash
  on public.notification_documents(content_hash);

create index if not exists idx_notification_documents_source
  on public.notification_documents(source_id, fetched_at desc);

create index if not exists idx_notification_documents_run
  on public.notification_documents(scrape_run_id);

alter table public.scrape_queue
  add column if not exists notification_document_id uuid references public.notification_documents(id) on delete set null,
  add column if not exists extraction_provider text,
  add column if not exists extraction_model text,
  add column if not exists extraction_prompt_version text,
  add column if not exists extraction_status text not null default 'unverified',
  add column if not exists evidence_required boolean not null default true;

create index if not exists idx_scrape_queue_document
  on public.scrape_queue(notification_document_id);

create index if not exists idx_scrape_queue_extraction_status
  on public.scrape_queue(extraction_status);

alter table public.extracted_field_evidence
  add column if not exists document_id uuid references public.notification_documents(id) on delete cascade,
  add column if not exists scrape_queue_id uuid references public.scrape_queue(id) on delete cascade,
  add column if not exists entity_type text not null default 'other',
  add column if not exists entity_key text,
  add column if not exists extracted_value jsonb,
  add column if not exists evidence_text text,
  add column if not exists page_number integer,
  add column if not exists char_start integer,
  add column if not exists char_end integer,
  add column if not exists extraction_method text not null default 'manual',
  add column if not exists model text,
  add column if not exists confidence numeric,
  add column if not exists reviewer_status text not null default 'unverified',
  add column if not exists reviewer_notes text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists corrected_value jsonb,
  add column if not exists extraction_provider text,
  add column if not exists source_page integer,
  add column if not exists source_bbox jsonb,
  add column if not exists alignment_status text;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = any(con.conkey)
    where con.conrelid = 'public.extracted_field_evidence'::regclass
      and con.contype = 'f'
      and att.attname = 'reviewed_by'
  loop
    execute format('alter table public.extracted_field_evidence drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'extracted_field_evidence_reviewed_by_fkey'
      and conrelid = 'public.extracted_field_evidence'::regclass
  ) then
    alter table public.extracted_field_evidence
      add constraint extracted_field_evidence_reviewed_by_fkey
      foreign key (reviewed_by) references public.profiles(id) on delete set null not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'extracted_field_evidence_entity_type_check'
      and conrelid = 'public.extracted_field_evidence'::regclass
  ) then
    alter table public.extracted_field_evidence
      add constraint extracted_field_evidence_entity_type_check
      check (entity_type in ('recruitment','post','age_criteria','education_criteria','fee','date','vacancy','other'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'extracted_field_evidence_extraction_method_check'
      and conrelid = 'public.extracted_field_evidence'::regclass
  ) then
    alter table public.extracted_field_evidence
      add constraint extracted_field_evidence_extraction_method_check
      check (extraction_method in ('rss_direct','selector','anthropic','gemini','manual','system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'extracted_field_evidence_reviewer_status_check'
      and conrelid = 'public.extracted_field_evidence'::regclass
  ) then
    alter table public.extracted_field_evidence
      add constraint extracted_field_evidence_reviewer_status_check
      check (reviewer_status in ('unverified','verified','rejected','corrected'));
  end if;
end $$;

create index if not exists idx_field_evidence_document
  on public.extracted_field_evidence(document_id);

create index if not exists idx_field_evidence_queue
  on public.extracted_field_evidence(scrape_queue_id);

create index if not exists idx_field_evidence_field_name
  on public.extracted_field_evidence(field_name);

create index if not exists idx_field_evidence_reviewer_status
  on public.extracted_field_evidence(reviewer_status);

notify pgrst, 'reload schema';
