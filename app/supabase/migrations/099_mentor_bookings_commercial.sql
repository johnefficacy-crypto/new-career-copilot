-- Extend mentor_bookings to support commercial bookings against the
-- existing marketplace mentor catalogue (which uses slug ids, not profile
-- UUIDs) and tie a booking to its Razorpay payment. mentor_id stays as a
-- nullable profile reference for the future native-mentor path.

alter table public.mentor_bookings
  add column if not exists mentor_slug text,
  add column if not exists duration_minutes integer not null default 60,
  add column if not exists price_inr integer,
  add column if not exists notes text,
  add column if not exists payment_id text,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','authorized','captured','failed','refunded')),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- Widen status to include the realistic lifecycle states.
alter table public.mentor_bookings
  drop constraint if exists mentor_bookings_status_check;
alter table public.mentor_bookings
  add constraint mentor_bookings_status_check
  check (status in (
    'requested','pending_payment','awaiting_mentor',
    'confirmed','completed','cancelled','no_show','refunded'
  ));

create index if not exists idx_mentor_bookings_slug
  on public.mentor_bookings(mentor_slug);
create index if not exists idx_mentor_bookings_user_status
  on public.mentor_bookings(user_id, status, created_at desc);
create index if not exists idx_mentor_bookings_payment
  on public.mentor_bookings(payment_id) where payment_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mentor_bookings'
      and policyname='mb_owner_read'
  ) then
    create policy mb_owner_read on public.mentor_bookings
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mentor_bookings'
      and policyname='mb_owner_insert'
  ) then
    create policy mb_owner_insert on public.mentor_bookings
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mentor_bookings'
      and policyname='mb_owner_update'
  ) then
    create policy mb_owner_update on public.mentor_bookings
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mentor_bookings'
      and policyname='mb_mentor_read'
  ) then
    create policy mb_mentor_read on public.mentor_bookings
      for select using (auth.uid() = mentor_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='mentor_bookings'
      and policyname='mb_service_role_all'
  ) then
    create policy mb_service_role_all on public.mentor_bookings
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
