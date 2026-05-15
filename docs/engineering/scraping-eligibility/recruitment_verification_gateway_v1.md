# Recruitment Verification Gateway v1 — Final Spec

Consolidated. All prior fixes folded in.

---

## 1. Architecture

```text
source_registry
  → scraper runner
  → scrape_queue
  → Recruitment Verification Gateway   ← new layer
  → canonical recruitments/posts/criteria
  → eligibility rule compiler
  → eligibility engine
  → recompute / alerts
```

Gateway purpose:

```text
classify criticality
resolve official proof
compare duplicate/cross-source facts
validate extracted fields
detect eligibility complexity
generate verification report
control promotion strategy
```

AI boundary (hard):

```text
AI may suggest URLs or classify ambiguity.
AI cannot decide official truth.
AI cannot publish.
AI cannot decide eligibility.
Backend validates every AI-suggested URL.
```

---

## 2. Tier Model (A / B / C)

### Tier A — high-stakes / mass-volume

Examples: UPSC, SSC, IBPS, SBI, RBI, Banking, Railways, Defence, Regulatory, State PSC, major state police/teacher/clerical exams.

Policy:

```text
official_source_required = true
aggregator_discovery_allowed = true
aggregator_canonical_truth_allowed = false
multi_source_consensus_required = true
human_verification_required = true
auto_publish_allowed = false
eligibility_rule_evidence_required = true
```

### Tier B — technical / conditional

Examples: PSU, university, research institutes, local body, GATE-based, domicile/language/certificate-heavy posts.

Policy:

```text
official_source_preferred = true
aggregator_discovery_allowed = true
aggregator_canonical_truth_allowed = false
conditional_rule_review_required = true
human_review_if_risk_flags = true
auto_publish_allowed = false
```

### Tier C — long-tail / low-risk standard

Examples: small local notices, low-volume standard recruitments, simple one-post recruitments.

Policy:

```text
official_source_preferred = true
multi_source_consensus_required = false
admin_review_only_if_quality_low = true
auto_publish_allowed = false
standard validate → verify → publish gate applies
```

---

## 3. Backend Modules

```text
app/backend/app/scraping/recruitment_classifier.py
app/backend/app/scraping/verification_policy.py
app/backend/app/scraping/verification_hash.py
app/backend/app/scraping/verification_report_schemas.py
app/backend/app/scraping/verification_reports.py        ← service surface
app/backend/app/scraping/official_resolver.py           ← PR2
app/backend/app/scraping/consensus_engine.py            ← PR3
app/backend/app/scraping/eligibility_complexity.py      ← PR4
app/backend/app/scraping/verification_gateway.py        ← orchestrator, PR2+
```

### classifier output

```json
{
  "criticality_tier": "A_HIGH_STAKES",
  "exam_family_key": "ssc",
  "review_strategy": "strict_official_multi_source",
  "publish_policy": "manual_verified_only"
}
```

### verification_reports.py service surface

```python
def get_active_report(scrape_queue_id=None, recruitment_id=None) -> dict | None: ...
def get_or_create_verification_report_for_queue(queue_item) -> tuple[dict, Literal["noop", "created"]]: ...
def get_or_create_verification_report_for_recruitment(recruitment) -> tuple[dict, Literal["noop", "created"]]: ...
def update_lifecycle_status(report_id, new_status) -> dict: ...   # only choke point
def mark_superseded(old_id, new_id) -> None: ...
```

All lifecycle writes go through `update_lifecycle_status`. Direct DB updates bypass matrix.

---

## 4. Hash Contract

Module: `verification_hash.py`

Normalize before hash. Never hash raw HTML / PDF bytes / CSS / ads / CDN wrappers.

```python
def normalize_verification_snapshot(extracted_data: dict) -> dict: ...
def build_source_snapshot_hash(extracted_data: dict) -> str: ...
def build_canonical_snapshot_hash(recruitment: dict, posts: list[dict]) -> str: ...
```

