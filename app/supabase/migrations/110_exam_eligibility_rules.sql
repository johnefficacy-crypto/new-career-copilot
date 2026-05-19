-- 110_exam_eligibility_rules.sql
--
-- Core architecture for exam-LEVEL baseline eligibility (PR-D1).
--
-- Important conceptual split:
--   * Recruitment-level eligibility (already exists) needs deep per-vacancy
--     data and is computed by ``eligibility_runner`` from the user's
--     normalized profile against ``age_criteria``, ``education_criteria``,
--     and ``recruitment_question_requirements`` rows.
--   * Exam-level baseline eligibility (this migration) is the answer to the
--     coarser question: "based on what we know about you, do you appear
--     eligible for SSC CGL?" — the exam's *published baseline rules*, not
--     any specific cycle's vacancy details. Safer to surface at onboarding
--     when only DOB/category/education_level are known.
--
-- Schema (one normalized table, easy for admin CRUD):
--   exam_eligibility_rules(exam_id, scope, rule_type, value_num | value_text,
--                          cutoff_date_basis, source_url, source_notes,
--                          reviewer_status, verified_by, verified_at)
--
-- ``scope`` selects the rule that applies to a given user:
--   * ``all``   — applies to everyone (baseline)
--   * ``general``/``obc``/``sc``/``st``/``ews`` — reservation category
--   * ``pwd``   — Person with Disability (treated as an alternative scope
--                 in PR-D1; future PR can model PWD as a stacking
--                 relaxation on top of category)
--   * ``ex_serviceman``/``women`` — flag-based scopes
--
-- ``rule_type`` controls how the row is interpreted:
--   age_min, age_max          → integer years, lives in value_num
--   attempts_max              → integer, value_num
--   education_min_level       → enum string, value_text (10th < 12th <
--                               diploma < graduation < post_graduation < phd)
--   nationality, gender       → enum string, value_text
--
-- ``reviewer_status`` gates evaluator visibility: only ``verified`` rows
-- feed the user-facing eligibility summary. ``draft`` rows are admin
-- work-in-progress; ``archived`` rows are kept for audit trail.

create table if not exists public.exam_eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  scope text not null default 'all'
    check (scope in ('all','general','obc','sc','st','ews','pwd','ex_serviceman','women')),
  rule_type text not null
    check (rule_type in ('age_min','age_max','education_min_level','nationality','gender','attempts_max')),
  value_num numeric,
  value_text text,
  cutoff_date_basis text
    check (cutoff_date_basis is null or cutoff_date_basis in ('cycle_notification','fixed_date')),
  cutoff_date date,
  is_knockout boolean not null default true,
  source_url text,
  source_notes text,
  reviewer_status text not null default 'draft'
    check (reviewer_status in ('draft','verified','archived')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, scope, rule_type)
);

create index if not exists idx_eer_exam_status
  on public.exam_eligibility_rules(exam_id, reviewer_status);

alter table public.exam_eligibility_rules enable row level security;
-- Service role only; the admin tool (PR-D2) will write via service role.

-- ─── Seed exam_families ──────────────────────────────────────────────────
-- Idempotent: skip slugs that already exist.
insert into public.exam_families (slug, name) values
  ('upsc','Union Public Service Commission'),
  ('ssc','Staff Selection Commission'),
  ('rrb','Railway Recruitment Boards'),
  ('ibps','Institute of Banking Personnel Selection'),
  ('sbi','State Bank of India'),
  ('rbi','Reserve Bank of India'),
  ('sebi','Securities and Exchange Board of India')
on conflict (slug) do nothing;

-- ─── Seed exams ──────────────────────────────────────────────────────────
insert into public.exams (slug, name, exam_type, exam_family_id)
select v.slug, v.name, 'recruitment', f.id
from (values
  ('upsc-cse',     'UPSC Civil Services Examination', 'upsc'),
  ('ssc-cgl',      'SSC Combined Graduate Level',     'ssc'),
  ('rrb-ntpc',     'RRB Non-Technical Popular Categories', 'rrb'),
  ('ibps-po',      'IBPS Probationary Officer',       'ibps'),
  ('sbi-po',       'SBI Probationary Officer',        'sbi'),
  ('rbi-grade-b',  'RBI Grade B Officer',             'rbi'),
  ('sebi-grade-a', 'SEBI Grade A Officer',            'sebi')
) as v(slug, name, family_slug)
join public.exam_families f on f.slug = v.family_slug
on conflict (slug) do nothing;

-- ─── Seed eligibility rules ──────────────────────────────────────────────
-- All rules marked reviewer_status='verified' so the summary endpoint
-- picks them up immediately. PR-D2 (admin tool) will let staff add/edit
-- and move rows between draft → verified.
--
-- Numbers below reflect the long-standing published baselines as of the
-- 2024-2025 cycles. Admin curation is expected to keep them current.

insert into public.exam_eligibility_rules
  (exam_id, scope, rule_type, value_num, value_text, source_url, reviewer_status)
