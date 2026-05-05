create table if not exists public.user_recruitment_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  feedback_type text not null check (feedback_type in (
    'wrong_match','deadline_wrong','official_link_broken',
    'duplicate_notification','not_interested','already_applied','other'
  )),
  message text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_user_recruitment_feedback_user_created
  on public.user_recruitment_feedback (user_id, created_at desc);

alter table public.user_recruitment_feedback enable row level security;

create policy "user_recruitment_feedback_own"
on public.user_recruitment_feedback
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