Note: `posts` is **required** for canonical hash. No default. Recruitment-only variant rejected.

Snapshot shape:

```python
{
  "title": normalized_title,
  "organization_name": normalized_organization,
  "notification_number": normalized_notification_number,
  "apply_start_date": normalized_apply_start_date,          # YYYY-MM-DD
  "apply_end_date": normalized_apply_end_date,              # YYYY-MM-DD
  "total_vacancies": normalized_total_vacancies,
  "post_names": sorted(normalized_post_names),
  "official_notification_url": normalized_official_notification_url,
  "official_apply_url": normalized_official_apply_url,
  "source_pdf_url": normalized_source_pdf_url,
}
```

Rules:

```text
lowercase strings, strip whitespace
dates → YYYY-MM-DD
arrays sorted
ignore null/empty optional fields consistently
sha256(json.dumps(snapshot, sort_keys=True))
```

Population rule per report:

```text
scrape_queue_id present → source_snapshot_hash = hash(extracted_data)
recruitment_id present  → canonical_snapshot_hash = hash(recruitment + posts)
both present            → both populated
queue-only report       → canonical_snapshot_hash = null
```

---

## 5. JSONB Schemas (Pydantic)

Module: `verification_report_schemas.py`

```python
class RiskFlag(BaseModel):
    flag: str
    field_key: str | None = None
    source_field_path: str | None = None
    blocking_level: Literal["promotion_blocker", "publish_blocker", "warning"]
    evidence_summary_key: str | None = None


class ConflictValue(BaseModel):
    source: str
    value: Any
    confidence: float | None = None


class VerificationConflict(BaseModel):
    conflict_key: str
    field_path: str
    values: list[ConflictValue]
    status: Literal["open", "resolved_by_admin", "ignored"] = "open"


class EvidenceSummaryItem(BaseModel):
    key: str
    field_path: str | None = None
    source_url: str | None = None
    snippet: str | None = None
    confidence: float | None = None
```

Validate before every insert/update. Raw jsonb writes forbidden.

---

## 6. Lifecycle States + Transitions

PR1 ships **4 states only**. Future PRs extend.

```python
PR1_LIFECYCLE_STATES = {
    "classified",
    "backfilled_needs_review",
    "superseded",
    "rejected",
}

ALLOWED_REPORT_TRANSITIONS = {
    "classified":              {"superseded", "rejected"},
    "backfilled_needs_review": {"classified", "superseded", "rejected"},
    "rejected":                {"superseded"},
    "superseded":              set(),   # terminal, immutable
}
```

Rules:

```text
superseded is terminal
no self-loops
regeneration = new row, not same-row mutation
classified → classified is invalid (same-hash is noop, hash-diff creates new row)
```

Future states (deferred to PR2–PR5):

```text
official_resolution_pending
official_resolved
consensus_pending
conflict
admin_override_required
complexity_detected
ready_for_promotion
promoted
stale
```

---

## 7. Reprocess Rule

Do **not** create a new report on every scrape.

```python
def get_or_create_verification_report_for_queue(queue_item):
    new_hash = build_source_snapshot_hash(queue_item["extracted_data"])
    active = get_active_report(scrape_queue_id=queue_item["id"])

    if active and active["source_snapshot_hash"] == new_hash:
        return active, "noop"

    return create_new_report_version(queue_item, active, new_hash), "created"
```

Race: two concurrent runs both insert → unique partial index rejects one. Service retries with `get_or_create` once, then fails loud.

---

## 8. Atomicity — PostgreSQL RPC Functions

Two-step inserts are non-atomic and orphan rows on crash. Use RPC.

### chain_root bootstrap

```sql
create or replace function public.create_verification_report(payload jsonb)
returns public.recruitment_verification_reports
language plpgsql
as $$
declare
  new_row public.recruitment_verification_reports;
begin
  insert into public.recruitment_verification_reports
  select * from jsonb_populate_record(null::public.recruitment_verification_reports, payload)
  returning * into new_row;

  -- bootstrap chain root if not set
  if new_row.chain_root_id is null then
    update public.recruitment_verification_reports
    set chain_root_id = new_row.id
    where id = new_row.id
    returning * into new_row;
  end if;

  return new_row;
end;
$$;
```

