-- 121_adaptation_event_types_expand.sql
-- Widen study_adaptation_events.event_type to admit the labels the app
-- actually emits.
--
-- Migration 033 created the column with an inline CHECK listing nine
-- event types. The application code, however, writes four more through
-- the planner / mission-control / admin-ops paths:
--
--   * mock_reviewed             (canonical.py — post mock-review regen)
--   * admin_apply               (admin_study_os.py — operator plan apply)
--   * admin_skip_task           (admin_study_os.py — operator skip)
--   * admin_reset_carry_forward (admin_study_os.py — operator backlog clear)
--
-- Before PR #367 the constraint violation was silently swallowed by a
-- bare _safe() wrapper. After PR #367 made planner persistence
-- fail-closed (safe_required), the violating insert returns None and the
-- whole apply/regen reports {generated:false, reason:audit_persist_failed}
-- on real Postgres — admin plan-apply and post-mock-review regeneration
-- break. These labels are meaningful audit values, so the right fix is to
-- admit them, not to collapse them onto a generic value.
--
-- Drop the existing inline CHECK (Postgres auto-named it
-- study_adaptation_events_event_type_check) and recreate it with the
-- expanded set. Idempotent: guarded by catalog lookups.

do $$
begin
  -- Drop whatever check constraint currently guards event_type, by its
  -- conventional auto-generated name.
  if exists (
    select 1
    from pg_constraint
    where conname = 'study_adaptation_events_event_type_check'
      and conrelid = 'public.study_adaptation_events'::regclass
  ) then
    alter table public.study_adaptation_events
      drop constraint study_adaptation_events_event_type_check;
  end if;

  -- Recreate with the full set (original nine + the four app labels).
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_adaptation_events_event_type_check'
      and conrelid = 'public.study_adaptation_events'::regclass
  ) then
    alter table public.study_adaptation_events
      add constraint study_adaptation_events_event_type_check
      check (event_type in (
        'mock_logged',
        'task_missed',
        'task_completed',
        'focus_session_completed',
        'deadline_changed',
        'exam_update',
        'revision_overdue',
        'manual_regeneration',
        'weekly_review',
        'mock_reviewed',
        'admin_apply',
        'admin_skip_task',
        'admin_reset_carry_forward'
      ));
  end if;
end $$;
