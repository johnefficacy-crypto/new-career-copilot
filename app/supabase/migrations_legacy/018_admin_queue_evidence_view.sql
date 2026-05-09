-- Migration 018: Update v_admin_queue_review with evidence counts
--
-- Replaces migration 009's view to include the new trust/evidence columns
-- added in migration 017 (extraction_status, evidence counts, document link).
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
  -- trust / evidence columns (migration 017)
  sq.notification_document_id,
  sq.extraction_provider,
  sq.extraction_model,
  sq.extraction_prompt_version,
  sq.extraction_status,
  sq.evidence_required,
  -- key fields extracted from extracted_data JSONB
  (sq.extracted_data ->> 'title')             AS title,
  (sq.extracted_data ->> 'organization_name') AS org_name,
  (sq.extracted_data ->> 'apply_end_date')    AS apply_end_date,
  (sq.extracted_data ->> 'total_vacancies')   AS total_vacancies,
  -- evidence aggregate counts (null when no document_id linked yet)
  ev_counts.evidence_total_count,
  ev_counts.evidence_verified_count,
  ev_counts.evidence_rejected_count,
  ev_counts.evidence_missing_count,
  -- source_observations fields (may be null)
  so.fingerprint,
  so.status                                   AS obs_status,
  so.canonical_id,
  r.name                                      AS canonical_name,
  -- scrape_run context
  sr.started_at                               AS run_started_at
FROM public.scrape_queue sq
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                        AS evidence_total_count,
    COUNT(*) FILTER (WHERE efe.reviewer_status = 'verified')        AS evidence_verified_count,
    COUNT(*) FILTER (WHERE efe.reviewer_status = 'rejected')        AS evidence_rejected_count,
    COUNT(*) FILTER (WHERE efe.evidence_text IS NULL
                       AND efe.reviewer_status = 'unverified')      AS evidence_missing_count
  FROM public.extracted_field_evidence efe
  WHERE efe.scrape_queue_id = sq.id
) ev_counts ON true
LEFT JOIN public.source_observations so
  ON so.scrape_run_id = sq.scrape_run_id
 AND so.source_url    = sq.source_url
LEFT JOIN public.recruitments r
  ON r.id = so.canonical_id
LEFT JOIN public.scrape_runs sr
  ON sr.id = sq.scrape_run_id;

GRANT SELECT ON public.v_admin_queue_review TO authenticated;
GRANT SELECT ON public.v_admin_queue_review TO service_role;

COMMENT ON VIEW public.v_admin_queue_review IS
  'Enriched queue view for the admin Scrape Dashboard — Queue Review tab.
   Adds extraction_status, evidence counts (total/verified/rejected/missing)
   and notification_document_id from migration 017 trust pipeline.
   Replaces migration 009 version. Created by migration 018.';
