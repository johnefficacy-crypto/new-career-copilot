-- Backfill profiles.target_exam from slug text to canonical exams.id UUID text.
-- Idempotent: only updates rows where target_exam exactly matches exams.slug.
-- Unresolved rows are left untouched and counted via NOTICE for audit.
--
-- Dry-run counters (NOTICE):
--   * resolvable rows
--   * unresolved slug-like rows

do $$
declare
  v_resolvable int := 0;
  v_unresolved int := 0;
begin
  select count(*)
    into v_resolvable
  from public.profiles p
  join public.exams e on e.slug = p.target_exam;

  select count(*)
    into v_unresolved
  from public.profiles p
  where p.target_exam is not null
    and not exists (
      select 1 from public.exams e where e.slug = p.target_exam
    );

  raise notice 'profiles.target_exam backfill dry-run: resolvable=% unresolved=%', v_resolvable, v_unresolved;

  update public.profiles p
     set target_exam = e.id::text
    from public.exams e
   where p.target_exam = e.slug;
end $$;

notify pgrst, 'reload schema';
