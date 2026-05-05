-- Migration 010: Add official_notification_url to recruitments
--
-- The ExtractedRecruitment type and the /dashboard/exams page both reference
-- official_notification_url, but the column was never added to the schema.
-- Result: PostgREST throws 42703 whenever the exams page loads, and the UI
-- shows "No recruitments found" even when recruitments exist.
--
-- This migration:
--   1. Adds official_notification_url text (nullable) to recruitments
--   2. Adds source_pdf_url text (nullable) — useful for direct PDF link
--   3. Backfills official_notification_url from scrape_queue.extracted_data
--      for already-promoted recruitments (matched via duplicate_of).

BEGIN;

-- ── 1. Add columns ────────────────────────────────────────────────────────────
ALTER TABLE public.recruitments
  ADD COLUMN IF NOT EXISTS official_notification_url text,
  ADD COLUMN IF NOT EXISTS source_pdf_url            text;

COMMENT ON COLUMN public.recruitments.official_notification_url IS
  'URL of the official notification page or PDF (from scrape_queue.extracted_data)';
COMMENT ON COLUMN public.recruitments.source_pdf_url IS
  'Direct link to the source PDF when available (from scrape_queue.extracted_data)';

-- ── 2. Backfill from existing scrape_queue rows ──────────────────────────────
UPDATE public.recruitments r
SET
  official_notification_url = COALESCE(
    r.official_notification_url,
    sq.extracted_data->>'official_notification_url'
  ),
  source_pdf_url = COALESCE(
    r.source_pdf_url,
    sq.extracted_data->>'source_pdf_url'
  )
FROM public.scrape_queue sq
WHERE sq.duplicate_of = r.id
  AND sq.extracted_data IS NOT NULL
  AND (
       r.official_notification_url IS NULL
    OR r.source_pdf_url            IS NULL
  );

COMMIT;

-- Sanity check (optional):
--   SELECT COUNT(*) FILTER (WHERE official_notification_url IS NOT NULL) AS with_url,
--          COUNT(*) FILTER (WHERE official_notification_url IS NULL)     AS without_url
--   FROM recruitments;