### supersede + insert atomic

```sql
create or replace function public.supersede_and_create_verification_report(
  old_id uuid,
  payload jsonb
) returns public.recruitment_verification_reports
language plpgsql
as $$
declare
  old_row public.recruitment_verification_reports;
  new_row public.recruitment_verification_reports;
begin
  select * into old_row
  from public.recruitment_verification_reports
  where id = old_id
  for update;

  if old_row.superseded_by is not null then
    raise exception 'old report already superseded';
  end if;

  -- mark old superseded first to free partial unique index slot
  update public.recruitment_verification_reports
  set superseded_by = gen_random_uuid(),   -- placeholder
      lifecycle_status = 'superseded'
  where id = old_id;

  -- insert new active
  insert into public.recruitment_verification_reports
  select * from jsonb_populate_record(null::public.recruitment_verification_reports, payload)
  returning * into new_row;

  if new_row.chain_root_id is null then
    update public.recruitment_verification_reports
    set chain_root_id = coalesce(old_row.chain_root_id, new_row.id)
    where id = new_row.id
    returning * into new_row;
  end if;

  -- point old → new
  update public.recruitment_verification_reports
  set superseded_by = new_row.id
  where id = old_id;

  return new_row;
end;
$$;
```

Service guards (before RPC call):

```python
def _validate_supersession(old, new_payload):
    if old["id"] == new_payload.get("id"):
        raise ValueError("report cannot supersede itself")
    if new_payload.get("superseded_by"):
        raise ValueError("new report cannot already be superseded")
    expected_version = old["report_version"] + 1
    if new_payload.get("report_version") not in (None, expected_version):
        raise ValueError(f"version must be {expected_version}")
    if new_payload.get("chain_root_id") and old.get("chain_root_id"):
        if new_payload["chain_root_id"] != old["chain_root_id"]:
            raise ValueError("cannot cross chains")
```

Cycle prevention (`A→B→A`) deferred to later PR. App guard adequate for PR1.

---

## 9. Schema

```sql
create table public.recruitment_verification_reports (
  id uuid primary key default gen_random_uuid(),

  scrape_queue_id uuid references public.scrape_queue(id),
  recruitment_id  uuid references public.recruitments(id),

  chain_root_id   uuid references public.recruitment_verification_reports(id),
  report_version  int not null default 1,
  superseded_by   uuid references public.recruitment_verification_reports(id),

  lifecycle_status text not null default 'classified',

  criticality_tier   text not null,
  exam_family_id     uuid,
  exam_family_key    text,

  review_strategy    text not null,
  publish_policy     text not null,
  recommended_action text not null default 'request_admin_review',

  source_snapshot_hash    text,
  canonical_snapshot_hash text,

  trigger_reason text not null default 'initial_scrape',

  risk_flags        jsonb not null default '[]',
  evidence_summary  jsonb not null default '{}',
  conflicts         jsonb not null default '[]',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_verification_report_owner
    check (scrape_queue_id is not null or recruitment_id is not null),

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

  constraint chk_exam_family_present
    check (
      exam_family_id is not null
      or exam_family_key is not null
      or criticality_tier = 'C_STANDARD_LONG_TAIL'
    )
);
```

`updated_at` maintained by trigger:

```sql
create or replace function public.touch_verification_report_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_verification_report
before update on public.recruitment_verification_reports
for each row execute function public.touch_verification_report_updated_at();
```

### Indexes

