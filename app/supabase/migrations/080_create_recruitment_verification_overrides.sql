-- Migration 080: PR3 — recruitment_verification_overrides audit table.
--
-- One row per admin override on a verification conflict. The original
-- conflict on the report's jsonb column flips to
-- ``status = 'resolved_by_admin'`` once an override row is written.
--
-- ``override_scope`` is restricted to ``field`` or ``recruitment``;
-- ``report`` was removed deliberately per the PR plan §4 — an override
-- that covers an entire report is too coarse and lets a single
-- decision unblock unrelated fields.

begin;

create table if not exists public.recruitment_verification_overrides (
  id uuid primary key default gen_random_uuid(),

  verification_report_id uuid not null
    references public.recruitment_verification_reports(id) on delete cascade,

  -- Matches conflict.conflict_id in the report's jsonb conflicts column.
  -- Stored as text to keep parity with the jsonb payload (uuid strings).
  conflict_id  text not null,
  conflict_key text not null,
  field_path   text,

  prior_value  jsonb,
  chosen_value jsonb,

  reason       text not null,
  evidence_url text,

  override_scope text not null default 'field'
    check (override_scope in ('field', 'recruitment')),

  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_recruitment_verification_overrides_report
  on public.recruitment_verification_overrides(verification_report_id, created_at desc);

create index if not exists idx_recruitment_verification_overrides_conflict
  on public.recruitment_verification_overrides(conflict_id);

commit;

notify pgrst, 'reload schema';
