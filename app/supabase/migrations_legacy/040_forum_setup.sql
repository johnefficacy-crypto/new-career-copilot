-- ============================================================
-- Migration: 040_forum_setup
-- Phase 8 — Community Forum
-- ============================================================
-- NOTE: The 7 forum tables already exist from the initial schema.
-- This migration adds the missing pieces:
--   1. RLS policies on all forum tables (using admin_role, NOT is_admin)
--   2. Triggers to keep denormalised counts accurate
--   3. Triggers to maintain forum_reputation
--   4. Full-text search index on forum_posts
--   5. Seed data for forum categories
-- ============================================================

-- ── 1. Enable RLS on all forum tables ────────────────────────────────────────

ALTER TABLE public.forum_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_post_upvotes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_saved_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reputation      ENABLE ROW LEVEL SECURITY;

-- ── Helper: RBAC-compliant admin check ───────────────────────────────────────
-- Uses admin_role IS NOT NULL — consistent with lib/db/admin.ts requireAdminRole().
-- Never use is_admin = true in new policies (legacy field, will be deprecated).

CREATE OR REPLACE FUNCTION public.is_any_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND admin_role IS NOT NULL
  );
$$;

-- ── 2. RLS Policies ───────────────────────────────────────────────────────────

-- Categories — public read, admin write only
DROP POLICY IF EXISTS "Forum categories are public" ON public.forum_categories;
CREATE POLICY "Forum categories are public"
  ON public.forum_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage forum categories" ON public.forum_categories;
CREATE POLICY "Admins manage forum categories"
  ON public.forum_categories FOR ALL
  USING  (public.is_any_admin())
  WITH CHECK (public.is_any_admin());

-- Posts — public read, authenticated write
DROP POLICY IF EXISTS "Forum posts are public" ON public.forum_posts;
CREATE POLICY "Forum posts are public"
  ON public.forum_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users create posts" ON public.forum_posts;
CREATE POLICY "Authenticated users create posts"
  ON public.forum_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own posts" ON public.forum_posts;
CREATE POLICY "Users update own posts"
  ON public.forum_posts FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own posts or admins delete any" ON public.forum_posts;
CREATE POLICY "Users delete own posts or admins delete any"
  ON public.forum_posts FOR DELETE
  USING (auth.uid() = user_id OR public.is_any_admin());

-- Comments
DROP POLICY IF EXISTS "Forum comments are public" ON public.forum_comments;
CREATE POLICY "Forum comments are public"
  ON public.forum_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users create comments" ON public.forum_comments;
CREATE POLICY "Authenticated users create comments"
  ON public.forum_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own comments" ON public.forum_comments;
CREATE POLICY "Users update own comments"
  ON public.forum_comments FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own comments or admins delete any" ON public.forum_comments;
CREATE POLICY "Users delete own comments or admins delete any"
  ON public.forum_comments FOR DELETE
  USING (auth.uid() = user_id OR public.is_any_admin());

-- Upvotes — users manage their own
DROP POLICY IF EXISTS "Users manage own post upvotes" ON public.forum_post_upvotes;
CREATE POLICY "Users manage own post upvotes"
  ON public.forum_post_upvotes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Post upvotes public read" ON public.forum_post_upvotes;
CREATE POLICY "Post upvotes public read"
  ON public.forum_post_upvotes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own comment upvotes" ON public.forum_comment_upvotes;
CREATE POLICY "Users manage own comment upvotes"
  ON public.forum_comment_upvotes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Comment upvotes public read" ON public.forum_comment_upvotes;
CREATE POLICY "Comment upvotes public read"
  ON public.forum_comment_upvotes FOR SELECT USING (true);

-- Saved posts
DROP POLICY IF EXISTS "Users manage own saved posts" ON public.forum_saved_posts;
CREATE POLICY "Users manage own saved posts"
  ON public.forum_saved_posts FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reputation — public read, system write only (triggers only, no user writes)
DROP POLICY IF EXISTS "Reputation is public" ON public.forum_reputation;
CREATE POLICY "Reputation is public"
  ON public.forum_reputation FOR SELECT USING (true);

-- ── 3. Denormalised count triggers ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_post_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_post_reply_count
  AFTER INSERT OR DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_post_reply_count();

CREATE OR REPLACE FUNCTION public.update_post_upvote_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_posts SET upvote_count = upvote_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_posts SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_post_upvote_count
  AFTER INSERT OR DELETE ON public.forum_post_upvotes
  FOR EACH ROW EXECUTE FUNCTION public.update_post_upvote_count();

CREATE OR REPLACE FUNCTION public.update_comment_upvote_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_comments SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_comment_upvote_count
  AFTER INSERT OR DELETE ON public.forum_comment_upvotes
  FOR EACH ROW EXECUTE FUNCTION public.update_comment_upvote_count();

CREATE OR REPLACE FUNCTION public.update_category_post_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_categories SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.category_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_category_post_count
  AFTER INSERT OR DELETE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_category_post_count();

