# Verified Domain Gap Action Plan

This document converts the uploaded recruitment-notification gap analysis into an implementation backlog verified against the current `ccp-mainbuild-v1` codebase and active clean Supabase baseline.

## Verification inputs

Reviewed repo areas:

- `app/supabase/migrations/002_core_runtime_schema.sql`
- `app/supabase/migrations/010_live_runtime_schema_hotfix.sql`
- `app/backend/app/api/canonical.py`
- `app/backend/app/api/admin_scrape.py`
- `app/backend/app/eligibility/runner.py`
- `app/backend/app/eligibility/engine.py`
- `app/backend/app/eligibility/schemas.py`
- `app/backend/app/profile/eligibility_mapper.py`
- `docs/schema/profile_schema_lineage_audit.md`

Reviewed uploaded analysis:

- `Pasted text.txt` / recruitment-domain gap analysis from the conversation.

## Current-state corrections

The uploaded analysis is directionally useful, but it mixes the old/full schema, legacy migrations, and the current clean baseline. Do not implement it as-is.

### Confirmed current facts

- The active domain model is recruitment-centric. There is no active `public.exams` table used by the backend.
- `recruitments`, `posts`, and `organizations` are the core recruitment objects.
- Aspirant profile data is split between `profiles` and normalized `aspirant_*` tables.
- Eligibility currently runs against `posts`, `age_criteria`, `education_criteria`, `certification_criteria`, `attempt_limits`, and user profile/education/certification/attempt/credential data.
- Current clean baseline now has a runtime hotfix migration `010_live_runtime_schema_hotfix.sql` for queue, notification, application, study, and eligibility result columns.

### Stale or unsupported claims in the uploaded analysis

Do not treat these as current active-schema facts:

- `experience_criteria` is not active in the current clean baseline or eligibility runner.
- `posts.selection_method` is not active in the current clean baseline.
- `v_recruitment_ranking` is not part of the current clean-baseline view set.
- `age_criteria` does not currently have a structured relaxations JSON column in the active clean baseline.
- The old `user_exam_attempts` mismatch is partly resolved: current code uses `aspirant_exam_attempts` through the eligibility mapper and only keeps a legacy fallback in the runner.

## P0: stabilize schema-code contract before domain expansion

Do this before adding recruitment-domain complexity.

### P0.1 Add schema contract tests

Create tests that assert the current Supabase schema has the columns the backend expects.

Suggested file:

`app/backend/tests/test_schema_contract.py`

Required tables to check first:

- `profiles`
- `recruitments`
- `posts`
- `eligibility_results`
- `eligibility_recompute_queue`
- `scrape_queue`
- `notification_documents`
- `extracted_field_evidence`
- `notification_alerts`
- `user_recruitment_applications`

Acceptance criteria:

- Test fails clearly when a backend-required column is missing.
- Test can run against the linked new Supabase project using service-role credentials.
- Test does not require Docker.

### P0.2 Keep recompute queue status consistent

Current safe target:

- Python enqueue path may create `status='pending'`.
- SQL claim function should continue accepting both `pending` and `queued` until all old callers are gone.

Acceptance criteria:

- `claim_eligibility_queue()` claims rows with `status in ('pending', 'queued')`.
- No worker path assumes only `queued`.
- Add a regression test or SQL verification query.

### P0.3 Remove secrets and generated Supabase temp files from Git

`supabase/.temp` and `app/supabase/.temp` are local CLI state and must not be tracked.

Acceptance criteria:

- `.gitignore` ignores both temp folders.
- Existing tracked temp files are removed from the repository.
- No pooler URL, project ref, CLI state, or generated version marker is committed.

## P1: verified recruitment-notification schema backlog

These gaps are confirmed against the active code/schema and should be implemented as separate migrations after P0 tests pass.

### P1.1 Multi-unit recruitment support

Problem:

Current `recruitments` has a single `organization_id`. Multi-unit notifications need parent organization plus multiple units and candidate unit preferences.

Add:

```sql
create table public.recruitment_units (
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
```

Backend follow-up:

- Update scraper promotion to create units when extracted data contains unit-wise posts.
- Update recruitment detail API to return units and post-unit mapping.

Acceptance criteria:

- One recruitment can expose multiple units.
- A post may optionally be tied to a unit.
- Existing single-organization recruitments continue working.

### P1.2 Horizontal reservation and backlog vacancies

Problem:

Current `vacancies(post_id, category, vacancy_count)` only represents vertical categories.

Prefer a new table over widening `vacancies`:

```sql
create table public.vacancy_reservations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  vertical_category text,
  horizontal_category text,
  vacancy_count integer not null default 0 check (vacancy_count >= 0),
  is_backlog boolean not null default false,
  source_note text,
  created_at timestamptz not null default now()
);

create index idx_vacancy_reservations_post
  on public.vacancy_reservations(post_id);
```

Acceptance criteria:

- UR/EWS/SC/ST/OBC can be stored separately from PwBD/Ex-serviceman horizontal reservations.
- Backlog vacancies can be represented without overloading category names.
- Existing `vacancies` table can remain for simple totals and UI compatibility.

### P1.3 Disability and physical requirement compatibility

Problem:

Current engine only handles broad PwBD age relaxation. It does not model disability codes or post physical suitability.

