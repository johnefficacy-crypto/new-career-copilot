-- Exam Intelligence import template (PRODUCTION-SAFE)
--
-- IMPORTANT:
-- 1) Replace placeholders with real verified values.
-- 2) Do NOT fabricate official URLs, PYQ text, or evidence.
-- 3) Default reviewer/trust states are non-planner-ready by design.
-- 4) Keep discovery policy rows non-impacting (all affects_* = false).

begin;

-- -------------------------------------------------------------------------
-- 1) Exam registry
-- -------------------------------------------------------------------------
insert into public.exam_families (id, slug, name, description)
values ('<exam-family-uuid>', '<exam-family-slug>', '<Exam Family Name>', '<Description>')
on conflict (id) do nothing;

insert into public.exams (id, exam_family_id, slug, name, exam_type, default_difficulty_level, description, is_active)
values ('<exam-uuid>', '<exam-family-uuid>', '<exam-slug>', '<Exam Name>', 'recruitment', 'medium', '<Description>', true)
on conflict (id) do nothing;

-- exam_cycles status check enforces ('expected', 'open', 'active', 'closed',
-- 'completed', 'cancelled') — see migration 030.
insert into public.exam_cycles (
  id, exam_id, year, cycle_name, status, notification_date, application_start,
  application_end, exam_start, exam_end, source_url
) values (
  '<exam-cycle-uuid>', '<exam-uuid>', <year>, '<Cycle Name>', 'expected',
  '<YYYY-MM-DD>', '<YYYY-MM-DD>', '<YYYY-MM-DD>', '<YYYY-MM-DD>', '<YYYY-MM-DD>',
  '<official-notification-url>' -- must be official source URL
)
on conflict (id) do nothing;

insert into public.exam_phases (
  id, exam_id, exam_cycle_id, phase_name, phase_slug, phase_order, mode,
  duration_mins, total_questions, total_marks, negative_marking, status
) values (
  '<phase-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', '<Phase Name>', '<phase-slug>',
  1, 'cbt', 60, 100, 200, '<negative-marking-notes>', 'expected'
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 2) Taxonomy
-- -------------------------------------------------------------------------
insert into public.subjects (id, slug, name, subject_group, default_difficulty_level, is_active)
values ('<subject-uuid>', '<subject-slug>', '<Subject Name>', 'verbal', 'medium', true)
on conflict (id) do nothing;

insert into public.topics (id, subject_id, slug, name, level, default_difficulty_level, is_active)
values ('<topic-uuid>', '<subject-uuid>', '<topic-slug>', '<Topic Name>', 'topic', 'medium', true)
on conflict (id) do nothing;

insert into public.topic_aliases (id, topic_id, alias, normalized_alias, source_context)
values ('<topic-alias-uuid>', '<topic-uuid>', '<Alias>', '<normalized-alias>', 'import')
on conflict (id) do nothing;

insert into public.topic_prerequisites (id, topic_id, prerequisite_topic_id, relation_type, strength, source_basis, metadata)
values ('<topic-prereq-uuid>', '<topic-uuid>', '<prereq-topic-uuid>', 'requires', 0.8, 'admin_review', '{"notes":"review required"}'::jsonb)
on conflict (id) do nothing;

insert into public.exam_phase_sections (
  id, exam_phase_id, subject_id, section_label, question_count, marks, weightage_percent, sort_order
) values (
  '<phase-section-uuid>', '<phase-uuid>', '<subject-uuid>', '<Section Label>', 25, 50, 25, 1
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 3) Syllabus evidence (official-first)
-- -------------------------------------------------------------------------
insert into public.syllabus_documents (
  id, exam_id, exam_cycle_id, document_type, title, source_url, trust_status,
  published_at, metadata
) values (
  '<syllabus-doc-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', 'syllabus_pdf',
  '<Official Syllabus Title>', '<official-syllabus-url>',
  'pending', -- default; promote only after review
  '<ISO-8601 timestamp>',
  '{"fetched_at":"<ISO-8601>","content_hash":"<sha256-or-null>","review_notes":"<required>"}'::jsonb
)
on conflict (id) do nothing;

insert into public.syllabus_topic_mentions (
  id, syllabus_document_id, exam_id, exam_cycle_id, exam_phase_id, topic_id,
  raw_text, normalized_text, mention_type, confidence_score, reviewer_status,
  reviewed_at, reviewer_notes
) values (
  '<syllabus-mention-uuid>', '<syllabus-doc-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', '<phase-uuid>',
  '<topic-uuid>', '<verbatim-fragment>', '<normalized-fragment>', 'explicit', 0.75,
  'pending', null, '<why-this-maps>'
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 4) PYQ evidence
-- -------------------------------------------------------------------------
insert into public.pyq_sources (id, exam_id, source_type, source_url, title, trust_status, metadata)
values (
  '<pyq-source-uuid>', '<exam-uuid>', 'official', '<official-pyq-url>',
  '<Official PYQ source title>', 'pending',
  '{"fetched_at":"<ISO-8601>","review_notes":"<required>"}'::jsonb
)
on conflict (id) do nothing;

insert into public.pyq_papers (
  id, pyq_source_id, exam_id, exam_phase_id, year, paper_date, shift,
  source_type, trust_status, metadata
) values (
  '<pyq-paper-uuid>', '<pyq-source-uuid>', '<exam-uuid>', '<phase-uuid>', <year>,
  '<YYYY-MM-DD>', '<Shift>', 'official', 'pending', '{"notes":"pending review"}'::jsonb
)
on conflict (id) do nothing;

