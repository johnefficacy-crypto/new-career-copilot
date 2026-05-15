-- 050_attempt_identity_split.sql
--
-- P1 #1 from the post-#138 audit: split eligibility attempt counts into
-- three scopes — exam-family (career-wide, e.g. SSC-CGL), recruitment-cycle
-- (e.g. SSC-CGL 2026), and post-specific. Until this migration:
--
--   * `aspirant_exam_attempts` carried exam-family attempts (legacy
--     `exam_id` column; migration 030 added `exam_ref_id` → `exams.id`).
--   * No table existed for cycle-specific or post-specific attempts.
--   * `attempt_limits.attempt_scope` was implicit — the runner stuffed
--     `exam_id` into a field called `recruitment_id` and the engine
--     matched on that, which is the ambiguity this PR removes.
--
-- Three changes:
--   1. `attempt_limits.attempt_scope` — explicit scope per limit row, so
--      a post can declare cycle-specific caps alongside exam-family caps
--      (each row picks its own scope).
--   2. `aspirant_recruitment_attempts` — new table for cycle/post counts.
--      Unique on (user_id, recruitment_id, post_id) so the cycle slot and
--      per-post slots can coexist (post_id null = cycle-scope row).
--   3. `recruitments.exam_id` — the missing back-link from recruitment to
--      its exam family. Mirrors `aspirant_exam_attempts.exam_ref_id`, so
--      the engine can match `user_attempt.exam_id == recruitment.exam_id`
--      for the exam-family scope.
--
-- Existing rows are left at the safest default — `attempt_scope='exam_family'`
-- — which preserves today's behaviour (the engine treats the legacy
-- `aspirant_exam_attempts` records as exam-family-scoped). New canonical
-- criteria can opt in to `'recruitment'` or `'post'` going forward.

------------------------------------------------------------
-- 1. attempt_limits.attempt_scope
------------------------------------------------------------

alter table public.attempt_limits
    add column if not exists attempt_scope text not null default 'exam_family'
        check (attempt_scope in ('exam_family', 'recruitment', 'post'));

comment on column public.attempt_limits.attempt_scope is
    'Granularity of the attempt cap: exam_family (career-wide, default), recruitment (per cycle), or post (per cycle+post). The engine routes the user''s attempts_used lookup based on this value.';

------------------------------------------------------------
-- 2. aspirant_recruitment_attempts
------------------------------------------------------------

create table if not exists public.aspirant_recruitment_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    recruitment_id uuid not null references public.recruitments(id) on delete cascade,
    -- Null `post_id` means "this row covers the whole recruitment cycle".
    -- A non-null `post_id` means "post-specific count within this cycle".
    -- Both can coexist for a single (user, recruitment).
    post_id uuid references public.posts(id) on delete cascade,
    attempts_used integer not null default 0
        check (attempts_used >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Unique slot per (user, recruitment, post). post_id=null collapses to a
-- single cycle-scope slot per user/recruitment; with the index spec below
-- we get a stable uniqueness guarantee regardless of NULL handling.
create unique index if not exists uq_aspirant_recruitment_attempts_user_rec_post
    on public.aspirant_recruitment_attempts
    (user_id, recruitment_id, coalesce(post_id::text, '__cycle__'));

create index if not exists idx_aspirant_recruitment_attempts_user
    on public.aspirant_recruitment_attempts (user_id);

create index if not exists idx_aspirant_recruitment_attempts_recruitment
    on public.aspirant_recruitment_attempts (recruitment_id);

comment on table public.aspirant_recruitment_attempts is
    'Per-cycle (and per-post) eligibility attempt counts. Used when an attempt_limits row has attempt_scope=''recruitment'' or ''post''. Exam-family counts continue to live in aspirant_exam_attempts.';

------------------------------------------------------------
-- 3. recruitments.exam_id — back-link to exams taxonomy
------------------------------------------------------------

alter table public.recruitments
    add column if not exists exam_id uuid references public.exams(id) on delete set null;

create index if not exists idx_recruitments_exam
    on public.recruitments (exam_id);

comment on column public.recruitments.exam_id is
    'FK to public.exams. Used by the eligibility engine to match exam-family attempt counts (aspirant_exam_attempts.exam_ref_id == recruitments.exam_id). Nullable: pre-existing recruitments can be backfilled.';

notify pgrst, 'reload schema';
