-- Migration 040: promote_recruitment(payload jsonb) RPC.
--
-- Promotion writes organizations, recruitments, recruitment_units, posts,
-- vacancy_reservations, age_criteria, and education_criteria across many
-- supabase-py calls. PRs #121 and #127 added compensation rollback for
-- partial failures, but that pattern can't survive a process crash mid-
-- promotion. This RPC wraps every insert in a single Postgres
-- transaction so either every canonical row exists, or none of them do.
--
-- The Python promotion path tries this RPC first; if the function is
-- missing on an older deploy or any unexpected error fires, it falls
-- back to the existing compensation pattern. Existing behaviour stays
-- as a strict subset of the new behaviour.
--
-- Contract for ``payload``:
--   {
--     "slug": text,
--     "title": text,
--     "organization_name": text,
--     "org_type": text,
--     "year": int,
--     "notification_date": text|null,
--     "apply_start_date": text|null,
--     "apply_end_date": text|null,
--     "derived_status": text,
--     "total_vacancies": int|null,
--     "official_notification_url": text,
--     "official_apply_url": text|null,
--     "source_pdf_url": text|null,
--     "source_id": uuid|null,
--     "posts": [{
--       "post_name": text,
--       "group_type": text|null,
--       "pay_level": text|null,
--       "vacancies": int|null,
--       "category_vacancies": jsonb|null,    -- {"UR":50, "SC":15, ...}
--       "min_age": int|null,
--       "max_age": int|null,
--       "age_cutoff_date": text|null,
--       "education_required": text|null,
--       "raw_requirement_text": text|null,
--       "disciplines": text[]|null,
--       "education_level": text,             -- mapped by Python caller
--       "unit_code": text|null,
--       "unit_name": text|null,
--       "unit_location_state": text|null,
--       "unit_location_city": text|null,
--       "language_requirements": text[]|null
--     }, ...]
--   }
--
-- Raises a custom SQLSTATE on duplicate slug so the Python wrapper can
-- map it back to ``DuplicatePromotionError`` without parsing strings.

begin;

