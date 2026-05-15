-- Source-registry health: store structured failure detail.
--
-- Prior runtime code wrote a generic ``last_error = 'scrape_failed'`` whenever
-- a source raised, throwing away the actual error class, HTTP status, and
-- attempted URL. PR 4 of the scraping audit lands these typed columns so
-- admin dashboards (and any future alerting) can see why a source is
-- degrading instead of just that it is.

alter table public.source_registry
  add column if not exists last_error_class text,
  add column if not exists last_error_message text,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_http_status integer,
  add column if not exists last_error_url text;

-- ``last_error`` stays as a short human-readable summary; runtime keeps
-- writing it for back-compat with existing admin views.

create index if not exists idx_source_registry_last_error_at
  on public.source_registry(last_error_at desc nulls last);

notify pgrst, 'reload schema';
