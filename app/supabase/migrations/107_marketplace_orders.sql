-- Marketplace orders + refunds — Razorpay one-time course purchase.
-- Couples to existing courses + enrollments from 013_marketplace_runtime_schema.sql.

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  amount_inr integer not null check (amount_inr >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created'
    check (status in ('created','paid','failed','refunded','cancelled')),
  razorpay_order_id text unique,
  razorpay_payment_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists uq_marketplace_orders_user_course_open
  on public.marketplace_orders (user_id, course_id)
  where status in ('created');

create unique index if not exists uq_marketplace_orders_payment
  on public.marketplace_orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

create index if not exists marketplace_orders_user_idx
  on public.marketplace_orders (user_id, created_at desc);

create index if not exists marketplace_orders_status_idx
  on public.marketplace_orders (status, created_at desc);

create table if not exists public.marketplace_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  reason text,
  status text not null default 'requested'
    check (status in ('requested','approved','denied','processed','failed')),
  amount_inr integer not null check (amount_inr >= 0),
  razorpay_refund_id text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists marketplace_refunds_status_idx
  on public.marketplace_refunds (status, created_at desc);

create index if not exists marketplace_refunds_user_idx
  on public.marketplace_refunds (user_id, created_at desc);

alter table public.courses
  add column if not exists refund_window_days integer not null default 7,
  add column if not exists is_affiliate boolean not null default false,
  add column if not exists affiliate_disclosure text;

alter table public.marketplace_orders enable row level security;
alter table public.marketplace_refunds enable row level security;

drop policy if exists mo_select_own on public.marketplace_orders;
create policy mo_select_own on public.marketplace_orders
  for select using (auth.uid() = user_id);

drop policy if exists mr_select_own on public.marketplace_refunds;
create policy mr_select_own on public.marketplace_refunds
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies for users — service role bypasses RLS.

notify pgrst, 'reload schema';
