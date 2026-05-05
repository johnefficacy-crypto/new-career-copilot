-- Migration 037: Notification templates table (Sprint 6)
create table if not exists public.notification_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  subject     text not null,
  body_text   text not null,
  body_html   text,
  variables   jsonb,
  is_active   boolean not null default true,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.notification_templates enable row level security;

create policy "notification_templates_admin_read" on public.notification_templates
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and (is_admin = true or admin_role is not null)
    )
  );

-- Seed default templates
insert into public.notification_templates (key, subject, body_text, variables) values
  ('new_match',         'New exam match: {{exam_name}}',
   'Hi {{user_name}},\n\nYou are eligible for {{exam_name}} ({{organization}}).\n\nApply by: {{apply_end_date}}\n\nView details: {{detail_url}}',
   '["user_name","exam_name","organization","apply_end_date","detail_url"]'::jsonb),
  ('deadline_reminder', 'Deadline approaching: {{exam_name}}',
   'Hi {{user_name}},\n\nThe application deadline for {{exam_name}} is {{days_left}} days away ({{apply_end_date}}).\n\nApply now: {{apply_url}}',
   '["user_name","exam_name","apply_end_date","days_left","apply_url"]'::jsonb),
  ('digest_weekly',     'Your weekly exam digest',
   'Hi {{user_name}},\n\nHere are your top matches this week:\n\n{{match_list}}\n\nView all: {{dashboard_url}}',
   '["user_name","match_list","dashboard_url"]'::jsonb)
on conflict (key) do nothing;
