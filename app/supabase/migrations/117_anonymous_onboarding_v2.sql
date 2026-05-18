-- 117 — anonymous onboarding v2 columns.
--
-- The new onboarding flow uses Supabase anonymous auth: the JWT carries
-- `is_anonymous=true` and the same `profiles.id` survives across the
-- guest → linked-identity transition. We denormalize the JWT claim onto
-- the row so the cleanup cron has an index it can use, and we move the
-- onboarding state machine off `onboarding_sessions` and onto a couple
-- of simple columns on `profiles`.
--
-- Backward-compatible: existing rows default to `is_anonymous=false`
-- and `onboarding_step=null` (treated as "completed" by callers that
-- check `onboarding_completed`). The legacy `onboarding_sessions` /
-- `onboarding_session_answers` / `funnel_sessions` tables are NOT
-- dropped here — frontend keeps reading them until the new flow ships.

alter table public.profiles
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists onboarding_step text,
  add column if not exists persona_seed jsonb;

-- Partial index — only the (typically short-lived) anonymous rows are
-- interesting to the cleanup job; permanent users never appear here.
create index if not exists idx_profiles_is_anonymous_created_at
  on public.profiles (is_anonymous, created_at)
  where is_anonymous = true;
