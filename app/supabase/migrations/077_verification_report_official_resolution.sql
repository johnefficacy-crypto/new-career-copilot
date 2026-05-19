-- Migration 077: PR2 — official-resolver columns + audit table.
--
-- Adds the resolver state columns on ``recruitment_verification_reports``
-- (status, method, confidence, suggested_official_urls) and the audit
-- table ``official_resolution_attempts`` that records every L-stage
-- attempt the resolver makes.
--
-- Existing PR1 + PR7 reports keep working: the new columns are all
-- nullable / default-empty, so old rows still satisfy the table's
-- check constraints. The service layer backfills
-- ``official_resolution_status = 'not_attempted'`` lazily on read
-- (per plan §3 acceptance: "default via service backfill, not DB
-- default") so an admin viewing a pre-PR2 report sees the explicit
-- "we haven't tried yet" state instead of a confusing NULL.

begin;

alter table public.recruitment_verification_reports
  add column if not exists official_resolution_status     text,
  add column if not exists official_resolution_method     text,
  add column if not exists official_resolution_confidence numeric,
  add column if not exists suggested_official_urls        jsonb not null default '[]'::jsonb;

alter table public.recruitment_verification_reports
  drop constraint if exists chk_official_resolution_status;

alter table public.recruitment_verification_reports
  add constraint chk_official_resolution_status
  check (
    official_resolution_status is null
    or official_resolution_status in (
      'not_attempted',
      'auto_resolved',
      'suggested',
      'unresolved',
      'admin_attached',
      'rejected'
    )
  );

alter table public.recruitment_verification_reports
  drop constraint if exists chk_official_resolution_method;

alter table public.recruitment_verification_reports
  add constraint chk_official_resolution_method
  check (
    official_resolution_method is null
    or official_resolution_method in (
      'direct_link',
      'duplicate',
      'canonical_match',
      'source_registry',
      'career_crawl',
      'sitemap',
      'admin_attached'
    )
  );

alter table public.recruitment_verification_reports
  drop constraint if exists chk_official_resolution_confidence;

alter table public.recruitment_verification_reports
  add constraint chk_official_resolution_confidence
  check (
    official_resolution_confidence is null
    or (official_resolution_confidence >= 0 and official_resolution_confidence <= 1)
  );

-- Sparse index for the admin "needs official proof" queue. Partial on
-- the suggest / unresolved bands so the planner skips auto-resolved
-- rows entirely.
create index if not exists idx_verification_reports_resolver_needs_attention
  on public.recruitment_verification_reports(
    criticality_tier,
    official_resolution_status,
    created_at desc
  )
  where superseded_by is null
    and official_resolution_status in ('suggested', 'unresolved', 'not_attempted');


-- ── official_resolution_attempts — audit trail ─────────────────────
--
-- One row per L-stage attempt. The resolver writes a batch after the
-- waterfall finishes (the service layer handles the insert). This is
-- an *audit* table — a missing row never blocks the resolver from
-- writing onto the report.

create table if not exists public.official_resolution_attempts (
  id uuid primary key default gen_random_uuid(),

  scrape_queue_id          uuid references public.scrape_queue(id) on delete cascade,
  recruitment_candidate_id uuid,
  source_id                uuid references public.source_registry(id),
  verification_report_id   uuid references public.recruitment_verification_reports(id) on delete cascade,

  method text not null check (method in (
    'direct_link',
    'duplicate',
    'canonical_match',
    'source_registry',
    'career_crawl',
    'sitemap',
    'admin_attached'
  )),
  status text not null check (status in (
    'success',
    'auto_resolved',
    'suggested',
    'low_confidence',
    'rejected',
    'error',
    'skipped'
  )),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  candidate_url text,
  official_source_host text,
  evidence jsonb not null default '[]'::jsonb,
  rejection_reason text,

  created_at timestamptz not null default now()
);

create index if not exists idx_official_resolution_attempts_report
  on public.official_resolution_attempts(verification_report_id, created_at desc);

create index if not exists idx_official_resolution_attempts_queue
  on public.official_resolution_attempts(scrape_queue_id, created_at desc)
  where scrape_queue_id is not null;

commit;

notify pgrst, 'reload schema';
