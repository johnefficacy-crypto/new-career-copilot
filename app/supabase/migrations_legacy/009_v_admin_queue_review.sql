-- Migration 009: v_admin_queue_review
-- Creates the enriched admin view for the Queue Review tab in the Scrape Dashboard.
-- Joins scrape_queue with source_observations (for fingerprint/canonical match data)
-- and scrape_runs (for run context).
--
-- Previously referenced in lib/db/notifications.ts as "sql/002_helper_functions.sql"
-- but was never added to migrations. This migration creates it properly.
--
-- Idempotent — safe to re-run.

DROP VIEW IF EXISTS public.v_admin_queue_review;

CREATE VIEW public.v_admin_queue_review AS
SELECT
  sq.id,
  sq.source_url,
  sq.source_name,
  sq.confidence_score,
  sq.data_quality_score,
  sq.status,
  sq.scraped_at,
  sq.reviewed_at,
  sq.reviewer_notes,
  -- Extract key fields from extracted_data JSONB so admin UI can display them
  -- without the client having to parse JSONB
  (sq.extracted_data ->> 'title')             AS title,
  (sq.extracted_data ->> 'organization_name') AS org_name,
  (sq.extracted_data ->> 'apply_end_date')    AS apply_end_date,
  (sq.extracted_data ->> 'total_vacancies')   AS total_vacancies,
  -- source_observations fields (may be null when no observation row exists)
  so.fingerprint,
  so.status                                   AS obs_status,
  so.canonical_id,
  r.name                                      AS canonical_name,
  -- scrape_run context
  sr.started_at                               AS run_started_at
FROM public.scrape_queue sq
LEFT JOIN public.source_observations so
  ON so.scrape_run_id = sq.scrape_run_id
  AND so.source_url   = sq.source_url
LEFT JOIN public.recruitments r
  ON r.id = so.canonical_id
LEFT JOIN public.scrape_runs sr
  ON sr.id = sq.scrape_run_id;

-- Admins only — underlying RLS on scrape_queue already enforces this,
-- but an explicit grant ensures the view is accessible via service role too.
GRANT SELECT ON public.v_admin_queue_review TO authenticated;
GRANT SELECT ON public.v_admin_queue_review TO service_role;

COMMENT ON VIEW public.v_admin_queue_review IS
  'Enriched queue view for the admin Scrape Dashboard — Queue Review tab.
   Extracts key JSONB fields from extracted_data and joins source_observations
   for fingerprint/canonical match context. Created by migration 009.';
