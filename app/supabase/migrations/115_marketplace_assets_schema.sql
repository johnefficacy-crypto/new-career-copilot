-- Marketplace hosted-asset schema (PR2 of the marketplace track).
--
-- Layers an admin-only review queue on top of the delivery-split (PR1,
-- migration 112) without touching the public catalogue, the order /
-- refund / payout flow, or anything in `enrollments`. Three additive
-- tables:
--
--   marketplace_assets         — one row per hostable artifact (notes
--                                pdf, test session, video, zip, bundle)
--                                attached to a course. Review state
--                                machine lives here.
--   marketplace_asset_files    — physical-file rows linked to an asset.
--                                Storage interaction is metadata-only;
--                                no bucket reads, no env vars in PR2.
--   marketplace_infringing_hashes
--                              — blocklist of sha256 hex hashes that
--                                the file-insert path consults before
--                                accepting a new upload row.
--
-- PR2 is admin-shell only: no buyer access, no signed URLs, no DMCA
-- cascade, no audit log table. `suspended` / `dmca_removed` states are
-- reserved but unreachable via any PR2 API path.

--------------------------------------------------
-- marketplace_assets
--------------------------------------------------

create table if not exists public.marketplace_assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  asset_type text not null
    check (asset_type in (
      'notes_pdf','test_session','video','zip','bundle','other'
    )),
  title text,
  description text,
  status text not null default 'draft'
    check (status in (
      'draft','pending_review','approved','published',
      'rejected','suspended','dmca_removed'
    )),
  copyright_risk_status text not null default 'unchecked'
    check (copyright_risk_status in (
      'unchecked','clear','flagged','rejected','known_infringing'
    )),
  protection_policy jsonb not null
    default '{"mode":"standard","allow_download":false,"allow_print":false,"watermark_required":true,"max_downloads":3,"max_views_per_day":50}'::jsonb,
  ownership_attestation_signed_at timestamptz,
  ownership_attestation_text text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approval_reason text,
  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.marketplace_assets.status is
  'PR2 reachable transitions: draft↔pending_review, pending_review→approved, '
  'pending_review/approved→rejected, approved→published. '
  'suspended / dmca_removed are reserved values with no PR2 API path.';

create index if not exists idx_marketplace_assets_course
  on public.marketplace_assets(course_id);
create index if not exists idx_marketplace_assets_status
  on public.marketplace_assets(status);
create index if not exists idx_marketplace_assets_asset_type
  on public.marketplace_assets(asset_type);
create index if not exists idx_marketplace_assets_copyright_risk
  on public.marketplace_assets(copyright_risk_status);
create index if not exists idx_marketplace_assets_course_status
  on public.marketplace_assets(course_id, status);

drop trigger if exists marketplace_assets_updated_at on public.marketplace_assets;
create trigger marketplace_assets_updated_at
before update on public.marketplace_assets
for each row execute function public.tg_set_updated_at();

--------------------------------------------------
-- marketplace_asset_files
--------------------------------------------------

create table if not exists public.marketplace_asset_files (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketplace_assets(id) on delete cascade,
  file_role text not null default 'source'
    check (file_role in ('source','preview','watermark','attachment')),
  storage_bucket text not null,
  storage_path text not null,
  original_filename text,
  mime_type text not null,
  file_size_bytes bigint,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(storage_bucket, storage_path)
);

comment on column public.marketplace_asset_files.content_hash is
  'sha256 hex, lowercase';

create index if not exists idx_marketplace_asset_files_asset
  on public.marketplace_asset_files(asset_id);
create index if not exists idx_marketplace_asset_files_content_hash
  on public.marketplace_asset_files(content_hash);
create index if not exists idx_marketplace_asset_files_role
  on public.marketplace_asset_files(file_role);

drop trigger if exists marketplace_asset_files_updated_at on public.marketplace_asset_files;
create trigger marketplace_asset_files_updated_at
before update on public.marketplace_asset_files
for each row execute function public.tg_set_updated_at();

--------------------------------------------------
-- marketplace_infringing_hashes
--------------------------------------------------

create table if not exists public.marketplace_infringing_hashes (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  reason text,
  claim_id uuid,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column public.marketplace_infringing_hashes.content_hash is
  'sha256 hex, lowercase';
comment on column public.marketplace_infringing_hashes.claim_id is
  'Standalone uuid in PR2. Wired to copyright_claims in the DMCA PR.';

create index if not exists idx_marketplace_infringing_hashes_claim
  on public.marketplace_infringing_hashes(claim_id);

--------------------------------------------------
-- RLS
--------------------------------------------------

alter table public.marketplace_assets enable row level security;
alter table public.marketplace_asset_files enable row level security;
alter table public.marketplace_infringing_hashes enable row level security;

do $$
begin
  -- marketplace_assets
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='marketplace_assets'
      and policyname='marketplace_assets_service_role_all'
  ) then
    create policy marketplace_assets_service_role_all on public.marketplace_assets
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='marketplace_assets'
      and policyname='marketplace_assets_public_select'
  ) then
    create policy marketplace_assets_public_select on public.marketplace_assets
      for select to authenticated
      using (
        status = 'published'
        and exists (
          select 1 from public.courses c
          where c.id = course_id
            and c.status = 'published'
        )
      );
  end if;

  -- marketplace_asset_files: service-role only. Default-deny applies
  -- to authenticated / anon — buyer file access lives in a later PR
  -- (signed URLs, tokenised delivery).
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='marketplace_asset_files'
      and policyname='marketplace_asset_files_service_role_all'
  ) then
    create policy marketplace_asset_files_service_role_all on public.marketplace_asset_files
      for all to service_role using (true) with check (true);
  end if;

  -- marketplace_infringing_hashes: service-role only.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='marketplace_infringing_hashes'
      and policyname='marketplace_infringing_hashes_service_role_all'
  ) then
    create policy marketplace_infringing_hashes_service_role_all on public.marketplace_infringing_hashes
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
