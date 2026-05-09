-- Migration 003: v_notification_feed
-- Read model for the user-facing notification feed.
-- JOINs notification_alerts with alert_events, recruitments, organizations,
-- and tracked_recruitments to produce the full NotificationAlert shape
-- consumed by getUserNotifications() in lib/db/notifications.ts.
--
-- Idempotent — safe to re-run.

DROP VIEW IF EXISTS public.v_notification_feed;

CREATE VIEW public.v_notification_feed AS
SELECT
  -- notification_alerts core
  na.id,
  na.user_id,
  na.alert_type,
  na.is_read,
  na.sent_at,
  na.read_at,
  na.priority,
  na.explanation,
  na.alert_event_id,

  -- alert_events
  ae.event_type,

  -- recruitments
  r.id            AS recruitment_id,
  r.name          AS recruitment_name,
  r.status        AS recruitment_status,
  r.apply_end_date,
  r.apply_start_date,
  r.notification_date,
  r.year,
  r.total_vacancies,

  -- organizations (column is `type`, aliased to match NotificationAlert shape)
  o.id            AS org_id,
  o.name          AS org_name,
  o.type          AS org_type,
  o.state         AS org_state,

  -- days until apply_end_date (null if already passed or no date)
  CASE
    WHEN r.apply_end_date IS NULL THEN NULL
    WHEN r.apply_end_date::date < CURRENT_DATE THEN NULL
    ELSE (r.apply_end_date::date - CURRENT_DATE)
  END             AS days_to_deadline,

  -- is_tracked: true if this user is watching the recruitment
  CASE WHEN tr.id IS NOT NULL THEN true ELSE false END AS is_tracked

FROM public.notification_alerts na
LEFT JOIN public.alert_events        ae ON ae.id  = na.alert_event_id
LEFT JOIN public.recruitments        r  ON r.id   = na.recruitment_id
LEFT JOIN public.organizations       o  ON o.id   = r.organization_id
LEFT JOIN public.tracked_recruitments tr
       ON tr.recruitment_id = na.recruitment_id
      AND tr.user_id        = na.user_id;

-- Row-level security is enforced on the underlying notification_alerts table.
-- Grant SELECT so authenticated users and service role can query the view.
GRANT SELECT ON public.v_notification_feed TO authenticated;
GRANT SELECT ON public.v_notification_feed TO service_role;

COMMENT ON VIEW public.v_notification_feed IS
  'User-facing notification feed. Joins notification_alerts with recruitments,
   organizations, alert_events, and tracked_recruitments to produce the full
   NotificationAlert shape. RLS enforced via underlying notification_alerts table.
   Created by migration 003.';
