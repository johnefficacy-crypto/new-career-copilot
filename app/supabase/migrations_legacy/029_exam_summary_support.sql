-- 029_exam_summary_support.sql

drop view if exists public.exam_summary cascade;
drop view if exists public.user_exam_summary cascade;

create or replace view public.exam_summary as
with post_rollup as (
  select
    p.recruitment_id,
    count(distinct p.id)::int as posts_count,
    coalesce(sum(v.vacancy_count), 0)::int as category_vacancies
  from public.posts p
  left join public.vacancies v
    on v.post_id = p.id
  group by p.recruitment_id
)

select
  r.id as recruitment_id,
  r.name as exam_name,
  r.year,
  r.status,
  r.notification_date,
  r.apply_start_date,
  r.apply_end_date,
  r.official_notification_url,
  r.source_pdf_url,

  o.id as organization_id,
  o.name as organization_name,
  o.type as organization_type,
  o.state as organization_state,

  coalesce(pr.posts_count, 0) as posts_count,
  coalesce(r.total_vacancies, pr.category_vacancies, 0) as total_vacancies,

  r.created_at

from public.recruitments r
left join public.organizations o
  on o.id = r.organization_id
left join post_rollup pr
  on pr.recruitment_id = r.id;

create or replace view public.user_exam_summary as
select
  urs.user_id,
  es.recruitment_id,
  es.exam_name,
  es.year,
  es.status,
  es.notification_date,
  es.apply_start_date,
  es.apply_end_date,
  es.official_notification_url,
  es.source_pdf_url,
  es.organization_id,
  es.organization_name,
  es.organization_type,
  es.organization_state,
  es.posts_count,
  es.total_vacancies,

  urs.is_tracked,
  urs.tracked_at,
  urs.target_status,
  urs.has_any_eligible_post,
  urs.has_conditional_result,
  urs.evaluated_posts_count,
  urs.eligible_posts_count,
  urs.fail_reasons,
  urs.last_eligibility_computed_at,
  urs.last_event_at,
  urs.event_count,
  urs.has_viewed,
  urs.clicked_apply,
  urs.refreshed_at

from public.user_recruitment_state urs
join public.exam_summary es
  on es.recruitment_id = urs.recruitment_id;