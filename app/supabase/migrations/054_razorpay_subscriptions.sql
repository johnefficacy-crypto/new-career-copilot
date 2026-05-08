-- ============================================================================
-- 054_razorpay_subscriptions.sql
--
-- Phase 2 · Session (iv) — Razorpay payment + subscription tables.
--
-- The repo already has a placeholder shape for `subscription_plans` /
-- `user_subscriptions` / `payment_history`. This migration is *additive*:
-- it ALTERs the existing tables to add the columns the API needs, seeds /
-- normalises the default plans, adds RLS, and adds an updated_at trigger.
--
-- subscription_plans.id is `text` (e.g. 'free','pro','elite').
-- ============================================================================

-- ─── 1. subscription_plans — additive columns ────────────────────────────────
alter table public.subscription_plans add column if not exists description text;
alter table public.subscription_plans add column if not exists currency    text not null default 'INR';
alter table public.subscription_plans add column if not exists interval    text not null default 'monthly';
alter table public.subscription_plans add column if not exists sort_order  integer not null default 0;
alter table public.subscription_plans add column if not exists created_at  timestamptz not null default now();
alter table public.subscription_plans add column if not exists updated_at  timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_interval_check'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_interval_check
      check (interval in ('monthly','annual','one_time','free'));
  end if;
end $$;

create index if not exists subscription_plans_active_idx
  on public.subscription_plans (is_active, sort_order);

-- ─── 2. user_subscriptions — additive columns ───────────────────────────────
alter table public.user_subscriptions add column if not exists razorpay_order_id   text;
alter table public.user_subscriptions add column if not exists razorpay_payment_id text;
alter table public.user_subscriptions add column if not exists amount_paid_inr     integer not null default 0;
alter table public.user_subscriptions add column if not exists currency            text not null default 'INR';
alter table public.user_subscriptions add column if not exists cancelled_at        timestamptz;

create index if not exists user_subscriptions_user_idx   on public.user_subscriptions (user_id);
create index if not exists user_subscriptions_status_idx on public.user_subscriptions (status);
create unique index if not exists user_subscriptions_order_idx
  on public.user_subscriptions (razorpay_order_id)
  where razorpay_order_id is not null;

-- ─── 3. payment_history — additive columns ──────────────────────────────────
alter table public.payment_history add column if not exists plan_id   text;
alter table public.payment_history add column if not exists currency  text not null default 'INR';
alter table public.payment_history add column if not exists method    text;
alter table public.payment_history add column if not exists source    text not null default 'checkout';
alter table public.payment_history add column if not exists event     text;
alter table public.payment_history add column if not exists raw_event jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_history_status_check'
  ) then
    alter table public.payment_history
      add constraint payment_history_status_check
      check (status in ('created','attempted','captured','failed','refunded'));
  end if;
end $$;

create index if not exists payment_history_user_idx     on public.payment_history (user_id);
create index if not exists payment_history_order_idx    on public.payment_history (razorpay_order_id);
create index if not exists payment_history_payment_idx  on public.payment_history (razorpay_payment_id);

-- ─── 4. updated_at trigger ───────────────────────────────────────────────────
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

-- ─── 5. Normalise default plan rows ──────────────────────────────────────────
update public.subscription_plans set
  description = coalesce(description, 'Get started with eligibility checks and exam tracking.'),
  interval    = 'free',
  price_inr   = 0,
  sort_order  = 0
where id = 'free';

update public.subscription_plans set
  description = coalesce(description, 'Full access to study OS, mocks, and AI guidance.'),
  interval    = 'monthly',
  -- price stays admin-controlled; convert legacy ₹199 to paise if needed.
  price_inr   = case when price_inr < 1000 then price_inr * 100 else price_inr end,
  sort_order  = 10
where id = 'pro';

update public.subscription_plans set
  description = coalesce(description, 'Annual plan with priority mentor review.'),
  interval    = 'annual',
  price_inr   = case when price_inr < 1000 then price_inr * 100 else price_inr end,
  sort_order  = 20
where id = 'elite';

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_history    enable row level security;

drop policy if exists "subscription_plans read active" on public.subscription_plans;
create policy "subscription_plans read active"
  on public.subscription_plans for select
  using (is_active = true or auth.role() = 'service_role');

drop policy if exists "subscription_plans admin write" on public.subscription_plans;
create policy "subscription_plans admin write"
  on public.subscription_plans for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "user_subscriptions read own" on public.user_subscriptions;
create policy "user_subscriptions read own"
  on public.user_subscriptions for select
  using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "user_subscriptions service write" on public.user_subscriptions;
create policy "user_subscriptions service write"
  on public.user_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

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
