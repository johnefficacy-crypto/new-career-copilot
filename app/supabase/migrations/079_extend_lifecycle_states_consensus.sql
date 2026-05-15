-- Migration 079: PR3 — extend lifecycle states for consensus.
--
-- Adds three lifecycle states the consensus engine writes:
--
--   consensus_pending       — engine is running / awaiting input
--   conflict                — at least one open conflict
--   admin_override_required — same as conflict but flagged for admin
--
-- The service-layer transition matrix is extended via
-- ``verification_reports.extend_transitions`` so PR1's transitions
-- (classified → superseded / rejected) survive the union.

begin;

alter table public.recruitment_verification_reports
  drop constraint chk_lifecycle_status;

alter table public.recruitment_verification_reports
  add constraint chk_lifecycle_status
  check (lifecycle_status in (
    'classified',
    'backfilled_needs_review',
    'superseded',
    'rejected',
    -- PR3 additions:
    'consensus_pending',
    'conflict',
    'admin_override_required'
  ));

commit;

notify pgrst, 'reload schema';
