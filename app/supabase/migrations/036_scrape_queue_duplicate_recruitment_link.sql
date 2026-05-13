-- Split scrape_queue.duplicate_of (queue→queue) from canonical duplicate target.
-- Prior runner code wrote a recruitments.id into duplicate_of, which is FK'd to
-- scrape_queue(id) (migration 011). This adds a typed column for the canonical
-- duplicate target so the two relationships stop colliding.

alter table public.scrape_queue
  add column if not exists duplicate_recruitment_id uuid references public.recruitments(id) on delete set null;

create index if not exists idx_scrape_queue_duplicate_recruitment
  on public.scrape_queue(duplicate_recruitment_id);

notify pgrst, 'reload schema';
