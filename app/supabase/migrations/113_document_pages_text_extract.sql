-- Document Text Extraction (PR2).
-- Per-page text storage + atomicity helpers for the synchronous text-extract
-- service. PR2 never adds OCR; empty pages here become an OCR signal for PR3.
--
-- Builds on migration 111 (document_assets, document_processing_jobs).
-- Reuses the existing `public.tg_set_updated_at()` trigger function (014).

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
  unique (document_id, page_number),
  constraint chk_document_pages_text_state check (
    (extraction_status = 'empty' and char_count = 0)
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

-- At most one active text_extract job per document. Race between two
-- enqueue paths collapses to a single row; the second insert fails on
-- the unique index and the caller treats the existing row as the result.
create unique index if not exists uq_document_processing_jobs_active_text_extract
on public.document_processing_jobs(document_id, job_type)
where job_type = 'text_extract' and status in ('queued','running');

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

-- Atomic delete+insert. The service worker calls this as a single Postgres
-- function so partial-write failures cannot leave stale pages alongside a
-- new run. `p_pages` is a JSON array of
-- `{page_number,text_content,char_count,extraction_status,metadata}` entries.
create or replace function public.replace_document_pages(
  p_document_id uuid,
  p_pages jsonb,
  p_parser_engine text,
  p_parser_version text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  delete from public.document_pages where document_id = p_document_id;

  insert into public.document_pages (
    document_id,
    page_number,
    text_content,
    char_count,
    extraction_status,
    parser_engine,
    parser_version,
    metadata
  )
  select
    p_document_id,
    (page->>'page_number')::int,
    coalesce(page->>'text_content', ''),
    coalesce((page->>'char_count')::int, 0),
    coalesce(page->>'extraction_status', 'extracted'),
    p_parser_engine,
    p_parser_version,
    coalesce(page->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) as page;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

notify pgrst, 'reload schema';
