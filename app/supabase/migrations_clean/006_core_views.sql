DROP VIEW IF EXISTS public.v_notification_feed;
CREATE VIEW public.v_notification_feed AS
SELECT
  na.id,
  na.user_id,
  na.alert_type,
  na.is_read,
  na.sent_at,
  na.read_at,
  na.priority,
  na.explanation,
  na.alert_event_id,
  ae.event_type,
  r.id AS recruitment_id,
  r.name AS recruitment_name,
  r.status AS recruitment_status,
  r.apply_end_date,
  r.apply_start_date,
  r.notification_date,
  r.year,
  r.total_vacancies,
  o.id AS org_id,
  o.name AS org_name,
  o.type AS org_type,
  o.state AS org_state,
  CASE
    WHEN r.apply_end_date IS NULL THEN NULL
    WHEN r.apply_end_date::date < CURRENT_DATE THEN NULL
    ELSE (r.apply_end_date::date - CURRENT_DATE)
  END AS days_to_deadline,
  CASE WHEN tr.id IS NOT NULL THEN true ELSE false END AS is_tracked
FROM public.notification_alerts na
LEFT JOIN public.alert_events ae ON ae.id = na.alert_event_id
LEFT JOIN public.recruitments r ON r.id = na.recruitment_id
LEFT JOIN public.organizations o ON o.id = r.organization_id
LEFT JOIN public.tracked_recruitments tr ON tr.recruitment_id = na.recruitment_id AND tr.user_id = na.user_id;

DROP VIEW IF EXISTS public.v_admin_queue_review;
CREATE VIEW public.v_admin_queue_review AS
SELECT
  sq.id, sq.source_url, sq.source_name, sq.confidence_score, sq.data_quality_score,
  sq.status, sq.scraped_at, sq.reviewed_at, sq.reviewer_notes,
  sq.notification_document_id, sq.extraction_provider, sq.extraction_model,
  sq.extraction_prompt_version, sq.extraction_status, sq.evidence_required,
  (sq.extracted_data ->> 'title') AS title,
  (sq.extracted_data ->> 'organization_name') AS org_name,
  (sq.extracted_data ->> 'apply_end_date') AS apply_end_date,
  (sq.extracted_data ->> 'total_vacancies') AS total_vacancies,
  ev_counts.evidence_total_count, ev_counts.evidence_verified_count,
  ev_counts.evidence_rejected_count, ev_counts.evidence_missing_count,
  so.fingerprint, so.status AS obs_status, so.canonical_id,
  r.name AS canonical_name, sr.started_at AS run_started_at
FROM public.scrape_queue sq
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS evidence_total_count,
         COUNT(*) FILTER (WHERE efe.reviewer_status = 'verified') AS evidence_verified_count,
         COUNT(*) FILTER (WHERE efe.reviewer_status = 'rejected') AS evidence_rejected_count,
         COUNT(*) FILTER (WHERE efe.evidence_text IS NULL AND efe.reviewer_status = 'unverified') AS evidence_missing_count
  FROM public.extracted_field_evidence efe
  WHERE efe.scrape_queue_id = sq.id
) ev_counts ON true
LEFT JOIN public.source_observations so ON so.scrape_run_id = sq.scrape_run_id AND so.source_url = sq.source_url
LEFT JOIN public.recruitments r ON r.id = so.canonical_id
LEFT JOIN public.scrape_runs sr ON sr.id = sq.scrape_run_id;
