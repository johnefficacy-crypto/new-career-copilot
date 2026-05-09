-- migration 032: admin_settings key-value store for operational flags
-- Used by notification governance kill switch and future feature flags.

create table if not exists public.admin_settings (
  key         text primary key,
  value       text not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Only service_role and super_admin can read/write
alter table public.admin_settings enable row level security;

create policy "service_role_admin_settings"
  on public.admin_settings for all
  using (auth.role() = 'service_role');

-- seed default: notifications not paused
insert into public.admin_settings (key, value)
values ('notifications_paused', 'false')
on conflict (key) do nothing;
