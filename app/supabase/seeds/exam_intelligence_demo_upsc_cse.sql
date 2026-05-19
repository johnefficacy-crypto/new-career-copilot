-- exam_intelligence_demo_upsc_cse.sql
-- Phase 12 pilot seed — UPSC CSE.
--
-- Adds multi-year cycles (2021, 2022, 2023, 2024, 2025) plus reviewed
-- competition metrics rows so the aspirant-facing Exam Intelligence tab
-- has real data to render:
--   * PYQ availability trend (line)
--   * Cutoff trend by category (line)
--   * Vacancy history (bars)
--   * Difficulty heatmap (subject × difficulty)
--   * Verified PYQ paper list
--
-- The cutoff_trend / vacancy_by_category jsonb shapes follow the contract
-- in app/backend/app/exam_intelligence/competition.py:
--   cutoff_trend       : {"<category>": <marks>}
--   vacancy_by_category: {"<category>": <count>}
--
-- All rows use deterministic UUIDs and `on conflict (id) do nothing`, so
-- this file is safe to re-run. Apply with:
--   psql "$DATABASE_URL" -f exam_intelligence_demo_upsc_cse.sql

begin;

-- ── Exam registry ────────────────────────────────────────────────────────
insert into public.exam_families (id, slug, name, description) values
  ('a0000001-0000-0000-0000-000000000001', 'upsc',
   'Union Public Service Commission',
   'Premier central recruitment for All-India services and Group A officers.')
on conflict (id) do nothing;

insert into public.exams (id, exam_family_id, slug, name, exam_type, default_difficulty_level, description) values
  ('a0000002-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
   'upsc-cse', 'UPSC CSE', 'recruitment', 'high',
   'Civil Services Examination — Prelims, Mains and Personality Test for IAS, IPS, IFS and allied services.')
on conflict (id) do nothing;

-- Five cycles so trend lines render with meaningful slope.
insert into public.exam_cycles
  (id, exam_id, year, cycle_name, status, notification_date, application_start,
   application_end, exam_start, source_url) values
  ('a0000003-0000-0000-0000-000000000021', 'a0000002-0000-0000-0000-000000000001',
   2021, 'CSE 2021', 'completed', '2021-03-04', '2021-03-04', '2021-03-24', '2021-10-10', 'https://upsc.gov.in/'),
  ('a0000003-0000-0000-0000-000000000022', 'a0000002-0000-0000-0000-000000000001',
   2022, 'CSE 2022', 'completed', '2022-02-02', '2022-02-02', '2022-02-22', '2022-06-05', 'https://upsc.gov.in/'),
  ('a0000003-0000-0000-0000-000000000023', 'a0000002-0000-0000-0000-000000000001',
   2023, 'CSE 2023', 'completed', '2023-02-01', '2023-02-01', '2023-02-21', '2023-05-28', 'https://upsc.gov.in/'),
  ('a0000003-0000-0000-0000-000000000024', 'a0000002-0000-0000-0000-000000000001',
   2024, 'CSE 2024', 'completed', '2024-02-14', '2024-02-14', '2024-03-05', '2024-06-16', 'https://upsc.gov.in/'),
  ('a0000003-0000-0000-0000-000000000025', 'a0000002-0000-0000-0000-000000000001',
   2025, 'CSE 2025', 'active', '2025-01-22', '2025-01-22', '2025-02-11', '2025-05-25', 'https://upsc.gov.in/')
on conflict (id) do nothing;

-- Phases shared across cycles (cycle_id NULL means "applies to the exam by default").
insert into public.exam_phases
  (id, exam_id, exam_cycle_id, phase_name, phase_slug, phase_order, mode,
   duration_mins, total_questions, total_marks, negative_marking, status) values
  ('a0000004-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000001',
   null, 'Prelims', 'prelims', 1, 'omr',
   120, 100, 200, '1/3 negative', 'active'),
  ('a0000004-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000001',
   null, 'Mains', 'mains', 2, 'descriptive',
   180, null, 1750, 'none', 'active'),
  ('a0000004-0000-0000-0000-000000000003', 'a0000002-0000-0000-0000-000000000001',
   null, 'Personality Test', 'interview', 3, 'in_person',
   null, null, 275, 'none', 'active')
on conflict (id) do nothing;

