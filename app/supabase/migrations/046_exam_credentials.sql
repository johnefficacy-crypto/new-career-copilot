create table if not exists public.aspirant_exam_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_key text not null,
  score numeric,
  percentile numeric,
  rank_text text,
  exam_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, exam_key)
);

alter table public.aspirant_exam_credentials enable row level security;
create policy "aspirant_exam_credentials_own"
on public.aspirant_exam_credentials
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
