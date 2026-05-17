-- Community governance — schema deltas for the admin governance consoles
-- specified in docs/engineering/community-governance-spec-v1.md §4.
--
-- 1. ``study_groups``: add freeze metadata (when an admin freezes a
--    group, sessions and joins block until unfreeze). Distinct from
--    ``status='archived'`` which is the soft-end-of-life flag.
-- 2. ``community_resources``: add trust attribution + merged-into FK
--    for the resource review queue (approve/edit/dedupe).
-- 3. ``partner_rematch_blocks``: when an admin ends a pair, optionally
--    block the two users from being matched again. Unique on the
--    unordered pair.
-- 4. ``mentor_verification``: sidecar to ``profiles`` carrying the
--    verification + KYC + payout-hold state for the Mentor Verification
--    Console. Sidecar (not new columns on ``profiles``) so the
--    verification team can own these rows without touching the canonical
--    profile.

alter table public.study_groups
  add column if not exists frozen_at timestamptz,
  add column if not exists frozen_by uuid references public.profiles(id) on delete set null,
  add column if not exists frozen_reason text;

alter table public.community_resources
  add column if not exists trust_attribution text
    check (trust_attribution in ('official','community','coaching','unknown'))
    default 'unknown',
  add column if not exists merged_into uuid references public.community_resources(id);

create index if not exists community_resources_status_idx
  on public.community_resources (status, created_at desc);

create table if not exists public.partner_rematch_blocks (
  id uuid primary key default gen_random_uuid(),
  -- We always store users in lexicographic order so the unique constraint
  -- treats (a,b) and (b,a) as the same block. The check constraint is
  -- enforced both in the API layer and at the row level here.
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) >= 8),
  blocked_by uuid references public.profiles(id) on delete set null,
  blocked_by_email text,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index if not exists partner_rematch_blocks_user_a_idx
  on public.partner_rematch_blocks (user_a, created_at desc);
create index if not exists partner_rematch_blocks_user_b_idx
  on public.partner_rematch_blocks (user_b, created_at desc);


create table if not exists public.mentor_verification (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  kyc_status text not null default 'unverified'
    check (kyc_status in ('unverified','submitted','verified','failed')),
  kyc_artifact_id text,
  payout_hold boolean not null default false,
  payout_hold_reason text,
  notes text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_by_email text,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists mentor_verification_status_idx
  on public.mentor_verification (status, updated_at desc);
