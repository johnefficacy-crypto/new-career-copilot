-- exam_intelligence_demo_ssc_cgl.sql
-- DEMO / DEVELOPMENT seed — NOT production truth.
--
-- A coherent SSC CGL 2026 vertical slice that exercises every Study OS
-- input group, so the Phase 7 planner has real rows to run against before
-- a true content pipeline exists:
--
--   Exam Intelligence  : exam family/exam/cycle/phases/sections, subject +
--                        topic taxonomy, topic prerequisites, locked
--                        exam_topic_coverage, verified syllabus mentions,
--                        verified PYQ papers/questions/topic tags.
--   Competition Intel  : one locked exam_competition_metrics row.
--   Policy / Update    : one verified official update + one unverified
--                        aggregator discovery.
--
-- All rows use deterministic UUIDs and `on conflict (id) do nothing`, so
-- this file is safe to re-run. `reviewed_by` is left NULL (no real admin
-- profile to reference); reviewer_status / reviewed_at are still set so
-- the verified-only readers treat the data as planner-ready.
--
-- Apply with:  psql "$DATABASE_URL" -f exam_intelligence_demo_ssc_cgl.sql

begin;

-- ── Exam registry ────────────────────────────────────────────────────────
insert into public.exam_families (id, slug, name, description) values
  ('11111111-1111-1111-1111-111111111111', 'ssc', 'Staff Selection Commission',
   'Central government recruitment via the Staff Selection Commission.')
on conflict (id) do nothing;

insert into public.exams (id, exam_family_id, slug, name, exam_type, default_difficulty_level, description) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'ssc-cgl', 'SSC CGL', 'recruitment', 'medium_high',
   'Combined Graduate Level examination for Group B and Group C posts.')
on conflict (id) do nothing;

insert into public.exam_cycles
  (id, exam_id, year, cycle_name, status, notification_date, application_start,
   application_end, exam_start, exam_end, source_url) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   2026, 'SSC CGL 2026', 'open', '2026-04-01', '2026-04-05', '2026-05-31',
   '2026-09-15', '2026-09-25', 'https://ssc.gov.in/')
on conflict (id) do nothing;

insert into public.exam_phases
  (id, exam_id, exam_cycle_id, phase_name, phase_slug, phase_order, mode,
   duration_mins, total_questions, total_marks, negative_marking, status) values
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'Tier 1', 'tier-1', 1, 'cbt',
   60, 100, 200, '0.50 per wrong answer', 'active'),
  ('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'Tier 2', 'tier-2', 2, 'cbt',
   150, 150, 450, '1.00 per wrong answer', 'expected')
on conflict (id) do nothing;

-- ── Subject / topic taxonomy ─────────────────────────────────────────────
insert into public.subjects (id, slug, name, subject_group, default_difficulty_level) values
  ('55555555-5555-5555-5555-555555555551', 'quantitative-aptitude', 'Quantitative Aptitude', 'numerical', 'medium_high'),
  ('55555555-5555-5555-5555-555555555552', 'english-language', 'English Language', 'verbal', 'medium'),
  ('55555555-5555-5555-5555-555555555553', 'general-intelligence-reasoning', 'General Intelligence & Reasoning', 'reasoning', 'medium')
on conflict (id) do nothing;

insert into public.topics (id, subject_id, slug, name, level, default_difficulty_level) values
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555551', 'percentage', 'Percentage', 'topic', 'medium'),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555551', 'profit-and-loss', 'Profit and Loss', 'topic', 'medium_high'),
  ('66666666-6666-6666-6666-666666666663', '55555555-5555-5555-5555-555555555551', 'data-interpretation', 'Data Interpretation', 'topic', 'high'),
  ('66666666-6666-6666-6666-666666666664', '55555555-5555-5555-5555-555555555551', 'time-and-work', 'Time and Work', 'topic', 'medium'),
  ('66666666-6666-6666-6666-666666666665', '55555555-5555-5555-5555-555555555552', 'reading-comprehension', 'Reading Comprehension', 'topic', 'medium'),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555552', 'vocabulary', 'Vocabulary', 'topic', 'medium'),
  ('66666666-6666-6666-6666-666666666667', '55555555-5555-5555-5555-555555555553', 'coding-decoding', 'Coding-Decoding', 'topic', 'medium')
