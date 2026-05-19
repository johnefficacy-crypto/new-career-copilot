-- Per-attempt audit + streak source for the trap-awareness drill.
-- One row per (user, question) attempt within a drill run.
-- ``drill_seed`` lets us correlate attempts from the same shuffled run
-- and powers deep-linkable drills (re-open the same five questions in
-- the same order). ``option_id`` is nullable because options can be
-- archived from under us; the boolean ``is_correct`` is the durable
-- truth.

create table if not exists public.user_trap_drill_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  question_id uuid not null references public.pyq_questions(id) on delete cascade,
  option_id uuid references public.pyq_options(id) on delete set null,
  is_correct boolean not null,
  drill_seed text,
  attempted_at timestamptz not null default now()
);

-- "Has this user missed this question before?" — the join key for
-- adaptive ranking in build_trap_drill.
create index if not exists user_trap_drill_attempts_user_q_idx
  on public.user_trap_drill_attempts(user_id, question_id, is_correct);

-- Streak / "this week" lookups walk attempts in reverse time order.
create index if not exists user_trap_drill_attempts_user_time_idx
  on public.user_trap_drill_attempts(user_id, attempted_at desc);

-- Per-exam streak lookups.
create index if not exists user_trap_drill_attempts_user_exam_time_idx
  on public.user_trap_drill_attempts(user_id, exam_id, attempted_at desc);

alter table public.user_trap_drill_attempts enable row level security;

-- Users see only their own attempts. The backend talks to Supabase via
-- the service role so it bypasses RLS, but this keeps direct PostgREST
-- access honest.
drop policy if exists user_trap_drill_attempts_own
  on public.user_trap_drill_attempts;
create policy user_trap_drill_attempts_own
  on public.user_trap_drill_attempts
  for select
  using (user_id = auth.uid());

drop policy if exists user_trap_drill_attempts_insert_own
  on public.user_trap_drill_attempts;
create policy user_trap_drill_attempts_insert_own
  on public.user_trap_drill_attempts
  for insert
  with check (user_id = auth.uid());
