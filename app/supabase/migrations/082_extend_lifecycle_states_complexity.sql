-- Migration 082: PR4 — add ``complexity_detected`` lifecycle state.
--
-- The eligibility-complexity detector emits signals into the report's
-- ``risk_flags`` jsonb. When at least one signal carries a
-- ``promotion_blocker`` or ``publish_blocker`` level, the orchestrator
-- transitions the report into ``complexity_detected`` so the admin
-- "needs attention" feed surfaces it.
--
-- No new ``recommended_action`` value lands here — PR4 reuses
-- ``block_publish`` per plan §5.

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
    -- PR4 addition:
    'complexity_detected'
  ));

commit;

notify pgrst, 'reload schema';
