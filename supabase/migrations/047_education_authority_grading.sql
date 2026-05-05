create table if not exists public.education_authorities (
  id uuid primary key default gen_random_uuid(),
  official_name text not null,
  normalized_name text not null,
  aliases text[],
  authority_type text not null check (authority_type in (
    'central_board','state_board','central_university','state_university',
    'deemed_university','open_university','technical_university',
    'medical_council','professional_council','iti_ncvt','iti_scvt','other'
  )),
  state text,
  official_website text,
  recognition_status text not null default 'recognized' check (recognition_status in ('recognized','provisional','de_recognized','unknown')),
  last_verified_at timestamptz,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.grading_conversion_rules (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid references public.education_authorities(id),
  grading_system text not null check (grading_system in ('percentage','cgpa_10','cgpa_9','cgpa_7','gpa_4','letter_grade','division','semester_gpa','aggregate_marks')),
  scale numeric,
  formula_expression text,
  applicable_from_year int,
  applicable_to_year int,
  source_url text,
  verification_status text not null default 'unverified' check (verification_status in ('verified','unverified','authority_published')),
  created_at timestamptz not null default now()
);
