-- Migration 006: Add org_state to source_registry
-- Required for state PSC personalisation — routes state-level notifications
-- only to users whose domicile matches the posting state.
-- Phase 3B added domicile check to the eligibility engine; this migration
-- wires up the data source side.

ALTER TABLE public.source_registry
  ADD COLUMN IF NOT EXISTS org_state text DEFAULT NULL;

COMMENT ON COLUMN public.source_registry.org_state IS
  'State code for State PSC / state govt sources (e.g. ''Maharashtra'').
   NULL = central government source — visible to all users.
   Non-null = only users with matching domicile_state are eligible.';

-- Populate known State PSC entries — update as more sources are added
UPDATE public.source_registry SET org_state = 'Maharashtra'
  WHERE category = 'state_psc' AND source_name ILIKE '%Maharashtra%';

UPDATE public.source_registry SET org_state = 'Uttar Pradesh'
  WHERE category = 'state_psc' AND source_name ILIKE '%Uttar Pradesh%' OR source_name ILIKE '%UPPSC%';

UPDATE public.source_registry SET org_state = 'Rajasthan'
  WHERE category = 'state_psc' AND source_name ILIKE '%Rajasthan%' OR source_name ILIKE '%RPSC%';

UPDATE public.source_registry SET org_state = 'Tamil Nadu'
  WHERE category = 'state_psc' AND source_name ILIKE '%Tamil Nadu%' OR source_name ILIKE '%TNPSC%';

UPDATE public.source_registry SET org_state = 'Karnataka'
  WHERE category = 'state_psc' AND source_name ILIKE '%Karnataka%' OR source_name ILIKE '%KPSC%';

UPDATE public.source_registry SET org_state = 'West Bengal'
  WHERE category = 'state_psc' AND source_name ILIKE '%West Bengal%' OR source_name ILIKE '%WBPSC%';

UPDATE public.source_registry SET org_state = 'Bihar'
  WHERE category = 'state_psc' AND source_name ILIKE '%Bihar%' OR source_name ILIKE '%BPSC%';

UPDATE public.source_registry SET org_state = 'Gujarat'
  WHERE category = 'state_psc' AND source_name ILIKE '%Gujarat%' OR source_name ILIKE '%GPSC%';

UPDATE public.source_registry SET org_state = 'Punjab'
  WHERE category = 'state_psc' AND source_name ILIKE '%Punjab%' OR source_name ILIKE '%PPSC%';

UPDATE public.source_registry SET org_state = 'Madhya Pradesh'
  WHERE category = 'state_psc' AND source_name ILIKE '%Madhya Pradesh%' OR source_name ILIKE '%MPPSC%';
