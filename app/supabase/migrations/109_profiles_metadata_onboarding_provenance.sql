-- 109_profiles_metadata_onboarding_provenance.sql
--
-- Adds a generic ``metadata`` jsonb column to ``profiles`` so the unified
-- onboarding adapter can record which canonical fields were filled from
-- onboarding answers (versus manually edited later from the Profile UI).
--
-- Format the adapter writes:
--   {
--     "onboarding_provenance": {
--       "<table>.<column>": {
--         "answered_at": "<iso-timestamp>",
--         "source": "recruitment_question_requirements" | ...,
--         "session_id": "<uuid>"
--       }
--     }
--   }
--
-- The column is additive and defaults to '{}', so existing reads continue
-- to work. Nothing downstream reads it yet; it is staged for future
-- product decisions (e.g. distinguishing onboarding-supplied vs manually-
-- verified facts when ranking eligibility evidence).

alter table public.profiles
  add column if not exists metadata jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
