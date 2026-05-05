-- 012_scraper_p0_observability.sql
-- Scraper P0 patches — run-level observability + per-source TLS posture.
--
-- scrape_runs.providers_health  — jsonb { anthropic: available|degraded|down,
--                                         gemini:    available|degraded|down }
-- scrape_runs.function_version  — deployed SHA, e.g. "scheduled-scraper@abc1234"
-- source_registry.insecure_tls  — opt-in to cert-ignore (replaces the global
--                                 insecureClient that weakened TLS for every fetch).

alter table public.scrape_runs
  add column if not exists providers_health jsonb,
  add column if not exists function_version text;

alter table public.source_registry
  add column if not exists insecure_tls boolean not null default false;

comment on column public.scrape_runs.providers_health is
  'Per-run LLM provider health snapshot at finalisation time. Example: {"anthropic":"available","gemini":"down"}';
comment on column public.scrape_runs.function_version is
  'Deployed scraper binary identifier (scheduled-scraper@<git-sha>). Set via GIT_SHA secret.';
comment on column public.source_registry.insecure_tls is
  'Opt in to unsafelyIgnoreCertificateErrors for this source. Leave false unless the origin has a known-expired cert (some NIC subdomains).';
