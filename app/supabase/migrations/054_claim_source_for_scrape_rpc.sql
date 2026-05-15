-- Migration 085: atomic per-source claim RPC.
--
-- PR #156 added ``source_registry.currently_scraping_at`` plus a
-- read-then-update claim sequence. Two workers reading NULL at the
-- same time can both stamp the column and both proceed. The race
-- window is small but real.
--
-- This function does the claim atomically via UPDATE ... RETURNING:
--   * Sets currently_scraping_at = now() iff the column is NULL or
--     older than ``p_stale_seconds`` (the stale-takeover threshold).
--   * Returns TRUE only when the row was actually updated, so two
--     concurrent callers always see exactly one TRUE between them.
--
-- The Python wrapper tries this RPC first and falls back to the
-- read-then-update path when the function is missing on older
-- deploys, so behaviour stays identical pre-migration.

begin;

create or replace function public.claim_source_for_scrape(
  p_source_id     uuid,
  p_stale_seconds integer default 900
)
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  update public.source_registry
     set currently_scraping_at = now()
   where id = p_source_id
     and (
       currently_scraping_at is null
       or currently_scraping_at < now() - make_interval(secs => p_stale_seconds)
     )
  returning id into v_id;
  return found;
end;
$$;

revoke all on function public.claim_source_for_scrape(uuid, integer) from public;
grant execute on function public.claim_source_for_scrape(uuid, integer) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
