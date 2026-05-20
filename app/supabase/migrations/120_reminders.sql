-- 120_reminders.sql
-- PR4 — Aspirant-owned reminders.
--
-- One row = one user-facing reminder. `source='user'` rows are CRUD-able
-- by the owner; `source='system'` rows are seeded by the platform (e.g.
-- recruitment deadline ingestion) and the user can only dismiss them via
-- `dismissed_at`, never edit or delete. The API enforces this contract;
-- RLS below mirrors it so direct PostgREST writes can't bypass.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  due_at timestamptz not null,
  reminder_type text not null default 'general'
    check (reminder_type in ('general', 'deadline', 'exam', 'document', 'payment', 'study')),
  source text not null default 'user'
    check (source in ('user', 'system')),
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reminders_user_due_at
  on public.reminders(user_id, due_at);

create index if not exists idx_reminders_user_upcoming
  on public.reminders(user_id, due_at)
  where dismissed_at is null;

drop trigger if exists reminders_updated_at on public.reminders;
create trigger reminders_updated_at
  before update on public.reminders
  for each row execute function public.tg_set_updated_at();

alter table public.reminders enable row level security;

drop policy if exists reminders_owner_select on public.reminders;
create policy reminders_owner_select on public.reminders
  for select using (user_id = auth.uid());

drop policy if exists reminders_owner_insert on public.reminders;
create policy reminders_owner_insert on public.reminders
  for insert with check (user_id = auth.uid() and source = 'user');

drop policy if exists reminders_owner_update on public.reminders;
create policy reminders_owner_update on public.reminders
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists reminders_owner_delete on public.reminders;
create policy reminders_owner_delete on public.reminders
  for delete using (user_id = auth.uid() and source = 'user');

notify pgrst, 'reload schema';
