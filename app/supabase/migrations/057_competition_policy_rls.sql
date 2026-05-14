-- 057_competition_policy_rls.sql
-- RLS for the Competition Intelligence and Policy / Update Intelligence
-- tables (migrations 055-056). Mirrors the verified-only contract used by
-- exam_topic_coverage in migration 035:
--   * reference / intelligence data is readable to authenticated users only
--     once it has cleared review,
--   * admins (profiles.is_admin = true) get full read/write,
--   * the backend service role bypasses RLS and applies the authoritative
--     filtering in app/study_os/*_context.py.

alter table public.exam_competition_metrics enable row level security;
alter table public.exam_policy_updates enable row level security;

-- Read policies.
do $$
begin
  -- Competition metrics: only reviewed/locked rows reach an aspirant.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_competition_metrics'
      and policyname = 'exam_competition_metrics_read_reviewed'
  ) then
    create policy exam_competition_metrics_read_reviewed on public.exam_competition_metrics
      for select to authenticated
      using (
        reviewer_status in ('reviewed', 'locked')
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
      );
  end if;

  -- Policy updates: verified official updates are user-facing; non-official
  -- discovery rows are surfaced for awareness while still pending/verified.
  -- Rejected discovery rows and pending official rows stay admin-only.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exam_policy_updates'
      and policyname = 'exam_policy_updates_read_trusted'
  ) then
    create policy exam_policy_updates_read_trusted on public.exam_policy_updates
      for select to authenticated
      using (
        reviewer_status = 'verified'
        or (source_type <> 'official' and reviewer_status = 'pending')
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
      );
  end if;
end $$;

-- Admin-all policies for controlled management.
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array[
    'exam_competition_metrics',
    'exam_policy_updates'
  ]
  loop
    policy_name := t || '_admin_all';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))',
        policy_name,
        t
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
