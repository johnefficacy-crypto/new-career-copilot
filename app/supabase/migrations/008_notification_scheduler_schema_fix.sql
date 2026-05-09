-- Required by recompute_worker.py:
-- supabase.rpc("claim_eligibility_queue", {"p_limit": limit})

drop function if exists public.claim_eligibility_queue(integer);

create function public.claim_eligibility_queue(p_limit integer default 25)
returns setof public.eligibility_recompute_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
    from public.eligibility_recompute_queue
    where status in ('pending', 'queued')
      and (next_attempt_at is null or next_attempt_at <= now())
      and coalesce(attempt_count, 0) < 5
    order by queued_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.eligibility_recompute_queue q
  set
    status = 'processing',
    claimed_at = now(),
    attempt_count = coalesce(q.attempt_count, 0) + 1,
    last_error = null
  from candidate
  where q.id = candidate.id
  returning q.*;
end;
$$;

grant execute on function public.claim_eligibility_queue(integer) to service_role;