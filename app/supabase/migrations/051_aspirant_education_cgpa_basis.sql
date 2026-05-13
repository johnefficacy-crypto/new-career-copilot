-- 051_aspirant_education_cgpa_basis.sql
--
-- P2 #3 from the post-#149 audit: replace the hardcoded `cgpa * 10`
-- percentage conversion in the eligibility engine with a per-row
-- conversion basis sourced from the candidate's actual transcript.
--
-- The legacy engine assumed every CGPA was on a 10-point scale. In
-- practice candidates land here with:
--   * 10-point CGPA (most Indian universities; the default).
--   * 4.0 GPA (US transcripts, some autonomous institutes).
--   * 7-point, 9-point, or other institute-specific scales.
--   * 12-point (rare; some IIM-PGP transcripts).
--
-- Without an explicit basis, a 3.5/4.0 GPA was converted to 35% and
-- failed every 60% cutoff. This migration lets the candidate (or the
-- admin entering the record) state the basis once per education row.
-- Nullable: the engine falls back to 10.0 when basis is not provided,
-- preserving today's behaviour for existing rows.

alter table public.aspirant_education
    add column if not exists cgpa_basis numeric;

comment on column public.aspirant_education.cgpa_basis is
    'Maximum value on the candidate''s CGPA/GPA scale (e.g. 10 for most Indian unis, 4 for US transcripts). The engine converts cgpa to percentage via (cgpa / cgpa_basis) * 100 when min_percentage is the canonical bar. NULL falls back to 10.';

notify pgrst, 'reload schema';
