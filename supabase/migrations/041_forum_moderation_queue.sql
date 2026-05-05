-- Migration: 041_forum_moderation_queue
-- Purpose: moderation queue + severity model for forum trust operations

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forum_report_target_type') THEN
    CREATE TYPE public.forum_report_target_type AS ENUM ('post', 'comment');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forum_report_status') THEN
    CREATE TYPE public.forum_report_status AS ENUM ('open', 'in_review', 'resolved', 'dismissed', 'escalated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forum_report_severity') THEN
    CREATE TYPE public.forum_report_severity AS ENUM ('p0_harmful', 'p1_misleading', 'p2_spam_noise');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type public.forum_report_target_type NOT NULL,
  post_id uuid NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  comment_id uuid NULL REFERENCES public.forum_comments(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text NULL,
  severity public.forum_report_severity NOT NULL DEFAULT 'p2_spam_noise',
  status public.forum_report_status NOT NULL DEFAULT 'open',
  assigned_admin_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action_notes text NULL,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forum_reports_target_check CHECK (
    (target_type = 'post' AND post_id IS NOT NULL AND comment_id IS NULL)
    OR
    (target_type = 'comment' AND comment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_forum_reports_status_created ON public.forum_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_reports_severity_status ON public.forum_reports(severity, status);
CREATE INDEX IF NOT EXISTS idx_forum_reports_post_id ON public.forum_reports(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forum_reports_comment_id ON public.forum_reports(comment_id) WHERE comment_id IS NOT NULL;

ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users create forum reports" ON public.forum_reports;
CREATE POLICY "Users create forum reports"
  ON public.forum_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "Users read own reports" ON public.forum_reports;
CREATE POLICY "Users read own reports"
  ON public.forum_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "Admins manage forum reports" ON public.forum_reports;
CREATE POLICY "Admins manage forum reports"
  ON public.forum_reports FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_admin = true OR p.admin_role IS NOT NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_admin = true OR p.admin_role IS NOT NULL)
    )
  );

CREATE OR REPLACE FUNCTION public.forum_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_reports_updated_at ON public.forum_reports;
CREATE TRIGGER trg_forum_reports_updated_at
BEFORE UPDATE ON public.forum_reports
FOR EACH ROW
EXECUTE FUNCTION public.forum_reports_set_updated_at();
