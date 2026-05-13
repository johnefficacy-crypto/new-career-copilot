-- Migration 046: promote_recruitment RPC writes fees + selection stages.
--
-- Migration 043 (rich-field RPC) added exam_patterns / skill_tests /
-- age_relaxation_rules to the single-transaction promotion path.
-- Migration 045 added the post_fees + post_selection_stages tables.
-- This migration replaces the RPC body so a single Postgres
-- transaction also populates those two tables when the payload
-- includes ``fees`` / ``selection_process`` on a post.
--
-- New per-post fields:
--   "fees": {"general": int, "obc": int, "sc": int, ..., "currency": "INR"} | null
--   "selection_process": ["tier_1", "tier_2", "interview", ...] | null
--
-- Both are optional; missing / null / wrong-type values become zero
-- rows in their respective tables. Existing payloads keep promoting
-- unchanged.

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
  v_pattern_stage     jsonb;
  v_pattern_sort      integer;
  v_skill             jsonb;
  v_relax_key         text;
  v_relax_years       integer;
  v_fee_key           text;
  v_fee_value         text;
  v_fee_currency      text;
  v_fee_amount        numeric;
  v_stage             jsonb;
  v_stage_sort        integer;
  v_stage_label       text;
begin
  if v_org_name is null or v_org_name = '' then
    raise exception 'promote_recruitment: organization_name is required' using errcode = 'P0001';
  end if;
  if v_slug is null or v_slug = '' then
    raise exception 'promote_recruitment: slug is required' using errcode = 'P0001';
  end if;

  select id into v_existing_slug_id
    from public.recruitments where slug = v_slug limit 1;
  if found then
    raise exception 'promote_recruitment: duplicate slug % (existing=%)', v_slug, v_existing_slug_id
      using errcode = '23P01';
  end if;

  select id into v_org_id from public.organizations where name = v_org_name limit 1;
  if not found then
    insert into public.organizations (name, type) values (v_org_name, v_org_type)
    returning id into v_org_id;
  end if;

  insert into public.recruitments (
    slug, organization_id, name, year,
    notification_date, apply_start_date, apply_end_date,
    status, publish_status, total_vacancies,
    official_notification_url, official_apply_url, source_pdf_url, source_id
  ) values (
    v_slug, v_org_id, payload ->> 'title', (payload ->> 'year')::int,
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

  for v_post in select * from jsonb_array_elements(coalesce(payload -> 'posts', '[]'::jsonb))
  loop
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
            where name = v_post ->> 'unit_name' limit 1;
          if not found then
            insert into public.organizations (name, type, state)
            values (v_post ->> 'unit_name', v_org_type,
                    nullif(v_post ->> 'unit_location_state', ''))
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
      'direct', v_unit_id,
      coalesce(
        (select array_agg(elem) from jsonb_array_elements_text(coalesce(v_post -> 'language_requirements', '[]'::jsonb)) as elem),
        '{}'::text[]
      )
    )
    returning id into v_post_id;

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

    if (v_post ->> 'education_required') is not null
       or (v_post ->> 'raw_requirement_text') is not null then
      insert into public.education_criteria (
        post_id, min_qualification_level, allowed_disciplines, raw_requirement_text
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

    if (v_post -> 'exam_pattern') is not null
       and jsonb_typeof(v_post -> 'exam_pattern') = 'array' then
      v_pattern_sort := 0;
      for v_pattern_stage in select * from jsonb_array_elements(v_post -> 'exam_pattern')
      loop
        if jsonb_typeof(v_pattern_stage) = 'object' then
          insert into public.exam_patterns (
            post_id, stage_name, section_name,
            question_count, marks, duration_minutes,
            negative_marking, sort_order
          ) values (
            v_post_id,
            coalesce(
              nullif(v_pattern_stage ->> 'stage_name', ''),
              nullif(v_pattern_stage ->> 'section', ''),
              'stage'
            ),
            nullif(v_pattern_stage ->> 'section', ''),
            (case when (v_pattern_stage ->> 'questions') ~ '^[0-9]+$'
                  then (v_pattern_stage ->> 'questions')::int else null end),
            (case when (v_pattern_stage ->> 'marks') ~ '^[0-9]+$'
                  then (v_pattern_stage ->> 'marks')::int else null end),
            (case when (v_pattern_stage ->> 'duration_minutes') ~ '^[0-9]+$'
                  then (v_pattern_stage ->> 'duration_minutes')::int else null end),
            nullif(v_pattern_stage ->> 'negative_marking', ''),
            v_pattern_sort
          );
          v_pattern_sort := v_pattern_sort + 1;
        end if;
      end loop;
    end if;

    if (v_post -> 'skill_tests') is not null
       and jsonb_typeof(v_post -> 'skill_tests') = 'array' then
      for v_skill in select * from jsonb_array_elements(v_post -> 'skill_tests')
      loop
        if jsonb_typeof(v_skill) = 'object' and
           coalesce(
             nullif(v_skill ->> 'type', ''),
             nullif(v_skill ->> 'test_type', '')
           ) is not null then
          insert into public.skill_tests (
            post_id, test_type, speed_requirement,
            duration_minutes, evaluation_formula
          ) values (
            v_post_id,
            coalesce(
              nullif(v_skill ->> 'type', ''),
              nullif(v_skill ->> 'test_type', '')
            ),
            (case when (v_skill ->> 'wpm') is not null then v_skill ->> 'wpm'
                  when (v_skill ->> 'speed_requirement') is not null then v_skill ->> 'speed_requirement'
                  else null end),
            (case when (v_skill ->> 'duration_minutes') ~ '^[0-9]+$'
                  then (v_skill ->> 'duration_minutes')::int else null end),
            nullif(v_skill ->> 'evaluation_formula', '')
          );
        end if;
      end loop;
    end if;

    if (v_post -> 'age_relaxation') is not null
       and jsonb_typeof(v_post -> 'age_relaxation') = 'object' then
      for v_relax_key, v_relax_years in
        select key, (value)::int
          from jsonb_each_text(v_post -> 'age_relaxation')
         where value ~ '^[0-9]+$'
      loop
        if v_relax_years >= 0 then
          insert into public.age_relaxation_rules (post_id, reservation_category, additional_years)
          values (v_post_id, v_relax_key, v_relax_years);
        end if;
      end loop;
    end if;

    -- ── post_fees (PR migration 045 + this) ──────────────────────────
    if (v_post -> 'fees') is not null
       and jsonb_typeof(v_post -> 'fees') = 'object' then
      v_fee_currency := coalesce(nullif(v_post -> 'fees' ->> 'currency', ''), 'INR');
      for v_fee_key, v_fee_value in
        select key, value::text
          from jsonb_each_text(v_post -> 'fees')
         where key <> 'currency'
      loop
        if v_fee_value ~ '^[0-9]+(\.[0-9]+)?$' then
          v_fee_amount := v_fee_value::numeric;
          if v_fee_amount >= 0 then
            insert into public.post_fees (post_id, category, amount, currency)
            values (v_post_id, v_fee_key, v_fee_amount, v_fee_currency);
          end if;
        end if;
      end loop;
    end if;

    -- ── post_selection_stages ───────────────────────────────────────
    if (v_post -> 'selection_process') is not null
       and jsonb_typeof(v_post -> 'selection_process') = 'array' then
      v_stage_sort := 0;
      for v_stage in select * from jsonb_array_elements(v_post -> 'selection_process')
      loop
        if jsonb_typeof(v_stage) = 'string' then
          v_stage_label := trim(v_stage #>> '{}');
          if v_stage_label <> '' then
            insert into public.post_selection_stages (post_id, stage_label, sort_order)
            values (v_post_id, v_stage_label, v_stage_sort);
            v_stage_sort := v_stage_sort + 1;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return v_rec_id;
end;
$$;

revoke all on function public.promote_recruitment(jsonb) from public;
grant execute on function public.promote_recruitment(jsonb) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
