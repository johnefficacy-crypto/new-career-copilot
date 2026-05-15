-- Migration 085: PR5 — extend recommended_action with await_corrigendum.

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
    'resolve_conflict',
    -- PR5 addition:
    'await_corrigendum'
  ));

commit;

notify pgrst, 'reload schema';
