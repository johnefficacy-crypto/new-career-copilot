-- Migration 084: PR5 — add staleness lifecycle states.
--
-- Three lifecycle states added:
--
--   stale_source_changed    — source page/PDF normalised hash drifted
--   stale_canonical_changed — admin edited a critical canonical field
--   needs_reverification    — escalation from either stale_* (after
--                              admin acknowledgment of a batch or
--                              direct corrigendum confirmation)
--
-- Each stale_* state transitions only to ``superseded`` (when a new
-- report version takes over) or ``rejected``.

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
    'consensus_pending',
    'conflict',
    'admin_override_required',
    'complexity_detected',
    -- PR5 additions:
    'stale_source_changed',
    'stale_canonical_changed',
    'needs_reverification'
  ));

commit;

notify pgrst, 'reload schema';
