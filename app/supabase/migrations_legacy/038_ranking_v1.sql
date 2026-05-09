-- Migration 038: Exam-fit ranking v1
-- Materialized scoring view combining eligibility, urgency, and user behavior.
-- Formula: eligibility(40%) + urgency(30%) + relevance(20%) + activity(10%)

create or replace view public.v_recruitment_ranking as
select
  er.user_id,
  er.recruitment_id,
  r.name                                               as recruitment_name,
  r.apply_end_date,
  r.status                                             as lifecycle_status,
  r.publish_status,
  o.name                                               as organization_name,
  o.type                                               as organization_type,
  -- Eligibility component (0-40)
  case
    when er.is_eligible = true  then 40
    when coalesce(er.is_conditional, false) = true then 20
    else 0
  end                                                  as eligibility_score,
  -- Urgency component (0-30): higher when deadline is near
  case
    when r.apply_end_date is null then 0
    when r.apply_end_date < now() then 0
    when r.apply_end_date <= now() + interval '7 days'  then 30
    when r.apply_end_date <= now() + interval '14 days' then 22
    when r.apply_end_date <= now() + interval '30 days' then 15
    when r.apply_end_date <= now() + interval '60 days' then 8
    else 3
  end                                                  as urgency_score,
  -- Relevance component (0-20): org verified = more trust
  case
    when o.is_verified = true  then 20
    when o.trust_tier = 'trusted' then 12
    else 6
  end                                                  as relevance_score,
  -- Computed total
  (
    case when er.is_eligible = true then 40 when coalesce(er.is_conditional, false) = true then 20 else 0 end
    +
    case
      when r.apply_end_date is null then 0
      when r.apply_end_date < now() then 0
      when r.apply_end_date <= now() + interval '7 days'  then 30
      when r.apply_end_date <= now() + interval '14 days' then 22
      when r.apply_end_date <= now() + interval '30 days' then 15
      when r.apply_end_date <= now() + interval '60 days' then 8
      else 3
    end
    +
    case when o.is_verified = true then 20 when o.trust_tier = 'trusted' then 12 else 6 end
  )                                                    as total_score
from public.eligibility_results er
join public.recruitments r   on r.id = er.recruitment_id
join public.organizations o  on o.id = r.organization_id
where r.publish_status in ('published', 'verified')
  and r.status in ('open', 'upcoming');

comment on view public.v_recruitment_ranking is
  'Scoring view for exam-fit ranking. Combines eligibility, deadline urgency, and org trust.';
