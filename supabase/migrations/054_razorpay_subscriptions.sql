-- ============================================================================
-- 054_razorpay_subscriptions.sql
--
-- Phase 2 · Session (iv) — Razorpay payment + subscription tables.
--
-- Tables:
--   public.subscription_plans  — admin-editable plan catalogue
--   public.user_subscriptions  — one active row per user per plan
--   public.payment_history     — append-only ledger of every Razorpay event
--
-- Plans are admin-editable (price + features + active flag). User-facing
-- /api/plans returns only `is_active=true` rows ordered by `sort_order`.
--
-- Generate-only: REVIEW BEFORE APPLYING IN SUPABASE SQL EDITOR.
-- ============================================================================

-- ─── 1. subscription_plans ───────────────────────────────────────────────────
create table if not exists public.subscription_plans (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,                 -- 'free', 'pro_monthly', 'pro_annual'
  name          text not null,
  description   text,
  price_inr     integer not null default 0,           -- amount in PAISE (₹499 → 49900)
  currency      text not null default 'INR',
  interval      text not null default 'monthly',      -- 'monthly' | 'annual' | 'one_time' | 'free'
  features      jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint subscription_plans_interval_check
    check (interval in ('monthly','annual','one_time','free'))
);

create index if not exists subscription_plans_active_idx
  on public.subscription_plans (is_active, sort_order);

-- ─── 2. user_subscriptions ───────────────────────────────────────────────────
create table if not exists public.user_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  plan_id                  uuid not null references public.subscription_plans(id) on delete restrict,
  status                   text not null default 'created',
  -- 'created' | 'active' | 'cancelled' | 'expired' | 'failed'
  razorpay_order_id        text,
  razorpay_payment_id      text,
  razorpay_subscription_id text,                       -- reserved for recurring
  amount_paid_inr          integer not null default 0, -- paise
  currency                 text not null default 'INR',
  starts_at                timestamptz,
  ends_at                  timestamptz,
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint user_subscriptions_status_check
    check (status in ('created','active','cancelled','expired','failed'))
);

create index if not exists user_subscriptions_user_idx
  on public.user_subscriptions (user_id);
create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions (status);
create unique index if not exists user_subscriptions_order_idx
  on public.user_subscriptions (razorpay_order_id)
  where razorpay_order_id is not null;

-- ─── 3. payment_history ──────────────────────────────────────────────────────
create table if not exists public.payment_history (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references public.profiles(id) on delete set null,
  subscription_id          uuid references public.user_subscriptions(id) on delete set null,
  plan_id                  uuid references public.subscription_plans(id) on delete set null,
  razorpay_order_id        text,
  razorpay_payment_id      text,
  amount_inr               integer not null default 0, -- paise
  currency                 text not null default 'INR',
  status                   text not null default 'created',
  -- 'created' | 'attempted' | 'captured' | 'failed' | 'refunded'
  method                   text,                       -- 'card' | 'upi' | 'netbanking' | ...
  source                   text not null default 'checkout',
  -- 'checkout' (verify endpoint) | 'webhook'
  event                    text,                       -- raw event name from webhook
  raw_event                jsonb,
  created_at               timestamptz not null default now(),
  constraint payment_history_status_check
    check (status in ('created','attempted','captured','failed','refunded'))
);

create index if not exists payment_history_user_idx
  on public.payment_history (user_id);
create index if not exists payment_history_order_idx
  on public.payment_history (razorpay_order_id);
create index if not exists payment_history_payment_idx
  on public.payment_history (razorpay_payment_id);

-- ─── 4. Helper: updated_at trigger ───────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.tg_set_updated_at();

drop trigger if exists user_subscriptions_updated_at on public.user_subscriptions;
create trigger user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute function public.tg_set_updated_at();

-- ─── 5. Seed default plans ───────────────────────────────────────────────────
insert into public.subscription_plans (code, name, description, price_inr, interval, features, is_active, sort_order)
values
  ('free', 'Free', 'Get started with eligibility checks and exam tracking.',
    0, 'free',
    '["Eligibility verdicts","Recruitment tracker","Community access"]'::jsonb,
    true, 0),
  ('pro_monthly', 'Pro · Monthly', 'Full access to study OS, mocks, and AI guidance.',
    49900, 'monthly',
    '["Everything in Free","Adaptive study plan","Unlimited mock attempts","AI Coach (Claude/Gemini)","Priority deadline alerts"]'::jsonb,
    true, 10),
  ('pro_annual', 'Pro · Annual', 'Same as monthly, billed yearly. Save ~20%.',
    479900, 'annual',
    '["Everything in Pro Monthly","2 months free","Annual review with mentor"]'::jsonb,
    true, 20)
on conflict (code) do nothing;

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_history    enable row level security;

-- subscription_plans: anyone can read active plans; admin can read/write all.
drop policy if exists "subscription_plans read active" on public.subscription_plans;
create policy "subscription_plans read active"
  on public.subscription_plans for select
  using (is_active = true or auth.role() = 'service_role');

drop policy if exists "subscription_plans admin write" on public.subscription_plans;
create policy "subscription_plans admin write"
  on public.subscription_plans for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- user_subscriptions: user reads their own; service role reads/writes all.
drop policy if exists "user_subscriptions read own" on public.user_subscriptions;
create policy "user_subscriptions read own"
  on public.user_subscriptions for select
  using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "user_subscriptions service write" on public.user_subscriptions;
create policy "user_subscriptions service write"
  on public.user_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- payment_history: same pattern.
drop policy if exists "payment_history read own" on public.payment_history;
create policy "payment_history read own"
  on public.payment_history for select
  using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "payment_history service write" on public.payment_history;
create policy "payment_history service write"
  on public.payment_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- End of 054_razorpay_subscriptions.sql
-- ============================================================================
