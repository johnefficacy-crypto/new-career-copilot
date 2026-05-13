-- Migration 042: persist aggregator lifecycle events.
--
-- ``recruitment_events`` was created by migration 020 with a NOT NULL
-- ``recruitment_id``. That makes it impossible to persist a lifecycle
-- event (admit card / result / corrigendum / date_extended / ...)
-- discovered for a recruitment we haven't canonicalised yet. Many real-
-- world feeds publish lifecycle URLs *before* (or instead of) the
-- recruitment notification itself — losing those signals means admin
-- can't even tell that a stage exists.
--
-- This migration:
--   * makes ``recruitment_id`` nullable so unattached events can sit in
--     the table until reconciliation links them;
--   * adds ``aggregator_listing_id`` so the event keeps a back-pointer
--     to the discovery row that produced it;
--   * adds a CHECK constraint over the documented event-type vocabulary
--     so writers can't accidentally invent new strings.

begin;

alter table public.recruitment_events
  alter column recruitment_id drop not null;

alter table public.recruitment_events
  add column if not exists aggregator_listing_id uuid
    references public.aggregator_listings(id) on delete set null;

create index if not exists idx_recruitment_events_listing
  on public.recruitment_events(aggregator_listing_id);

-- Index for the "unattached lifecycle events" admin view. Filtering on
-- ``recruitment_id IS NULL`` is rare enough that a partial index is
-- cheaper than a full one.
create index if not exists idx_recruitment_events_unattached
  on public.recruitment_events(event_type, created_at desc)
  where recruitment_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recruitment_events_event_type_check'
      and conrelid = 'public.recruitment_events'::regclass
  ) then
    alter table public.recruitment_events
      add constraint recruitment_events_event_type_check
      check (event_type in (
        'new_recruitment',
        'admit_card',
        'result',
        'answer_key',
        'corrigendum',
        'date_extended',
        'syllabus',
        'interview_schedule',
        'notification_revised',
        'other'
      ));
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
