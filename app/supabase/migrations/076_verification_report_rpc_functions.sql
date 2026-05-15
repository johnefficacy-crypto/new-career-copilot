-- Migration 076: atomic RPCs for the Recruitment Verification Gateway.
--
-- Two operations on ``recruitment_verification_reports`` are not safe as
-- two-step inserts:
--
--   1. ``create_verification_report`` — inserts a fresh row and
--      bootstraps chain_root_id = id. A naive insert-then-update path
--      orphans rows if the worker crashes between the two statements.
--   2. ``supersede_and_create_verification_report`` — marks the
--      currently-active report superseded AND inserts the new version
--      that points back at the old one. The active-uniqueness partial
--      index forbids two active rows for the same scrape_queue_id, so
--      the supersede step must happen first; everything must be in one
--      transaction or a crash leaves the queue with no active report.
--
-- Both functions live in the ``public`` schema and are exposed to
-- authenticated/service_role roles (REVOKE from public; GRANT to the
-- service callers).

begin;

-- ── create_verification_report ─────────────────────────────────────────
--
-- Inserts a single row from the JSONB payload, then back-fills
-- chain_root_id with its own id when the caller didn't pre-set one.
-- Returns the inserted (and possibly updated) row.

create or replace function public.create_verification_report(payload jsonb)
returns public.recruitment_verification_reports
language plpgsql
as $$
declare
  new_row public.recruitment_verification_reports;
begin
  insert into public.recruitment_verification_reports
  select * from jsonb_populate_record(
    null::public.recruitment_verification_reports,
    payload
  )
  returning * into new_row;

  -- Bootstrap chain_root_id when caller didn't pass one. Row-1 of a
  -- chain points at itself.
  if new_row.chain_root_id is null then
    update public.recruitment_verification_reports
       set chain_root_id = new_row.id
     where id = new_row.id
    returning * into new_row;
  end if;

  return new_row;
end;
$$;

revoke all on function public.create_verification_report(jsonb) from public;
grant execute on function public.create_verification_report(jsonb)
  to authenticated, service_role;


-- ── supersede_and_create_verification_report ───────────────────────────
--
-- Locks the old row, marks it superseded (placeholder pointer so the
-- partial unique index frees its slot for the new insert), inserts the
-- new active row, then points the old row's ``superseded_by`` at the
-- new id. All in one transaction.
--
-- The placeholder uuid for the supersede step is a synthetic value —
-- we update it to ``new_row.id`` at the end of the function. The
-- partial unique index uses ``superseded_by IS NULL`` as its predicate,
-- so any non-null value vacates the slot.

create or replace function public.supersede_and_create_verification_report(
  old_id uuid,
  payload jsonb
) returns public.recruitment_verification_reports
language plpgsql
as $$
declare
  old_row public.recruitment_verification_reports;
  new_row public.recruitment_verification_reports;
  placeholder uuid := gen_random_uuid();
begin
  -- Lock the old row so a concurrent supersede attempt waits or fails.
  select * into old_row
    from public.recruitment_verification_reports
   where id = old_id
   for update;

  if old_row.id is null then
    raise exception 'verification_report % not found', old_id
      using errcode = 'no_data_found';
  end if;
  if old_row.superseded_by is not null then
    raise exception 'verification_report % already superseded', old_id
      using errcode = 'unique_violation';
  end if;

  -- Free the active-uniqueness slot first by stamping superseded_by
  -- with a placeholder + flipping lifecycle_status. The chk_no_self
  -- constraint allows non-self uuids; the placeholder is replaced
  -- below with the real new_row.id.
  update public.recruitment_verification_reports
     set superseded_by    = placeholder,
         lifecycle_status = 'superseded'
   where id = old_id;

  -- Insert the new version row.
  insert into public.recruitment_verification_reports
  select * from jsonb_populate_record(
    null::public.recruitment_verification_reports,
    payload
  )
  returning * into new_row;

  -- Preserve / bootstrap the chain pointer. New versions inherit the
  -- old row's chain_root_id; new-chain rows (no old row had one) point
  -- at themselves.
  if new_row.chain_root_id is null then
    update public.recruitment_verification_reports
       set chain_root_id = coalesce(old_row.chain_root_id, new_row.id)
     where id = new_row.id
    returning * into new_row;
  end if;

  -- Replace the placeholder with the real new id.
  update public.recruitment_verification_reports
     set superseded_by = new_row.id
   where id = old_id;

  return new_row;
end;
$$;

revoke all on function public.supersede_and_create_verification_report(uuid, jsonb)
  from public;
grant execute on function public.supersede_and_create_verification_report(uuid, jsonb)
  to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