-- ── 4. Reputation trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.maintain_forum_reputation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_user uuid;
  pts         integer;
BEGIN
  IF TG_TABLE_NAME = 'forum_posts' THEN
    target_user := COALESCE(NEW.user_id, OLD.user_id);
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.forum_reputation (user_id, points, posts_count)
        VALUES (target_user, 2, 1)
        ON CONFLICT (user_id) DO UPDATE
          SET points      = forum_reputation.points + 2,
              posts_count = forum_reputation.posts_count + 1;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.forum_reputation
        SET points      = GREATEST(points - 2, 0),
            posts_count = GREATEST(posts_count - 1, 0)
        WHERE user_id = target_user;
    END IF;

  ELSIF TG_TABLE_NAME = 'forum_comments' THEN
    target_user := COALESCE(NEW.user_id, OLD.user_id);
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.forum_reputation (user_id, points, comments_count)
        VALUES (target_user, 1, 1)
        ON CONFLICT (user_id) DO UPDATE
          SET points         = forum_reputation.points + 1,
              comments_count = forum_reputation.comments_count + 1;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.forum_reputation
        SET points         = GREATEST(points - 1, 0),
            comments_count = GREATEST(comments_count - 1, 0)
        WHERE user_id = target_user;
    END IF;

  ELSIF TG_TABLE_NAME = 'forum_post_upvotes' THEN
    SELECT user_id INTO target_user
      FROM public.forum_posts
      WHERE id = COALESCE(NEW.post_id, OLD.post_id);
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.forum_reputation (user_id, upvotes_received, points)
        VALUES (target_user, 1, 5)
        ON CONFLICT (user_id) DO UPDATE
          SET upvotes_received = forum_reputation.upvotes_received + 1,
              points           = forum_reputation.points + 5;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.forum_reputation
        SET upvotes_received = GREATEST(upvotes_received - 1, 0),
            points           = GREATEST(points - 5, 0)
        WHERE user_id = target_user;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_forum_reputation_posts
  AFTER INSERT OR DELETE ON public.forum_posts
  FOR EACH ROW EXECUTE FUNCTION public.maintain_forum_reputation();

CREATE OR REPLACE TRIGGER trg_forum_reputation_comments
  AFTER INSERT OR DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.maintain_forum_reputation();

CREATE OR REPLACE TRIGGER trg_forum_reputation_upvotes
  AFTER INSERT OR DELETE ON public.forum_post_upvotes
  FOR EACH ROW EXECUTE FUNCTION public.maintain_forum_reputation();

-- ── 5. Full-text search index ─────────────────────────────────────────────────

ALTER TABLE public.forum_posts ADD COLUMN IF NOT EXISTS
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS forum_posts_search_idx
  ON public.forum_posts USING GIN (search_vector);

-- ── 6. Seed forum categories ──────────────────────────────────────────────────

INSERT INTO public.forum_categories (id, name, slug, description, exam_tag, icon, color, order_index)
VALUES
  (gen_random_uuid(), 'UPSC & Civil Services', 'upsc',           'IAS, IPS, IFS, CAPF and all UPSC exams',        'UPSC',      '🏛', '#8B6914', 1),
  (gen_random_uuid(), 'Banking & Finance',     'banking',         'IBPS, SBI, RBI, NABARD, SEBI, IRDAI',           'Banking',   '🏦', '#1B5E6E', 2),
  (gen_random_uuid(), 'SSC Exams',             'ssc',             'CGL, CHSL, CPO, GD, MTS, JE',                   'SSC',       '📋', '#1B4F3E', 3),
  (gen_random_uuid(), 'Railways',              'railways',        'RRB NTPC, Group D, JE, ALP, Technician',        'Railways',  '🚂', '#4A1B6E', 4),
  (gen_random_uuid(), 'State PSC',             'state-psc',       'State Public Service Commissions — all states', 'State PSC', '🗺', '#6E1B1B', 5),
  (gen_random_uuid(), 'Defence & Police',      'defence',         'CDS, NDA, AFCAT, BSF, CRPF, SSB',               'Defence',   '🛡', '#1B3A6E', 6),
  (gen_random_uuid(), 'Study Strategy',        'study',           'Preparation tips, resources, schedules',        NULL,        '📚', '#3A1B6E', 7),
  (gen_random_uuid(), 'Current Affairs',       'current-affairs', 'News analysis and GK for competitive exams',    NULL,        '📰', '#1B6E3A', 8),
  (gen_random_uuid(), 'Results & Cut-offs',    'results',         'Official results, answer keys, cut-offs',       NULL,        '📊', '#6E4A1B', 9),
  (gen_random_uuid(), 'Off Topic',             'off-topic',       'Career advice, motivation, life as an aspirant',NULL,        '💬', '#4A4A4A', 10)
ON CONFLICT DO NOTHING;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
