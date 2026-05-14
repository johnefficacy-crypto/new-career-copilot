-- 085_progressive_persona_questions.sql
--
-- PR2: Progressive Tiny Questions v1.
--
-- Builds on the PR1 persona foundation (migration 084). Adds a small
-- question registry, an answer/audit table, and an optional dismissal
-- table so the backend can ask one tiny question at a time to improve
-- profile completeness and persona confidence.
--
-- This migration intentionally does NOT touch or duplicate the migration
-- 016 onboarding/chat runtime tables (candidate_field_registry,
-- onboarding_sessions, onboarding_answers, funnel_events). Those tables
-- own the recruitment-aware onboarding flow; progressive persona
-- questions are a separate, internal layer.
--
-- Tables added:
--   A. persona_question_bank          - question registry (one row per question_key)
--   B. persona_question_answers       - per-user answers + audit
--   C. persona_question_dismissals    - per-user "not now" suppression
--
-- All access is via the backend service role. RLS is enabled with no
-- policies so direct anon/auth queries are blocked, mirroring the PR1
-- persona tables.

-- ─── A. persona_question_bank ─────────────────────────────────────────────
create table if not exists public.persona_question_bank (
  id uuid primary key default gen_random_uuid(),

  question_key text not null unique,
  field_key text,
  question_text text not null,
  help_text text,

  data_type text not null,

  options jsonb not null default '[]'::jsonb,

  target_dimension text,
  target_profile_group text,
  profile_table text,
  profile_column text,

  priority int not null default 100,
  trigger_rules jsonb not null default '{}'::jsonb,
  applies_when jsonb not null default '{}'::jsonb,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'persona_question_bank_data_type_check'
  ) then
    alter table public.persona_question_bank
      add constraint persona_question_bank_data_type_check
      check (
        data_type in ('text', 'number', 'date', 'boolean', 'single_select', 'multi_select', 'json')
      );
  end if;
end $$;

create index if not exists idx_persona_question_bank_active_priority
  on public.persona_question_bank(is_active, priority);

comment on table public.persona_question_bank is
  'Registry of tiny progressive questions used to improve profile/persona signals. Internal layer; never displayed as identity labels to users.';

-- ─── B. persona_question_answers ──────────────────────────────────────────
create table if not exists public.persona_question_answers (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  question_key text not null references public.persona_question_bank(question_key),

  answer_value jsonb,
  normalized_value jsonb,
  skipped boolean not null default false,

  source text not null default 'persona_tiny_question',
  confidence numeric,
  needs_review boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_persona_question_answers_user_question
  on public.persona_question_answers(user_id, question_key, created_at desc);

create index if not exists idx_persona_question_answers_user_created
  on public.persona_question_answers(user_id, created_at desc);

comment on table public.persona_question_answers is
  'Append-only answers to persona tiny questions. Audit/interaction store; canonical profile data lives in profiles/aspirant_preferences. The persona classifier reads the latest answer per (user_id, question_key).';

-- ─── C. persona_question_dismissals ──────────────────────────────────────
create table if not exists public.persona_question_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_key text not null references public.persona_question_bank(question_key),
  dismissed_until timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, question_key)
);

create index if not exists idx_persona_question_dismissals_user
  on public.persona_question_dismissals(user_id, dismissed_until);

comment on table public.persona_question_dismissals is
  'Per-user "not now" suppression so the selector does not re-ask a dismissed question until dismissed_until passes.';

-- ─── RLS: backend-only ────────────────────────────────────────────────────
alter table public.persona_question_bank enable row level security;
alter table public.persona_question_answers enable row level security;
alter table public.persona_question_dismissals enable row level security;

-- ─── Seed: v1 safe questions ──────────────────────────────────────────────
-- All seeded questions are non-sensitive and target observable study
-- behaviour or availability. No caste / category / financial / family
-- inference. `idempotent` upserts: use unique question_key.

insert into public.persona_question_bank
  (question_key, question_text, help_text, data_type, options, target_dimension, priority)
