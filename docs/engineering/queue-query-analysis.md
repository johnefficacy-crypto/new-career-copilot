# Queue query analysis (Step 6)

This note records the SQL used to analyze queue query paths from the runbook:

- `eligibility_queue()` API path (`/api/admin/eligibility-queue`)
- `list_scrape_queue()` API path (`/api/admin/scrape/queue`)

## Why results are not included here

`EXPLAIN ANALYZE` was not executed in this environment because no local Postgres/Supabase database instance is connected for query-plan capture.

## SQL to run manually in Supabase SQL editor

### 1) scrape queue list path

```sql
EXPLAIN ANALYZE
SELECT id, source_url, source_name, raw_html, extracted_data, confidence_score,
       data_quality_score, status, duplicate_of, reviewer_id, reviewer_notes,
       reviewed_at, field_evidence, official_source_resolved, official_source_host,
       extraction_status, evidence_required, scraped_at
FROM public.scrape_queue
WHERE status = 'pending'
ORDER BY scraped_at DESC
LIMIT 50;
```

### 2) eligibility queue pending panel

```sql
EXPLAIN ANALYZE
SELECT id, source_name, extracted_data, confidence_score, scraped_at
FROM public.scrape_queue
WHERE status = 'pending'
ORDER BY scraped_at DESC
LIMIT 50;
```

### 3) eligibility recompute backlog count

```sql
EXPLAIN ANALYZE
SELECT count(*)
FROM public.eligibility_recompute_queue
WHERE status = 'pending';
```

### 4) queue cleanup candidate report (read-only)

```sql
SELECT *
FROM public.queue_cleanup_candidates(365, 180);
```

## Expected index usage to confirm

- `idx_scrape_queue_status`
- `idx_scrape_queue_reviewed_at`
- `idx_recompute_queue_status`
- `idx_extracted_field_evidence_scrape_queue_id`

If sequential scans persist on large tables, gather `pg_stat_statements` and inspect filter/selectivity before adding additional composite indexes.
