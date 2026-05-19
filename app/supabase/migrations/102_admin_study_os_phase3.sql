-- Admin Study OS — Phase 3 + open-content schema additions.
--
-- 1. ``support_content_access`` — durable log of every admin "open content"
--    action against a user-owned artifact (note body, flashcard
--    front/back, mistake question text). The audit_logs table covers the
--    fact that a write occurred; this table separately answers "who read
--    what content for which user". Kept separate from admin_audit_logs so
--    privacy reviews can filter to content reads without trawling the
--    general admin audit trail.
--
-- 2. ``is_hidden`` on ``study_leaderboard_entries`` — Phase 3 leaderboard
--    abuse handling. Today, visibility is enforced via RLS on the read
--    path; adding a row-level admin override means hide/restore is a
--    bounded UPDATE rather than a fan-out across cohort/period rows.
--
-- 3. ``is_hidden`` on ``mentor_session_feedback`` — Phase 3 mentor
--    feedback governance. Same pattern: row-level boolean an admin can
--    flip; the read path filters on it.

create table if not exists public.support_content_access (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('note','flashcard','mistake')),
  artifact_id uuid not null,
  fields_returned text[] not null default '{}',
  reason text not null check (char_length(reason) >= 8),
  created_at timestamptz not null default now()
);

create index if not exists support_content_access_user_idx
  on public.support_content_access (user_id, created_at desc);
create index if not exists support_content_access_actor_idx
  on public.support_content_access (actor_id, created_at desc);

alter table public.study_leaderboard_entries
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null,
  add column if not exists hidden_at timestamptz;

create index if not exists sle_visible_only_idx
  on public.study_leaderboard_entries (board_type, period_end desc)
  where is_hidden = false;

alter table public.mentor_session_feedback
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null,
  add column if not exists hidden_at timestamptz;
