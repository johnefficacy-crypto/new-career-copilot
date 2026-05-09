-- Migration 008: Fix organizations unique + reset ghost-approved items
--
-- Root cause: organizations.name has no unique constraint. Upsert with
-- onConflict:"name" in promoteToRecruitments() was failing silently, making
-- every scrape_queue approval create a "ghost approved" row — status='approved'
-- but nothing in recruitments. Dashboard has no data to show as a result.
--
-- This migration:
--   1. De-duplicates any existing duplicate names in organizations
--   2. Adds UNIQUE constraint on organizations.name (case-insensitive via trim+lower)
--   3. Resets all ghost-approved queue items (status='approved', duplicate_of IS NULL)
--      back to 'pending' so they can be re-promoted by the fixed approveScrapeItem()

BEGIN;

-- ── 1. Dedup organizations by name (keep earliest) ────────────────────────────
-- Safe to run because recruitments.organization_id FK would CASCADE, and we
-- already know recruitments table is empty (0 rows).
WITH ranked AS (
  SELECT id, name,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(name))
           ORDER BY id
         ) AS rn
  FROM public.organizations
)
DELETE FROM public.organizations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 2. Add unique constraint on name ──────────────────────────────────────────
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_name_unique;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_name_unique UNIQUE (name);

-- ── 3. Reset ghost-approved items back to pending ─────────────────────────────
-- These will be re-processed by the fixed approveScrapeItem() which will now
-- throw if promotion fails, surfacing the real error to the admin UI.
UPDATE public.scrape_queue
SET status          = 'pending',
    reviewed_at     = NULL,
    reviewer_id     = NULL,
    reviewer_notes  = COALESCE(reviewer_notes, '') || ' [reset by migration 008: promotion failed silently due to missing unique constraint]'
WHERE status = 'approved'
  AND duplicate_of IS NULL;

COMMIT;

-- Sanity check after running (optional, for manual verification):
--   SELECT status, COUNT(*) FROM scrape_queue GROUP BY status;
--   SELECT COUNT(*) FROM organizations;
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.organizations'::regclass AND contype = 'u';
