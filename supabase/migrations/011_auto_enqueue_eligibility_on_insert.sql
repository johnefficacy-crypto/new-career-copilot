BEGIN;

CREATE OR REPLACE FUNCTION public.fn_enqueue_eligibility_for_new_recruitment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.eligibility_recompute_queue
    (user_id, recruitment_id, status, reason, queued_at)
  SELECT
    p.id,
    NEW.id,
    'pending',
    'new_recruitment_inserted',
    NOW()
  FROM public.profiles p
  WHERE p.onboarding_completed = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.eligibility_recompute_queue q
      WHERE q.user_id = p.id
        AND q.recruitment_id = NEW.id
        AND q.status = 'pending'
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enqueue_eligibility_for_new_recruitment() IS
  'AFTER INSERT trigger on recruitments — fans out eligibility_recompute_queue rows for every onboarded user.';

DROP TRIGGER IF EXISTS trg_enqueue_eligibility_on_recruitment_insert
  ON public.recruitments;

CREATE TRIGGER trg_enqueue_eligibility_on_recruitment_insert
AFTER INSERT ON public.recruitments
FOR EACH ROW
EXECUTE FUNCTION public.fn_enqueue_eligibility_for_new_recruitment();

INSERT INTO public.eligibility_recompute_queue
  (user_id, recruitment_id, status, reason, queued_at)
SELECT
  p.id,
  r.id,
  'pending',
  'migration_011_backfill',
  NOW()
FROM public.profiles p
  CROSS JOIN public.recruitments r
WHERE p.onboarding_completed = true
  AND r.status IN ('open', 'upcoming', 'published')
  AND NOT EXISTS (
    SELECT 1
    FROM public.eligibility_recompute_queue q
    WHERE q.user_id        = p.id
      AND q.recruitment_id = r.id
      AND q.status         = 'pending'
  );

COMMIT;