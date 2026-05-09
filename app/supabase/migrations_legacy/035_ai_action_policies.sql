-- Migration 035: AI action policy layer
-- Controls what actions the AI is permitted to take autonomously

create type public.ai_policy_action as enum (
  'publish_recruitment',
  'send_notification',
  'update_eligibility',
  'generate_study_plan',
  'send_message',
  'approve_scrape_item',
  'modify_user_data'
);

create type public.ai_policy_mode as enum (
  'allow',
  'require_approval',
  'deny'
);

create table if not exists public.ai_action_policies (
  id          uuid primary key default gen_random_uuid(),
  action      public.ai_policy_action not null unique,
  mode        public.ai_policy_mode   not null default 'require_approval',
  reason      text,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- RLS: readable by authenticated admins, writable by service_role only
alter table public.ai_action_policies enable row level security;

create policy "ai_policies_admin_read" on public.ai_action_policies
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and (is_admin = true or admin_role is not null)
    )
  );

-- Seed default policies (conservative defaults)
insert into public.ai_action_policies (action, mode, reason) values
  ('publish_recruitment',  'deny',             'AI must not publish recruitments without human review'),
  ('send_notification',    'require_approval', 'Notifications require admin sign-off before broadcast'),
  ('update_eligibility',   'allow',            'Deterministic engine; AI may trigger recompute'),
  ('generate_study_plan',  'allow',            'User-initiated; AI may generate plans on request'),
  ('send_message',         'require_approval', 'AI must not initiate outbound messages autonomously'),
  ('approve_scrape_item',  'deny',             'Scrape approvals require human review'),
  ('modify_user_data',     'deny',             'AI must never modify user profile or subscription data')
on conflict (action) do nothing;
