-- Document Asset Foundation (PR1).
-- Storage-only shell for user uploads and (future) admin document ingestion.
-- No parsing, OCR, or extraction here — those live in later PRs that will
-- write `document_processing_jobs` rows and (later) `document_pages` /
-- `document_chunks` tables. FK target mirrors `personal_notes` exactly:
-- `public.profiles(id)`. `updated_at` is maintained by the existing
-- `public.tg_set_updated_at()` trigger function defined in migration 014.

create table if not exists public.document_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  scope text not null
    check (scope in (
      'personal_library',
      'admin_exam_intelligence',
      'admin_recruitment',
      'marketplace'
    )),
  document_kind text not null
    check (document_kind in (
      'note_pdf',
      'image',
      'text_file',
      'pyq_paper',
      'syllabus',
      'notification',
      'corrigendum',
      'answer_key',
      'other'
    )),
  title text,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint,
  storage_bucket text not null,
  storage_path text not null,
  content_hash text not null,
  language_hint text,
  page_count int,
  processing_policy text not null default 'store_only'
    check (processing_policy in (
      'store_only',
      'extract_text',
      'deep_parse',
      'ocr_required'
    )),
  visibility text not null default 'private'
    check (visibility in ('private', 'admin_only', 'public_reviewed')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'processed', 'failed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_assets_owner_created
  on public.document_assets(owner_user_id, created_at desc);
create index if not exists idx_document_assets_scope_kind
  on public.document_assets(scope, document_kind);
create index if not exists idx_document_assets_content_hash
  on public.document_assets(content_hash);
create index if not exists idx_document_assets_status
  on public.document_assets(status);
create unique index if not exists uq_document_assets_bucket_path
  on public.document_assets(storage_bucket, storage_path);

drop trigger if exists document_assets_updated_at on public.document_assets;
create trigger document_assets_updated_at
before update on public.document_assets
for each row execute function public.tg_set_updated_at();

alter table public.document_assets enable row level security;

do $$
begin
  -- Owner-scoped read for personal library rows.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_assets'
      and policyname = 'da_owner_select_personal'
  ) then
    create policy da_owner_select_personal on public.document_assets
      for select
      using (
        scope = 'personal_library'
        and owner_user_id = auth.uid()
      );
  end if;

  -- Owner-scoped insert: must be personal_library and self-owned.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_assets'
      and policyname = 'da_owner_insert_personal'
  ) then
    create policy da_owner_insert_personal on public.document_assets
      for insert
      with check (
        scope = 'personal_library'
        and owner_user_id = auth.uid()
      );
  end if;

  -- Owner-scoped update: only their own personal_library rows, must remain so.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_assets'
      and policyname = 'da_owner_update_personal'
  ) then
    create policy da_owner_update_personal on public.document_assets
      for update
      using (
        scope = 'personal_library'
        and owner_user_id = auth.uid()
      )
      with check (
        scope = 'personal_library'
        and owner_user_id = auth.uid()
      );
  end if;

  -- Owner-scoped delete: only their own personal_library rows. Endpoints
  -- soft-archive via UPDATE; this policy exists for parity with notes.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_assets'
      and policyname = 'da_owner_delete_personal'
  ) then
    create policy da_owner_delete_personal on public.document_assets
      for delete
      using (
        scope = 'personal_library'
        and owner_user_id = auth.uid()
      );
  end if;

  -- Admin scopes (owner_user_id IS NULL) are service-role only — no
  -- end-user role gets a policy match, RLS blocks them by default.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_assets'
      and policyname = 'da_service_role_all'
  ) then
    create policy da_service_role_all on public.document_assets
      for all to service_role using (true) with check (true);
  end if;
end $$;


-- Processing jobs are a forward-compatible scaffold. PR1 never writes here;
-- later PRs (text extract, OCR, layout parse) insert rows via service-role.

create table if not exists public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_assets(id) on delete cascade,
  job_type text not null
    check (job_type in (
      'text_extract',
      'ocr',
      'layout_parse',
      'table_extract',
      'domain_extract'
    )),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'needs_review')),
  parser_engine text,
  parser_version text,
  attempt_count int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_processing_jobs_document
  on public.document_processing_jobs(document_id);
create index if not exists idx_document_processing_jobs_status
  on public.document_processing_jobs(status);

alter table public.document_processing_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_processing_jobs'
      and policyname = 'dpj_owner_select'
  ) then
    create policy dpj_owner_select on public.document_processing_jobs
      for select
      using (
        exists (
          select 1 from public.document_assets d
          where d.id = document_processing_jobs.document_id
            and d.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'document_processing_jobs'
      and policyname = 'dpj_service_role_all'
  ) then
    create policy dpj_service_role_all on public.document_processing_jobs
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
