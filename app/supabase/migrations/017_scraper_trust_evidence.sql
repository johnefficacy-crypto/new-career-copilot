-- Migration 017: Scraper trust / evidence pipeline
--
-- Adds provenance and field-level evidence tables so every extracted value
-- can be traced back to the source document and human-reviewed before
-- a scrape_queue item is promoted to canonical recruitments.
--
-- Tables added:
--   public.notification_documents   — one row per fetched document snapshot
--   public.extracted_field_evidence — one row per extracted field, per document
--
-- Columns added to public.scrape_queue:
--   notification_document_id, extraction_provider, extraction_model,
--   extraction_prompt_version, extraction_status, evidence_required
--
-- RLS: admins read/manage everything; service role inserts/updates.
-- Idempotent — safe to re-run.

-- ── 1. notification_documents ─────────────────────────────────────────────────
-- One row per unique document fetch. content_hash is the SHA-256 of the raw
-- bytes (HTML body / PDF bytes / RSS payload / JSON body) before any processing.
-- Deduplication: ON CONFLICT (content_hash) DO NOTHING.

CREATE TABLE IF NOT EXISTS public.notification_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid        NULL REFERENCES public.source_registry(id) ON DELETE SET NULL,
  scrape_run_id   uuid        NULL REFERENCES public.scrape_runs(id)     ON DELETE SET NULL,
  source_url      text        NOT NULL,
  final_url       text        NULL,
  document_type   text        NOT NULL
                  CHECK (document_type IN ('html','pdf','rss','json','unknown')),
  content_hash    text        NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  http_status     integer     NULL,
  etag            text        NULL,
  last_modified   text        NULL,
  raw_text        text        NULL,    -- extracted/stripped text (not raw PDF bytes)
  storage_path    text        NULL,    -- future: Supabase Storage bucket path
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_documents_hash
  ON public.notification_documents (content_hash);

CREATE INDEX IF NOT EXISTS idx_notification_documents_source
  ON public.notification_documents (source_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_documents_run
  ON public.notification_documents (scrape_run_id);

COMMENT ON TABLE public.notification_documents IS
  'One row per unique document snapshot fetched by the scraper.
   content_hash (SHA-256) deduplicates re-fetches of unchanged documents.
   raw_text stores stripped text for evidence search; raw bytes are NOT stored here.
   Created by migration 017.';

-- ── 2. extracted_field_evidence ───────────────────────────────────────────────
-- One row per field extracted from a document. Links every value in
-- scrape_queue.extracted_data back to an evidence snippet in the source document.
-- reviewer_status tracks whether a human has verified the evidence.

CREATE TABLE IF NOT EXISTS public.extracted_field_evidence (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid        NOT NULL REFERENCES public.notification_documents(id) ON DELETE CASCADE,
  scrape_queue_id     uuid        NULL     REFERENCES public.scrape_queue(id)           ON DELETE CASCADE,
  entity_type         text        NOT NULL
                      CHECK (entity_type IN ('recruitment','post','age_criteria',
                                             'education_criteria','fee','date',
                                             'vacancy','other')),
  entity_key          text        NULL,   -- e.g. post_name when entity_type='post'
  field_name          text        NOT NULL,
  extracted_value     jsonb       NOT NULL,
  evidence_text       text        NULL,   -- raw snippet from document proving the value
  page_number         integer     NULL,
  char_start          integer     NULL,
  char_end            integer     NULL,
  extraction_method   text        NOT NULL
                      CHECK (extraction_method IN ('rss_direct','selector','anthropic',
                                                   'gemini','manual','system')),
  model               text        NULL,
  confidence          numeric     NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reviewer_status     text        NOT NULL DEFAULT 'unverified'
                      CHECK (reviewer_status IN ('unverified','verified','rejected','corrected')),
  reviewer_notes      text        NULL,
  reviewed_by         uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_evidence_document
  ON public.extracted_field_evidence (document_id);

CREATE INDEX IF NOT EXISTS idx_field_evidence_queue
  ON public.extracted_field_evidence (scrape_queue_id);

CREATE INDEX IF NOT EXISTS idx_field_evidence_field_name
  ON public.extracted_field_evidence (field_name);

CREATE INDEX IF NOT EXISTS idx_field_evidence_reviewer_status
  ON public.extracted_field_evidence (reviewer_status);

COMMENT ON TABLE public.extracted_field_evidence IS
  'Field-level evidence linking every extracted value back to a source document.
   One row per field per document. reviewer_status=verified is required before
   a scrape_queue item can be promoted to canonical recruitments.
   Created by migration 017.';

-- ── 3. scrape_queue: add trust/evidence columns ───────────────────────────────

ALTER TABLE public.scrape_queue
  ADD COLUMN IF NOT EXISTS notification_document_id uuid NULL
    REFERENCES public.notification_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extraction_provider      text NULL,
  ADD COLUMN IF NOT EXISTS extraction_model         text NULL,
  ADD COLUMN IF NOT EXISTS extraction_prompt_version text NULL,
  ADD COLUMN IF NOT EXISTS extraction_status        text NOT NULL DEFAULT 'unverified'
    CHECK (extraction_status IN ('unverified','needs_review','verified','rejected','stale','duplicate')),
  ADD COLUMN IF NOT EXISTS evidence_required        boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_scrape_queue_document
  ON public.scrape_queue (notification_document_id);

CREATE INDEX IF NOT EXISTS idx_scrape_queue_extraction_status
  ON public.scrape_queue (extraction_status);

COMMENT ON COLUMN public.scrape_queue.extraction_status IS
  'unverified: freshly extracted, no human review.
   needs_review: admin flagged for manual checking.
   verified: all required evidence rows have reviewer_status=verified.
   rejected: item was rejected (bad data, duplicate, lifecycle update).
   stale: document changed since extraction.
   duplicate: same notification already promoted under a different queue item.';

COMMENT ON COLUMN public.scrape_queue.evidence_required IS
  'When true (default), approveScrapeItem() will refuse to promote unless
   extracted_field_evidence rows for required fields are verified.
   Set false only for manually curated / seeded items.';

-- ── 4. RLS policies ───────────────────────────────────────────────────────────

ALTER TABLE public.notification_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_field_evidence  ENABLE ROW LEVEL SECURITY;

-- notification_documents
DROP POLICY IF EXISTS "notification_documents_admin_all"   ON public.notification_documents;
DROP POLICY IF EXISTS "notification_documents_service_all" ON public.notification_documents;

CREATE POLICY "notification_documents_admin_all"
  ON public.notification_documents FOR ALL
  USING      (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "notification_documents_service_all"
  ON public.notification_documents FOR ALL
  USING      (true)
  WITH CHECK (true);

-- extracted_field_evidence
DROP POLICY IF EXISTS "field_evidence_admin_all"   ON public.extracted_field_evidence;
DROP POLICY IF EXISTS "field_evidence_service_all" ON public.extracted_field_evidence;

CREATE POLICY "field_evidence_admin_all"
  ON public.extracted_field_evidence FOR ALL
  USING      (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "field_evidence_service_all"
  ON public.extracted_field_evidence FOR ALL
  USING      (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.notification_documents   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.extracted_field_evidence TO authenticated;
GRANT ALL                    ON public.notification_documents   TO service_role;
GRANT ALL                    ON public.extracted_field_evidence TO service_role;
