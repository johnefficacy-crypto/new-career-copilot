-- ============================================================
-- Migration: marketplace_setup
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Instructor flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_instructor   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS instructor_bio  text,
  ADD COLUMN IF NOT EXISTS avatar_url      text;

-- 2. Courses
CREATE TABLE IF NOT EXISTS public.courses (
  id                    uuid    NOT NULL DEFAULT gen_random_uuid(),
  instructor_id         uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                 text    NOT NULL,
  slug                  text    NOT NULL UNIQUE,
  description           text    NOT NULL DEFAULT '',
  short_description     text,
  thumbnail_url         text,
  preview_video_url     text,
  price_inr             integer NOT NULL DEFAULT 0,
  original_price_inr    integer,
  level                 text    NOT NULL DEFAULT 'all',
  language              text    NOT NULL DEFAULT 'Hindi',
  exam_tags             text[]  NOT NULL DEFAULT '{}',
  status                text    NOT NULL DEFAULT 'draft',
  total_lessons         integer NOT NULL DEFAULT 0,
  total_duration_mins   integer NOT NULL DEFAULT 0,
  avg_rating            numeric(3,2),
  total_reviews         integer NOT NULL DEFAULT 0,
  total_enrollments     integer NOT NULL DEFAULT 0,
  commission_pct        integer NOT NULL DEFAULT 20,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_level_check    CHECK (level    IN ('beginner','intermediate','advanced','all')),
  CONSTRAINT courses_status_check   CHECK (status   IN ('draft','published','archived')),
  CONSTRAINT courses_commission_check CHECK (commission_pct BETWEEN 0 AND 100)
);

-- 3. Sections
CREATE TABLE IF NOT EXISTS public.course_sections (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title           text NOT NULL,
  order_index     integer NOT NULL DEFAULT 0,
  is_free_preview boolean NOT NULL DEFAULT false,
  CONSTRAINT course_sections_pkey PRIMARY KEY (id)
);

-- 4. Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id      uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  title           text NOT NULL,
  type            text NOT NULL DEFAULT 'video',
  order_index     integer NOT NULL DEFAULT 0,
  duration_mins   integer,
  is_free_preview boolean NOT NULL DEFAULT false,
  content_url     text,
  content_text    text,
  CONSTRAINT lessons_pkey PRIMARY KEY (id),
  CONSTRAINT lessons_type_check CHECK (type IN ('video','pdf','text','quiz'))
);

-- 5. Enrollments
CREATE TABLE IF NOT EXISTS public.enrollments (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id             uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'active',
  amount_paid_inr       integer NOT NULL DEFAULT 0,
  razorpay_order_id     text,
  razorpay_payment_id   text,
  enrolled_at           timestamptz DEFAULT now(),
  completed_at          timestamptz,
  CONSTRAINT enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT enrollments_user_course_unique UNIQUE (user_id, course_id),
  CONSTRAINT enrollments_status_check CHECK (status IN ('active','completed','refunded'))
);

-- 6. Lesson progress
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  completed       boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,
  watch_seconds   integer NOT NULL DEFAULT 0,
  CONSTRAINT lesson_progress_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_progress_user_lesson_unique UNIQUE (user_id, lesson_id)
);

-- 7. Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  rating      integer NOT NULL,
  body        text,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_user_course_unique UNIQUE (user_id, course_id),
  CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
);