select e.id, r.scope, r.rule_type, r.value_num, r.value_text, r.source_url, 'verified'
from public.exams e
join (values
  -- UPSC CSE
  ('upsc-cse', 'all',     'age_min',             21::numeric, null::text,   'https://upsc.gov.in/'),
  ('upsc-cse', 'general', 'age_max',             32::numeric, null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'obc',     'age_max',             35::numeric, null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'sc',      'age_max',             37::numeric, null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'st',      'age_max',             37::numeric, null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'ews',     'age_max',             32::numeric, null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'pwd',     'age_max',             42::numeric, null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'all',     'education_min_level', null,        'graduation', 'https://upsc.gov.in/'),
  ('upsc-cse', 'all',     'nationality',         null,        'Indian',     'https://upsc.gov.in/'),
  ('upsc-cse', 'general', 'attempts_max',        6::numeric,  null,         'https://upsc.gov.in/'),
  ('upsc-cse', 'obc',     'attempts_max',        9::numeric,  null,         'https://upsc.gov.in/'),

  -- SSC CGL
  ('ssc-cgl',  'all',     'age_min',             18::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'general', 'age_max',             32::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'obc',     'age_max',             35::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'sc',      'age_max',             37::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'st',      'age_max',             37::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'ews',     'age_max',             32::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'pwd',     'age_max',             42::numeric, null,         'https://ssc.gov.in/'),
  ('ssc-cgl',  'all',     'education_min_level', null,        'graduation', 'https://ssc.gov.in/'),
  ('ssc-cgl',  'all',     'nationality',         null,        'Indian',     'https://ssc.gov.in/'),

  -- RRB NTPC (graduate level)
  ('rrb-ntpc', 'all',     'age_min',             18::numeric, null,         'https://indianrailways.gov.in/'),
  ('rrb-ntpc', 'general', 'age_max',             33::numeric, null,         'https://indianrailways.gov.in/'),
  ('rrb-ntpc', 'obc',     'age_max',             36::numeric, null,         'https://indianrailways.gov.in/'),
  ('rrb-ntpc', 'sc',      'age_max',             38::numeric, null,         'https://indianrailways.gov.in/'),
  ('rrb-ntpc', 'st',      'age_max',             38::numeric, null,         'https://indianrailways.gov.in/'),
  ('rrb-ntpc', 'all',     'education_min_level', null,        'graduation', 'https://indianrailways.gov.in/'),
  ('rrb-ntpc', 'all',     'nationality',         null,        'Indian',     'https://indianrailways.gov.in/'),

  -- IBPS PO
  ('ibps-po',  'all',     'age_min',             20::numeric, null,         'https://ibps.in/'),
  ('ibps-po',  'general', 'age_max',             30::numeric, null,         'https://ibps.in/'),
  ('ibps-po',  'obc',     'age_max',             33::numeric, null,         'https://ibps.in/'),
  ('ibps-po',  'sc',      'age_max',             35::numeric, null,         'https://ibps.in/'),
  ('ibps-po',  'st',      'age_max',             35::numeric, null,         'https://ibps.in/'),
  ('ibps-po',  'pwd',     'age_max',             40::numeric, null,         'https://ibps.in/'),
  ('ibps-po',  'all',     'education_min_level', null,        'graduation', 'https://ibps.in/'),
  ('ibps-po',  'all',     'nationality',         null,        'Indian',     'https://ibps.in/'),

  -- SBI PO
  ('sbi-po',   'all',     'age_min',             21::numeric, null,         'https://sbi.co.in/'),
  ('sbi-po',   'general', 'age_max',             30::numeric, null,         'https://sbi.co.in/'),
  ('sbi-po',   'obc',     'age_max',             33::numeric, null,         'https://sbi.co.in/'),
  ('sbi-po',   'sc',      'age_max',             35::numeric, null,         'https://sbi.co.in/'),
  ('sbi-po',   'st',      'age_max',             35::numeric, null,         'https://sbi.co.in/'),
  ('sbi-po',   'all',     'education_min_level', null,        'graduation', 'https://sbi.co.in/'),
  ('sbi-po',   'all',     'nationality',         null,        'Indian',     'https://sbi.co.in/'),

  -- RBI Grade B
  ('rbi-grade-b','all',   'age_min',             21::numeric, null,         'https://rbi.org.in/'),
  ('rbi-grade-b','general','age_max',            30::numeric, null,         'https://rbi.org.in/'),
  ('rbi-grade-b','obc',   'age_max',             33::numeric, null,         'https://rbi.org.in/'),
  ('rbi-grade-b','sc',    'age_max',             32::numeric, null,         'https://rbi.org.in/'),
  ('rbi-grade-b','st',    'age_max',             32::numeric, null,         'https://rbi.org.in/'),
  ('rbi-grade-b','all',   'education_min_level', null,        'graduation', 'https://rbi.org.in/'),
  ('rbi-grade-b','all',   'nationality',         null,        'Indian',     'https://rbi.org.in/'),

  -- SEBI Grade A
  ('sebi-grade-a','all',  'age_min',             21::numeric, null,         'https://sebi.gov.in/'),
  ('sebi-grade-a','general','age_max',           30::numeric, null,         'https://sebi.gov.in/'),
  ('sebi-grade-a','obc',  'age_max',             33::numeric, null,         'https://sebi.gov.in/'),
  ('sebi-grade-a','sc',   'age_max',             35::numeric, null,         'https://sebi.gov.in/'),
  ('sebi-grade-a','st',   'age_max',             35::numeric, null,         'https://sebi.gov.in/'),
  ('sebi-grade-a','all',  'education_min_level', null,        'graduation', 'https://sebi.gov.in/'),
  ('sebi-grade-a','all',  'nationality',         null,        'Indian',     'https://sebi.gov.in/')
) as r(exam_slug, scope, rule_type, value_num, value_text, source_url)
  on e.slug = r.exam_slug
on conflict (exam_id, scope, rule_type) do nothing;

notify pgrst, 'reload schema';
