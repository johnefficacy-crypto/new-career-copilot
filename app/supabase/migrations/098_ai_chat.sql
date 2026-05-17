-- AI chat runtime.
-- Replaces the in-memory _ai_history dict from the placeholder router.
-- Threads + messages are durable, owner-scoped, and queryable so the
-- forthcoming weekly-review and KPI pipelines can read message volume.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New conversation',
  topic text,
  exam_slug text,
  -- 'study','strategy','wellbeing','exam_policy','other'
  intent text not null default 'study'
    check (intent in ('study','strategy','wellbeing','exam_policy','other')),
  message_count integer not null default 0,
  last_message_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  model text,
  -- For guardrail/audit: which provider/version answered, with what confidence
  metadata jsonb not null default '{}'::jsonb,
  confidence numeric(4,2),
  is_flagged boolean not null default false,
  flag_reason text,
  prompt_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user_updated
  on public.ai_conversations(user_id, updated_at desc);
create index if not exists idx_ai_messages_conversation_created
  on public.ai_messages(conversation_id, created_at);
create index if not exists idx_ai_messages_user_created
  on public.ai_messages(user_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_conversations'
      and policyname='aic_owner_all'
  ) then
    create policy aic_owner_all on public.ai_conversations
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_conversations'
      and policyname='aic_service_role_all'
  ) then
    create policy aic_service_role_all on public.ai_conversations
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_messages'
      and policyname='aim_owner_all'
  ) then
    create policy aim_owner_all on public.ai_messages
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_messages'
      and policyname='aim_service_role_all'
  ) then
    create policy aim_service_role_all on public.ai_messages
      for all to service_role using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
