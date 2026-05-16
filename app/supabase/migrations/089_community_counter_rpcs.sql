-- Atomic counter RPCs for the community runtime.
-- Replaces client-side read-modify-write on community_threads.reply_count,
-- community_threads.vote_count, community_replies.vote_count,
-- community_resources.upvote_count, and community_resources.report_count.
--
-- Each function performs `UPDATE ... SET col = col + delta` so concurrent
-- writers cannot lose increments. Returns the post-update value so the
-- caller can echo it to the client without a second read.

create or replace function public.community_inc_thread_reply_count(
  p_thread_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  update public.community_threads
     set reply_count = greatest(0, reply_count + p_delta),
         updated_at = now()
   where id = p_thread_id
  returning reply_count into v_new;
  return v_new;
end;
$$;

create or replace function public.community_inc_thread_vote_count(
  p_thread_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  update public.community_threads
     set vote_count = vote_count + p_delta,
         updated_at = now()
   where id = p_thread_id
  returning vote_count into v_new;
  return v_new;
end;
$$;

create or replace function public.community_inc_reply_vote_count(
  p_reply_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  update public.community_replies
     set vote_count = vote_count + p_delta,
         updated_at = now()
   where id = p_reply_id
  returning vote_count into v_new;
  return v_new;
end;
$$;

create or replace function public.community_inc_resource_upvote_count(
  p_resource_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  update public.community_resources
     set upvote_count = greatest(0, upvote_count + p_delta),
         updated_at = now()
   where id = p_resource_id
  returning upvote_count into v_new;
  return v_new;
end;
$$;

create or replace function public.community_inc_resource_report_count(
  p_resource_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  update public.community_resources
     set report_count = greatest(0, report_count + p_delta),
         updated_at = now()
   where id = p_resource_id
  returning report_count into v_new;
  return v_new;
end;
$$;

revoke all on function public.community_inc_thread_reply_count(uuid, integer) from public;
revoke all on function public.community_inc_thread_vote_count(uuid, integer) from public;
revoke all on function public.community_inc_reply_vote_count(uuid, integer) from public;
revoke all on function public.community_inc_resource_upvote_count(uuid, integer) from public;
revoke all on function public.community_inc_resource_report_count(uuid, integer) from public;

grant execute on function public.community_inc_thread_reply_count(uuid, integer) to authenticated, service_role;
grant execute on function public.community_inc_thread_vote_count(uuid, integer) to authenticated, service_role;
grant execute on function public.community_inc_reply_vote_count(uuid, integer) to authenticated, service_role;
grant execute on function public.community_inc_resource_upvote_count(uuid, integer) to authenticated, service_role;
grant execute on function public.community_inc_resource_report_count(uuid, integer) to authenticated, service_role;
