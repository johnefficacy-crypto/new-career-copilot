-- Migration 036: Organization trust and verification fields
alter table public.organizations
  add column if not exists official_domain   text,
  add column if not exists is_verified       boolean not null default false,
  add column if not exists trust_tier        text    not null default 'unknown'
    check (trust_tier in ('verified', 'trusted', 'unknown', 'unverified')),
  add column if not exists verification_notes text,
  add column if not exists verified_at       timestamptz,
  add column if not exists verified_by       uuid references auth.users(id) on delete set null,
  add column if not exists website_url       text;

create index if not exists idx_organizations_trust_tier on public.organizations(trust_tier);
create index if not exists idx_organizations_is_verified on public.organizations(is_verified);
