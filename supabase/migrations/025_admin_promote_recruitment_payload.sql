-- Migration 025: Transactional recruitment promotion RPC
--
-- Problem: approveScrapeItem() promoted a scrape payload to recruitments via
-- multiple separate INSERT statements in TypeScript. If any step failed mid-way,
-- a partial recruitment record was left in the database with no rollback.
--
-- Fix: a single plpgsql function wraps the entire promotion (org upsert,
-- recruitment insert, posts, age criteria, education criteria) in one
-- transaction. Either everything succeeds or nothing is written.
--
-- Callers should pass the normalized_payload (or raw payload) from scrape_queue
-- and the reviewer's user_id. The function returns the new recruitment UUID.

begin;

create or replace function public.admin_promote_recruitment_payload(
  p_payload     jsonb,
  p_reviewer_id uuid
) returns uuid
language plpgsql
security definer
as $$
declare
  v_org_name       text;
  v_title          text;
  v_org_id         uuid;
  v_recruitment_id uuid;
  v_post           jsonb;
  v_age            jsonb;
  v_edu            jsonb;
begin
  if p_payload is null then
    raise exception 'p_payload is required';
  end if;

  v_org_name := nullif(trim(p_payload->>'organization_name'), '');
  v_title    := nullif(trim(p_payload->>'title'), '');

  if v_org_name is null then
    raise exception 'organization_name is required in payload';
  end if;

  if v_title is null then
    raise exception 'title is required in payload';
  end if;

  -- Upsert organization by name (case-insensitive)
  select id into v_org_id
  from public.organizations
  where lower(name) = lower(v_org_name)
  limit 1;

  if v_org_id is null then
    insert into public.organizations (name, created_at)
    values (v_org_name, now())
    returning id into v_org_id;
  end if;

  -- Insert recruitment
  insert into public.recruitments (
    organization_id,
    title,
    source_url,
    apply_start_date,
    apply_end_date,
    status,
    created_at
  )
  values (
    v_org_id,
    v_title,
    nullif(p_payload->>'source_url', ''),
    nullif(p_payload->>'apply_start_date', '')::timestamptz,
    nullif(p_payload->>'apply_end_date',   '')::timestamptz,
    coalesce(nullif(p_payload->>'status', ''), 'open'),
    now()
  )
  returning id into v_recruitment_id;

  -- Insert posts (optional array in payload)
  for v_post in
    select * from jsonb_array_elements(coalesce(p_payload->'posts', '[]'::jsonb))
  loop
    insert into public.recruitment_posts (
      recruitment_id,
      name,
      vacancies,
      created_at
    )
    values (
      v_recruitment_id,
      coalesce(nullif(v_post->>'name', ''), 'Post'),
      nullif(v_post->>'vacancies', '')::integer,
      now()
    );
  end loop;

  -- Insert age criteria (optional array in payload)
  for v_age in
    select * from jsonb_array_elements(coalesce(p_payload->'age_criteria', '[]'::jsonb))
  loop
    insert into public.recruitment_age_criteria (
      recruitment_id,
      min_age,
      max_age,
      category,
      created_at
    )
    values (
      v_recruitment_id,
      nullif(v_age->>'min_age', '')::integer,
      nullif(v_age->>'max_age', '')::integer,
      nullif(v_age->>'category', ''),
      now()
    );
  end loop;

  -- Insert education criteria (optional array in payload)
  for v_edu in
    select * from jsonb_array_elements(coalesce(p_payload->'education_criteria', '[]'::jsonb))
  loop
    insert into public.recruitment_education_criteria (
      recruitment_id,
      level,
      subject,
      appearing_allowed,
      created_at
    )
    values (
      v_recruitment_id,
      nullif(v_edu->>'level', ''),
      nullif(v_edu->>'subject', ''),
      coalesce((v_edu->>'appearing_allowed')::boolean, false),
      now()
    );
  end loop;

  return v_recruitment_id;
end;
$$;

comment on function public.admin_promote_recruitment_payload(jsonb, uuid) is
  'Transactionally promotes a scrape payload to a full recruitment record. '
  'Rolls back everything if any insert fails. Called by approveScrapeItem().';

commit;
