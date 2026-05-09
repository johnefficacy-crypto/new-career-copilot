alter table public.scrape_queue
  add column if not exists raw_snapshot_hash   text,
  add column if not exists raw_snapshot_url    text,
  add column if not exists extraction_provider text,
  add column if not exists extraction_model    text,
  add column if not exists prompt_version      text,
  add column if not exists field_evidence      jsonb;

alter table public.source_registry
  add column if not exists selectors jsonb;

comment on column public.scrape_queue.raw_snapshot_hash is 'SHA-256 of raw HTML/PDF bytes at fetch time. Enables replay/audit.';
comment on column public.scrape_queue.extraction_provider is 'anthropic | gemini | rss_direct | selectors | playwright';
comment on column public.scrape_queue.extraction_model is 'Model ID for LLM providers; null for deterministic paths.';
comment on column public.scrape_queue.prompt_version is 'System prompt revision. Bump when SYSTEM_PROMPT changes.';
comment on column public.source_registry.selectors is 'Optional per-source HTML selectors for deterministic extraction. Tried before LLM.';
