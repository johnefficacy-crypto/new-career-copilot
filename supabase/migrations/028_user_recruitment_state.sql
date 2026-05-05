-- 028_user_recruitment_state_materialized_view.sql

drop materialized view if exists public.user_recruitment_state cascade;

create materialized view public.user_recruitment_state as
with eligibility as (
  select
    er.user_id,
    er.recruitment_id,
    count(*)::int as evaluated_posts_count,
    count(*) filter (where er.is_eligible)::int as eligible_posts_count,
    bool_or(er.is_eligible) as has_any_eligible_post,
    bool_or(er.is_conditional) as has_conditional_result,
    max(er.computed_at) as last_eligibility_computed_at
  from public.eligibility_results er
  group by er.user_id, er.recruitment_id
),

fail_reason_rollup as (
  select
    er.user_id,
    er.recruitment_id,
    coalesce(
      array_agg(distinct fr.reason) filter (where fr.reason is not null),
      '{}'::text[]
    ) as fail_reasons
  from public.eligibility_results er
  left join lateral unnest(coalesce(er.fail_reasons, '{}'::text[])) as fr(reason)
    on true
  group by er.user_id, er.recruitment_id
),

tracked as (
  select
    tr.user_id,
    tr.recruitment_id,
    true                   as is_tracked,
    null::timestamptz      as tracked_at   -- tracked_recruitments has no tracked_at column
  from public.tracked_recruitments tr
  group by tr.user_id, tr.recruitment_id
),

targets as (
  select
    ut.user_id,
    ut.recruitment_id,
    max(ut.status) as target_status
  from public.user_targets ut
  group by ut.user_id, ut.recruitment_id
),

events as (
  select
    ue.user_id,
    coalesce(ue.recruitment_id, ue.exam_id) as recruitment_id,
    max(ue.occurred_at) as last_event_at,
    count(*)::int as event_count,

    bool_or(
      coalesce(ue.event_type, ue.event_name) in (
        'view',
        'view_recruitment',
        'recruitment_view'
      )
    ) as has_viewed,

    bool_or(
      coalesce(ue.event_type, ue.event_name) in (
        'apply_click',
        'apply_now',
        'external_apply_click'
      )
    ) as clicked_apply

  from public.user_events ue
  where coalesce(ue.recruitment_id, ue.exam_id) is not null
  group by ue.user_id, coalesce(ue.recruitment_id, ue.exam_id)
),

base as (
  select user_id, recruitment_id from eligibility
  union
  select user_id, recruitment_id from tracked
  union
  select user_id, recruitment_id from targets
  union
  select user_id, recruitment_id from events
)

select
  b.user_id,
  b.recruitment_id,

  coalesce(t.is_tracked, false) as is_tracked,
  t.tracked_at,
  tg.target_status,

  coalesce(el.has_any_eligible_post, false) as has_any_eligible_post,
  coalesce(el.has_conditional_result, false) as has_conditional_result,
  coalesce(el.evaluated_posts_count, 0) as evaluated_posts_count,
  coalesce(el.eligible_posts_count, 0) as eligible_posts_count,
  coalesce(fr.fail_reasons, '{}'::text[]) as fail_reasons,
  el.last_eligibility_computed_at,

  ev.last_event_at,
  coalesce(ev.event_count, 0) as event_count,
  coalesce(ev.has_viewed, false) as has_viewed,
  coalesce(ev.clicked_apply, false) as clicked_apply,

  now() as refreshed_at

from base b
left join eligibility el
  on el.user_id = b.user_id
 and el.recruitment_id = b.recruitment_id
left join fail_reason_rollup fr
  on fr.user_id = b.user_id
 and fr.recruitment_id = b.recruitment_id
left join tracked t
  on t.user_id = b.user_id
 and t.recruitment_id = b.recruitment_id
left join targets tg
  on tg.user_id = b.user_id
 and tg.recruitment_id = b.recruitment_id
left join events ev
  on ev.user_id = b.user_id
 and ev.recruitment_id = b.recruitment_id
with data;

create unique index if not exists user_recruitment_state_uidx
  on public.user_recruitment_state(user_id, recruitment_id);

create index if not exists idx_user_recruitment_state_user
  on public.user_recruitment_state(user_id);

create index if not exists idx_user_recruitment_state_recruitment
  on public.user_recruitment_state(recruitment_id);