-- Verified Domain Gap Action Plan: P1 domain schema.
-- Adds representation for multi-unit recruitments, richer vacancies,
-- disability/physical suitability, EWS metadata, languages, education
-- equivalence, notice-specific age relaxations, and exam/skill-test patterns.

--------------------------------------------------
-- P0 CONTRACT HARDENING FOR VERIFIED DOMAIN FLOWS
--------------------------------------------------

alter table public.recruitments
  add column if not exists source_id uuid references public.source_registry(id) on delete set null,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists review_notes text;

alter table public.posts
  add column if not exists group_type text,
  add column if not exists pay_level text,
  add column if not exists job_type text;

alter table public.salary_details
  add column if not exists in_hand_estimate numeric;

alter table public.scrape_queue
  add column if not exists source_id uuid references public.source_registry(id) on delete set null,
  add column if not exists raw_html text,
  add column if not exists raw_payload jsonb,
  add column if not exists extracted_fields jsonb,
  add column if not exists duplicate_of uuid references public.scrape_queue(id) on delete set null,
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists field_evidence jsonb,
  add column if not exists official_source_resolved boolean not null default false,
  add column if not exists official_source_host text,
  add column if not exists promoted_recruitment_id uuid references public.recruitments(id) on delete set null;

alter table public.notification_documents
  add column if not exists source_id uuid references public.source_registry(id) on delete set null,
  add column if not exists storage_path text,
  add column if not exists content_hash text;

alter table public.extracted_field_evidence
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewer_notes text,
  add column if not exists extraction_method text,
  add column if not exists extracted_value jsonb;

alter table public.notification_alerts
  add column if not exists source text;

create index if not exists idx_scrape_queue_source_id
  on public.scrape_queue(source_id);

create index if not exists idx_scrape_queue_duplicate_of
  on public.scrape_queue(duplicate_of);

create index if not exists idx_scrape_queue_promoted_recruitment_id
  on public.scrape_queue(promoted_recruitment_id);

create index if not exists idx_notification_documents_content_hash
  on public.notification_documents(content_hash);

--------------------------------------------------
-- P1.1 MULTI-UNIT RECRUITMENT SUPPORT
--------------------------------------------------

create table if not exists public.recruitment_units (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  unit_code text,
  unit_name text,
  location_state text,
  location_city text,
  preference_order integer,
  created_at timestamptz not null default now(),
  unique (recruitment_id, organization_id)
);

alter table public.posts
  add column if not exists recruitment_unit_id uuid references public.recruitment_units(id);

create index if not exists idx_recruitment_units_recruitment
  on public.recruitment_units(recruitment_id);

--------------------------------------------------
-- P1.2 HORIZONTAL RESERVATION AND BACKLOG VACANCIES
--------------------------------------------------

create table if not exists public.vacancy_reservations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  vertical_category text,
  horizontal_category text,
  vacancy_count integer not null default 0 check (vacancy_count >= 0),
  is_backlog boolean not null default false,
  source_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vacancy_reservations_post
  on public.vacancy_reservations(post_id);

--------------------------------------------------
-- P1.3 DISABILITY AND PHYSICAL REQUIREMENT COMPATIBILITY
--------------------------------------------------

create table if not exists public.disability_types (
  code text primary key,
  description text not null,
  is_active boolean not null default true
);

create table if not exists public.physical_requirement_types (
  code text primary key,
  description text not null,
  is_active boolean not null default true
);

create table if not exists public.post_disability_requirements (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  disability_code text references public.disability_types(code),
  physical_requirement_code text references public.physical_requirement_types(code),
  suitable boolean not null default true,
  source_note text,
  created_at timestamptz not null default now()
);

alter table public.aspirant_reservations
  add column if not exists disability_code text references public.disability_types(code);

create index if not exists idx_post_disability_requirements_post
  on public.post_disability_requirements(post_id);

--------------------------------------------------
-- P1.4 EWS DETAILS
--------------------------------------------------

alter table public.aspirant_reservations
  add column if not exists family_income_annual numeric(12,2),
  add column if not exists ews_assets jsonb not null default '{}'::jsonb,
  add column if not exists ews_certificate_available boolean;

--------------------------------------------------
-- P1.5 LANGUAGE REQUIREMENTS
--------------------------------------------------

alter table public.posts
  add column if not exists language_requirements text[] not null default '{}'::text[];

alter table public.aspirant_preferences
  add column if not exists languages_known text[] not null default '{}'::text[],
  add column if not exists preferred_language text;

--------------------------------------------------
-- P1.6 EDUCATION EQUIVALENCE AND HIGHER QUALIFICATION CONTROL
--------------------------------------------------

alter table public.education_criteria
  add column if not exists allow_higher_qualification boolean not null default true,
  add column if not exists accepted_equivalent_qualifications jsonb not null default '[]'::jsonb,
  add column if not exists raw_requirement_text text;

--------------------------------------------------
-- P1.7 STRUCTURED AGE RELAXATION RULES
--------------------------------------------------

create table if not exists public.age_relaxation_rules (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reservation_category text,
  condition_key text,
  additional_years integer not null default 0,
  max_age_cap integer,
  cumulative boolean not null default false,
  source_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_age_relaxation_rules_post
  on public.age_relaxation_rules(post_id);

--------------------------------------------------
-- P1.8 EXAM PATTERN AND SKILL TESTS
--------------------------------------------------

create table if not exists public.exam_patterns (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  stage_name text not null,
  section_name text,
  question_count integer,
  marks integer,
  duration_minutes integer,
  negative_marking text,
  sort_order integer default 0,
  source_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_tests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  test_type text not null,
  speed_requirement text,
  duration_minutes integer,
  evaluation_formula text,
  source_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_exam_patterns_post
  on public.exam_patterns(post_id);

create index if not exists idx_skill_tests_post
  on public.skill_tests(post_id);

notify pgrst, 'reload schema';
