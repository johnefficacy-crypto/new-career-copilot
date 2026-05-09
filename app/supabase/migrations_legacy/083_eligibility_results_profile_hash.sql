begin;

alter table if exists public.eligibility_results
  add column if not exists profile_hash text;

create index if not exists idx_eligibility_results_user_post_profile_hash
  on public.eligibility_results (user_id, post_id, profile_hash);

commit;
