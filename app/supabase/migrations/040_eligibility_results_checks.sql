-- 040_eligibility_results_checks.sql
--
-- Persist the full rule-by-rule check list from the deterministic engine so
-- admins (and downstream auditing tooling) can see exactly which rules
-- passed, which failed, and why — instead of relying on the existing
-- `fail_reasons text[]` which only carries the human-readable detail of
-- failing checks.
--
-- Each element in `checks` is the JSON form of `app.eligibility.schemas.
-- EligibilityCheck`:
--     { "rule": "age", "passed": true,  "detail": "Age 24 is within range …" }
--     { "rule": "age", "passed": false, "detail": "Age 41 exceeds maximum …" }
--
-- Pre-migration rows have an empty array; the runner overwrites the column
-- on every recompute, so the next pass will populate it from the engine's
-- current verdict.

alter table public.eligibility_results
    add column if not exists checks jsonb not null default '[]'::jsonb;

comment on column public.eligibility_results.checks is
    'JSONB array of EligibilityCheck objects ({rule, passed, detail}) from the deterministic engine. Overwritten on every recompute.';
