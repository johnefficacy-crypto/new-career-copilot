-- Backfill profiles.target_exam from slug text to canonical exams.id UUID text.
-- Idempotent: only updates rows where target_exam exactly matches exams.slug.
-- Unresolved rows are left untouched.

update public.profiles p
set target_exam = e.id::text
from public.exams e
where p.target_exam = e.slug;

notify pgrst, 'reload schema';