-- 8. Instructor payouts
CREATE TABLE IF NOT EXISTS public.instructor_payouts (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  instructor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_inr          integer NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  razorpay_payout_id  text,
  created_at          timestamptz DEFAULT now(),
  CONSTRAINT instructor_payouts_pkey PRIMARY KEY (id),
  CONSTRAINT payouts_status_check CHECK (status IN ('pending','processing','paid','failed'))
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS courses_instructor_idx    ON public.courses(instructor_id);
CREATE INDEX IF NOT EXISTS courses_status_idx        ON public.courses(status);
CREATE INDEX IF NOT EXISTS courses_exam_tags_idx     ON public.courses USING GIN(exam_tags);
CREATE INDEX IF NOT EXISTS enrollments_user_idx      ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS lesson_progress_user_idx  ON public.lesson_progress(user_id, course_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_sections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_payouts ENABLE ROW LEVEL SECURITY;

-- Courses: anyone reads published; instructor manages own
DROP POLICY IF EXISTS "Public reads published courses" ON public.courses;
DROP POLICY IF EXISTS "Instructor manages own courses" ON public.courses;
DROP POLICY IF EXISTS "Admin manages all courses" ON public.courses;

CREATE POLICY "Public reads published courses"
  ON public.courses FOR SELECT USING (status = 'published');
CREATE POLICY "Instructor manages own courses"
  ON public.courses FOR ALL
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);
CREATE POLICY "Admin manages all courses"
  ON public.courses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Sections: readable with course
DROP POLICY IF EXISTS "Public reads sections of published courses" ON public.course_sections;
DROP POLICY IF EXISTS "Instructor manages own sections" ON public.course_sections;

CREATE POLICY "Public reads sections of published courses"
  ON public.course_sections FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND status = 'published'));
CREATE POLICY "Instructor manages own sections"
  ON public.course_sections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND instructor_id = auth.uid()));

-- Lessons: public reads preview or enrolled reads all
DROP POLICY IF EXISTS "Public reads free preview lessons" ON public.lessons;
DROP POLICY IF EXISTS "Enrolled users read all lessons" ON public.lessons;
DROP POLICY IF EXISTS "Instructor manages own lessons" ON public.lessons;

CREATE POLICY "Public reads free preview lessons"
  ON public.lessons FOR SELECT
  USING (is_free_preview = true);
CREATE POLICY "Enrolled users read all lessons"
  ON public.lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.course_sections cs
      JOIN public.enrollments e ON e.course_id = cs.course_id
      WHERE cs.id = section_id AND e.user_id = auth.uid() AND e.status = 'active'
    )
  );
CREATE POLICY "Instructor manages own lessons"
  ON public.lessons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.course_sections cs
      JOIN public.courses c ON c.id = cs.course_id
      WHERE cs.id = section_id AND c.instructor_id = auth.uid()
    )
  );

-- Enrollments
DROP POLICY IF EXISTS "Users read own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Service role manages enrollments" ON public.enrollments;

CREATE POLICY "Users read own enrollments"
  ON public.enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages enrollments"
  ON public.enrollments FOR ALL USING (true) WITH CHECK (true);

-- Progress
DROP POLICY IF EXISTS "Users manage own progress" ON public.lesson_progress;

CREATE POLICY "Users manage own progress"
  ON public.lesson_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reviews
DROP POLICY IF EXISTS "Public reads reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users manage own reviews" ON public.reviews;

CREATE POLICY "Public reads reviews"
  ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users manage own reviews"
  ON public.reviews FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Payouts: instructor reads own
DROP POLICY IF EXISTS "Instructor reads own payouts" ON public.instructor_payouts;
DROP POLICY IF EXISTS "Admin manages all payouts" ON public.instructor_payouts;

CREATE POLICY "Instructor reads own payouts"
  ON public.instructor_payouts FOR SELECT USING (auth.uid() = instructor_id);
CREATE POLICY "Admin manages all payouts"
  ON public.instructor_payouts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ─── Trigger: keep avg_rating + total_reviews on courses up to date ───────────
CREATE OR REPLACE FUNCTION public.refresh_course_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.courses SET
    avg_rating    = (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE course_id = COALESCE(NEW.course_id, OLD.course_id)),
    total_reviews = (SELECT COUNT(*)                       FROM public.reviews WHERE course_id = COALESCE(NEW.course_id, OLD.course_id))
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_refresh_course_stats
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.refresh_course_stats();

-- Trigger: update total_enrollments
CREATE OR REPLACE FUNCTION public.refresh_enrollment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.courses SET
    total_enrollments = (SELECT COUNT(*) FROM public.enrollments WHERE course_id = COALESCE(NEW.course_id, OLD.course_id) AND status = 'active')
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_refresh_enrollment_count
AFTER INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.refresh_enrollment_count();

-- ============================================================
-- END OF MIGRATION
-- ============================================================