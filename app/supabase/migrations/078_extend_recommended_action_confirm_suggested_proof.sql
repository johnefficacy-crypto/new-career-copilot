-- Migration 078: PR2 — extend ``recommended_action`` enum.
--
-- Adds ``confirm_suggested_proof`` to the constrained enum. PR1
-- shipped five values; the resolver now needs a sixth to drive the
-- admin "an L-stage found a candidate, please confirm it" surface.
--
-- Per the PR plan (§0.6) every enum extension is its own ALTER
-- migration so the constraint sets are obvious in git history.

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
    'confirm_suggested_proof'
  ));

commit;

notify pgrst, 'reload schema';
