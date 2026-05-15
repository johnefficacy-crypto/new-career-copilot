-- Migration 086: PR5 — reverification_batches table.
--
-- One row per mass-corrigendum batch. When a single source flips more
-- reports than ``CORRIGENDUM_WATCH_LIMITS.mass_change_batch_limit`` in
-- a single watch pass, the first 25 reports go to
-- ``needs_reverification`` and the rest accumulate as
-- ``pending_reverification_batch`` against one of these rows. An
-- admin acknowledges → the service flips the pending reports in
-- throttled chunks.

begin;

create table if not exists public.reverification_batches (
  id uuid primary key default gen_random_uuid(),

  source_id    uuid references public.source_registry(id) on delete set null,
  scrape_run_id uuid,

  trigger_reason text not null,

  total_reports_affected           int not null default 0,
  promoted_to_needs_reverification int not null default 0,
  remaining_pending                int not null default 0,

  notes text,

  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,

  created_at timestamptz not null default now()
);

-- Sparse index of unacknowledged batches — admin feed reads off this.
create index if not exists idx_reverification_batches_unack
  on public.reverification_batches(created_at desc)
  where acknowledged_at is null;

commit;

notify pgrst, 'reload schema';
