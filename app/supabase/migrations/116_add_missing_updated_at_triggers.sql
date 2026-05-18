-- Backfill missing public.tg_set_updated_at() triggers.
--
-- Many tables across the schema declare an `updated_at timestamptz`
-- column but never had the matching BEFORE-UPDATE trigger wired up,
-- leaving the column to drift unless every writer remembered to set it
-- explicitly. This migration adds the standard trigger to every such
-- table in one pass, using the existing `public.tg_set_updated_at()`
-- function introduced in migration 014.
--
-- The trigger names follow the established `<table>_updated_at`
-- convention; each is created with the idempotent
-- `drop trigger if exists ... ; create trigger ...` pattern so this
-- migration is safe to re-run on environments that already have a
-- subset of the triggers in place.

do $$
declare
  t text;
  targets text[] := array[
    'admin_settings',
    'aggregator_listings',
    'ai_action_policies',
    'ai_conversations',
    'aspirant_exam_credentials',
    'aspirant_recruitment_attempts',
    'blog_posts',
    'candidate_field_registry',
    'chat_sessions',
    'community_channels',
    'community_replies',
    'community_reports',
    'community_resource_reports',
    'community_resources',
    'community_spaces',
    'community_threads',
    'copyright_claims',
    'course_sections',
    'courses',
    'exam_competition_metrics',
    'exam_cycles',
    'exam_eligibility_rules',
    'exam_families',
    'exam_phase_sections',
    'exam_phases',
    'exam_policy_updates',
    'exam_topic_coverage',
    'exams',
    'flashcard_decks',
    'flashcards',
    'form_submissions',
    'forum_categories',
    'forum_comments',
    'forum_posts',
    'forum_reports',
    'forum_reputation',
    'funnel_sessions',
    'mentor_bookings',
    'mentor_verification',
    'mistake_entries',
    'moderation_items',
    'notification_group_state',
    'notification_preferences',
    'onboarding_sessions',
    'persona_question_bank',
    'personal_notes',
    'profiles',
    'pyq_option_repetitions',
    'pyq_papers',
    'pyq_questions',
    'recruitment_candidates',
    'recruitment_question_requirements',
    'recruitments',
    'revision_items',
    'source_registry',
    'study_comparison_settings',
    'study_plans',
    'study_sessions',
    'study_tasks',
    'subjects',
    'syllabus_documents',
    'topic_relation_edges',
    'topics',
    'user_study_plan_preferences',
    'user_topic_error_patterns',
    'user_topic_mastery'
  ];
begin
  foreach t in array targets loop
    -- Skip tables that don't exist in this environment (e.g. partial
    -- branch state) and tables that lack an `updated_at` column.
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'updated_at'
    ) then
      raise notice 'skipping %: no updated_at column found', t;
      continue;
    end if;

    execute format(
      'drop trigger if exists %I on public.%I',
      t || '_updated_at', t
    );
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.tg_set_updated_at()',
      t || '_updated_at', t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
