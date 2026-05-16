-- Migration 087: consensus conflict resolver for scrape queue + recruitments.
--
-- ``recruitment_verification_conflicts`` is the canonical record of a
-- single-field disagreement across official sources for a queue item or
-- a promoted recruitment (e.g. apply_end_date on a notification PDF vs
-- a corrigendum). One row per field per pipeline target. Admin override
-- writes ``status='resolved_by_admin'`` plus the chosen value, reason
-- and evidence_url; the promotion gate refuses to advance a queue item
-- while any row for it is still ``status='open'``.
--
-- This table sits alongside the existing PR3 ``recruitment_verification_overrides``
-- (migration 080), which records overrides on the verification report's
-- jsonb conflict array. The two address different stages: PR3 covers
-- post-promotion gateway reports; this table covers pre-promotion queue
-- consensus and field-level recruitment edits.
--
-- The note name "055_verification_conflicts.sql" in the originating PR
-- predates several migrations; this file is shipped as 087 to slot in
-- after the latest applied migration (086).

begin;

create table if not exists public.recruitment_verification_conflicts (
  id uuid primary key default gen_random_uuid(),

  queue_id uuid
    references public.scrape_queue(id) on delete cascade,
  recruitment_id uuid
    references public.recruitments(id) on delete cascade,

  field_key text not null,
  candidates jsonb not null,

  status text not null default 'open'
    check (status in ('open', 'resolved_by_admin', 'auto_resolved', 'rejected')),

  resolved_value jsonb,
  resolved_scope text
    check (resolved_scope is null or resolved_scope in ('field', 'recruitment')),
  resolved_by uuid references public.profiles(id),
  resolved_reason text,
  resolved_evidence_url text,

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint recruitment_verification_conflicts_target_required
    check (queue_id is not null or recruitment_id is not null)
);

-- Sparse indexes: the admin UI only ever asks for the open conflicts on
-- a given target. Filtering to ``status='open'`` keeps the index small
-- even as resolved rows accumulate.
create index if not exists idx_recruitment_verification_conflicts_queue_open
  on public.recruitment_verification_conflicts(queue_id)
  where status = 'open';

create index if not exists idx_recruitment_verification_conflicts_recruitment_open
  on public.recruitment_verification_conflicts(recruitment_id)
  where status = 'open';

alter table public.recruitment_verification_conflicts enable row level security;

drop policy if exists recruitment_verification_conflicts_admin
  on public.recruitment_verification_conflicts;
create policy recruitment_verification_conflicts_admin
on public.recruitment_verification_conflicts
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

commit;

notify pgrst, 'reload schema';
