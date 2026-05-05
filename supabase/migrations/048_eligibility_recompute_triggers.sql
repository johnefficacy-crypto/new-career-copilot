-- ============================================================================
-- 048_eligibility_recompute_triggers.sql
--
-- Phase 2 · Session (v) follow-up. Adds Postgres triggers that enqueue a
-- recompute into `public.eligibility_recompute_queue` whenever a user's
-- profile fields that the deterministic eligibility engine depends on
-- change, or whenever any of their `aspirant_education` rows change.
--
-- The in-process APScheduler worker (`elig:recompute`, every 5 minutes)
-- drains this queue by calling the deterministic engine for the whole
-- user. The engine is the only thing allowed to write `eligibility_results`
-- and `notification_alerts.alert_type='new_match'` — AI never touches
-- eligibility.
--
-- Generate-only: REVIEW BEFORE APPLYING IN SUPABASE SQL EDITOR.
-- ============================================================================

-- Helpful partial index so we can dedup queued rows per user (otherwise
-- a user editing their profile 5 times in a minute would create 5 queue
-- rows). We can keep multiple "completed" / "failed" rows for audit.
create index if not exists idx_eligibility_recompute_queue_user_queued
  on public.eligibility_recompute_queue (user_id)
  where status = 'queued';

-- ----------------------------------------------------------------------------
-- enqueue_user_recompute
--
-- Inserts ONE queued row for the given user. `recruitment_id` is NOT NULL
-- in the queue, so we pick any currently-active recruitment id as a
-- placeholder — the worker's recompute is whole-user (it loads every
-- active post for the user, not just the queued recruitment), so the
-- choice of placeholder is irrelevant to correctness.
--
-- If a queued row already exists for this user, skip (the worker will
-- pick up all changes when it drains).
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_user_recompute(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recruitment_id uuid;
  v_existing       uuid;
begin
  if p_user_id is null then
    return;
  end if;

  -- Idempotent: if there is already a queued row, do nothing.
  select id into v_existing
    from public.eligibility_recompute_queue
   where user_id = p_user_id
     and status  = 'queued'
   limit 1;
  if v_existing is not null then
    return;
  end if;

  -- Prefer a recruitment the user has already been evaluated against; this
  -- keeps the queue row meaningful even though the worker recomputes the
  -- whole user.
  select recruitment_id into v_recruitment_id
    from public.eligibility_results
   where user_id = p_user_id
   order by computed_at desc nulls last
   limit 1;

  -- Fallback: any currently-active published recruitment.
  if v_recruitment_id is null then
    select id into v_recruitment_id
      from public.recruitments
     where status in ('open', 'upcoming')
       and publish_status in ('verified', 'published')
     order by apply_end_date asc nulls last
     limit 1;
  end if;

  -- Hard fallback: any recruitment at all (cold-start db).
  if v_recruitment_id is null then
    select id into v_recruitment_id
      from public.recruitments
     order by created_at desc
     limit 1;
  end if;

  if v_recruitment_id is null then
    -- Nothing to enqueue against — the canonical schema is empty. Skip.
    return;
  end if;

  insert into public.eligibility_recompute_queue
    (user_id, recruitment_id, reason, status, queued_at)
  values
    (p_user_id, v_recruitment_id, p_reason, 'queued', now());
end;
$$;

comment on function public.enqueue_user_recompute(uuid, text) is
  'Phase 2 · Session (v). Idempotent enqueue helper used by profile + '
  'aspirant_education triggers. Picks an arbitrary recruitment_id as a '
  'placeholder because the worker recomputes the whole user.';

-- ----------------------------------------------------------------------------
-- Trigger on public.profiles — only fire when an engine-relevant column
-- actually changes. We read both `dob` and `date_of_birth` because the
-- table has both (legacy + canonical).
-- ----------------------------------------------------------------------------
create or replace function public.trg_profile_recompute() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed :=
         (new.dob              is distinct from old.dob)
      or (new.date_of_birth    is distinct from old.date_of_birth)
      or (new.category         is distinct from old.category)
      or (new.pwbd_status      is distinct from old.pwbd_status)
      or (new.ex_serviceman    is distinct from old.ex_serviceman)
      or (new.service_years    is distinct from old.service_years)
      or (new.govt_employee    is distinct from old.govt_employee)
      or (new.domicile_state   is distinct from old.domicile_state)
      or (new.nationality      is distinct from old.nationality);
  end if;

  if v_changed then
    perform public.enqueue_user_recompute(new.id, 'profile_change');
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_recompute_trigger on public.profiles;
create trigger profiles_recompute_trigger
  after insert or update on public.profiles
  for each row execute function public.trg_profile_recompute();

-- ----------------------------------------------------------------------------
-- Trigger on public.aspirant_education — fires for INSERT / UPDATE / DELETE.
-- Any add/edit/remove of an education row changes the engine's verdict.
-- ----------------------------------------------------------------------------
create or replace function public.trg_aspirant_education_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;

  perform public.enqueue_user_recompute(v_user, 'education_change');

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists aspirant_education_recompute_trigger
  on public.aspirant_education;
create trigger aspirant_education_recompute_trigger
  after insert or update or delete on public.aspirant_education
  for each row execute function public.trg_aspirant_education_recompute();

-- ----------------------------------------------------------------------------
-- Trigger on public.aspirant_exam_credentials — affects the "required
-- exam credential" engine rule. Same shape as the education trigger.
-- ----------------------------------------------------------------------------
create or replace function public.trg_aspirant_exam_creds_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
  else
    v_user := new.user_id;
  end if;

  perform public.enqueue_user_recompute(v_user, 'exam_credentials_change');

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists aspirant_exam_creds_recompute_trigger
  on public.aspirant_exam_credentials;
create trigger aspirant_exam_creds_recompute_trigger
  after insert or update or delete on public.aspirant_exam_credentials
  for each row execute function public.trg_aspirant_exam_creds_recompute();

-- ============================================================================
-- VERIFY (run AFTER applying):
--   update public.profiles set domicile_state = 'Maharashtra' where id = '...';
--   select id, user_id, recruitment_id, reason, status, queued_at
--     from public.eligibility_recompute_queue
--    where user_id = '...'
--    order by queued_at desc;
--
-- The APScheduler worker (`elig:recompute`, every 5m) will drain this row
-- the next time it runs. To force-drain immediately, hit:
--   POST /api/admin/jobs/run/elig:recompute
-- ============================================================================
