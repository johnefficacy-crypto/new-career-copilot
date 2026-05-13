-- Migration 044: aggregator-listing conditional fetch state.
--
-- PR #130 wired HTTP conditional fetch (If-None-Match / If-Modified-
-- Since) for aggregator *detail* pages, with prior headers looked up
-- from notification_documents. The same trick saves bandwidth and run
-- time on aggregator *listing* pages, but listings aren't stored in
-- notification_documents — we don't want every listing fetch to write
-- a doc row.
--
-- Two small columns on source_registry let the runner remember the
-- last listing response's caching headers per source. On the next
-- pass, the runner sends them as conditional headers; a 304 response
-- short-circuits discovery entirely.

alter table public.source_registry
  add column if not exists last_listing_etag text,
  add column if not exists last_listing_modified text;

notify pgrst, 'reload schema';
