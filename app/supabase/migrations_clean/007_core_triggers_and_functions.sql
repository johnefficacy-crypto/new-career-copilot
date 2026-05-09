create or replace function public.fn_enqueue_eligibility_for_new_recruitment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.eligibility_recompute_queue (user_id, recruitment_id, reason, status, queued_at)
  select p.id, new.id, 'new_recruitment', 'queued', now()
  from public.profiles p
  where coalesce(p.onboarding_completed, false) = true;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_eligibility_on_recruitment_insert on public.recruitments;
create trigger trg_enqueue_eligibility_on_recruitment_insert
after insert on public.recruitments
for each row execute function public.fn_enqueue_eligibility_for_new_recruitment();

create or replace function public.claim_eligibility_queue(batch_size integer default 50)
returns setof public.eligibility_recompute_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    update public.eligibility_recompute_queue q
       set status = 'processing', claimed_at = now()
     where q.id in (
       select id
       from public.eligibility_recompute_queue
       where status = 'queued'
       order by queued_at asc
       limit greatest(batch_size, 1)
       for update skip locked
     )
     returning q.*
  )
  select * from claimed;
end;
$$;

create or replace function public.fn_fanout_alert_event(event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.notification_alerts (user_id, recruitment_id, alert_event_id, alert_type, priority, sent_at)
  select tr.user_id, ae.recruitment_id, ae.id, ae.event_type, ae.priority, now()
  from public.alert_events ae
  join public.tracked_recruitments tr on tr.recruitment_id = ae.recruitment_id
  where ae.id = event_id
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  update public.alert_events
     set fanout_status = 'completed',
         fanout_completed_at = now(),
         users_notified = coalesce(users_notified,0) + inserted_count
   where id = event_id;

  return inserted_count;
end;
$$;