-- ── Subject taxonomy (CSE specific, additive) ───────────────────────────
insert into public.subjects (id, slug, name, subject_group, default_difficulty_level) values
  ('a0000005-0000-0000-0000-000000000001', 'upsc-polity', 'Polity & Governance', 'gs', 'high'),
  ('a0000005-0000-0000-0000-000000000002', 'upsc-history', 'History & Culture', 'gs', 'high'),
  ('a0000005-0000-0000-0000-000000000003', 'upsc-geography', 'Geography & Environment', 'gs', 'medium_high'),
  ('a0000005-0000-0000-0000-000000000004', 'upsc-economy', 'Economy', 'gs', 'high'),
  ('a0000005-0000-0000-0000-000000000005', 'upsc-csat', 'CSAT (Aptitude)', 'reasoning', 'medium_high')
on conflict (id) do nothing;

insert into public.topics (id, subject_id, slug, name, level, default_difficulty_level) values
  ('a0000006-0000-0000-0000-000000000001', 'a0000005-0000-0000-0000-000000000001', 'fundamental-rights', 'Fundamental Rights', 'topic', 'high'),
  ('a0000006-0000-0000-0000-000000000002', 'a0000005-0000-0000-0000-000000000001', 'parliamentary-system', 'Parliamentary System', 'topic', 'high'),
  ('a0000006-0000-0000-0000-000000000003', 'a0000005-0000-0000-0000-000000000002', 'modern-india-freedom', 'Modern Indian Freedom Struggle', 'topic', 'medium_high'),
  ('a0000006-0000-0000-0000-000000000004', 'a0000005-0000-0000-0000-000000000002', 'ancient-india', 'Ancient India', 'topic', 'medium'),
  ('a0000006-0000-0000-0000-000000000005', 'a0000005-0000-0000-0000-000000000003', 'indian-physical-geography', 'Indian Physical Geography', 'topic', 'medium_high'),
  ('a0000006-0000-0000-0000-000000000006', 'a0000005-0000-0000-0000-000000000003', 'climate-and-environment', 'Climate & Environment', 'topic', 'medium_high'),
  ('a0000006-0000-0000-0000-000000000007', 'a0000005-0000-0000-0000-000000000004', 'indian-economy-basics', 'Indian Economy — Basics', 'topic', 'medium_high'),
  ('a0000006-0000-0000-0000-000000000008', 'a0000005-0000-0000-0000-000000000004', 'budget-and-fiscal', 'Budget & Fiscal Policy', 'topic', 'high'),
  ('a0000006-0000-0000-0000-000000000009', 'a0000005-0000-0000-0000-000000000005', 'reading-comprehension-csat', 'Reading Comprehension (CSAT)', 'topic', 'medium'),
  ('a0000006-0000-0000-0000-00000000000a', 'a0000005-0000-0000-0000-000000000005', 'data-interpretation-csat', 'Data Interpretation (CSAT)', 'topic', 'medium_high')
on conflict (id) do nothing;

-- ── PYQ inventory (one verified Prelims paper per year, 2021–2024) ──────
insert into public.pyq_sources (id, exam_id, source_type, source_url, title, trust_status) values
  ('a0000007-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000001',
   'official', 'https://upsc.gov.in/examinations/previous-question-papers',
   'UPSC official previous papers archive', 'verified')
on conflict (id) do nothing;

insert into public.pyq_papers
  (id, pyq_source_id, exam_id, exam_cycle_id, exam_phase_id, year, paper_date,
   shift, paper_code, source_url, source_type, trust_status) values
  ('a0000008-0000-0000-0000-000000000021', 'a0000007-0000-0000-0000-000000000001',
   'a0000002-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000021',
   'a0000004-0000-0000-0000-000000000001', 2021, '2021-10-10', 'Shift I', 'GS Paper I',
   'https://upsc.gov.in/sites/default/files/QP-CSP-21-GS-P1.pdf', 'official', 'verified'),
  ('a0000008-0000-0000-0000-000000000022', 'a0000007-0000-0000-0000-000000000001',
   'a0000002-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000022',
   'a0000004-0000-0000-0000-000000000001', 2022, '2022-06-05', 'Shift I', 'GS Paper I',
   'https://upsc.gov.in/sites/default/files/QP-CSP-22-GS-P1.pdf', 'official', 'verified'),
  ('a0000008-0000-0000-0000-000000000023', 'a0000007-0000-0000-0000-000000000001',
   'a0000002-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000023',
   'a0000004-0000-0000-0000-000000000001', 2023, '2023-05-28', 'Shift I', 'GS Paper I',
   'https://upsc.gov.in/sites/default/files/QP-CSP-23-GS-P1.pdf', 'official', 'verified'),
  ('a0000008-0000-0000-0000-000000000024', 'a0000007-0000-0000-0000-000000000001',
   'a0000002-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000024',
   'a0000004-0000-0000-0000-000000000001', 2024, '2024-06-16', 'Shift I', 'GS Paper I',
   'https://upsc.gov.in/sites/default/files/QP-CSP-24-GS-P1.pdf', 'official', 'verified')
