-- migration 031: application/form tracker
-- Durable per-user application state, separate from telemetry click events.
-- clicked_apply in user_events is telemetry only; this table is product state.

create type public.application_status as enum (
  'not_started',
  'opened',
  'in_progress',
  'submitted',
  'skipped',
  'not_applicable'
);

create table if not exists public.user_recruitment_applications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  recruitment_id      uuid not null references public.recruitments(id) on delete cascade,
  status              public.application_status not null default 'not_started',
  application_number  text,
  fee_paid            boolean default false,
  fee_amount          numeric(10,2),
  payment_reference   text,
  documents_pending   jsonb,   -- array of string labels
  notes               text,
  submitted_at        timestamptz,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),

  unique (user_id, recruitment_id)
);

-- keep updated_at current
create or replace function public.set_application_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_application_updated_at
  before update on public.user_recruitment_applications
  for each row execute procedure public.set_application_updated_at();

-- RLS: users can only see and modify their own applications
alter table public.user_recruitment_applications enable row level security;

create policy "users_own_applications_select"
  on public.user_recruitment_applications for select
  using (auth.uid() = user_id);

create policy "users_own_applications_insert"
  on public.user_recruitment_applications for insert
  with check (auth.uid() = user_id);

create policy "users_own_applications_update"
  on public.user_recruitment_applications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_applications_delete"
  on public.user_recruitment_applications for delete
  using (auth.uid() = user_id);

-- admins can read all (support use-case)
create policy "service_role_applications_all"
  on public.user_recruitment_applications for all
  using (auth.role() = 'service_role');

-- index for dashboard queries
create index if not exists idx_applications_user_id
  on public.user_recruitment_applications(user_id);

create index if not exists idx_applications_user_status
  on public.user_recruitment_applications(user_id, status);
