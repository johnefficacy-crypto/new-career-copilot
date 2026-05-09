begin;

alter table if exists public.scrape_queue
  drop constraint if exists scrape_queue_status_check;

alter table if exists public.scrape_queue
  add constraint scrape_queue_status_check
  check (status in ('pending','reviewing','approved','rejected','duplicate','promoted'));

commit;
