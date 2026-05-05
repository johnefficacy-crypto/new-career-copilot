-- Migration 016: Disable confidence-only auto-promotion trigger
--
-- REASON: fn_promote_approved_scrape() + trg_promote_approved_scrape promoted
-- scrape_queue rows with confidence_score >= 0.92 directly into canonical
-- recruitments without any human review or evidence validation.
-- LLM confidence is NOT a substitute for evidence — a model can return 0.95
-- for hallucinated data. Promotion must only happen through reviewer-approved
-- evidence validation via approveScrapeItem() → validateScrapeItemForPromotion()
-- → promoteToRecruitments().
--
-- The function fn_promote_approved_scrape is kept (not dropped) for audit
-- purposes but the trigger that fires it is removed.
-- Historical scrape_queue data is untouched.
--
-- Idempotent — safe to re-run.

DROP TRIGGER IF EXISTS trg_promote_approved_scrape ON public.scrape_queue;

COMMENT ON FUNCTION public.fn_promote_approved_scrape() IS
  'DISABLED (migration 016) — trigger trg_promote_approved_scrape has been dropped.
   Confidence-only auto-promotion is not safe: LLM confidence != verified truth.
   Promotion must happen only via approveScrapeItem() after a human reviewer
   confirms evidence in extracted_field_evidence with reviewer_status=verified.
   This function is kept for historical reference only.';
