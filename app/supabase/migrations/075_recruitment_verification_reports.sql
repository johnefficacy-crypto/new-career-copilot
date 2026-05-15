-- Migration 075: Recruitment Verification Gateway — PR1 shell.
--
-- Adds the ``recruitment_verification_reports`` table that the new
-- gateway layer writes through. The gateway sits between
-- ``scrape_queue`` and the canonical recruitments/posts/criteria
-- tables; every queue item gets classified (Tier A / B / C) and a
-- report row is the audit trail of that classification + the
-- subsequent verification decisions.
--
-- PR1 scope (spec §6 + §9):
--   * 4 lifecycle states only — classified, backfilled_needs_review,
--     superseded, rejected. Future PRs (PR2 resolver, PR3 consensus,
--     PR4 complexity, PR5 corrigendum) add more states.
--   * Both report owners allowed — a report may reference a queue item,
--     a canonical recruitment, or both. The chk_verification_report_owner
--     constraint requires at least one. Active uniqueness is enforced by
--     two partial indexes.
--   * Trigger reasons are an OPEN text column (chk constraint at the end
--     of the table) — the DB carries the full taxonomy now even though
--     the PR1 service only emits three. This avoids a schema change
--     when PR2+ start writing more.
--   * recommended_action is also constrained — keeps free-text bugs out
--     of the column.
--   * Resolver / consensus / complexity columns are NOT added here.
--     They land with the PR that introduces them so this table doesn't
--     accrete unused fields.
--
-- Indexes (spec §9):
--   * uq_active_verification_report_queue — at most one active report
--     per scrape_queue_id.
--   * uq_active_verification_report_recruitment — at most one active
--     recruitment-scoped report (scrape_queue_id IS NULL).
--   * idx_verification_reports_chain — O(1) latest-version lookup per
--     chain_root_id.
--   * idx_verification_reports_attention — fuels the admin "needs
--     attention" list; partial on active reports only.
--   * idx_verification_reports_queue_active — joins from scrape_queue
--     listings to active report metadata.

begin;

