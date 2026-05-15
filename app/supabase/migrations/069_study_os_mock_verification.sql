-- PR 5 — Study OS comparison: mock-score verification tiers.

create table if not exists public.mock_score_verification (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  verification_tier text not null default 'tier_3'
    check (verification_tier in ('tier_1','tier_1_5','tier_2','tier_3')),
  attester_role text
    check (attester_role is null or attester_role in
           ('provider','admin','mentor','partner','self')),
  attested_by uuid references public.profiles(id),
  evidence_url text,
  provider_name text,
  provider_attempt_id text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')),

  verified_score numeric,
  verified_max_score numeric check (verified_max_score is null or verified_max_score > 0),
  confidence_score numeric
    check (confidence_score is null or confidence_score between 0 and 1),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id),

  check (verified_score is null or verified_max_score is null
         or verified_score <= verified_max_score),
  unique (mock_test_id, user_id)
);

create index if not exists idx_msv_user on public.mock_score_verification (user_id, created_at desc);
create index if not exists idx_msv_mock on public.mock_score_verification (mock_test_id);

alter table public.mock_score_verification enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mock_score_verification'
      and policyname = 'msv_owner_or_attester_select'
  ) then
    create policy msv_owner_or_attester_select on public.mock_score_verification
      for select using (auth.uid() = user_id or auth.uid() = attested_by);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mock_score_verification'
      and policyname = 'msv_owner_insert'
  ) then
    create policy msv_owner_insert on public.mock_score_verification
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mock_score_verification'
      and policyname = 'msv_service_role_all'
  ) then
    create policy msv_service_role_all on public.mock_score_verification
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