on conflict (id) do nothing;

-- Prerequisite edges — Percentage underpins the other Quant topics.
insert into public.topic_prerequisites
  (id, topic_id, prerequisite_topic_id, relation_type, strength, source_basis) values
  ('77777777-7777-7777-7777-777777777771', '66666666-6666-6666-6666-666666666662',
   '66666666-6666-6666-6666-666666666661', 'requires', 0.9, 'admin_review'),
  ('77777777-7777-7777-7777-777777777772', '66666666-6666-6666-6666-666666666663',
   '66666666-6666-6666-6666-666666666661', 'requires', 0.8, 'admin_review'),
  ('77777777-7777-7777-7777-777777777773', '66666666-6666-6666-6666-666666666664',
   '66666666-6666-6666-6666-666666666661', 'recommended_before', 0.6, 'admin_review')
on conflict (id) do nothing;

-- ── Phase sections (Tier 1 weightage) ────────────────────────────────────
insert into public.exam_phase_sections
  (id, exam_phase_id, subject_id, section_label, question_count, marks, weightage_percent, sort_order) values
  ('88888888-8888-8888-8888-888888888881', '44444444-4444-4444-4444-444444444441',
   '55555555-5555-5555-5555-555555555551', 'Quantitative Aptitude', 25, 50, 25, 1),
  ('88888888-8888-8888-8888-888888888882', '44444444-4444-4444-4444-444444444441',
   '55555555-5555-5555-5555-555555555552', 'English Comprehension', 25, 50, 25, 2),
  ('88888888-8888-8888-8888-888888888883', '44444444-4444-4444-4444-444444444441',
   '55555555-5555-5555-5555-555555555553', 'General Intelligence & Reasoning', 25, 50, 25, 3)
on conflict (id) do nothing;

-- ── Locked topic coverage (planner-ready exam intelligence) ──────────────
insert into public.exam_topic_coverage
  (id, exam_id, exam_cycle_id, exam_phase_id, topic_id, coverage_depth,
   expected_difficulty, exam_priority_score, is_high_yield, confidence_score,
   source_basis, reviewer_status, reviewed_at) values
  ('99999999-9999-9999-9999-999999999991', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666661', 'core', 'medium', 88, true, 0.86,
   'hybrid', 'locked', '2026-05-02T00:00:00+00:00'),
  ('99999999-9999-9999-9999-999999999992', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666662', 'deep', 'medium_high', 80, true, 0.81,
   'pyq_analysis', 'locked', '2026-05-02T00:00:00+00:00'),
  ('99999999-9999-9999-9999-999999999993', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666663', 'core', 'high', 85, true, 0.83,
   'pyq_analysis', 'locked', '2026-05-02T00:00:00+00:00'),
  ('99999999-9999-9999-9999-999999999994', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666664', 'normal', 'medium', 62, false, 0.7,
   'official_syllabus', 'locked', '2026-05-02T00:00:00+00:00'),
  ('99999999-9999-9999-9999-999999999995', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666665', 'deep', 'medium', 78, true, 0.79,
   'hybrid', 'locked', '2026-05-02T00:00:00+00:00'),
  ('99999999-9999-9999-9999-999999999996', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666666', 'normal', 'medium', 55, false, 0.66,
   'official_syllabus', 'locked', '2026-05-02T00:00:00+00:00'),
  ('99999999-9999-9999-9999-999999999997', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   '66666666-6666-6666-6666-666666666667', 'normal', 'medium', 70, true, 0.74,
   'pyq_analysis', 'locked', '2026-05-02T00:00:00+00:00')
on conflict (id) do nothing;