values
  (
    'preparation_stage_self_assessment',
    'Where are you currently in your preparation?',
    'Helps us choose the right starting point for your plan.',
    'single_select',
    '[
       {"value":"just_starting","label":"Just starting"},
       {"value":"studied_before_restarting","label":"Studied before, restarting"},
       {"value":"currently_preparing","label":"Currently preparing"},
       {"value":"already_attempted_exam","label":"Already attempted the exam"},
       {"value":"final_revision_phase","label":"Final revision phase"}
     ]'::jsonb,
    'preparation_stage',
    10
  ),
  (
    'weekday_study_availability',
    'How much time can you realistically study on a normal weekday?',
    null,
    'single_select',
    '[
       {"value":"less_than_1_hour","label":"Less than 1 hour"},
       {"value":"1_to_2_hours","label":"1 to 2 hours"},
       {"value":"2_to_4_hours","label":"2 to 4 hours"},
       {"value":"4_plus_hours","label":"4 hours or more"}
     ]'::jsonb,
    'time_constraint',
    20
  ),
  (
    'weekend_study_availability',
    'How much time can you study on weekends?',
    null,
    'single_select',
    '[
       {"value":"less_than_2_hours","label":"Less than 2 hours"},
       {"value":"2_to_4_hours","label":"2 to 4 hours"},
       {"value":"4_to_8_hours","label":"4 to 8 hours"},
       {"value":"8_plus_hours","label":"8 hours or more"}
     ]'::jsonb,
    'time_constraint',
    30
  ),
  (
    'study_consistency_blocker',
    'What usually breaks your study plan?',
    'Pick the one that affects you most. We will adjust your plan, not judge.',
    'single_select',
    '[
       {"value":"job_or_college_schedule","label":"Job or college schedule"},
       {"value":"family_responsibilities","label":"Family responsibilities"},
       {"value":"phone_distraction","label":"Phone distraction"},
       {"value":"low_energy","label":"Low energy"},
       {"value":"unclear_plan","label":"Unclear plan"},
       {"value":"subject_difficulty","label":"Subject difficulty"},
       {"value":"other","label":"Something else"}
     ]'::jsonb,
    'execution_risk',
    40
  ),
  (
    'mock_behavior',
    'How do you usually handle mock tests?',
    null,
    'single_select',
    '[
       {"value":"avoid_mocks","label":"I avoid mocks"},
       {"value":"take_mocks_but_skip_analysis","label":"I take mocks but skip analysis"},
       {"value":"analyze_mocks_sometimes","label":"I analyze sometimes"},
       {"value":"analyze_every_mock","label":"I analyze every mock"},
       {"value":"not_started_mocks_yet","label":"Have not started mocks yet"}
     ]'::jsonb,
    'learning_behavior',
    50
  ),
  (
    'revision_behavior',
    'How often do you revise old topics?',
    null,
    'single_select',
    '[
       {"value":"rarely","label":"Rarely"},
       {"value":"only_before_exam","label":"Only before exam"},
       {"value":"weekly","label":"Weekly"},
       {"value":"after_mistakes","label":"After mistakes"},
       {"value":"with_spaced_revision","label":"With spaced revision"}
     ]'::jsonb,
    'learning_behavior',
    60
  ),
  (
    'preferred_plan_style',
    'What type of study plan works better for you?',
    null,
    'single_select',
    '[
       {"value":"strict_daily_schedule","label":"Strict daily schedule"},
       {"value":"flexible_task_list","label":"Flexible task list"},
       {"value":"short_focus_blocks","label":"Short focus blocks"},
       {"value":"weekly_targets_only","label":"Weekly targets only"}
     ]'::jsonb,
    'study_policy',
    70
  ),
  (
    'primary_weak_area',
    'Which area currently feels weakest?',
    null,
    'single_select',
    '[
       {"value":"quant","label":"Quant"},
       {"value":"reasoning","label":"Reasoning"},
       {"value":"english","label":"English"},
       {"value":"general_awareness","label":"General awareness"},
       {"value":"current_affairs","label":"Current affairs"},
       {"value":"descriptive_writing","label":"Descriptive writing"},
       {"value":"interview","label":"Interview"},
       {"value":"not_sure","label":"Not sure yet"}
     ]'::jsonb,
    'learning_behavior',
    80
  )
on conflict (question_key) do nothing;

notify pgrst, 'reload schema';
