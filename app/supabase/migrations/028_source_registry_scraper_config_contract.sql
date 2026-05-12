-- Stabilize scraper source configuration without forcing a wide column rollout.
-- Backend validates source_type so this migration keeps source_type as free text
-- for existing data while adding jsonb config pockets for admin-controlled policy.

alter table public.source_registry
  add column if not exists scrape_config jsonb not null default '{}'::jsonb,
  add column if not exists trust_config jsonb not null default '{}'::jsonb,
  add column if not exists adapter_config jsonb not null default '{}'::jsonb;

update public.source_registry
   set is_verified = false,
       is_official_source = false,
       can_publish_directly = false,
       discovery_only = true,
       requires_official_confirmation = true,
       verification_status = coalesce(nullif(verification_status, 'verified'), 'needs_review'),
       trust_config = coalesce(trust_config, '{}'::jsonb)
         || jsonb_build_object(
              'discovery_only', true,
              'manual_review_required', true,
              'requires_official_source', true,
              'evidence_required', true,
              'auto_promote', false
            )
 where lower(coalesce(source_type, '')) = 'aggregator'
    or discovery_only is true;

create index if not exists idx_source_registry_source_type_active
  on public.source_registry(source_type, is_active);

notify pgrst, 'reload schema';
