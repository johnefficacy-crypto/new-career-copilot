-- Document Asset OCR Wiring (PR3).
--
-- Adds the per-item OCR job table for personal-library PDFs that
-- post-text-extraction look likely to need OCR. PR3 only wires schema,
-- state machine, and enqueue surface — there is NO OCR engine here.
-- With `LIBRARY_OCR_ENGINE=none` (default), jobs auto-finalize to
-- `skipped` synchronously. The engine plug-in lands in PR4.
--
-- This table is intentionally separate from `document_processing_jobs`
-- (migration 111). The text-extract worker reuses that generic table
-- because its status vocabulary (queued/running/succeeded/failed) is
-- compatible. OCR introduces `pending`, `skipped`, `cancelled` and an
-- explicit `trigger_reason`, so we keep its state machine in its own
-- table rather than broadening the shared CHECK and column set.
--
-- Mirrors migration 113's header/footer conventions:
--   - `create table if not exists` / `create index if not exists`
--   - DO-block guarded `create policy ...`
--   - relies on `public.tg_set_updated_at()` from migration 014
--   - `notify pgrst, 'reload schema'` footer

--------------------------------------------------
-- library_ocr_jobs — per-item OCR job state
--------------------------------------------------

create table if not exists public.library_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null
    references public.document_assets(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending',
      'queued',
      'running',
      'succeeded',
      'failed',
      'skipped',
      'cancelled'
    )),
  engine text not null default 'none',
  engine_version text,
  trigger_reason text not null
    check (trigger_reason in (
      'auto_likely_needs_ocr',
      'manual_request',
      'retry'
    )),
  pages_total int,
  pages_processed int not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_ocr_jobs_item_status_idx
  on public.library_ocr_jobs(item_id, status);
create index if not exists library_ocr_jobs_user_status_idx
  on public.library_ocr_jobs(user_id, status);
create index if not exists library_ocr_jobs_created_at_desc_idx
  on public.library_ocr_jobs(created_at desc);

-- One active job per item. PR4's worker claims by id; the partial
-- unique index guarantees auto-enqueue cannot race a manual request
-- into a duplicate pending/queued/running row.
create unique index if not exists library_ocr_jobs_active_unique_idx
  on public.library_ocr_jobs(item_id)
  where status in ('pending','queued','running');

drop trigger if exists library_ocr_jobs_updated_at on public.library_ocr_jobs;
create trigger library_ocr_jobs_updated_at
before update on public.library_ocr_jobs
for each row execute function public.tg_set_updated_at();

--------------------------------------------------
-- RLS — library_ocr_jobs
--
-- Owner-select on own rows. Service-role full. No insert/update for
-- end-user roles in PR3 — all writes go through the service module so
-- the state machine and engine='none' auto-finalize stay enforceable
-- from one place. Postgres default-deny covers everything else.
--------------------------------------------------

alter table public.library_ocr_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'library_ocr_jobs'
      and policyname = 'library_ocr_jobs_owner_select'
  ) then
    create policy library_ocr_jobs_owner_select on public.library_ocr_jobs
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'library_ocr_jobs'
      and policyname = 'library_ocr_jobs_service_role_all'
  ) then
    create policy library_ocr_jobs_service_role_all on public.library_ocr_jobs
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
