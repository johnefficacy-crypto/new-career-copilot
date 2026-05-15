-- Migration 083: PR5 — staleness columns on verification reports.
--
-- Three columns added:
--
--   staleness_status   — fresh / stale_source_changed / stale_canonical_changed
--                       / needs_reverification / pending_reverification_batch
--   last_checked_at    — when the watcher last touched the row
--   valid_until        — apply_end_date or exam_start_date (per plan §6 populator)
--
-- ``pending_reverification_batch`` is intentionally a staleness_status
-- VALUE, not a lifecycle state — the mass-corrigendum batch path
-- defers reports without flipping their lifecycle.

begin;

alter table public.recruitment_verification_reports
  add column if not exists staleness_status text not null default 'fresh',
  add column if not exists last_checked_at timestamptz,
  add column if not exists valid_until      timestamptz;

alter table public.recruitment_verification_reports
  drop constraint if exists chk_staleness_status;

alter table public.recruitment_verification_reports
  add constraint chk_staleness_status
  check (staleness_status in (
    'fresh',
    'stale_source_changed',
    'stale_canonical_changed',
    'needs_reverification',
    'pending_reverification_batch'
  ));

-- Sparse index for the watcher's "what's stale?" feed. Only rows that
-- need attention are in the index; the bulk of fresh rows are skipped
-- by the planner.
create index if not exists idx_verification_reports_staleness
  on public.recruitment_verification_reports(staleness_status, last_checked_at)
  where staleness_status <> 'fresh';

commit;

notify pgrst, 'reload schema';