-- ── Syllabus evidence (verified mentions) ────────────────────────────────
insert into public.syllabus_documents
  (id, exam_id, exam_cycle_id, document_type, title, source_url, trust_status, published_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'syllabus_pdf', 'SSC CGL 2026 Tier 1 Syllabus',
   'https://ssc.gov.in/cgl-2026-syllabus.pdf', 'verified', '2026-04-01T00:00:00+00:00')
on conflict (id) do nothing;

insert into public.syllabus_topic_mentions
  (id, syllabus_document_id, exam_id, exam_cycle_id, exam_phase_id, topic_id,
   raw_text, normalized_text, mention_type, confidence_score, reviewer_status, reviewed_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444441', '66666666-6666-6666-6666-666666666661',
   'Percentage', 'percentage', 'explicit', 0.95, 'verified', '2026-04-10T00:00:00+00:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444441', '66666666-6666-6666-6666-666666666662',
   'Profit & Loss, Discount', 'profit and loss discount', 'explicit', 0.92, 'verified', '2026-04-10T00:00:00+00:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444441', '66666666-6666-6666-6666-666666666663',
   'Data Interpretation (tables, bar graphs, pie charts)', 'data interpretation', 'explicit', 0.9, 'verified', '2026-04-10T00:00:00+00:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444441', '66666666-6666-6666-6666-666666666664',
   'Time and Work', 'time and work', 'explicit', 0.88, 'verified', '2026-04-10T00:00:00+00:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444441', '66666666-6666-6666-6666-666666666665',
   'Reading Comprehension', 'reading comprehension', 'explicit', 0.93, 'verified', '2026-04-10T00:00:00+00:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444441', '66666666-6666-6666-6666-666666666667',
   'Coding-Decoding', 'coding decoding', 'explicit', 0.9, 'verified', '2026-04-10T00:00:00+00:00')
on conflict (id) do nothing;

-- ── PYQ intelligence (verified papers, questions, topic tags) ────────────
insert into public.pyq_sources (id, exam_id, source_type, source_url, title, trust_status) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '22222222-2222-2222-2222-222222222222',
   'official', 'https://ssc.gov.in/cgl-previous-papers', 'SSC CGL official archive', 'verified')
on conflict (id) do nothing;

insert into public.pyq_papers
  (id, pyq_source_id, exam_id, exam_phase_id, year, paper_date, shift, source_type, trust_status) values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
   '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444441',
   2024, '2024-09-12', 'Shift 1', 'official', 'verified'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
   '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444441',
   2023, '2023-07-14', 'Shift 2', 'official', 'verified')
on conflict (id) do nothing;

insert into public.pyq_questions
  (id, pyq_paper_id, question_number, question_text, question_type,
   observed_difficulty, expected_solve_time_sec, reviewer_status) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
   3, 'A number increased by 20% then decreased by 20% — net change?', 'mcq', 'easy', 45, 'verified'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
   11, 'An article sold at 15% profit; had it been sold for Rs 60 more...', 'mcq', 'medium', 75, 'verified'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3', 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
   22, 'The pie chart shows expenditure — find the central angle for...', 'mcq', 'medium_high', 90, 'verified'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4', 'dddddddd-dddd-dddd-dddd-ddddddddddd2',
   7, 'A can do a work in 12 days, B in 18 days — together?', 'mcq', 'medium', 70, 'verified'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'dddddddd-dddd-dddd-dddd-ddddddddddd2',
   14, 'Two successive discounts of 10% and 20% equal a single discount of?', 'mcq', 'medium', 60, 'verified'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6', 'dddddddd-dddd-dddd-dddd-ddddddddddd2',
   28, 'If COLD is coded as DPME, then WARM is coded as?', 'mcq', 'easy', 40, 'verified')
on conflict (id) do nothing;