-- pyq_questions has no review_notes column (see migration 032). Reviewer
-- notes ride on the `metadata` jsonb so the audit trail is preserved.
insert into public.pyq_questions (
  id, pyq_paper_id, question_number, question_text, question_type,
  observed_difficulty, expected_solve_time_sec, reviewer_status, metadata
) values (
  '<pyq-question-uuid>', '<pyq-paper-uuid>', 1, '<Question text from trusted source>',
  'mcq', 'medium', 60, 'pending', '{"review_notes":"<citation required>"}'::jsonb
)
on conflict (id) do nothing;

-- pyq_options has no source_basis column (see migration 032). Provenance
-- rides on the `metadata` jsonb so audits keep the trail.
insert into public.pyq_options (
  id, question_id, option_label, option_text, is_correct, metadata
) values
  ('<pyq-option-a-uuid>', '<pyq-question-uuid>', 'A', '<Option A>', false, '{"source_basis":"manual_import"}'::jsonb),
  ('<pyq-option-b-uuid>', '<pyq-question-uuid>', 'B', '<Option B>', false, '{"source_basis":"manual_import"}'::jsonb)
on conflict (id) do nothing;

-- pyq_question_topic_tags has no review_notes column (see migration 032).
-- Mapping evidence rides on the `metadata` jsonb.
insert into public.pyq_question_topic_tags (
  id, question_id, topic_id, tag_weight, tag_role, tagging_source,
  confidence_score, reviewer_status, reviewed_at, metadata
) values (
  '<pyq-tag-uuid>', '<pyq-question-uuid>', '<topic-uuid>', 1.0, 'primary', 'admin',
  0.7, 'pending', null, '{"review_notes":"<mapping evidence required>"}'::jsonb
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 5) Coverage + context (non-locked defaults)
-- -------------------------------------------------------------------------
-- exam_topic_coverage stores reviewer notes in `review_notes` (not
-- reviewer_notes — see migration 030).
insert into public.exam_topic_coverage (
  id, exam_id, exam_cycle_id, exam_phase_id, topic_id, coverage_depth,
  expected_difficulty, exam_priority_score, is_high_yield, confidence_score,
  source_basis, reviewer_status, reviewed_at, review_notes
) values (
  '<coverage-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', '<phase-uuid>', '<topic-uuid>',
  'normal', 'medium', 50, false, 0.6,
  'official_syllabus', 'pending_review', null, '<why included; evidence links>'
)
on conflict (id) do nothing;

-- exam_competition_metrics stores reviewer notes in `reviewer_notes`.
-- source_basis enforces ('manual', 'official', 'reviewed_analysis',
-- 'derived', 'model_generated'); reviewer_status enforces ('draft',
-- 'pending_review', 'reviewed', 'locked', 'rejected') — see migration 055.
insert into public.exam_competition_metrics (
  id, exam_id, exam_cycle_id, exam_phase_id, vacancy_total, applicant_count,
  selection_ratio, cutoff_trend, difficulty_trend, competition_pressure_score,
  source_basis, confidence_score, evidence_count, reviewer_status, reviewed_at, reviewer_notes
) values (
  '<competition-metrics-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', '<phase-uuid>',
  null, null, null, '{}'::jsonb, '{}'::jsonb, null,
  'manual', 0.5, 0, 'pending_review', null, '<evidence count and source notes>'
)
on conflict (id) do nothing;

-- official policy update example (can affect plan only after verified).
-- exam_policy_updates stores notes in `reviewer_notes`. update_type
-- enforces ('notification_change', 'cycle_change', 'date_change',
-- 'syllabus_change', 'pattern_change', 'vacancy_change',
-- 'eligibility_change', 'reservation_change', 'document_rule_change',
-- 'other'); claim_status enforces ('unverified', 'official_confirmed',
-- 'superseded') — see migration 056.
insert into public.exam_policy_updates (
  id, exam_id, exam_cycle_id, exam_phase_id, update_type, title, summary,
  source_url, source_type, claim_status, reviewer_status,
  affects_plan, affects_deadline, affects_eligibility, affects_documents, affects_syllabus, affects_vacancy,
  published_at, effective_from, reviewer_notes
) values (
  '<policy-update-official-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', '<phase-uuid>',
  'notification_change', '<Official update title>', '<Short summary>',
  '<official-update-url>', 'official', 'unverified', 'pending',
  false, false, false, false, false, false,
  '<ISO-8601>', '<ISO-8601>', '<review evidence required before any affects_* true>'
)
on conflict (id) do nothing;

-- discovery-only policy row (aggregator/research/opportunity MUST stay non-impacting).
-- 'rumor' is not in the update_type check list; use 'other' for
-- unstructured discovery items.
insert into public.exam_policy_updates (
  id, exam_id, exam_cycle_id, exam_phase_id, update_type, title, summary,
  source_url, source_type, claim_status, reviewer_status,
  affects_plan, affects_deadline, affects_eligibility, affects_documents, affects_syllabus, affects_vacancy,
  published_at, effective_from, reviewer_notes
) values (
  '<policy-update-discovery-uuid>', '<exam-uuid>', '<exam-cycle-uuid>', '<phase-uuid>',
  'other', '<Discovery item title>', '<Unverified lead>',
  '<aggregator-or-research-url>', 'aggregator', 'unverified', 'pending',
  false, false, false, false, false, false,
  '<ISO-8601>', null, '<discovery-only: never set affects_* true>'
)
on conflict (id) do nothing;

commit;
