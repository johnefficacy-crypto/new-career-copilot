-- =============================================================================
-- Migration 020: AI Infrastructure
-- Tables: ai_prompt_versions, ai_jobs, ai_review_queue,
--         user_next_actions, study_tasks, study_sessions
-- =============================================================================

-- ─── ai_prompt_versions ───────────────────────────────────────────────────────
-- Single source of truth for every AI prompt used in production.
-- Every AI job must reference a prompt_key + version from this table.

CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_key      TEXT         NOT NULL,
  version         INTEGER      NOT NULL DEFAULT 1,
  model_name      TEXT         NOT NULL DEFAULT 'claude-sonnet-4-6',
  prompt_template TEXT         NOT NULL,
  json_schema     JSONB,
  confidence_policy JSONB,      -- { "auto_accept": 0.85, "review": 0.65 }
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW() NOT NULL,
  UNIQUE (prompt_key, version)
);

COMMENT ON TABLE ai_prompt_versions IS
  'Versioned prompt registry. Every production AI job must reference a row here.';

-- ─── ai_jobs ─────────────────────────────────────────────────────────────────
-- Tracks every AI job: input, output, confidence, latency, and status.
-- Used for observability, cost tracking, and admin audit.

CREATE TABLE IF NOT EXISTS ai_jobs (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type     TEXT,                        -- 'recruitment' | 'study_plan' | 'note' | 'user'
  entity_id       TEXT,
  job_type        TEXT         NOT NULL,       -- 'next_actions' | 'study_plan' | 'eligibility_explain'
                                               -- | 'mock_analysis' | 'note_summary' | 'pyq_classify'
  status          TEXT         DEFAULT 'pending'
                               CHECK (status IN ('pending','running','done','failed')),
  priority        INTEGER      DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  input_json      JSONB,
  output_json     JSONB,
  confidence_score REAL,
  model_name      TEXT,
  prompt_key      TEXT,
  prompt_version  INTEGER,
  token_count     INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW() NOT NULL,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_jobs_user_id_idx    ON ai_jobs (user_id);
CREATE INDEX IF NOT EXISTS ai_jobs_status_idx     ON ai_jobs (status);
CREATE INDEX IF NOT EXISTS ai_jobs_job_type_idx   ON ai_jobs (job_type);

COMMENT ON TABLE ai_jobs IS
  'Audit log for every AI job. Tracks input, output, confidence, latency, and status.';

-- ─── ai_review_queue ─────────────────────────────────────────────────────────
-- Items that need admin review before being used in user-facing features.
-- Populated when confidence_score is below auto-accept threshold.

CREATE TABLE IF NOT EXISTS ai_review_queue (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ai_job_id           UUID        REFERENCES ai_jobs(id) ON DELETE CASCADE,
  entity_type         TEXT,
  entity_id           TEXT,
  field_name          TEXT,
  proposed_value_json JSONB,
  evidence_json       JSONB,
  confidence_score    REAL,
  review_status       TEXT        DEFAULT 'pending'
                                  CHECK (review_status IN ('pending','approved','rejected','corrected')),
  reviewed_by         UUID        REFERENCES auth.users(id),
  reviewed_at         TIMESTAMPTZ,
  admin_notes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_review_queue_status_idx ON ai_review_queue (review_status);

COMMENT ON TABLE ai_review_queue IS
  'Admin review queue for low-confidence AI outputs before they reach users.';

-- ─── user_next_actions ───────────────────────────────────────────────────────
-- Prioritised action list for each user. Generated deterministically from
-- eligibility results, deadlines, profile gaps, and study plan state.
-- Rendered as the "What should I do next?" panel on the dashboard.

CREATE TABLE IF NOT EXISTS user_next_actions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT        NOT NULL CHECK (action_type IN (
                            'apply_now',
                            'deadline_alert',
                            'complete_profile',
                            'study_today',
                            'setup_plan',
                            'check_eligibility',
                            'check_notifications',
                            'mock_test'
                          )),
  title       TEXT        NOT NULL,
  description TEXT,
  cta_label   TEXT,
  cta_url     TEXT,
  source_type TEXT,       -- 'recruitment' | 'study_plan' | 'profile' | 'eligibility' | 'notification'
  source_id   TEXT,       -- recruitment_id / plan_id / etc.
  priority    INTEGER     DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),  -- 1 = highest urgency
  due_at      TIMESTAMPTZ,
  status      TEXT        DEFAULT 'pending'
                          CHECK (status IN ('pending','done','snoozed','dismissed')),
  snoozed_until TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ  -- auto-expire stale actions
);

CREATE INDEX IF NOT EXISTS user_next_actions_user_status_idx
  ON user_next_actions (user_id, status);

ALTER TABLE user_next_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_next_actions_own" ON user_next_actions;
CREATE POLICY "user_next_actions_own"
  ON user_next_actions
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE user_next_actions IS
  'Prioritised next-best-action list per user. Regenerated on eligibility recompute, '
  'deadline sweep, study plan updates, and profile changes.';

-- ─── study_tasks ─────────────────────────────────────────────────────────────
-- Daily granular tasks derived from a study plan week.
-- Each task is a concrete unit of work: read, practice, revise, mock.

CREATE TABLE IF NOT EXISTS study_tasks (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id      UUID        REFERENCES study_plans(id) ON DELETE CASCADE NOT NULL,
  week_id      UUID        REFERENCES study_weeks(id) ON DELETE CASCADE,
  day_label    TEXT        NOT NULL,   -- 'Monday' | 'Day 1' | ISO date string
  subject      TEXT,
  topic        TEXT,
  microtopic   TEXT,
  task_type    TEXT        DEFAULT 'study'
                           CHECK (task_type IN ('study','practice','revise','mock','read','watch')),
  title        TEXT        NOT NULL,
  description  TEXT,
  duration_mins INTEGER,
  resources    JSONB,      -- [{ title, url, type }]
  status       TEXT        DEFAULT 'pending'
                           CHECK (status IN ('pending','in_progress','done','skipped')),
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS study_tasks_user_plan_idx ON study_tasks (user_id, plan_id);
CREATE INDEX IF NOT EXISTS study_tasks_status_idx    ON study_tasks (user_id, status);

ALTER TABLE study_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_tasks_own" ON study_tasks;
CREATE POLICY "study_tasks_own"
  ON study_tasks
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE study_tasks IS
  'Daily execution tasks derived from study_weeks. Tracks completion at task level.';

-- ─── study_sessions ──────────────────────────────────────────────────────────
-- Focus timer sessions. Each session is linked to an exam/subject/topic/task.
-- Used to build time-spent analytics and feed AI weekly reports.

CREATE TABLE IF NOT EXISTS study_sessions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id       UUID        REFERENCES study_plans(id) ON DELETE SET NULL,
  task_id       UUID        REFERENCES study_tasks(id) ON DELETE SET NULL,
  exam_name     TEXT,
  subject       TEXT,
  topic         TEXT,
  session_type  TEXT        DEFAULT 'focus'
                            CHECK (session_type IN ('focus','pomodoro','review','mock')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  duration_mins INTEGER,    -- computed or manual override
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS study_sessions_user_idx ON study_sessions (user_id);

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_sessions_own" ON study_sessions;
CREATE POLICY "study_sessions_own"
  ON study_sessions
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE study_sessions IS
  'Focus timer sessions. Each session links to plan/task/exam/subject for time analytics.';
