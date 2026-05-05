-- Migration 043: Aggregator official-source gating fields
--
-- Adds explicit fields to track whether a scrape_queue row has been resolved
-- to a first-party official notification host, and whether promotion should
-- require that resolution.

begin;

alter table public.source_registry
  add column if not exists requires_official_confirmation boolean not null default false;

comment on column public.source_registry.requires_official_confirmation is
  'When true, scrape items from this source cannot be promoted unless official_source_resolved=true on scrape_queue.';

update public.source_registry
set requires_official_confirmation = true
where source_type = 'aggregator';

alter table public.scrape_queue
  add column if not exists official_source_resolved boolean not null default false,
  add column if not exists official_source_host text null;

comment on column public.scrape_queue.official_source_resolved is
  'True only when extracted official_notification_url host is distinct from aggregator source host and treated as first-party official.';

comment on column public.scrape_queue.official_source_host is
  'Parsed hostname for extracted official_notification_url at scrape time.';

create index if not exists idx_scrape_queue_official_source_resolved
  on public.scrape_queue (official_source_resolved, status, scraped_at desc);

commit;
