-- Safe Feature Migration Plan: accountability, telemetry, and user state.

create table if not exists public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  event_type text,
  recruitment_id uuid references public.recruitments(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  exam_id text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  recruitment_id uuid references public.recruitments(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  form_type text,
  status text not null default 'draft',
  application_number text,
  payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_recruitment_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recruitment_id uuid references public.recruitments(id) on delete cascade,
  rating integer,
  feedback text,
  feedback_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.accountability_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  exam_tag text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accountability_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.accountability_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.accountability_partner_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.mentor_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mentor_id uuid references public.profiles(id) on delete set null,
  slot timestamptz,
  agenda text,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_events_user_time on public.user_events(user_id, occurred_at desc);
create index if not exists idx_user_events_recruitment_time on public.user_events(recruitment_id, occurred_at desc);
create index if not exists idx_form_submissions_user_time on public.form_submissions(user_id, submitted_at desc);
create index if not exists idx_form_submissions_recruitment on public.form_submissions(recruitment_id);
create index if not exists idx_user_recruitment_feedback_user on public.user_recruitment_feedback(user_id, recruitment_id);
create index if not exists idx_accountability_group_members_user on public.accountability_group_members(user_id);
create index if not exists idx_mentor_bookings_user on public.mentor_bookings(user_id, created_at desc);

alter table public.user_events enable row level security;
alter table public.form_submissions enable row level security;
alter table public.user_recruitment_feedback enable row level security;
alter table public.accountability_groups enable row level security;
alter table public.accountability_group_members enable row level security;
alter table public.accountability_partner_requests enable row level security;
alter table public.mentor_bookings enable row level security;

notify pgrst, 'reload schema';