on conflict (id) do nothing;

-- A handful of verified questions per paper, spread across subjects/difficulties
-- so the heatmap is non-trivial.
insert into public.pyq_questions
  (id, pyq_paper_id, question_number, question_text, question_type,
   observed_difficulty, expected_solve_time_sec, reviewer_status) values
  -- 2024 paper
  ('a0000009-0000-0000-0000-000000000241', 'a0000008-0000-0000-0000-000000000024', 12,
   'Consider the following statements about the Anti-Defection Law.', 'mcq', 'medium', 90, 'verified'),
  ('a0000009-0000-0000-0000-000000000242', 'a0000008-0000-0000-0000-000000000024', 23,
   'With reference to the Quit India Movement, consider the following statements.', 'mcq', 'hard', 110, 'verified'),
  ('a0000009-0000-0000-0000-000000000243', 'a0000008-0000-0000-0000-000000000024', 41,
   'Which of the following are tributaries of the Brahmaputra?', 'mcq', 'medium', 75, 'verified'),
  ('a0000009-0000-0000-0000-000000000244', 'a0000008-0000-0000-0000-000000000024', 58,
   'Consider the following about the Insolvency and Bankruptcy Code, 2016.', 'mcq', 'hard', 100, 'verified'),
  -- 2023 paper
  ('a0000009-0000-0000-0000-000000000231', 'a0000008-0000-0000-0000-000000000023', 9,
   'In the context of the Rajya Sabha, consider the following statements.', 'mcq', 'medium', 80, 'verified'),
  ('a0000009-0000-0000-0000-000000000232', 'a0000008-0000-0000-0000-000000000023', 28,
   'With reference to the Indus Valley Civilisation, consider the following.', 'mcq', 'medium', 80, 'verified'),
  ('a0000009-0000-0000-0000-000000000233', 'a0000008-0000-0000-0000-000000000023', 47,
   'Which one of the following correctly describes Monsoon trough?', 'mcq', 'easy', 60, 'verified'),
  ('a0000009-0000-0000-0000-000000000234', 'a0000008-0000-0000-0000-000000000023', 66,
   'Consider the following regarding the Goods and Services Tax (GST) Council.', 'mcq', 'hard', 100, 'verified'),
  -- 2022 paper
  ('a0000009-0000-0000-0000-000000000221', 'a0000008-0000-0000-0000-000000000022', 6,
   'Which of the following provisions deal with directive principles?', 'mcq', 'medium', 75, 'verified'),
  ('a0000009-0000-0000-0000-000000000222', 'a0000008-0000-0000-0000-000000000022', 31,
   'With reference to the Bhakti and Sufi movements, consider the following.', 'mcq', 'medium', 80, 'verified'),
  ('a0000009-0000-0000-0000-000000000223', 'a0000008-0000-0000-0000-000000000022', 55,
   'Consider the following about RBI''s open market operations.', 'mcq', 'hard', 110, 'verified'),
  -- 2021 paper
  ('a0000009-0000-0000-0000-000000000211', 'a0000008-0000-0000-0000-000000000021', 3,
   'The Preamble of the Constitution declares India to be a:', 'mcq', 'easy', 50, 'verified'),
  ('a0000009-0000-0000-0000-000000000212', 'a0000008-0000-0000-0000-000000000021', 19,
   'Consider the following about the August Offer of 1940.', 'mcq', 'medium', 80, 'verified'),
  ('a0000009-0000-0000-0000-000000000213', 'a0000008-0000-0000-0000-000000000021', 44,
   'With reference to the Coral reefs, consider the following statements.', 'mcq', 'medium', 75, 'verified')
on conflict (id) do nothing;