```sql
create unique index if not exists uq_active_verification_report_queue
on public.recruitment_verification_reports(scrape_queue_id)
where superseded_by is null and scrape_queue_id is not null;

create unique index if not exists uq_active_verification_report_recruitment
on public.recruitment_verification_reports(recruitment_id)
where superseded_by is null
  and scrape_queue_id is null
  and recruitment_id is not null;

create index if not exists idx_verification_reports_chain
on public.recruitment_verification_reports(chain_root_id, report_version desc);

create index if not exists idx_verification_reports_attention
on public.recruitment_verification_reports(
  lifecycle_status,
  criticality_tier,
  recommended_action,
  created_at desc
)
where superseded_by is null;

create index if not exists idx_verification_reports_queue_active
on public.recruitment_verification_reports(scrape_queue_id, created_at desc)
where superseded_by is null and scrape_queue_id is not null;
```

### recommended_action default mapping (service)

```text
Tier A → request_admin_review
Tier B → request_admin_review
Tier C → promote_eligible if quality acceptable, else request_admin_review
backfilled_needs_review → request_admin_review
rejected → no_action
superseded → no_action
```

### exam_family service rule

```python
if tier == "C_STANDARD_LONG_TAIL" and not exam_family_id and not exam_family_key:
    exam_family_key = "other"
```

---

## 10. PR1 Trigger Reasons

DB enum holds full taxonomy. Service PR1 emits:

```python
PR1_TRIGGER_REASONS = {
    "initial_scrape",
    "resubmission",                 # same queue_id, hash changed, active existed
    "backfill_existing_recruitment",
}
```

`admin_requested` deferred until admin re-run endpoint ships.

---

## 11. Backfill

PR1 ships **soft backfill only**.

```python
# verification_policy.py
BACKFILL_MODE = "soft"
```

Semantics:

```text
create report for existing recruitments
do not unpublish
do not block currently published items
Tier A gaps → lifecycle_status = 'backfilled_needs_review'
trigger_reason = 'backfill_existing_recruitment'
strict backfill deferred to later PR
```

---

## 12. Promotion Gate (PR3+)

### Tier A allow if

```text
official_source_resolved = true
official source verified
notification/apply/PDF URL exists
no unresolved conflict OR conflict resolved_by_admin
verification_report exists and active
high-risk fields evidence-backed
```

Block if:

```text
aggregator_only = true
official_resolution_status != resolved
consensus_status = conflict (and no override)
critical eligibility evidence missing
```

### Tier B allow draft if

```text
official source resolved OR trusted source available
risk flags recorded
conditional rules visible for review
```

Block publish if:

```text
domicile/language/GATE/discipline/experience flags exist
AND no deterministic rule representation exists
```

### Tier C

Standard validate → verify → publish gate.

---

## 13. Official Resolver (PR2)

Waterfall:

```text
L1  direct official links on scraped page
L2  duplicate/open queue official URL reuse
L3  existing canonical recruitment match
L4  source_registry parent/career page
L5  official sitemap/RSS/API lookup
L6  AI-assisted candidate URL (budget-gated)
L7  admin fallback
```

Confidence thresholds (config):

```python
OFFICIAL_RESOLUTION_THRESHOLDS = {
    "auto_resolve": 0.85,
    "suggest_for_admin": 0.60,
    "manual_required": 0.0,
}
```

Behavior:

```text
≥ 0.85 → auto-resolved, still auditable
0.60–0.85 → suggested proof, admin confirmation
< 0.60 → unresolved, manual attach
```

Audit table:

```sql
create table public.official_resolution_attempts (
  id uuid primary key default gen_random_uuid(),
  scrape_queue_id uuid references public.scrape_queue(id),
  recruitment_candidate_id uuid,
  source_id uuid references public.source_registry(id),

  method text not null,
  status text not null,
  confidence numeric,
  candidate_url text,
  official_source_host text,
  evidence jsonb not null default '[]',
  rejection_reason text,

  created_at timestamptz not null default now()
);
```

---

## 14. AI Resolver Budget (PR2)

```python
AI_RESOLVER_LIMITS = {
    "window": "per_scrape_run_per_source",
    "max_attempts_per_queue_item": 1,
    "max_attempts_per_source_per_run": 10,
    "max_attempts_per_run": 50,
    "disable_after_error_rate": 0.30,
    "disable_after_low_confidence_rate": 0.70,
    "min_attempts_before_breaker": 5,
    "reset_rule": "next_scrape_run",
}
```

