-- Sprint 8 P0-7: notification grouping state by (user_id, recruitment_id)
create table if not exists public.notification_group_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  latest_event_at timestamptz,
  unread_count int not null default 0,
  current_match_status text,
  current_deadline_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, recruitment_id)
);

create index if not exists idx_notification_group_state_user_latest
  on public.notification_group_state (user_id, latest_event_at desc nulls last);

alter table public.notification_group_state enable row level security;

create policy "notification_group_state_own"
  on public.notification_group_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.sync_notification_group_state(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.notification_group_state (
    user_id, recruitment_id, latest_event_at, unread_count, current_match_status, current_deadline_status, updated_at
  )
  select
    na.user_id,
    na.recruitment_id,
    max(na.sent_at) as latest_event_at,
    count(*) filter (where coalesce(na.is_read, false) = false)::int as unread_count,
    max(case when na.alert_type = 'new_match' then 'confirmed_match' when na.alert_type in ('deadline_1day','deadline_3day') then 'deadline_alert' else null end) as current_match_status,
    max(case
      when r.apply_end_date is null then 'unknown'
      when r.apply_end_date < current_date then 'closed'
      when r.apply_end_date = current_date then 'closes_today'
      when r.apply_end_date <= current_date + interval '7 day' then 'closing_soon'
      else 'open'
    end) as current_deadline_status,
    now()
  from public.notification_alerts na
  left join public.recruitments r on r.id = na.recruitment_id
  where na.user_id = p_user_id
  group by na.user_id, na.recruitment_id
  on conflict (user_id, recruitment_id)
  do update set
    latest_event_at = excluded.latest_event_at,
    unread_count = excluded.unread_count,
    current_match_status = excluded.current_match_status,
    current_deadline_status = excluded.current_deadline_status,
    updated_at = now();
end;
$$;