create table if not exists public.recruitment_verification_reports (
  id uuid primary key default gen_random_uuid(),

  -- Owners. At least one must be set; both is allowed once a queue
  -- item has been promoted into a canonical recruitment.
  scrape_queue_id uuid references public.scrape_queue(id)        on delete cascade,
  recruitment_id  uuid references public.recruitments(id)        on delete cascade,

  -- Chain of versions. chain_root_id points at the first report in the
  -- chain (self-reference on row 1). superseded_by points at the next
  -- active version. report_version increments by 1 on each new version.
  chain_root_id   uuid references public.recruitment_verification_reports(id),
  report_version  int not null default 1,
  -- superseded_by FK is DEFERRABLE INITIALLY DEFERRED so the supersede
  -- RPC can stamp a transient placeholder uuid on the old row to free
  -- the active-uniqueness slot, then update it to the real new row's
  -- id within the same transaction. The FK check runs at COMMIT time
  -- and the transient placeholder is gone by then.
  superseded_by   uuid references public.recruitment_verification_reports(id)
                  deferrable initially deferred,

  lifecycle_status text not null default 'classified',

  -- Classification result from recruitment_classifier.py.
  criticality_tier   text not null,
  exam_family_id     uuid,          -- FK once exam_families ships (post-PR1)
  exam_family_key    text,

  -- Policy bundle plucked from verification_policy.py.
  review_strategy    text not null,
  publish_policy     text not null,
  recommended_action text not null default 'request_admin_review',

  -- Snapshot hashes (verification_hash.py). Either or both may be set:
  --   * scrape_queue_id present  → source_snapshot_hash populated
  --   * recruitment_id present   → canonical_snapshot_hash populated
  --   * queue-only report        → canonical hash null
  source_snapshot_hash    text,
  canonical_snapshot_hash text,

  trigger_reason text not null default 'initial_scrape',

  -- jsonb columns — write path goes through pydantic validators in
  -- verification_report_schemas.py. Defaults are empty so old readers
  -- never see null.
  risk_flags        jsonb not null default '[]'::jsonb,
  evidence_summary  jsonb not null default '{}'::jsonb,
  conflicts         jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_verification_report_owner
    check (scrape_queue_id is not null or recruitment_id is not null),

  -- PR1 lifecycle states only. Future PRs extend this check.
  constraint chk_lifecycle_status
    check (lifecycle_status in (
      'classified',
      'backfilled_needs_review',
      'superseded',
      'rejected'
    )),

  constraint chk_criticality_tier
    check (criticality_tier in (
      'A_HIGH_STAKES',
      'B_TECHNICAL_CONDITIONAL',
      'C_STANDARD_LONG_TAIL'
    )),

  constraint chk_recommended_action
    check (recommended_action in (
      'await_official_proof',
      'request_admin_review',
      'promote_eligible',
      'block_publish',
      'no_action'
    )),

  -- Full trigger-reason taxonomy in the DB. PR1 service only emits the
  -- first three (initial_scrape, resubmission, backfill_existing_recruitment).
  constraint chk_trigger_reason
    check (trigger_reason in (
      'initial_scrape',
      'resubmission',
      'backfill_existing_recruitment',
      'corrigendum_detected',
      'source_hash_changed',
      'admin_requested',
      'canonical_field_edited',
      'source_trust_changed'
    )),

  -- Tier C may legitimately not have an exam-family hint; A/B must
  -- provide either id or key. The service layer defaults Tier C key
  -- to 'other' so consumers can rely on a non-null value, but the DB
  -- constraint accepts the null-key-null-id Tier C case for safety.
  constraint chk_exam_family_present
    check (
      exam_family_id is not null
      or exam_family_key is not null
      or criticality_tier = 'C_STANDARD_LONG_TAIL'
    ),

  -- Version monotonicity: report_version must be >= 1.
  constraint chk_report_version_positive
    check (report_version >= 1),

  -- Self-supersession is always a bug. (Cycle prevention beyond depth-1
  -- is deferred per spec §8; app-side guard is adequate for PR1.)
  constraint chk_no_self_supersede
    check (superseded_by is null or superseded_by <> id)
);


-- updated_at trigger. Keeps the column accurate without forcing every
-- writer to remember it.
create or replace function public.touch_verification_report_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_verification_report
  on public.recruitment_verification_reports;
create trigger trg_touch_verification_report
before update on public.recruitment_verification_reports
for each row execute function public.touch_verification_report_updated_at();


-- ── Indexes ────────────────────────────────────────────────────────────

-- Active queue-scoped uniqueness. A given scrape_queue_id may have at
-- most one report with superseded_by IS NULL. Older versions stay in
-- the table but are flagged superseded.
create unique index if not exists uq_active_verification_report_queue
on public.recruitment_verification_reports(scrape_queue_id)
where superseded_by is null and scrape_queue_id is not null;

-- Active recruitment-scoped uniqueness. Restricted to rows where the
-- queue id is null so a queue→recruitment "joint" report doesn't
-- collide with a recruitment-only backfill row.
create unique index if not exists uq_active_verification_report_recruitment
on public.recruitment_verification_reports(recruitment_id)
where superseded_by is null
  and scrape_queue_id is null
  and recruitment_id is not null;

-- Latest-version-per-chain lookup. desc on report_version so the very
-- first row of the index is the current head.
create index if not exists idx_verification_reports_chain
on public.recruitment_verification_reports(chain_root_id, report_version desc);

-- Admin "needs attention" feed. Active only; sorted newest first.
create index if not exists idx_verification_reports_attention
on public.recruitment_verification_reports(
  lifecycle_status,
  criticality_tier,
  recommended_action,
  created_at desc
)
where superseded_by is null;

-- Queue → active report join.
create index if not exists idx_verification_reports_queue_active
on public.recruitment_verification_reports(scrape_queue_id, created_at desc)
where superseded_by is null and scrape_queue_id is not null;


commit;

notify pgrst, 'reload schema';
