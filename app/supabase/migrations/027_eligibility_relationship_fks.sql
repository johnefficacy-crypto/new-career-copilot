-- Eligibility relationship contract for PostgREST embeds.
-- Runtime keeps a defensive fallback, but the schema should expose these
-- relationships for clean embedded selects where deployments allow it.

do $$
begin
  if to_regclass('public.posts') is not null
     and to_regclass('public.recruitments') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.posts'::regclass
         and conname = 'posts_recruitment_id_fkey'
     ) then
    alter table public.posts
      add constraint posts_recruitment_id_fkey
      foreign key (recruitment_id) references public.recruitments(id)
      on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.recruitments') is not null
     and to_regclass('public.organizations') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.recruitments'::regclass
         and conname = 'recruitments_organization_id_fkey'
     ) then
    alter table public.recruitments
      add constraint recruitments_organization_id_fkey
      foreign key (organization_id) references public.organizations(id)
      on delete set null not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.age_criteria') is not null
     and to_regclass('public.posts') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.age_criteria'::regclass
         and conname = 'age_criteria_post_id_fkey'
     ) then
    alter table public.age_criteria
      add constraint age_criteria_post_id_fkey
      foreign key (post_id) references public.posts(id)
      on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.education_criteria') is not null
     and to_regclass('public.posts') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.education_criteria'::regclass
         and conname = 'education_criteria_post_id_fkey'
     ) then
    alter table public.education_criteria
      add constraint education_criteria_post_id_fkey
      foreign key (post_id) references public.posts(id)
      on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.attempt_limits') is not null
     and to_regclass('public.posts') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.attempt_limits'::regclass
         and conname = 'attempt_limits_post_id_fkey'
     ) then
    alter table public.attempt_limits
      add constraint attempt_limits_post_id_fkey
      foreign key (post_id) references public.posts(id)
      on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.certification_criteria') is not null
     and to_regclass('public.posts') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.certification_criteria'::regclass
         and conname = 'certification_criteria_post_id_fkey'
     ) then
    alter table public.certification_criteria
      add constraint certification_criteria_post_id_fkey
      foreign key (post_id) references public.posts(id)
      on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.post_disability_requirements') is not null
     and to_regclass('public.posts') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.post_disability_requirements'::regclass
         and conname = 'post_disability_requirements_post_id_fkey'
     ) then
    alter table public.post_disability_requirements
      add constraint post_disability_requirements_post_id_fkey
      foreign key (post_id) references public.posts(id)
      on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.age_relaxation_rules') is not null
     and to_regclass('public.posts') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.age_relaxation_rules'::regclass
         and conname = 'age_relaxation_rules_post_id_fkey'
     ) then
    alter table public.age_relaxation_rules
      add constraint age_relaxation_rules_post_id_fkey
      foreign key (post_id) references public.posts(id)
      on delete cascade not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
