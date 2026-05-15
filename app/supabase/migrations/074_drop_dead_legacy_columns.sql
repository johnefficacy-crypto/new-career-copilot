-- Drop dead legacy columns retired by Sprint 5 (wire-contract cleanup).
--
-- Two columns are removed here. Both stopped being read or written by
-- application code in Sprint 5 (PR #216), which left runtime payloads
-- already free of these fields. This migration is the irreversible
-- follow-up that reclaims the storage and removes the schema-drift smell
-- so reviewers no longer have to ask "which of these is authoritative?".
--
-- 1. ``public.source_registry.source_url``
--      Predates ``official_url`` (added by migration 022). The active
--      runtime reads ``official_url`` exclusively after Sprint 5; the
--      legacy ``source_url`` value was being mirrored server-side by
--      ``admin_trust._source_payload`` only to keep older readers
--      working through the transition. Backfilled before drop so any row
--      that still has only ``source_url`` survives the column removal.
--
-- 2. ``public.scrape_queue.field_evidence``
--      Pre-relational evidence JSON. The relational
--      ``extracted_field_evidence`` table (migration 002 + 023) has been
--      the source of truth since the queue-list endpoint was widened to
--      project ``field_evidence_status`` and ``field_evidence_details``.
--      The JSON column was being shipped to clients but never consumed.
--
-- Indexes: neither column has an index that needs dropping first.
-- Views/triggers/functions: ``source_url`` on source_registry is not
-- referenced by any view; ``scrape_queue.source_url`` (the unrelated
-- per-row URL of each scraped page) is NOT touched by this migration.
-- ``scrape_queue.field_evidence`` is not referenced by any view either.

-- ── 1. Backfill official_url from source_url before drop ─────────────────
-- Rows seeded by ``app/supabase/seeds/free_job_alert_source_registry.sql``
-- (and any historical data that predates migration 022) only have
-- ``source_url`` populated. Copy the value over so dropping the column
-- doesn't take the URL with it.
update public.source_registry
   set official_url = source_url
 where official_url is null
   and source_url   is not null;

-- ── 2. Drop source_registry.source_url ──────────────────────────────────
alter table public.source_registry
  drop column if exists source_url;

-- ── 3. Drop scrape_queue.field_evidence ─────────────────────────────────
alter table public.scrape_queue
  drop column if exists field_evidence;

-- PostgREST schema cache reload so /api/admin/scrape/queue stops shipping
-- the dropped column at the wire layer too. The application code in this
-- PR already removed both references; this NOTIFY just shortens the
-- propagation window in environments that haven't restarted PostgREST.
notify pgrst, 'reload schema';