Circuit:

```text
error_rate / low_confidence_rate computed per source within one scrape_run
breaker opens for that source for remainder of run
next run → half_open
one high-confidence success closes
```

Audit:

```sql
create table public.ai_resolution_budget_events (
  id uuid primary key default gen_random_uuid(),
  scrape_run_id uuid,
  source_id uuid,
  scrape_queue_id uuid,
  event_type text not null,
  attempts_used int not null default 0,
  budget_remaining int,
  circuit_state text,
  reason text,
  created_at timestamptz default now()
);
```

---

## 15. Consensus + Override (PR3)

High-risk fields compared across sources:

```text
title, organization, notification_number,
apply_start_date, apply_end_date,
total_vacancies, post_names,
age limits, education,
official_notification_url, official_apply_url, source_pdf_url
```

Conflict rules:

```text
official source wins over aggregator
two official sources conflict → admin review required
aggregator-only value cannot become canonical
```

Override action: `admin_override_conflict`. Roles: `admin`, `super_admin`.

Payload:

```json
{
  "conflict_id": "uuid",
  "chosen_value": "...",
  "prior_value": "...",
  "reason": "Official corrigendum dated ... supersedes earlier PDF",
  "evidence_url": "...",
  "override_scope": "field | recruitment",
  "reviewer_id": "uuid"
}
```

`override_scope = 'report'` removed. Field or recruitment only.

```sql
create table public.recruitment_verification_overrides (
  id uuid primary key default gen_random_uuid(),
  verification_report_id uuid not null references public.recruitment_verification_reports(id),
  conflict_key text not null,
  field_path text,
  prior_value jsonb,
  chosen_value jsonb,
  reason text not null,
  evidence_url text,
  override_scope text not null default 'field'
    check (override_scope in ('field', 'recruitment')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

---

## 16. Eligibility Complexity Contract (PR4)

Detects:

```text
domicile, language, GATE score, experience,
discipline-specific degree, first-class requirement,
category relaxation, PwBD horizontal reservation,
ex-serviceman rules, physical/medical standards, certificates
```

Output flag shape:

```python
@dataclass
class EligibilityComplexitySignal:
    flag: str
    field_key: str
    source_field_path: str
    blocking_level: Literal[
        "promotion_blocker",
        "publish_blocker",
        "conditional_result_allowed",
        "warning",
    ]
    evidence_summary_key: str | None    # points into report.evidence_summary jsonb
