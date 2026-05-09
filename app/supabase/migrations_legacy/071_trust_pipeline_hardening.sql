begin;

alter table if exists public.source_registry
  add column if not exists jurisdiction text,
  add column if not exists state text,
  add column if not exists verification_status text default 'needs_review',
  add column if not exists anti_bot_risk text,
  add column if not exists notes text;

alter table if exists public.scrape_queue
  add column if not exists source_id uuid,
  add column if not exists raw_title text,
  add column if not exists raw_url text,
  add column if not exists raw_payload jsonb,
  add column if not exists extracted_fields jsonb,
  add column if not exists warnings jsonb,
  add column if not exists duplicate_candidates jsonb,
  add column if not exists error_message text,
  add column if not exists reviewed_by uuid,
  add column if not exists promoted_recruitment_id uuid;

alter table if exists public.organizations
  add column if not exists official_website text,
  add column if not exists verified_domain text,
  add column if not exists verification_status text default 'needs_review',
  add column if not exists trust_score numeric,
  add column if not exists notes text;

alter table if exists public.admin_audit_logs
  add column if not exists admin_user_id uuid,
  add column if not exists before_payload jsonb,
  add column if not exists after_payload jsonb,
  add column if not exists metadata jsonb;

create index if not exists idx_source_registry_verification_status on public.source_registry(verification_status);
create index if not exists idx_scrape_queue_status_created on public.scrape_queue(status, created_at desc);
create index if not exists idx_org_verification_status on public.organizations(verification_status);

commit;