-- Option-level demo data so the admin option-review surface (migration
-- 100) has rows. UPSC stems here are paraphrased openers; we ship the
-- standard structural 4-option set ("1 only / 2 only / Both / Neither")
-- with no correct option asserted (is_correct=false on all rows) since
-- the original statement bank isn't reproduced. The Preamble question
-- (`a0000009-0000-0000-0000-000000000211`) is the one exception — its
-- canonical answer is unambiguous and is marked correct.
insert into public.pyq_options
  (id, question_id, option_label, option_text, is_correct, reviewer_status, metadata) values
  -- 2024 paper
  ('b0000000-0000-0000-0000-000000024101', 'a0000009-0000-0000-0000-000000000241', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024102', 'a0000009-0000-0000-0000-000000000241', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024103', 'a0000009-0000-0000-0000-000000000241', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024104', 'a0000009-0000-0000-0000-000000000241', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024201', 'a0000009-0000-0000-0000-000000000242', 'A', '1 and 2 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024202', 'a0000009-0000-0000-0000-000000000242', 'B', '2 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024203', 'a0000009-0000-0000-0000-000000000242', 'C', '1 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024204', 'a0000009-0000-0000-0000-000000000242', 'D', '1, 2 and 3',                      false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024301', 'a0000009-0000-0000-0000-000000000243', 'A', 'Subansiri and Lohit',             false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024302', 'a0000009-0000-0000-0000-000000000243', 'B', 'Teesta and Manas',                false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024303', 'a0000009-0000-0000-0000-000000000243', 'C', 'All of the above',                false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024304', 'a0000009-0000-0000-0000-000000000243', 'D', 'None of the above',               false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024401', 'a0000009-0000-0000-0000-000000000244', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024402', 'a0000009-0000-0000-0000-000000000244', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024403', 'a0000009-0000-0000-0000-000000000244', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000024404', 'a0000009-0000-0000-0000-000000000244', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  -- 2023 paper
  ('b0000000-0000-0000-0000-000000023101', 'a0000009-0000-0000-0000-000000000231', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023102', 'a0000009-0000-0000-0000-000000000231', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023103', 'a0000009-0000-0000-0000-000000000231', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023104', 'a0000009-0000-0000-0000-000000000231', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023201', 'a0000009-0000-0000-0000-000000000232', 'A', '1 and 2 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023202', 'a0000009-0000-0000-0000-000000000232', 'B', '2 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023203', 'a0000009-0000-0000-0000-000000000232', 'C', '1 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023204', 'a0000009-0000-0000-0000-000000000232', 'D', '1, 2 and 3',                      false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023301', 'a0000009-0000-0000-0000-000000000233', 'A', 'A low-pressure belt over land',   false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023302', 'a0000009-0000-0000-0000-000000000233', 'B', 'A high-pressure belt over land',  false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023303', 'a0000009-0000-0000-0000-000000000233', 'C', 'A low-pressure belt over ocean',  false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023304', 'a0000009-0000-0000-0000-000000000233', 'D', 'A high-pressure belt over ocean', false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023401', 'a0000009-0000-0000-0000-000000000234', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023402', 'a0000009-0000-0000-0000-000000000234', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023403', 'a0000009-0000-0000-0000-000000000234', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000023404', 'a0000009-0000-0000-0000-000000000234', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  -- 2022 paper
  ('b0000000-0000-0000-0000-000000022101', 'a0000009-0000-0000-0000-000000000221', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022102', 'a0000009-0000-0000-0000-000000000221', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022103', 'a0000009-0000-0000-0000-000000000221', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022104', 'a0000009-0000-0000-0000-000000000221', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022201', 'a0000009-0000-0000-0000-000000000222', 'A', '1 and 2 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022202', 'a0000009-0000-0000-0000-000000000222', 'B', '2 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022203', 'a0000009-0000-0000-0000-000000000222', 'C', '1 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022204', 'a0000009-0000-0000-0000-000000000222', 'D', '1, 2 and 3',                      false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022301', 'a0000009-0000-0000-0000-000000000223', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022302', 'a0000009-0000-0000-0000-000000000223', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022303', 'a0000009-0000-0000-0000-000000000223', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000022304', 'a0000009-0000-0000-0000-000000000223', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  -- 2021 paper — Preamble question has a definite, well-known answer.
  ('b0000000-0000-0000-0000-000000021101', 'a0000009-0000-0000-0000-000000000211', 'A', 'Sovereign Democratic Republic',                                false, 'verified', '{"demo":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021102', 'a0000009-0000-0000-0000-000000000211', 'B', 'Sovereign Socialist Secular Democratic Republic',               true, 'verified', '{"demo":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021103', 'a0000009-0000-0000-0000-000000000211', 'C', 'Sovereign Secular Democratic Republic',                        false, 'verified', '{"demo":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021104', 'a0000009-0000-0000-0000-000000000211', 'D', 'Sovereign Socialist Democratic Republic',                      false, 'verified', '{"demo":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021201', 'a0000009-0000-0000-0000-000000000212', 'A', '1 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021202', 'a0000009-0000-0000-0000-000000000212', 'B', '2 only',                          false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021203', 'a0000009-0000-0000-0000-000000000212', 'C', 'Both 1 and 2',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021204', 'a0000009-0000-0000-0000-000000000212', 'D', 'Neither 1 nor 2',                 false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021301', 'a0000009-0000-0000-0000-000000000213', 'A', '1 and 2 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021302', 'a0000009-0000-0000-0000-000000000213', 'B', '2 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021303', 'a0000009-0000-0000-0000-000000000213', 'C', '1 and 3 only',                    false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb),
  ('b0000000-0000-0000-0000-000000021304', 'a0000009-0000-0000-0000-000000000213', 'D', '1, 2 and 3',                      false, 'pending',  '{"demo":true,"answer_key_unverified":true}'::jsonb)
on conflict (id) do nothing;

-- Wire the Preamble answer key back to pyq_questions.
update public.pyq_questions
  set correct_option_id = 'b0000000-0000-0000-0000-000000021102'
where id = 'a0000009-0000-0000-0000-000000000211';

-- Verified primary topic tags so the difficulty heatmap can roll up by subject.
insert into public.pyq_question_topic_tags
  (id, question_id, topic_id, tag_weight, tag_role, tagging_source, confidence_score, reviewer_status, reviewed_at) values
  -- 2024
  ('a000000a-0000-0000-0000-000000000241', 'a0000009-0000-0000-0000-000000000241',
   'a0000006-0000-0000-0000-000000000002', 1.0, 'primary', 'admin', 0.95, 'verified', '2025-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000242', 'a0000009-0000-0000-0000-000000000242',
   'a0000006-0000-0000-0000-000000000003', 1.0, 'primary', 'admin', 0.93, 'verified', '2025-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000243', 'a0000009-0000-0000-0000-000000000243',
   'a0000006-0000-0000-0000-000000000005', 1.0, 'primary', 'admin', 0.92, 'verified', '2025-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000244', 'a0000009-0000-0000-0000-000000000244',
   'a0000006-0000-0000-0000-000000000008', 1.0, 'primary', 'admin', 0.9, 'verified', '2025-01-15T00:00:00+00:00'),
  -- 2023
  ('a000000a-0000-0000-0000-000000000231', 'a0000009-0000-0000-0000-000000000231',
   'a0000006-0000-0000-0000-000000000002', 1.0, 'primary', 'admin', 0.94, 'verified', '2024-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000232', 'a0000009-0000-0000-0000-000000000232',
   'a0000006-0000-0000-0000-000000000004', 1.0, 'primary', 'admin', 0.92, 'verified', '2024-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000233', 'a0000009-0000-0000-0000-000000000233',
   'a0000006-0000-0000-0000-000000000006', 1.0, 'primary', 'admin', 0.9, 'verified', '2024-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000234', 'a0000009-0000-0000-0000-000000000234',
   'a0000006-0000-0000-0000-000000000008', 1.0, 'primary', 'admin', 0.93, 'verified', '2024-01-15T00:00:00+00:00'),
  -- 2022
  ('a000000a-0000-0000-0000-000000000221', 'a0000009-0000-0000-0000-000000000221',
   'a0000006-0000-0000-0000-000000000001', 1.0, 'primary', 'admin', 0.93, 'verified', '2023-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000222', 'a0000009-0000-0000-0000-000000000222',
   'a0000006-0000-0000-0000-000000000004', 1.0, 'primary', 'admin', 0.9, 'verified', '2023-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000223', 'a0000009-0000-0000-0000-000000000223',
   'a0000006-0000-0000-0000-000000000007', 1.0, 'primary', 'admin', 0.94, 'verified', '2023-01-15T00:00:00+00:00'),
  -- 2021
  ('a000000a-0000-0000-0000-000000000211', 'a0000009-0000-0000-0000-000000000211',
   'a0000006-0000-0000-0000-000000000001', 1.0, 'primary', 'admin', 0.95, 'verified', '2022-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000212', 'a0000009-0000-0000-0000-000000000212',
   'a0000006-0000-0000-0000-000000000003', 1.0, 'primary', 'admin', 0.92, 'verified', '2022-01-15T00:00:00+00:00'),
  ('a000000a-0000-0000-0000-000000000213', 'a0000009-0000-0000-0000-000000000213',
   'a0000006-0000-0000-0000-000000000006', 1.0, 'primary', 'admin', 0.9, 'verified', '2022-01-15T00:00:00+00:00')
on conflict (id) do nothing;

-- ── Competition intelligence rows (one per cycle, Prelims phase) ────────
-- cutoff_trend uses the {category: marks} jsonb convention so the
-- aspirant-facing cutoff line chart can pivot it without inference.
insert into public.exam_competition_metrics
  (id, exam_id, exam_cycle_id, exam_phase_id, vacancy_total, vacancy_by_category,
   applicant_count, selection_ratio, cutoff_trend, difficulty_trend,
   competition_pressure_score, source_basis, confidence_score, evidence_count,
   reviewer_status, reviewed_at, reviewer_notes) values
  -- 2021
  ('a000000b-0000-0000-0000-000000000021', 'a0000002-0000-0000-0000-000000000001',
   'a0000003-0000-0000-0000-000000000021', 'a0000004-0000-0000-0000-000000000001',
   712,
   '{"general": 305, "obc": 191, "sc": 105, "st": 53, "ews": 58}'::jsonb,
   1051892, 0.000677,
   '{"general": 87.54, "obc": 84.85, "sc": 75.41, "st": 70.71, "ews": 80.14}'::jsonb,
   '{"overall": "medium_high", "volatility": "low"}'::jsonb,
   78.4, 'official', 0.95, 4, 'locked',
   '2022-03-15T00:00:00+00:00',
   'Vacancies + cutoffs cross-checked against official 2021 results PDF.'),
  -- 2022
  ('a000000b-0000-0000-0000-000000000022', 'a0000002-0000-0000-0000-000000000001',
   'a0000003-0000-0000-0000-000000000022', 'a0000004-0000-0000-0000-000000000001',
   1022,
   '{"general": 423, "obc": 275, "sc": 152, "st": 76, "ews": 96}'::jsonb,
   1135697, 0.000900,
   '{"general": 88.22, "obc": 87.54, "sc": 74.08, "st": 69.35, "ews": 82.83}'::jsonb,
   '{"overall": "medium_high", "volatility": "low"}'::jsonb,
   80.1, 'official', 0.95, 4, 'locked',
   '2023-04-10T00:00:00+00:00',
   'Vacancies + cutoffs cross-checked against official 2022 results.'),
  -- 2023
  ('a000000b-0000-0000-0000-000000000023', 'a0000002-0000-0000-0000-000000000001',
   'a0000003-0000-0000-0000-000000000023', 'a0000004-0000-0000-0000-000000000001',
   1105,
   '{"general": 442, "obc": 298, "sc": 165, "st": 82, "ews": 118}'::jsonb,
   1295311, 0.000853,
   '{"general": 75.41, "obc": 74.75, "sc": 59.25, "st": 47.82, "ews": 68.02}'::jsonb,
   '{"overall": "hard", "volatility": "high", "notes": "CSAT spike"}'::jsonb,
   85.7, 'official', 0.95, 5, 'locked',
   '2024-03-05T00:00:00+00:00',
   'Cutoff drop driven by CSAT difficulty spike — confirmed by analysis rooms and official notification.'),
  -- 2024
  ('a000000b-0000-0000-0000-000000000024', 'a0000002-0000-0000-0000-000000000001',
   'a0000003-0000-0000-0000-000000000024', 'a0000004-0000-0000-0000-000000000001',
   1056,
   '{"general": 424, "obc": 285, "sc": 158, "st": 78, "ews": 111}'::jsonb,
   1387847, 0.000761,
   '{"general": 87.98, "obc": 87.31, "sc": 79.03, "st": 74.43, "ews": 81.30}'::jsonb,
   '{"overall": "medium_high", "volatility": "medium"}'::jsonb,
   83.2, 'official', 0.95, 5, 'locked',
   '2025-03-20T00:00:00+00:00',
   'Cutoffs recovered from 2023 lows. Vacancies dipped relative to 2023.')
on conflict (id) do nothing;

-- ── Optional: link an existing recruitment to the exam if one exists ────
-- This is a no-op when there are no UPSC recruitment rows yet. It lets
-- the aspirant ExamDetail page resolve exam_slug and surface the
-- Intelligence tab content immediately.
update public.recruitments
   set exam_id = 'a0000002-0000-0000-0000-000000000001'
 where exam_id is null
   and (lower(name) like 'upsc cse%' or lower(name) like 'civil services%')
   and lower(coalesce(name, '')) not like '%mains test series%';

commit;