Add reference tables:

```sql
create table public.disability_types (
  code text primary key,
  description text not null,
  is_active boolean not null default true
);

create table public.physical_requirement_types (
  code text primary key,
  description text not null,
  is_active boolean not null default true
);

create table public.post_disability_requirements (
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
```

Backend follow-up:

- Extend `EligibilityProfile.reservations` to include `disability_code`.
- Add a post-compatibility check in `eligibility/engine.py`.

Acceptance criteria:

- A post can be marked suitable/unsuitable for specific disability categories.
- Candidate disability code can be matched deterministically.
- Existing broad `pwbd_status` remains as compatibility fallback.

### P1.4 EWS details

Problem:

Current engine can normalize category `ews`, but there is no family income/assets model.

Add minimally:

```sql
alter table public.aspirant_reservations
  add column if not exists family_income_annual numeric(12,2),
  add column if not exists ews_assets jsonb not null default '{}'::jsonb,
  add column if not exists ews_certificate_available boolean;
```

Backend follow-up:

- Do not fail candidates only because these fields are missing until onboarding captures them.
- Add completion warning: `EWS details incomplete`.

Acceptance criteria:

- EWS can be represented beyond category text.
- Eligibility engine can later distinguish declared EWS from verifiable EWS.

### P1.5 Language requirements

Problem:

No active language requirement model exists.

Add:

```sql
alter table public.posts
  add column if not exists language_requirements text[] not null default '{}'::text[];

alter table public.aspirant_preferences
  add column if not exists languages_known text[] not null default '{}'::text[],
  add column if not exists preferred_language text;
```

Backend follow-up:

- Add language check in eligibility engine as conditional/fail depending requirement type.
- Update profile/onboarding to capture languages later.

Acceptance criteria:

- Posts requiring Marathi or other languages can be represented.
- Matching logic can be added without changing recruitment shape again.

### P1.6 Education equivalence and higher qualification control

Problem:

The current engine generally accepts higher education ranks. Some notices require exact diploma/discipline or define acceptable equivalents.

Add:

```sql
alter table public.education_criteria
  add column if not exists allow_higher_qualification boolean not null default true,
  add column if not exists accepted_equivalent_qualifications jsonb not null default '[]'::jsonb,
  add column if not exists raw_requirement_text text;
```

Backend follow-up:

- Update `EducationCriteria` Pydantic schema.
- Update engine logic to respect `allow_higher_qualification=false`.

Acceptance criteria:

- Generic higher-degree acceptance remains default.
- Exact qualification requirements can be enforced when notice demands it.

### P1.7 Structured age relaxation rules

Problem:

Current age relaxation is hardcoded in `eligibility/engine.py`. This is insufficient for notice-specific rules.

Add:

```sql
create table public.age_relaxation_rules (
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

create index idx_age_relaxation_rules_post
  on public.age_relaxation_rules(post_id);
```

Backend follow-up:

- Extend runner to select `age_relaxation_rules` with posts.
- Update engine to calculate notice-specific relaxation before fallback rules.

Acceptance criteria:

- Widow, PwBD, ex-serviceman, category, and notice-specific caps can be modeled per post.
- Existing hardcoded default remains fallback only.

### P1.8 Exam pattern and skill tests

Problem:

Study OS cannot generate reliable plans from notices because exam sections, marks, duration, and skill tests are not modeled.

Add:

```sql
create table public.exam_patterns (
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

create table public.skill_tests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  test_type text not null,
  speed_requirement text,
  duration_minutes integer,
  evaluation_formula text,
  source_note text,
  created_at timestamptz not null default now()
);
```

Backend follow-up:

- Update recruitment detail endpoint to include exam pattern and skill tests.
- Later update Study OS planner to consume these tables.

Acceptance criteria:

- Dashboard can display exam scheme from DB data.
- Study plan can eventually use sections and duration.

## P2: code cleanup after domain migrations

### P2.1 Remove stale fallback assumptions

After migrations and data backfill are stable:

- Remove or isolate fallback to `user_exam_attempts`.
- Stop relying on scalar profile education fields for canonical decisions.
- Prefer `date_of_birth` as canonical DOB write target while reading `dob` as fallback.

### P2.2 Wire profile completeness to normalized tables

Ensure completion logic uses:

- identity: `profiles`
- education: `aspirant_education`
- reservations/location: `aspirant_reservations` + `aspirant_location`
- preferences: `aspirant_preferences`
- certifications: `aspirant_certifications`
- experience: `aspirant_experience`

## Recommended implementation order

1. P0 schema contract tests.
2. P0 temp-file cleanup.
3. P1.1 recruitment units.
4. P1.2 vacancy reservations.
5. P1.3 disability and physical requirements.
6. P1.6 education equivalence controls.
7. P1.7 age relaxation rules.
8. P1.5 language requirements.
9. P1.4 EWS details.
10. P1.8 exam pattern and skill tests.
11. P2 code cleanup.

## Non-goals for the first implementation PR

Do not add all domain tables at once. Each P1 module should be its own migration + backend mapper/test PR.

Do not reintroduce the legacy migration chain.

Do not implement roadmap-only views such as `v_recruitment_ranking` unless the current backend/frontend explicitly consumes them.