-- Verified question -> topic tags (both question and tag must be verified
-- for the verified-only PYQ readers to count them).
insert into public.pyq_question_topic_tags
  (id, question_id, topic_id, tag_weight, tag_role, tagging_source, confidence_score, reviewer_status, reviewed_at) values
  ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   '66666666-6666-6666-6666-666666666661', 1.0, 'primary', 'admin', 0.95, 'verified', '2026-05-01T00:00:00+00:00'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
   '66666666-6666-6666-6666-666666666662', 1.0, 'primary', 'admin', 0.93, 'verified', '2026-05-01T00:00:00+00:00'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff3', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',
   '66666666-6666-6666-6666-666666666663', 1.0, 'primary', 'admin', 0.9, 'verified', '2026-05-01T00:00:00+00:00'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff4', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee4',
   '66666666-6666-6666-6666-666666666664', 1.0, 'primary', 'admin', 0.92, 'verified', '2026-05-01T00:00:00+00:00'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff5', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5',
   '66666666-6666-6666-6666-666666666662', 0.8, 'secondary', 'admin', 0.88, 'verified', '2026-05-01T00:00:00+00:00'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff6', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee6',
   '66666666-6666-6666-6666-666666666667', 1.0, 'primary', 'admin', 0.91, 'verified', '2026-05-01T00:00:00+00:00')
on conflict (id) do nothing;

-- ── Competition intelligence (locked) ────────────────────────────────────
insert into public.exam_competition_metrics
  (id, exam_id, exam_cycle_id, exam_phase_id, vacancy_total, vacancy_by_category,
   applicant_count, selection_ratio, cutoff_trend, difficulty_trend,
   competition_pressure_score, source_basis, confidence_score, evidence_count,
   reviewer_status, reviewed_at, reviewer_notes) values
  ('12121212-1212-1212-1212-121212121201', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444441',
   17727,
   '{"UR": 7000, "OBC": 4800, "SC": 2700, "ST": 1300, "EWS": 1900}'::jsonb,
   2500000, 0.007091,
   '{"last_year_cutoff": 153.5, "three_year_avg": 150.1, "trend": "rising"}'::jsonb,
   '{"expected_difficulty": "medium_high", "volatility": "high", "basis": "pyq_analysis"}'::jsonb,
   78, 'reviewed_analysis', 0.76, 5, 'locked', '2026-05-03T00:00:00+00:00',
   'Vacancy and applicant counts cross-checked against the official notification + prior cycle.')
on conflict (id) do nothing;

-- ── Policy / Update intelligence ─────────────────────────────────────────
-- 1) Verified official update — may carry affects_* flags.
insert into public.exam_policy_updates
  (id, exam_id, exam_cycle_id, update_type, title, summary, source_url,
   source_type, claim_status, reviewer_status, affects_plan, affects_vacancy,
   change_summary, published_at, effective_from, reviewed_at) values
  ('13131313-1313-1313-1313-131313131301', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'vacancy_change',
   'SSC CGL 2026 vacancies revised upward',
   'The Commission revised the total vacancy count for SSC CGL 2026 from 15,000 to 17,727.',
   'https://ssc.gov.in/cgl-2026-vacancy-addendum',
   'official', 'official_confirmed', 'verified', true, true,
   '{"field": "vacancy_total", "old_value": 15000, "new_value": 17727, "delta": 2727}'::jsonb,
   '2026-05-12T00:00:00+00:00', '2026-05-12', '2026-05-12T06:00:00+00:00')
on conflict (id) do nothing;

-- 2) Unverified aggregator discovery — discovery-only, all affects_* false
--    (enforced by the exam_policy_updates_non_official_no_effect constraint).
insert into public.exam_policy_updates
  (id, exam_id, exam_cycle_id, update_type, title, summary, source_url,
   source_type, claim_status, reviewer_status, change_summary, published_at) values
  ('13131313-1313-1313-1313-131313131302', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'date_change',
   'Aggregator rumor: Tier 1 exam window may shift to October',
   'An aggregator site claims the Tier 1 window could move to October 2026. No official source — surfaced for awareness only.',
   'https://example-aggregator.test/ssc-cgl-date-rumor',
   'aggregator', 'unverified', 'pending',
   '{"claimed_change": "tier_1_window", "claimed_value": "October 2026"}'::jsonb,
   '2026-05-10T00:00:00+00:00')
on conflict (id) do nothing;

commit;
