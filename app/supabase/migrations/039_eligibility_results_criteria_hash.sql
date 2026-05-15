-- 039_eligibility_results_criteria_hash.sql
--
-- Add cache-key columns to eligibility_results so:
--   1. Admin edits to canonical post criteria (age, education, attempts,
--      domicile, age relaxation rules, certification rules, etc.) invalidate
--      the cached row for that post even when the user's profile_hash is
--      unchanged.
--   2. Rule-semantics changes in the deterministic engine force a global
--      recompute by bumping the RULES_VERSION constant in
--      `app/backend/app/eligibility/engine.py`.
--
-- Existing rows are left with NULL criteria_hash / rules_version; the runner
-- treats a missing value as a cache miss and recomputes on the next pass.

alter table public.eligibility_results
    add column if not exists criteria_hash text,
    add column if not exists rules_version text;

comment on column public.eligibility_results.criteria_hash is
    'SHA-256 hash of the PostCriteria payload (excluding post_id/recruitment_id) that produced this row. Mismatch with current criteria triggers recompute.';

comment on column public.eligibility_results.rules_version is
    'Engine rule-set version string (RULES_VERSION constant in app.eligibility.engine). Bump when rule semantics change to force global recompute.';
