-- Migration 081: PR3 — extend ``recommended_action`` enum.
--
-- Adds ``resolve_conflict`` for reports whose lifecycle_status is
-- ``conflict`` or ``admin_override_required``.

begin;

alter table public.recruitment_verification_reports
  drop constraint chk_recommended_action;

alter table public.recruitment_verification_reports
  add constraint chk_recommended_action
  check (recommended_action in (
    'await_official_proof',
    'request_admin_review',
    'promote_eligible',
    'block_publish',
    'no_action',
    'confirm_suggested_proof',
    -- PR3 addition:
    'resolve_conflict'
  ));

commit;

notify pgrst, 'reload schema';