```

Compiler behavior per blocking_level:

```text
promotion_blocker          → cannot promote until represented in canonical rule
publish_blocker            → draft allowed, publish blocked until rule exists
conditional_result_allowed → publish allowed if user-facing result handles missing-profile state
warning                    → publish allowed, admin warning shown
```

---

## 17. Admin UI (PR6)

Split single Operations Console into two modes.

### Mode 1: Setup & Run

Show:

```text
source selector
source trust status
run live scrape
dry scrape (secondary/debug)
recent run summary
run detail drawer
```

Hide: field review, official proof resolver, duplicate merge, blockers, validate/verify/publish, eligibility ops.

### Mode 2: Review & Publish

Show:

```text
queue item list
selected candidate verification report
current blocker
primary next action
promote to draft
draft readiness
publish gate
```

Hide: source setup, crawler config, dry/live scrape controls.

### Checklist

```text
keep: useAdminNextActions.js
hide: full AdminActionChecklist from default view
replace primary surface: CurrentActionCard
move full checklist to: Workflow Details drawer
```

Default rule: 1 current blocker, 1 recommended next action, 1 primary button.

### Official Proof UX

Label: `Official Proof` (not `Resolve official source`).

States: `Auto-resolved | Suggested proof | Unresolved | Admin attached | Rejected`.

### Admin Action Rationalization

Keep primary:

```text
run live scrape, review required fields, review verification report,
promote to draft, fix blockers, validate, mark verified, publish
```

Conditional only:

```text
resolve official proof, preview merge, mark duplicate,
post-level review, eligibility health
```

Move out of console:

```text
source CRUD          → /admin/sources
crawler/parser config → /admin/sources
organization CRUD     → /admin/organizations
audit trail           → /admin/audit
eligibility ops       → /admin/eligibility-ops
notifications         → /admin/notifications
RBAC/users            → /admin/rbac
marketplace/plans/community → governance pages
```

---

## 18. Bulk Operations (PR6)

Batch-safe:

```text
bulk classify
bulk mark reviewed low-risk fields
bulk request official resolver retry
bulk reject duplicates
bulk promote (only if each item individually passes gate)
bulk assign reviewer
```

Not batch-safe (preview required):

```text
admin_override_conflict
publish
manual official proof attach
eligibility rule override
```

Contract:

```json
{
  "selected_ids": ["..."],
  "action": "bulk_promote",
  "dry_run": true,
  "result": {
    "eligible_count": 42,
    "blocked_count": 8,
    "blockers": [
      {
        "id": "queue-or-report-id",
        "entity_type": "scrape_queue | recruitment | verification_report",
        "reason_code": "official_proof_missing",
        "message": "Official proof is required before promotion.",
        "blocking_level": "promotion_blocker"
      }
    ]
  }
}
```

Rule: bulk action runs dry-run first. Mutation applies only to eligible subset. Blocked subset unchanged with reasons.

`blocking_level` ∈ `{promotion_blocker, publish_blocker, warning}`.

---

## 19. E2E Acceptance Criteria

```text
1. Tier A cannot promote without official proof.
2. Tier A publish requires verified readiness + evidence-backed eligibility rules.
3. Tier B exposes conditional eligibility flags before publish.
4. Aggregator data never becomes canonical without official proof.
5. Resolver stores attempts, method, confidence, evidence.
6. Admin sees only current blocker and next action by default.
7. Full workflow checklist hidden in drawer.
8. Setup/run separated from review/publish.
9. Eligibility engine consumes only canonical verified data.
10. AI never decides official truth, eligibility, or publish readiness.
```

---

## 20. Implementation Phases

### PR1 — Gateway shell

```text
recruitment_classifier.py
verification_policy.py
verification_hash.py
verification_report_schemas.py
verification_reports.py
migration: recruitment_verification_reports + indexes + RPC functions
backfill (soft mode) entry point
admin read-only fields exposed: tier, strategy, lifecycle, recommended_action, staleness omitted
tests
```

### PR2 — Official resolver v2

```text
official_resolver.py
OFFICIAL_RESOLUTION_THRESHOLDS config
official_resolution_attempts table
direct / duplicate / source-registry / career-page resolver stages
AI budget guard stub (no AI calls yet)
admin suggested-proof state surface
add resolver columns to report (official_resolution_status/method/confidence/suggested_official_urls)
```

### PR3 — Consensus + override

```text
consensus_engine.py
conflict model
admin_override_conflict action
recruitment_verification_overrides table
promotion_gate.py update: accepts resolved_by_admin
lifecycle states added: consensus_pending, conflict, admin_override_required
```

### PR4 — Eligibility complexity contract

```text
eligibility_complexity.py
EligibilityComplexitySignal interface
publish blockers for unrepresented conditional rules
field_key mapping to candidate/profile registry
lifecycle state added: complexity_detected
```

### PR5 — Corrigendum / staleness

```text
source hash watcher
canonical hash watcher
corrigendum detection
report supersession on hash drift
stale report queue
lifecycle states added: stale, needs_reverification
add columns: staleness_status, last_checked_at, valid_until
```

### PR6 — Admin UI simplification

```text
Setup & Run mode
Review & Publish mode
CurrentActionCard
WorkflowDetailsDrawer
VerificationReportCard
batch review mode + dry_run contract
```

---

## 21. PR1 Deliverables (Detailed)

### Files

```text
app/backend/app/scraping/recruitment_classifier.py
app/backend/app/scraping/verification_policy.py
app/backend/app/scraping/verification_hash.py
app/backend/app/scraping/verification_report_schemas.py
app/backend/app/scraping/verification_reports.py
db/migrations/NNNN_recruitment_verification_reports.sql
db/migrations/NNNN_verification_report_rpc_functions.sql
tests/scraping/test_recruitment_classifier.py
tests/scraping/test_verification_hash.py
tests/scraping/test_verification_reports.py
tests/scraping/test_verification_report_schemas.py
tests/db/test_verification_report_constraints.py
```

### Tests

```text
classification
  UPSC/SSC/IBPS/Defence/State PSC → Tier A
  PSU/GATE/domicile/language/experience-heavy → Tier B
  simple long-tail recruitment → Tier C