create or replace function public.promote_recruitment(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  v_org_id            uuid;
  v_org_name          text := payload ->> 'organization_name';
  v_org_type          text := payload ->> 'org_type';
  v_slug              text := payload ->> 'slug';
  v_rec_id            uuid;
  v_existing_slug_id  uuid;
  v_post              jsonb;
  v_post_id           uuid;
  v_unit_id           uuid;
  v_unit_key          text;
  v_unit_org_id       uuid;
  v_cat               text;
  v_cat_count         integer;
  v_units             jsonb := '{}'::jsonb;
begin
  if v_org_name is null or v_org_name = '' then
    raise exception 'promote_recruitment: organization_name is required' using errcode = 'P0001';
  end if;
  if v_slug is null or v_slug = '' then
    raise exception 'promote_recruitment: slug is required' using errcode = 'P0001';
  end if;

  -- Duplicate slug guard. Raised as SQLSTATE 23P01 so the Python wrapper
  -- can map it to DuplicatePromotionError without string-matching.
  select id into v_existing_slug_id
    from public.recruitments
    where slug = v_slug
    limit 1;
  if found then
    raise exception 'promote_recruitment: duplicate slug % (existing=%)', v_slug, v_existing_slug_id
      using errcode = '23P01';
  end if;

  -- Find-or-create organization.
  select id into v_org_id
    from public.organizations
    where name = v_org_name
    limit 1;
  if not found then
    insert into public.organizations (name, type)
    values (v_org_name, v_org_type)
    returning id into v_org_id;
  end if;

  -- Recruitment.
  insert into public.recruitments (
    slug, organization_id, name, year,
    notification_date, apply_start_date, apply_end_date,
    status, publish_status, total_vacancies,
    official_notification_url, official_apply_url, source_pdf_url, source_id
  ) values (
    v_slug,
    v_org_id,
    payload ->> 'title',
    (payload ->> 'year')::int,
    nullif(payload ->> 'notification_date', ''),
    nullif(payload ->> 'apply_start_date', ''),
    nullif(payload ->> 'apply_end_date', ''),
    coalesce(payload ->> 'derived_status', 'upcoming'),
    'needs_review',
    nullif(payload ->> 'total_vacancies', '')::int,
    payload ->> 'official_notification_url',
    nullif(payload ->> 'official_apply_url', ''),
    nullif(payload ->> 'source_pdf_url', ''),
    nullif(payload ->> 'source_id', '')::uuid
  )
  returning id into v_rec_id;

  -- Posts + per-post children.
  for v_post in select * from jsonb_array_elements(coalesce(payload -> 'posts', '[]'::jsonb))
  loop
    -- Unit (organisation slice). De-dup units within this call by their
    -- (code, name, state, city) tuple so two posts can share a unit row.
    v_unit_id := null;
    if (v_post ->> 'unit_code') is not null or (v_post ->> 'unit_name') is not null then
      v_unit_key := concat_ws('|',
        coalesce(v_post ->> 'unit_code', ''),
        coalesce(v_post ->> 'unit_name', ''),
        coalesce(v_post ->> 'unit_location_state', ''),
        coalesce(v_post ->> 'unit_location_city', '')
      );
      if v_units ? v_unit_key then
        v_unit_id := (v_units ->> v_unit_key)::uuid;
      else
        v_unit_org_id := v_org_id;
        if (v_post ->> 'unit_name') is not null
           and (v_post ->> 'unit_name') <> v_org_name then
          select id into v_unit_org_id
            from public.organizations
            where name = v_post ->> 'unit_name'
            limit 1;
          if not found then
            insert into public.organizations (name, type, state)
            values (
              v_post ->> 'unit_name',
              v_org_type,
              nullif(v_post ->> 'unit_location_state', '')
            )
            returning id into v_unit_org_id;
          end if;
        end if;
        insert into public.recruitment_units (
          recruitment_id, organization_id,
          unit_code, unit_name, location_state, location_city
        ) values (
          v_rec_id, v_unit_org_id,
          nullif(v_post ->> 'unit_code', ''),
          nullif(v_post ->> 'unit_name', ''),
          nullif(v_post ->> 'unit_location_state', ''),
          nullif(v_post ->> 'unit_location_city', '')
        )
        returning id into v_unit_id;
        v_units := v_units || jsonb_build_object(v_unit_key, v_unit_id::text);
      end if;
    end if;

    insert into public.posts (
      recruitment_id, post_name, group_type, pay_level,
      job_type, recruitment_unit_id, language_requirements
    ) values (
      v_rec_id,
      v_post ->> 'post_name',
      nullif(v_post ->> 'group_type', ''),
      nullif(v_post ->> 'pay_level', ''),
      'direct',
      v_unit_id,
      coalesce(
        (select array_agg(elem) from jsonb_array_elements_text(coalesce(v_post -> 'language_requirements', '[]'::jsonb)) as elem),
        '{}'::text[]
      )
    )
    returning id into v_post_id;

    -- Vacancies: per-category expansion or single unreserved row.
    if (v_post -> 'category_vacancies') is not null
       and jsonb_typeof(v_post -> 'category_vacancies') = 'object' then
      for v_cat, v_cat_count in
        select key, (value)::int
          from jsonb_each_text(v_post -> 'category_vacancies')
         where value ~ '^[0-9]+$'
      loop
        if v_cat_count >= 0 then
          insert into public.vacancy_reservations (post_id, vertical_category, vacancy_count)
          values (v_post_id, v_cat, v_cat_count);
        end if;
      end loop;
    elsif (v_post ->> 'vacancies') is not null
          and (v_post ->> 'vacancies') ~ '^[0-9]+$' then
      insert into public.vacancy_reservations (post_id, vertical_category, vacancy_count)
      values (v_post_id, null, (v_post ->> 'vacancies')::int);
    end if;

    -- Age criteria.
    if (v_post ->> 'min_age') is not null or (v_post ->> 'max_age') is not null then
      insert into public.age_criteria (post_id, min_age, max_age, cutoff_date)
      values (
        v_post_id,
        nullif(v_post ->> 'min_age', '')::int,
        nullif(v_post ->> 'max_age', '')::int,
        coalesce(
          nullif(v_post ->> 'age_cutoff_date', ''),
          nullif(payload ->> 'apply_end_date', '')
        )
      );
    end if;

    -- Education criteria.
    if (v_post ->> 'education_required') is not null
       or (v_post ->> 'raw_requirement_text') is not null then
      insert into public.education_criteria (
        post_id,
        min_qualification_level,
        allowed_disciplines,
        raw_requirement_text
      ) values (
        v_post_id,
        coalesce(nullif(v_post ->> 'education_level', ''), 'graduate'),
        case when (v_post -> 'disciplines') is not null
                  and jsonb_typeof(v_post -> 'disciplines') = 'array'
                  and jsonb_array_length(v_post -> 'disciplines') > 0
             then jsonb_build_object('primary', v_post -> 'disciplines')
             else null
        end,
        coalesce(
          nullif(v_post ->> 'raw_requirement_text', ''),
          nullif(v_post ->> 'education_required', '')
        )
      );
    end if;
  end loop;

  return v_rec_id;
end;
$$;

revoke all on function public.promote_recruitment(jsonb) from public;
grant execute on function public.promote_recruitment(jsonb) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
