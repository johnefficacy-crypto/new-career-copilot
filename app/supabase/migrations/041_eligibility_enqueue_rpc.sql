-- 041_eligibility_enqueue_rpc.sql
--
-- Atomic enqueue RPC for the eligibility recompute queue. Replaces the
-- read-then-insert/update path in `app.eligibility.recompute_queue` which:
--   * Only deduped against status='pending' (ignored 'queued' and 'processing').
--   * Reset attempt_count / next_attempt_at / last_error on re-enqueue,
--     erasing the retry history admins need.
--   * Was race-prone under concurrent triggers.
--
-- Behaviour:
--   1. Active row (status in 'pending','queued','processing') for the same
--      (user_id, recruitment_id) scope → return unchanged. Mid-flight
--      'processing' rows must not be mutated; the existing
--      claim_eligibility_queue() RPC owns that lifecycle.
--   2. Failed row for the same scope → requeue immediately: preserve
--      attempt_count and last_error (audit trail), reset status to
--      'pending', set queued_at = next_attempt_at = now(), clear
--      claimed_at and processed_at, refresh reason and metadata.
--   3. Otherwise → insert a fresh pending row with attempt_count = 0.
--
-- Null recruitment_id is treated as a distinct ("global-scope") slot via
-- `is not distinct from`; without that, SQL's `null != null` would let two
-- global-scope rows live side-by-side.
--
-- Concurrent enqueues for the same (user_id, scope) are serialised with a
-- transaction-scoped advisory lock, so the read-then-write below is race
-- free without needing a partial unique index (which would fail on any
-- pre-existing duplicate active rows in production).

drop function if exists public.enqueue_eligibility_recompute(uuid, uuid, text, jsonb);

create function public.enqueue_eligibility_recompute(
    p_user_id uuid,
    p_recruitment_id uuid default null,
    p_reason text default null,
    p_metadata jsonb default '{}'::jsonb
)
returns public.eligibility_recompute_queue
language plpgsql
security definer
set search_path = public
as $$
declare
    v_active public.eligibility_recompute_queue;
    v_failed public.eligibility_recompute_queue;
    v_row public.eligibility_recompute_queue;
begin
    -- Serialise concurrent enqueues for the same (user_id, scope). Released
    -- when the surrounding transaction ends.
    perform pg_advisory_xact_lock(
        hashtext(
            p_user_id::text || ':' || coalesce(p_recruitment_id::text, '__global__')
        )
    );

    -- 1. Active row → return unchanged.
    select *
    into v_active
    from public.eligibility_recompute_queue
    where user_id = p_user_id
      and recruitment_id is not distinct from p_recruitment_id
      and status in ('pending', 'queued', 'processing')
    order by queued_at asc
    limit 1
    for update;

    if found then
        return v_active;
    end if;

    -- 2. Failed row → requeue, preserve attempt_count / last_error.
    select *
    into v_failed
    from public.eligibility_recompute_queue
    where user_id = p_user_id
      and recruitment_id is not distinct from p_recruitment_id
      and status = 'failed'
    order by queued_at desc
    limit 1
    for update;

    if found then
        update public.eligibility_recompute_queue
        set
            status = 'pending',
            queued_at = now(),
            next_attempt_at = now(),
            reason = p_reason,
            metadata = coalesce(p_metadata, '{}'::jsonb),
            claimed_at = null,
            processed_at = null
        where id = v_failed.id
        returning * into v_row;
        return v_row;
    end if;

    -- 3. Fresh row.
    insert into public.eligibility_recompute_queue (
        user_id,
        recruitment_id,
        reason,
        status,
        queued_at,
        next_attempt_at,
        attempt_count,
        last_error,
        metadata
    ) values (
        p_user_id,
        p_recruitment_id,
        p_reason,
        'pending',
        now(),
        null,
        0,
        null,
        coalesce(p_metadata, '{}'::jsonb)
    )
    returning * into v_row;
    return v_row;
end;
$$;

grant execute on function public.enqueue_eligibility_recompute(uuid, uuid, text, jsonb) to service_role;

comment on function public.enqueue_eligibility_recompute(uuid, uuid, text, jsonb) is
    'Atomic enqueue for eligibility_recompute_queue. Active rows (pending/queued/processing) return unchanged; failed rows requeue while preserving attempt_count and last_error; otherwise inserts a fresh pending row. See migration 041 header for the full contract.';
