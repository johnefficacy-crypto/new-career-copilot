-- Document Text Extraction (PR2).
--
-- Adds the per-page text-extraction artifact tables/policies for personal-
-- library PDFs uploaded via PR1 (`document_assets`). Extraction is
-- triggered explicitly via the new `POST /library/items/{id}/process-text`
-- endpoint (sync, no worker), or lazily auto-enqueued at
-- `complete-upload` time for PDFs.  This migration is storage-only schema:
-- no extraction logic lives here, no OCR, no chunking.
--
-- Relies on `public.tg_set_updated_at()` introduced in migration 014.

--------------------------------------------------
-- document_pages — per-page extracted text
--------------------------------------------------

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_assets(id) on delete cascade,
  page_number int not null,
  text_content text not null default '',
  char_count int not null default 0,
  extraction_status text not null default 'extracted'
    check (extraction_status in ('extracted','empty','failed')),
  parser_engine text,
  parser_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id, page_number),
  constraint chk_document_pages_text_state check (
    (extraction_status = 'empty'     and char_count = 0)
    or (extraction_status = 'extracted' and char_count > 0)
    or (extraction_status = 'failed')
  )
);

create index if not exists idx_document_pages_document_page
  on public.document_pages(document_id, page_number);
create index if not exists idx_document_pages_status
  on public.document_pages(extraction_status);

drop trigger if exists document_pages_updated_at on public.document_pages;
create trigger document_pages_updated_at
before update on public.document_pages
for each row execute function public.tg_set_updated_at();

--------------------------------------------------
-- One active text_extract job per document at a time
--------------------------------------------------

create unique index if not exists uq_document_processing_jobs_active_text_extract
  on public.document_processing_jobs(document_id, job_type)
  where job_type = 'text_extract' and status in ('queued','running');

--------------------------------------------------
-- Atomic page replacement
--
-- Service-role helper that swaps a document's page rows in a single
-- transaction. Callers serialise the new page set as JSONB and trust
-- this function to delete-then-insert atomically. Used by
-- `app.library.text_extract.run_text_extract_job` so a parser crash
-- midway through cannot leave the table half-populated.
--------------------------------------------------

create or replace function public.replace_document_pages(
  p_document_id uuid,
  p_parser_engine text,
  p_parser_version text,
  p_pages jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  delete from public.document_pages where document_id = p_document_id;

  insert into public.document_pages
    (document_id, page_number, text_content, char_count,
     extraction_status, parser_engine, parser_version, metadata)
  select
    p_document_id,
    (p ->> 'page_number')::int,
    coalesce(p ->> 'text_content', ''),
    coalesce((p ->> 'char_count')::int, 0),
    coalesce(p ->> 'extraction_status', 'extracted'),
    p_parser_engine,
    p_parser_version,
    coalesce((p -> 'metadata')::jsonb, '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) as p;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end $$;

revoke all on function public.replace_document_pages(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_document_pages(uuid, text, text, jsonb) to service_role;

--------------------------------------------------
-- RLS — document_pages
--
-- Owner-select via the parent `document_assets` row; service-role gets
-- full access for the extraction service. Postgres default-deny covers
-- the remaining ops for end-user roles.
--------------------------------------------------

alter table public.document_pages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_pages'
      and policyname = 'document_pages_owner_select'
  ) then
    create policy document_pages_owner_select on public.document_pages
      for select
      using (
        exists (
          select 1 from public.document_assets d
          where d.id = document_pages.document_id
            and d.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_pages'
      and policyname = 'document_pages_service_role_all'
  ) then
    create policy document_pages_service_role_all on public.document_pages
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
