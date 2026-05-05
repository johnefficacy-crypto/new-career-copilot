-- =============================================================================
-- 004_phase3b_profiles_service_years.sql
-- Career Copilot — Phase 3B: Eligibility Engine Completion
--
-- Adds service_years to profiles table.
-- Required for the correct ex-serviceman age relaxation formula:
--   effective_age = actual_age − service_years − 3
--
-- Idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS service_years integer DEFAULT NULL;

COMMENT ON COLUMN public.profiles.service_years IS
  'Years of military service. Used for ex-serviceman age relaxation: '
  'effective_age = actual_age - service_years - 3. Null = not provided.';
