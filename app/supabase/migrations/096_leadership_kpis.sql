-- Leadership KPI Dashboard runtime.
-- Materialized snapshots of the four KPI families described in the
-- management-strategy doc (outcome, trust, commercial, quality). A nightly
-- job (or admin-triggered run) inserts a new snapshot; the API reads the
-- latest snapshot plus a rolling 30-day series for sparklines.

create table if not exists public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_for date not null,
  family text not null check (family in ('outcome','trust','commercial','quality')),
  metric_key text not null,
  metric_label text not null,
  value numeric,
  unit text,
  target numeric,
  trend_direction text check (trend_direction in ('up','down','flat','na')),
  series jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (captured_for, family, metric_key)
);

create index if not exists idx_kpi_snapshots_family_date
  on public.kpi_snapshots(family, captured_for desc);
create index if not exists idx_kpi_snapshots_metric_date
  on public.kpi_snapshots(metric_key, captured_for desc);

alter table public.kpi_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='kpi_snapshots'
      and policyname='kpi_service_role_all'
  ) then
    create policy kpi_service_role_all on public.kpi_snapshots
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Latest-snapshot helper view: one row per (family, metric_key) at the most
-- recent captured_for date.
create or replace view public.kpi_latest_v as
select distinct on (family, metric_key)
  family, metric_key, metric_label, value, unit, target,
  trend_direction, series, metadata, captured_for, computed_at
from public.kpi_snapshots
order by family, metric_key, captured_for desc;

notify pgrst, 'reload schema';
