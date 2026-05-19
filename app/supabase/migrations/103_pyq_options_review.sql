-- Expose pyq_options for admin review.
--
-- Migration 032 introduced public.pyq_options as the normalised child of
-- pyq_questions but stopped short of the reviewer-status columns the
-- admin Exam Intelligence surface (app/api/admin_exam_intelligence.py)
-- requires for every reviewable table. This migration adds those
-- columns so option-level review (repeated options, traps, elimination
-- patterns, correct-answer validation) can be moved through the same
-- workflow as the rest of exam intelligence.
--
-- Status lifecycle (matches pyq_questions / pyq_question_topic_tags):
--   pending → verified | rejected | needs_correction
--   needs_correction → verified | rejected | pending
--   verified → rejected (operator reversal) | needs_correction
--   rejected → pending | needs_correction

alter table public.pyq_options
  add column if not exists reviewer_status text not null default 'pending'
    check (reviewer_status in ('pending', 'verified', 'rejected', 'needs_correction')),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_pyq_options_reviewer_status
  on public.pyq_options(reviewer_status);

notify pgrst, 'reload schema';
