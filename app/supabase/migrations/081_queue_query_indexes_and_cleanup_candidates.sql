begin;

-- Step 6: queue query optimization indexes.
-- Keep idempotent; do not alter business logic.

create index if not exists idx_scrape_queue_status
  on public.scrape_queue(status);

create index if not exists idx_scrape_queue_reviewed_at
  on public.scrape_queue(reviewed_at);

create index if not exists idx_recompute_queue_status
  on public.eligibility_recompute_queue(status);

-- Relevant FK/join path used in queue review surfaces.
create index if not exists idx_extracted_field_evidence_scrape_queue_id
  on public.extracted_field_evidence(scrape_queue_id);

-- Conservative cleanup helper: report candidates only; no data mutation.
create or replace function public.queue_cleanup_candidates(
  p_scrape_retention_days integer default 365,
  p_recompute_retention_days integer default 180
)
returns table(metric text, row_count bigint)
language sql
security definer
as $$
  select 'scrape_queue_reviewed_candidates'::text as metric,
         count(*)::bigint as row_count
  from public.scrape_queue
  where reviewed_at is not null
    and reviewed_at < now() - make_interval(days => p_scrape_retention_days)

  union all

  select 'eligibility_recompute_terminal_candidates'::text as metric,
         count(*)::bigint as row_count
  from public.eligibility_recompute_queue
  where status in ('completed', 'failed')
    and coalesce(processed_at, queued_at) < now() - make_interval(days => p_recompute_retention_days);
$$;

comment on function public.queue_cleanup_candidates(integer, integer) is
  'Read-only helper for queue retention planning. Reports candidate row counts only; does not delete or archive data.';

commit;
