-- 034_exam_intelligence_rls_indexes.sql
-- RLS for Exam Intelligence tables.
-- Uses profiles.is_admin to avoid requiring a separate public.is_admin() function.

alter table public.subjects enable row level security;
alter table public.subject_aliases enable row level security;
alter table public.topics enable row level security;
alter table public.topic_aliases enable row level security;
alter table public.topic_prerequisites enable row level security;

alter table public.exam_families enable row level security;
alter table public.exams enable row level security;
alter table public.exam_cycles enable row level security;
alter table public.exam_phases enable row level security;
alter table public.exam_phase_sections enable row level security;
alter table public.exam_topic_coverage enable row level security;

alter table public.syllabus_documents enable row level security;
alter table public.syllabus_topic_mentions enable row level security;

alter table public.pyq_sources enable row level security;
alter table public.pyq_papers enable row level security;
alter table public.pyq_questions enable row level security;
alter table public.pyq_options enable row level security;
alter table public.pyq_question_topic_tags enable row level security;
alter table public.pyq_option_patterns enable row level security;
alter table public.pyq_option_repetitions enable row level security;
alter table public.question_relation_edges enable row level security;
alter table public.topic_relation_edges enable row level security;

alter table public.exam_topic_score_snapshots enable row level security;
alter table public.user_topic_mastery enable row level security;
alter table public.user_topic_error_patterns enable row level security;
alter table public.study_plan_versions enable row level security;
alter table public.study_adaptation_events enable row level security;
alter table public.mock_topic_breakdowns enable row level security;

-- Helper predicate repeated inside policies:
-- exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)

-- Read policies for reference data.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subjects' and policyname='subjects_read_authenticated') then
    create policy subjects_read_authenticated on public.subjects
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='subject_aliases' and policyname='subject_aliases_read_authenticated') then
    create policy subject_aliases_read_authenticated on public.subject_aliases
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='topics' and policyname='topics_read_authenticated') then
    create policy topics_read_authenticated on public.topics
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='topic_aliases' and policyname='topic_aliases_read_authenticated') then
    create policy topic_aliases_read_authenticated on public.topic_aliases
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='topic_prerequisites' and policyname='topic_prerequisites_read_authenticated') then
    create policy topic_prerequisites_read_authenticated on public.topic_prerequisites
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exam_families' and policyname='exam_families_read_authenticated') then
    create policy exam_families_read_authenticated on public.exam_families
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exams' and policyname='exams_read_authenticated') then
    create policy exams_read_authenticated on public.exams
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exam_cycles' and policyname='exam_cycles_read_authenticated') then
    create policy exam_cycles_read_authenticated on public.exam_cycles
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exam_phases' and policyname='exam_phases_read_authenticated') then
    create policy exam_phases_read_authenticated on public.exam_phases
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exam_phase_sections' and policyname='exam_phase_sections_read_authenticated') then
    create policy exam_phase_sections_read_authenticated on public.exam_phase_sections
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exam_topic_coverage' and policyname='exam_topic_coverage_read_reviewed') then
    create policy exam_topic_coverage_read_reviewed on public.exam_topic_coverage
      for select to authenticated
      using (
        reviewer_status in ('reviewed', 'locked')
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='exam_topic_score_snapshots' and policyname='exam_topic_score_snapshots_read_reviewed') then
    create policy exam_topic_score_snapshots_read_reviewed on public.exam_topic_score_snapshots
      for select to authenticated
      using (
        status in ('reviewed', 'locked')
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
      );
  end if;
end $$;

-- User-owned analytics policies.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_topic_mastery' and policyname='user_topic_mastery_owner_select') then
    create policy user_topic_mastery_owner_select on public.user_topic_mastery
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_topic_mastery' and policyname='user_topic_mastery_owner_insert') then
    create policy user_topic_mastery_owner_insert on public.user_topic_mastery
      for insert to authenticated with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_topic_mastery' and policyname='user_topic_mastery_owner_update') then
    create policy user_topic_mastery_owner_update on public.user_topic_mastery
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_topic_error_patterns' and policyname='user_topic_error_patterns_owner_select') then
    create policy user_topic_error_patterns_owner_select on public.user_topic_error_patterns
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_topic_error_patterns' and policyname='user_topic_error_patterns_owner_insert') then
    create policy user_topic_error_patterns_owner_insert on public.user_topic_error_patterns
      for insert to authenticated with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_topic_error_patterns' and policyname='user_topic_error_patterns_owner_update') then
    create policy user_topic_error_patterns_owner_update on public.user_topic_error_patterns
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_plan_versions' and policyname='study_plan_versions_owner_select') then
    create policy study_plan_versions_owner_select on public.study_plan_versions
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_adaptation_events' and policyname='study_adaptation_events_owner_select') then
    create policy study_adaptation_events_owner_select on public.study_adaptation_events
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mock_topic_breakdowns' and policyname='mock_topic_breakdowns_owner_select') then
    create policy mock_topic_breakdowns_owner_select on public.mock_topic_breakdowns
      for select to authenticated
      using (
        exists (
          select 1
          from public.mock_tests mt
          where mt.id = mock_topic_breakdowns.mock_test_id
            and mt.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Admin-all policies for controlled intelligence management.
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array[
    'subjects',
    'subject_aliases',
    'topics',
    'topic_aliases',
    'topic_prerequisites',
    'exam_families',
    'exams',
    'exam_cycles',
    'exam_phases',
    'exam_phase_sections',
    'exam_topic_coverage',
    'syllabus_documents',
    'syllabus_topic_mentions',
    'pyq_sources',
    'pyq_papers',
    'pyq_questions',
    'pyq_options',
    'pyq_question_topic_tags',
    'pyq_option_patterns',
    'pyq_option_repetitions',
    'question_relation_edges',
    'topic_relation_edges',
    'exam_topic_score_snapshots'
  ]
  loop
    policy_name := t || '_admin_all';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))',
        policy_name,
        t
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
