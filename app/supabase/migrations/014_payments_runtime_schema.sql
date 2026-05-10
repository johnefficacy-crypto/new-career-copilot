-- Safe Feature Migration Plan: payments and subscription runtime schema.
-- Preserves the clean baseline UUID primary key on subscription_plans and
-- exposes frontend slugs through subscription_plans.plan_code.

--------------------------------------------------
-- SUBSCRIPTION PLANS
--------------------------------------------------

alter table public.subscription_plans
  add column if not exists plan_code text,
  add column if not exists description text,
  add column if not exists price_inr integer,
  add column if not exists currency text not null default 'INR',
  add column if not exists interval text not null default 'monthly',
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.subscription_plans
   set price_inr = coalesce(price_inr, case when price is null then 0 else (price * 100)::integer end),
       interval = coalesce(nullif(interval, ''), billing_period, 'monthly')
 where price_inr is null
    or interval is null
    or interval = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_plan_code_key'
      and conrelid = 'public.subscription_plans'::regclass
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_plan_code_key unique (plan_code);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'subscription_plans_interval_check'
      and conrelid = 'public.subscription_plans'::regclass
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_interval_check
      check (interval in ('monthly','annual','one_time','free'));
  end if;
end $$;

create index if not exists subscription_plans_active_idx
  on public.subscription_plans(is_active, sort_order);

--------------------------------------------------
-- USER SUBSCRIPTIONS
--------------------------------------------------

alter table public.user_subscriptions
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists amount_paid_inr integer not null default 0,
  add column if not exists currency text not null default 'INR',
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.user_subscriptions
   set current_period_start = coalesce(current_period_start, starts_at),
       current_period_end = coalesce(current_period_end, ends_at)
 where current_period_start is null
    or current_period_end is null;

create index if not exists user_subscriptions_user_idx
  on public.user_subscriptions(user_id);

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions(status);

create unique index if not exists user_subscriptions_order_idx
  on public.user_subscriptions(razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists user_subscriptions_user_active_idx
  on public.user_subscriptions(user_id, status)
  where status in ('active','past_due');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_subscriptions_plan_id_fkey'
      and conrelid = 'public.user_subscriptions'::regclass
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_plan_id_fkey
      foreign key (plan_id) references public.subscription_plans(id) on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_subscriptions_user_id_fkey'
      and conrelid = 'public.user_subscriptions'::regclass
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

--------------------------------------------------
-- PAYMENT HISTORY
--------------------------------------------------

alter table public.payment_history
  add column if not exists plan_id text,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists amount_inr integer,
  add column if not exists method text,
  add column if not exists source text not null default 'checkout',
  add column if not exists event text,
  add column if not exists raw_event jsonb;

update public.payment_history
   set amount_inr = coalesce(amount_inr, (amount * 100)::integer),
       razorpay_payment_id = coalesce(razorpay_payment_id, provider_payment_id)
 where amount_inr is null
    or razorpay_payment_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_history_status_check'
      and conrelid = 'public.payment_history'::regclass
  ) then
    alter table public.payment_history
      add constraint payment_history_status_check
      check (status in ('created','attempted','captured','failed','refunded','pending'));
  end if;
end $$;

create index if not exists payment_history_user_idx
  on public.payment_history(user_id);

create index if not exists payment_history_order_idx
  on public.payment_history(razorpay_order_id);

create index if not exists payment_history_payment_idx
  on public.payment_history(razorpay_payment_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_history_user_id_fkey'
      and conrelid = 'public.payment_history'::regclass
  ) then
    alter table public.payment_history
      add constraint payment_history_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_history_subscription_id_fkey'
      and conrelid = 'public.payment_history'::regclass
  ) then
    alter table public.payment_history
      add constraint payment_history_subscription_id_fkey
      foreign key (subscription_id) references public.user_subscriptions(id) on delete set null not valid;
  end if;
end $$;

--------------------------------------------------
-- UPDATED_AT TRIGGER
--------------------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function public.tg_set_updated_at();

drop trigger if exists user_subscriptions_updated_at on public.user_subscriptions;
create trigger user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function public.tg_set_updated_at();

--------------------------------------------------
-- DEFAULT PLAN SEEDS
--------------------------------------------------

insert into public.subscription_plans (
  plan_code, name, description, price_inr, currency, interval, features, sort_order, is_active
) values
  (
    'free',
    'Free',
    'Get started with eligibility checks and exam tracking.',
    0,
    'INR',
    'free',
    '["Eligibility checks","Recruitment tracker"]'::jsonb,
    0,
    true
  ),
  (
    'pro',
    'Pro',
    'Full access to study OS, mocks, and AI guidance.',
    19900,
    'INR',
    'monthly',
    '["Study OS","Mock analytics","AI guidance"]'::jsonb,
    10,
    true
  ),
  (
    'elite',
    'Elite',
    'Annual plan with priority mentor review.',
    199900,
    'INR',
    'annual',
    '["Everything in Pro","Priority mentor review","Annual savings"]'::jsonb,
    20,
    true
  )
on conflict (plan_code) do update
   set name = excluded.name,
       description = coalesce(public.subscription_plans.description, excluded.description),
       price_inr = coalesce(public.subscription_plans.price_inr, excluded.price_inr),
       currency = coalesce(public.subscription_plans.currency, excluded.currency),
       interval = coalesce(public.subscription_plans.interval, excluded.interval),
       features = case
         when public.subscription_plans.features is null
           or public.subscription_plans.features = '[]'::jsonb
         then excluded.features
         else public.subscription_plans.features
       end,
       sort_order = excluded.sort_order,
       is_active = coalesce(public.subscription_plans.is_active, excluded.is_active);

--------------------------------------------------
-- RLS
--------------------------------------------------

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_history enable row level security;

drop policy if exists "subscription_plans read active" on public.subscription_plans;
create policy "subscription_plans read active"
  on public.subscription_plans for select
  using (is_active = true or auth.role() = 'service_role');

drop policy if exists "subscription_plans service write" on public.subscription_plans;
create policy "subscription_plans service write"
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

notify pgrst, 'reload schema';
