-- Migration 007: data_quality_score on scrape_queue
-- Stores a 0-100 completeness score computed at extraction time.
-- Breakdown: title(15) + org(15) + apply_end_date(20) + apply_start_date(10) +
--            vacancies(10) + posts_present(10) + age_criteria(10) + education(10)
--
-- Allows admin to sort/filter queue by data completeness before approving.
-- Items with score < 50 likely have incomplete eligibility data and need
-- manual enrichment before approval.

ALTER TABLE public.scrape_queue
  ADD COLUMN IF NOT EXISTS data_quality_score integer DEFAULT NULL
  CONSTRAINT chk_data_quality_score CHECK (
    data_quality_score IS NULL OR (data_quality_score >= 0 AND data_quality_score <= 100)
  );

COMMENT ON COLUMN public.scrape_queue.data_quality_score IS
  'Completeness score 0-100 computed at extraction time.
   ≥ 80: approve with confidence (full eligibility data present)
   50-79: review carefully (partial data, may lack age/education)
   < 50: needs enrichment before approval';

CREATE INDEX IF NOT EXISTS idx_scrape_queue_quality_pending
  ON public.scrape_queue (data_quality_score DESC NULLS LAST, scraped_at DESC)
  WHERE status = 'pending';