hash
  raw HTML/CSS/ads noise ignored
  date normalization to YYYY-MM-DD
  array order does not affect hash
  whitespace/case does not affect hash
  required posts arg for canonical hash

lifecycle
  only PR1 states accepted by DB
  update_lifecycle_status enforces ALLOWED_REPORT_TRANSITIONS
  superseded → anything rejected
  classified → backfilled_needs_review rejected
  rejected → classified rejected
  backfilled_needs_review → classified accepted

supersession
  reprocess same hash returns same report ("noop")
  reprocess different hash creates new version
  new report_version = old + 1
  chain_root_id preserved across versions
  old.superseded_by = new.id after supersession
  old.lifecycle_status = 'superseded' after supersession
  cannot supersede across chains
  RPC is atomic (no orphan rows on simulated mid-call failure)

uniqueness
  queue item cannot have two active reports
  backfilled recruitment cannot have two active reports

owner / exam_family
  report cannot exist without queue_id or recruitment_id
  exam_family_id null + key null + tier=C → defaults to 'other' in service
  exam_family_id null + key null + tier=A → constraint violation

recommended_action / trigger_reason
  recommended_action rejects free text
  trigger_reason rejects unknown values
  PR1 emit set respected

canonical hash population
  queue-only report → canonical_snapshot_hash is None
  recruitment-linked report → canonical_snapshot_hash is set

jsonb schemas
  invalid RiskFlag rejected before write
  invalid VerificationConflict rejected before write
  invalid EvidenceSummaryItem rejected before write

queries
  needs-attention index returns only active unsuperseded reports
  chain index supports O(1) latest-version lookup per chain_root_id

policy
  aggregator_discovery_allowed = true for all tiers
  aggregator_canonical_truth_allowed = false for all tiers
```

### Ship Gate

```text
1. first insert bootstraps chain_root_id atomically via RPC
2. same-hash reprocess is noop (no new row)
3. hash-diff reprocess creates new version atomically via RPC
4. verification_hash.py exists and is the only hash producer
5. jsonb fields validate through Pydantic before write
6. PR1 emits only defined trigger reasons
7. Tier C null exam family becomes 'other' in service
8. backfilled report uniqueness covered by recruitment_id partial index
9. lifecycle transitions enforced only via update_lifecycle_status
10. canonical_snapshot_hash rule tested
11. updated_at trigger present
12. needs-attention and chain indexes present
13. resolver-dependent columns NOT included
14. AI resolver NOT included
15. promotion gate enforcement NOT included
```

---

## 22. What This Spec Does NOT Cover

```text
- frontend Operations Console redesign (PR6)
- consensus implementation (PR3)
- eligibility compiler internals (consumes PR4 signal)
- corrigendum detection (PR5)
- AI prompt design for resolver (PR2)
- strict backfill mode (post-PR1)
- supersession cycle detection at DB level (deferred)
- rate-limited admin re-run endpoint (post-PR1)
- evidence table (replaces evidence_summary_key FK target in later PR)
```

Architecture sound. PR1 scope = shell + classification + report + supersession + hash. Everything resolver/consensus/eligibility/UI lands in PR2–PR6.
