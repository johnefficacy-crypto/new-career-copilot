-- =============================================================================
-- 005_phase3b_eligibility_conditional.sql
-- Career Copilot — Phase 3B: Eligibility Engine Completion
--
-- Adds is_conditional to eligibility_results table.
-- A conditional result means the user is in their final year of the required
-- qualification (is_completed=false) — they may become eligible on graduation.
--
-- is_eligible=false + is_conditional=true  → show as "Conditionally Eligible"
-- is_eligible=true  + is_conditional=false → show as "Eligible"
-- is_eligible=false + is_conditional=false → show as "Not Eligible"
--
-- Idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE public.eligibility_results
  ADD COLUMN IF NOT EXISTS is_conditional boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eligibility_results.is_conditional IS
  'True when user is in their final year of required qualification. '
  'Eligibility is conditional on completing the degree. '
  'is_eligible will be false; is_conditional=true means show as Conditional.';

-- Index to support dashboard queries that include conditional results
CREATE INDEX IF NOT EXISTS idx_eligibility_results_user_conditional
  ON public.eligibility_results (user_id, is_conditional)
  WHERE is_conditional = true;
