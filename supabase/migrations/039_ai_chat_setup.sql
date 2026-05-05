-- =============================================================================
-- MIGRATION: chat_sessions
-- Phase 8 — AI Career Chat
--
-- Run in Supabase SQL Editor AFTER the existing migrations.
-- =============================================================================

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL DEFAULT 'Career chat',
  messages   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indices ───────────────────────────────────────────────────────────────────

-- Fast lookup by user (sidebar list)
CREATE INDEX IF NOT EXISTS chat_sessions_user_id_updated_at_idx
  ON public.chat_sessions (user_id, updated_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_chat_sessions_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own sessions
DROP POLICY IF EXISTS "Users read own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users read own chat sessions" ON chat_sessions;
CREATE POLICY "Users read own chat sessions"
  ON public.chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own sessions
-- (The API route creates sessions via createClient() which inherits the user's session)
DROP POLICY IF EXISTS "Users insert own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users insert own chat sessions" ON chat_sessions;
CREATE POLICY "Users insert own chat sessions"
  ON public.chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions (append messages)
DROP POLICY IF EXISTS "Users update own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users update own chat sessions" ON chat_sessions;
CREATE POLICY "Users update own chat sessions"
  ON public.chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own sessions
DROP POLICY IF EXISTS "Users delete own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users delete own chat sessions" ON chat_sessions;
CREATE POLICY "Users delete own chat sessions"
  ON public.chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ── Verification ──────────────────────────────────────────────────────────────

SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'chat_sessions'
ORDER BY ordinal_position;