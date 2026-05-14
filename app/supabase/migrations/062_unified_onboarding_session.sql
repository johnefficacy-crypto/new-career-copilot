-- 062_unified_onboarding_session.sql
--
-- Unified Guided Onboarding — Sprint 1.
--
-- Unifies the two existing onboarding entry paths (recruitment-aware CTA
-- funnel + cold homepage discovery) onto ONE session engine. This
-- migration is intentionally ADDITIVE: it does not rename, drop, or
-- change the semantics of any existing table.
--
-- It reuses the migration 016 onboarding/funnel runtime tables
-- (funnel_sessions, onboarding_sessions, onboarding_answers,
-- candidate_field_registry, recruitment_question_requirements) and the
-- migration 053 progressive persona tables (persona_question_bank,
-- persona_question_answers, persona_question_dismissals). Nothing here
-- duplicates those.
--
-- Changes:
--   A. onboarding_sessions — extra columns the unified engine needs so a
--      cold (intent-unknown) session and a CTA (intent-known) session can
--      share the same row shape: anonymous_id, intent, entry_mode,
--      recruitment/post context, asked-question tracking, and a hard
--      question cap counter.
--   B. onboarding_session_answers — a generic, source-agnostic answer log
--      for the unified engine. Unlike onboarding_answers (which is keyed
--      to candidate_field_registry) this log can hold the intent-picker
--      answer and persona_question_bank answers, and it supports
--      anonymous_id rows so 2-3 questions can be answered before login
--      and stitched to a user afterwards. It is a log / audit / signal
--      store — NOT canonical profile truth.

-- ─── A. onboarding_sessions: unified engine columns ──────────────────────
alter table public.onboarding_sessions
  add column if not exists anonymous_id text;

alter table public.onboarding_sessions
  add column if not exists intent text;

alter table public.onboarding_sessions
  add column if not exists entry_mode text not null default 'cold';

alter table public.onboarding_sessions
  add column if not exists recruitment_id uuid references public.recruitments(id) on delete set null;

alter table public.onboarding_sessions
  add column if not exists post_id uuid references public.posts(id) on delete set null;

-- current_field_key (migration 016) is FK-bound to candidate_field_registry
-- and cannot hold an intent-picker key or a persona_question_bank key.
-- These two columns let the engine resume on ANY question source.
alter table public.onboarding_sessions
  add column if not exists current_question_key text;

alter table public.onboarding_sessions
  add column if not exists current_question_source text;

-- Every question presented (answered OR skipped) is appended here so the
-- selector never re-asks within a session and the 7-question hard cap is
-- enforceable across all question sources.
alter table public.onboarding_sessions
  add column if not exists asked_question_keys jsonb not null default '[]'::jsonb;

alter table public.onboarding_sessions
  add column if not exists question_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'onboarding_sessions_entry_mode_check'
      and conrelid = 'public.onboarding_sessions'::regclass
  ) then
    alter table public.onboarding_sessions
      add constraint onboarding_sessions_entry_mode_check
      check (entry_mode in ('cold', 'cta', 'discovery'));
  end if;
end $$;

create index if not exists idx_onboarding_sessions_anonymous
  on public.onboarding_sessions(anonymous_id, status);

-- ─── B. onboarding_session_answers: unified answer log ───────────────────
create table if not exists public.onboarding_session_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.onboarding_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,

  -- 'intent_picker' | 'persona_question_bank' | 'recruitment_question_requirements'
  question_source text not null,
  question_key text not null,

  answer_value jsonb,
  normalized_value jsonb,
  skipped boolean not null default false,

  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'onboarding_session_answers_source_check'
      and conrelid = 'public.onboarding_session_answers'::regclass
  ) then
    alter table public.onboarding_session_answers
      add constraint onboarding_session_answers_source_check
      check (
        question_source in (
          'intent_picker',
          'persona_question_bank',
          'recruitment_question_requirements'
        )
      );
  end if;
end $$;

create index if not exists idx_onboarding_session_answers_session
  on public.onboarding_session_answers(session_id, created_at);

create index if not exists idx_onboarding_session_answers_anonymous
  on public.onboarding_session_answers(anonymous_id, created_at);

create index if not exists idx_onboarding_session_answers_user
  on public.onboarding_session_answers(user_id, created_at);

comment on table public.onboarding_session_answers is
  'Source-agnostic answer log for the unified guided onboarding engine. Holds intent-picker, persona_question_bank, and recruitment_question_requirements answers (incl. anonymous rows). Log/audit/signal store only — canonical profile truth lives in profiles/aspirant_* via the profile adapter.';

-- Backend service role only, matching the migration 016 + 053 tables.
alter table public.onboarding_session_answers enable row level security;

notify pgrst, 'reload schema';
