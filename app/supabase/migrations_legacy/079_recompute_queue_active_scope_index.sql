begin;

create unique index if not exists uq_recompute_queue_active_scope
on public.eligibility_recompute_queue (
  user_id,
  coalesce(recruitment_id::text, '__all__')
)
where status in ('pending', 'processing');

commit;
