# Recruitment Verification Gateway — PR Plan (Corrected)

Companion to: `docs/engineering/scraping-eligibility/recruitment_verification_gateway_v1.md`

This doc owns PR2–PR7 scoping. All review fixes folded in.

---

## 0. Cross-cutting Glue

### 0.1 Transition Matrix — Single Source of Truth

Location: `app/backend/app/scraping/verification_reports.py`

Canonical matrix kept in one module. Each PR amends via helper, never via `dict |=` (which overwrites, not merges).

```python
# verification_reports.py

ALLOWED_REPORT_TRANSITIONS: dict[str, set[str]] = {
    "classified":              {"superseded", "rejected"},
    "backfilled_needs_review": {"classified", "superseded", "rejected"},
    "rejected":                {"superseded"},
    "superseded":              set(),
}


def extend_transitions(additions: dict[str, set[str]]) -> None:
    """Per-key union. Use this for every PR amendment."""
    for state, allowed in additions.items():
        ALLOWED_REPORT_TRANSITIONS[state] = (
            ALLOWED_REPORT_TRANSITIONS.get(state, set()) | allowed
        )
```

Each PR appends via `extend_transitions(...)`. Final cumulative matrix below at §8.

### 0.2 Orchestrator Owner

`verification_gateway.py` is owned by **PR2**.

```text
app/backend/app/scraping/verification_gateway.py
```

Initial functions:

```python
def run_gateway_for_queue_item(queue_item_id: str, *, trigger_reason: str) -> dict: ...
def run_resolver_stage(report_id: str) -> dict: ...
def enqueue_or_run_gateway_after_scrape_queue_insert(queue_item_id: str) -> None: ...
```

### 0.3 Execution Mode Flag

```python
# verification_policy.py
GATEWAY_EXECUTION_MODE = "sync"   # PR2 default
# PR3+ may flip to "async_queue" once stages get expensive
```

Rule:

```text
sync         → orchestrator runs inline after scrape_queue insert
async_queue  → orchestrator enqueues a job and returns immediately
```

No auto-detection. Flag is explicit.

### 0.4 Hook Points Per Stage

```text
PR1:
  scrape_queue insert → create/get verification report → classify only

PR2:
  scrape_queue insert OR report created
    → run_resolver_stage(report.id)

PR3:
  resolver resolved/suggested/unresolved
    → run_consensus_stage(report.id)

PR4:
  consensus complete (or skipped)
    → run_eligibility_complexity_stage(report.id)

PR5:
  source/canonical hash drift detected
    → create superseding report
    → rerun gateway stages as needed
```

Slow remote work (official-site crawl, sitemap fetch) never blocks scrape run. Move to async queue or budget-cap.

### 0.5 Promotion Gate Timing

Stub in **PR2**, full enforcement in **PR3+**.

```text
PR2 stub gate behavior:
  Tier A:
    - block if active verification report missing
    - block if official_resolution_status in (null, 'unresolved', 'not_attempted')
    - reason code: gateway_not_ready or official_proof_missing
  Tier B/C:
    - pass through stub gate unconditionally
    - full Tier B blockers land in PR4
    - Tier C standard validate → verify → publish gate continues to apply
```

Existing publish readiness in `admin_trust.py` is not replaced. Gateway gate sits **before** promotion.

### 0.6 `recommended_action` Enum Growth Plan

Frozen for PR1. PRs extend explicitly:

```text
PR1: await_official_proof, request_admin_review, promote_eligible, block_publish, no_action
PR2: + confirm_suggested_proof
PR3: + resolve_conflict
PR5: + await_corrigendum
```

Every extension = ALTER `chk_recommended_action`.

### 0.7 PR Ordering

```text
PR1 Gateway shell
PR7 Soft backfill                                       ← moved earlier
PR2 Official resolver v2 + orchestrator + stub gate
PR3 Consensus + override
PR4 Eligibility complexity
PR5 Corrigendum/staleness
PR6 Admin UI simplification + bulk workflow + API
```

PR7 depends only on PR1. Shipping it last left existing recruitments outside the gateway for months.

---

## 1. PR1 (Reference Only)

Already specified in `recruitment_verification_gateway_v1.md` §3–§21.

Provides:

```text
recruitment_classifier.py
verification_policy.py (BACKFILL_MODE, GATEWAY_EXECUTION_MODE, aggregator policy)
verification_hash.py
verification_report_schemas.py
verification_reports.py (service surface + ALLOWED_REPORT_TRANSITIONS + extend_transitions)
migration: recruitment_verification_reports + indexes + RPC functions
```

---

## 2. PR7 — Soft Backfill Operationalization

Ships immediately after PR1. Parallel-safe with PR2.

### Files

```text
app/backend/app/scraping/verification_backfill.py
app/backend/app/api/admin_verification_reports.py     (read-only listing only at PR7)
scripts/backfill_verification_reports.py
tests/scraping/test_verification_backfill.py
```

### Behavior

```python
# verification_policy.py
BACKFILL_MODE = "soft"
```

Rules:

```text
- create active report per existing canonical recruitment
- canonical_snapshot_hash = build_canonical_snapshot_hash(recruitment, posts)   # required
- source_snapshot_hash = null (no linked queue item)
- recruitment_id set, scrape_queue_id null
- trigger_reason = 'backfill_existing_recruitment'
- Tier A gap (no official proof) → lifecycle_status = 'backfilled_needs_review'
- otherwise lifecycle_status = 'classified'
- do not unpublish anything
- do not block currently published items
```

### PR7 enum compatibility

PR7 ships before PR2/PR3/PR5. May emit **only** PR1 enum values:

```text
recommended_action ∈ {request_admin_review, promote_eligible, no_action}
trigger_reason     ∈ {backfill_existing_recruitment}
lifecycle_status   ∈ {classified, backfilled_needs_review}
```

No `confirm_suggested_proof`, `resolve_conflict`, `await_corrigendum`, or resolver/consensus/staleness states.

### Re-run rule

```text
re-running backfill for same recruitment:
  - compute new canonical_snapshot_hash
  - same hash → noop
  - different hash → supersede old, create new version via atomic RPC
```

### Acceptance

```text
- one active report per recruitment (unique partial index enforces)
- re-run with same canonical hash is noop
- canonical hash drift creates new report version
- Tier A missing proof enters needs-attention queue
- no published recruitment is auto-unpublished
- emits only PR1 enum values
```

---

## 3. PR2 — Official Resolver v2 + Orchestrator + Stub Gate

### Files

```text
app/backend/app/scraping/official_resolver.py
app/backend/app/scraping/verification_gateway.py             ← new owner of orchestrator
app/backend/app/scraping/promotion_gate.py                   ← stub
app/backend/app/scraping/verification_policy.py              ← thresholds + GATEWAY_EXECUTION_MODE
app/backend/app/scraping/verification_reports.py             ← resolver state setters
app/backend/app/scraping/verification_report_schemas.py      ← SuggestedOfficialUrl
app/backend/app/api/admin_verification_reports.py
db/migrations/NNNN_add_official_resolution_fields.sql
db/migrations/NNNN_extend_recommended_action_confirm_suggested_proof.sql
tests/scraping/test_official_resolver.py
tests/scraping/test_verification_gateway.py
tests/scraping/test_promotion_gate_stub.py
```

### Resolver waterfall

```text
L1 direct official links on scraped page
L2 duplicate/open queue official URL reuse
L3 existing canonical recruitment match
L4 source_registry parent/career page
L5 official sitemap/RSS/API lookup
L6 AI candidate URL          ← deferred to a later PR; budget guard stub only
L7 admin fallback            ← always available
```

### Thresholds

```python
# verification_policy.py
OFFICIAL_RESOLUTION_THRESHOLDS = {
    "auto_resolve": 0.85,
    "suggest_for_admin": 0.60,
    "manual_required": 0.0,
}
```

Behavior:

```text
≥ 0.85   → auto-resolved, status = 'auto_resolved'
0.60–0.85 → status = 'suggested', recommended_action = 'confirm_suggested_proof'
< 0.60   → status = 'unresolved', recommended_action = 'await_official_proof'
```

### Migration — column additions

```sql
alter table public.recruitment_verification_reports
add column official_resolution_status text,
add column official_resolution_method text,
add column official_resolution_confidence numeric,
add column suggested_official_urls jsonb not null default '[]'::jsonb;

alter table public.recruitment_verification_reports
add constraint chk_official_resolution_status
check (
  official_resolution_status is null
  or official_resolution_status in (
    'not_attempted',
    'auto_resolved',
    'suggested',
    'unresolved',
    'admin_attached',
    'rejected'
  )
);
```

### Migration — `recommended_action` extension

```sql
alter table public.recruitment_verification_reports
drop constraint chk_recommended_action;

alter table public.recruitment_verification_reports
add constraint chk_recommended_action
check (recommended_action in (
  'await_official_proof',
  'request_admin_review',
  'promote_eligible',
  'block_publish',
  'no_action',
  'confirm_suggested_proof'
));
```

### `suggested_official_urls` schema

```python
class SuggestedOfficialUrl(BaseModel):
    url: str
    url_type: Literal["notification", "apply", "pdf", "career_page", "unknown"]
    method: Literal[
        "direct_link",
        "duplicate",
        "canonical_match",
        "source_registry",
        "career_crawl",
        "sitemap",
    ]
    confidence: float
    source_id: str | None = None
    host: str | None = None
    evidence_summary_key: str | None = None
```

Validated before write like all other jsonb shapes.

### Resolver error handling

```text
network/timeout error on any L-stage:
  - log to official_resolution_attempts with status='error', rejection_reason=...
  - continue to next L-stage
  - if all stages exhausted with no candidate:
      official_resolution_status = 'unresolved'
  - never raise out of run_resolver_stage; orchestrator gets a structured result
```

### Audit table

```sql
create table public.official_resolution_attempts (
  id uuid primary key default gen_random_uuid(),
  scrape_queue_id uuid references public.scrape_queue(id),
  recruitment_candidate_id uuid,
  source_id uuid references public.source_registry(id),

  verification_report_id uuid references public.recruitment_verification_reports(id),

  method text not null check (method in (
    'direct_link','duplicate','canonical_match',
    'source_registry','career_crawl','sitemap','admin_attached'
  )),
  status text not null check (status in (
    'success','low_confidence','rejected','error','skipped'
  )),
  confidence numeric,
  candidate_url text,
  official_source_host text,
  evidence jsonb not null default '[]',
  rejection_reason text,

  created_at timestamptz not null default now()
);
```

### Stub promotion gate

`promotion_gate.py`:

```python
def check_promotion(report: dict) -> PromotionGateResult:
    if report["criticality_tier"] == "A_HIGH_STAKES":
        if report.get("official_resolution_status") in (None, "not_attempted", "unresolved"):
            return blocked(reason_code="official_proof_missing")
    return allowed()
```

Tier B/C: pass through. Stub does not enforce Tier B complexity (PR4) or consensus (PR3).

### API endpoints

```text
GET  /api/admin/verification-reports?lifecycle=&tier=&recommended_action=&limit=&offset=
GET  /api/admin/verification-reports/{id}
POST /api/admin/verification-reports/{id}/run-resolver
POST /api/admin/verification-reports/{id}/confirm-suggested-proof
```

`run-resolver` rate limit:

```python
RESOLVER_RERUN_LIMITS = {
    "per_report_cooldown_seconds": 300,   # 5 min
    "per_admin_per_hour": 60,
}
```

`confirm-suggested-proof` behavior:

```text
input: report_id, chosen_url (must match one in suggested_official_urls)
effect:
  - official_resolution_status = 'admin_attached'   ← audit truthful: admin made the call
  - method recorded as the original suggestion method
  - recommended_action recomputed
  - lifecycle_status unchanged (stays 'classified')
```

### Acceptance

```text
- ALTER migrations land cleanly on existing PR1 reports (default to 'not_attempted' via service backfill, not DB default)
- suggested_official_urls validates through Pydantic
- verification_gateway.py runs resolver stage after scrape_queue insert
- L1–L5 resolvers run deterministically
- aggregator source never satisfies official proof
- every resolver attempt stored in official_resolution_attempts
- promotion blocked for Tier A when resolver missing/unresolved
- Tier B/C pass stub gate
- run-resolver cooldown enforced
- confirm-suggested-proof sets status='admin_attached'
- no AI calls anywhere yet
```

---

## 4. PR3 — Consensus Engine + Conflict Override

### Files

```text
app/backend/app/scraping/consensus_engine.py
app/backend/app/scraping/verification_gateway.py             ← add consensus hook
app/backend/app/scraping/verification_reports.py             ← lifecycle extensions
app/backend/app/scraping/verification_report_schemas.py      ← conflict_id field
app/backend/app/scraping/promotion_gate.py                   ← strengthen gate
app/backend/app/api/admin_verification_reports.py            ← override endpoint
db/migrations/NNNN_extend_lifecycle_states_consensus.sql
db/migrations/NNNN_create_recruitment_verification_overrides.sql
db/migrations/NNNN_extend_recommended_action_resolve_conflict.sql
tests/scraping/test_consensus_engine.py
tests/scraping/test_verification_overrides.py
tests/scraping/test_promotion_gate_consensus.py
```

### Consensus fields (final)

```text
title
organization
notification_number
apply_start_date
apply_end_date
total_vacancies
post_names
age_min
age_max
education_required
discipline_required
category_relaxation
official_notification_url
official_apply_url
source_pdf_url
```

### Conflict rules

```text
official source wins over aggregator
two official sources conflict → admin review required
aggregator-only value cannot become canonical
```

### `VerificationConflict` schema update

```python
class VerificationConflict(BaseModel):
    conflict_id: str           # uuid generated at conflict creation, stable across writes
    conflict_key: str
    field_path: str
    values: list[ConflictValue]
    status: Literal["open", "resolved_by_admin", "ignored"] = "open"
```

Override targets `conflict_id`, not array index.

### Lifecycle additions

Migration extends `chk_lifecycle_status` to include:

```text
consensus_pending
conflict
admin_override_required
```

Code:

```python
# in PR3 module init / migration glue
extend_transitions({
    "classified":              {"consensus_pending"},
    "consensus_pending":       {"classified", "conflict", "admin_override_required", "superseded", "rejected"},
    "conflict":                {"admin_override_required", "classified", "superseded", "rejected"},
    "admin_override_required": {"classified", "superseded", "rejected"},
})
```

Note: helper does per-key union, so `classified → superseded/rejected` from PR1 is preserved.

### `recommended_action` extension

```sql
alter table public.recruitment_verification_reports
drop constraint chk_recommended_action;

alter table public.recruitment_verification_reports
add constraint chk_recommended_action
check (recommended_action in (
  'await_official_proof',
  'request_admin_review',
  'promote_eligible',
  'block_publish',
  'no_action',
  'confirm_suggested_proof',
  'resolve_conflict'
));
```

Mapping:

```text
lifecycle_status in ('conflict', 'admin_override_required') → recommended_action = 'resolve_conflict'
```

### Override table

```sql
create table public.recruitment_verification_overrides (
  id uuid primary key default gen_random_uuid(),
  verification_report_id uuid not null references public.recruitment_verification_reports(id),
  conflict_id text not null,                                    -- matches conflict.conflict_id in jsonb
  conflict_key text not null,
  field_path text,
  prior_value jsonb,
  chosen_value jsonb,
  reason text not null,
  evidence_url text,
  override_scope text not null default 'field'
    check (override_scope in ('field', 'recruitment')),         -- 'report' scope removed
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

### Override payload

```json
{
  "conflict_id": "uuid",
  "prior_value": "...",
  "chosen_value": "...",
  "reason": "Official corrigendum dated ... supersedes earlier PDF",
  "evidence_url": "...",
  "override_scope": "field | recruitment",
  "reviewer_id": "uuid"
}
```

### API endpoint

```text
POST /api/admin/verification-reports/{id}/override-conflict
```

Roles: `admin`, `super_admin`. Permission: `recruitments.manage`.

### Promotion gate strengthening

```python
def check_promotion(report):
    if tier_a:
        if not official_resolved_or_admin_attached(report):
            return blocked("official_proof_missing")
        if has_unresolved_conflict(report):       # status='open'
            return blocked("consensus_conflict_unresolved")
    # Tier B/C continue to pass until PR4
    return allowed()
```

Conflicts marked `resolved_by_admin` pass.

### Consensus stage error handling

```text
runtime exception during compare:
  - log to gateway error trail
  - set lifecycle_status remains at 'consensus_pending'
  - report recommended_action = 'request_admin_review'
  - never raise out of run_consensus_stage
```

### Acceptance

```text
- conflict blocks Tier A promotion
- resolved_by_admin conflict passes promotion gate
- override_scope rejects 'report'
- prior_value and chosen_value both audited
- conflict_id is stable across writes
- consensus runs after resolver stage
- consensus does not run if resolver state is 'unresolved' for Tier A
- transitions enforced via update_lifecycle_status only
- recommended_action enum extension lands
```

---

## 5. PR4 — Eligibility Complexity Contract

### Files

```text
app/backend/app/scraping/eligibility_complexity.py
app/backend/app/scraping/verification_gateway.py             ← add complexity hook
app/backend/app/scraping/verification_reports.py             ← lifecycle extensions
app/backend/app/scraping/verification_report_schemas.py      ← EligibilityComplexitySignal
app/backend/app/eligibility/complexity_contract.py           ← new compiler adapter
app/backend/app/api/admin_trust.py                           ← hook into publish readiness
app/backend/app/scraping/promotion_gate.py                   ← extend to Tier B
db/migrations/NNNN_extend_lifecycle_states_complexity.sql
tests/scraping/test_eligibility_complexity.py
tests/eligibility/test_complexity_rule_contract.py
tests/scraping/test_promotion_gate_complexity.py
```

### Compiler adapter location

Repo has deterministic criteria tables (`age_criteria`, `education_criteria`, `certification_criteria`, `eligibility_results`, `eligibility_recompute_queue`) and publish readiness in `admin_trust.py`. No central compiler module.

PR4 creates the adapter:

```text
app/backend/app/eligibility/complexity_contract.py
```

`admin_trust.py` consumes this adapter for publish readiness. No guessed compiler file is modified.

### Detect

```text
domicile
language
GATE score
experience
discipline-specific degree
first-class requirement
category relaxation
PwBD horizontal reservation
ex-serviceman rules
physical standards
medical standards
certificates
attempts (Tier A age relaxation logic)
```

### Signal schema

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
    evidence_summary_key: str | None
```

`evidence_summary_key` validator: must exist as a key in `report.evidence_summary`, else signal rejected.

### Tier coverage

```text
Tier A:
  standard fields + official proof + consensus mandatory
  complexity flags still apply: age relaxation, category, PwBD, ex-serviceman, physical standards, attempts

Tier B:
  complexity flags usually dominate: GATE, domicile, language, discipline, experience

Tier C:
  complexity flags optional; standard gate applies
```

### Compiler behavior

```text
promotion_blocker          → cannot promote until canonical rule exists
publish_blocker            → draft allowed, publish blocked until rule exists
conditional_result_allowed → publish allowed if user-facing result handles missing-profile state
warning                    → publish allowed, admin warning shown
```

### Lifecycle additions

```python
extend_transitions({
    "classified":            {"complexity_detected"},
    "consensus_pending":     {"complexity_detected"},   # consensus may skip-to complexity for Tier B
    "complexity_detected":   {"classified", "superseded", "rejected"},
})
```

Migration extends `chk_lifecycle_status` with `complexity_detected`.

### `recommended_action`

No new enum value. Reuse `block_publish` when complexity blockers exist.

Mapping:

```text
has any blocking_level='promotion_blocker' → block_publish (and promotion gate blocks)
has any blocking_level='publish_blocker'   → block_publish (draft ok, publish blocked)
else                                       → unchanged
```

### Promotion gate extension

```python
def check_promotion(report):
    # PR2 + PR3 checks above
    if has_complexity_blocker(report, level="promotion_blocker"):
        return blocked("eligibility_rule_missing")
    return allowed()
```

Tier B now has real blockers.

### Acceptance

```text
- complexity flags are non-decorative
- complexity_contract.py exposed to admin_trust.py
- Tier B publish blocked when GATE/domicile/language/discipline rule detected but not represented
- Tier A complexity flags applied for age relaxation, PwBD, ex-serviceman, etc.
- evidence_summary_key validated against report.evidence_summary
- promotion gate respects promotion_blocker level
- publish gate (admin_trust.py) respects publish_blocker level
- existing canonical recruitments scanned for complexity via backfill pass (one-time, soft)
```

---

## 6. PR5 — Corrigendum / Staleness / Reverification

### Files

```text
app/backend/app/scraping/corrigendum_detector.py
app/backend/app/scraping/verification_hash.py                ← canonical hash watcher
app/backend/app/scraping/verification_reports.py             ← lifecycle + staleness setters
app/backend/app/scraping/source_watch.py
app/backend/app/api/admin_trust.py                           ← canonical edit hook
db/migrations/NNNN_add_staleness_fields.sql
db/migrations/NNNN_extend_lifecycle_states_stale.sql
db/migrations/NNNN_extend_recommended_action_await_corrigendum.sql
db/migrations/NNNN_create_reverification_batches.sql
tests/scraping/test_corrigendum_detector.py
tests/scraping/test_verification_staleness.py
tests/scraping/test_canonical_edit_hook.py
```

### Migration — staleness columns

```sql
alter table public.recruitment_verification_reports
add column staleness_status text not null default 'fresh',
add column last_checked_at timestamptz,
add column valid_until timestamptz;

alter table public.recruitment_verification_reports
add constraint chk_staleness_status
check (staleness_status in (
  'fresh',
  'stale_source_changed',
  'stale_canonical_changed',
  'needs_reverification',
  'pending_reverification_batch'
));
```

Note: `pending_reverification_batch` is a `staleness_status` value, not a lifecycle state.

### Lifecycle additions

Add lifecycle states:

```text
stale_source_changed
stale_canonical_changed
needs_reverification
```

```python
extend_transitions({
    "classified":              {"stale_source_changed", "stale_canonical_changed", "needs_reverification"},
    "complexity_detected":     {"stale_source_changed", "stale_canonical_changed", "needs_reverification"},
    "consensus_pending":       {"stale_source_changed", "stale_canonical_changed", "needs_reverification"},
    "stale_source_changed":    {"superseded", "rejected"},
    "stale_canonical_changed": {"superseded", "rejected"},
    "needs_reverification":    {"superseded", "rejected"},
})
```

Stale states transition only to `superseded` (when new report version takes over) or `rejected` (admin decision).

### `recommended_action` extension

```sql
alter table public.recruitment_verification_reports
drop constraint chk_recommended_action;

alter table public.recruitment_verification_reports
add constraint chk_recommended_action
check (recommended_action in (
  'await_official_proof',
  'request_admin_review',
  'promote_eligible',
  'block_publish',
  'no_action',
  'confirm_suggested_proof',
  'resolve_conflict',
  'await_corrigendum'
));
```

Mapping:

```text
staleness_status in (stale_source_changed, stale_canonical_changed, needs_reverification)
  → recommended_action = 'await_corrigendum'
```

### `valid_until` populator

```python
def compute_valid_until(extracted_or_canonical: dict) -> datetime | None:
    if extracted_or_canonical.get("apply_end_date"):
        return parse(extracted_or_canonical["apply_end_date"])
    if extracted_or_canonical.get("exam_start_date"):
        return parse(extracted_or_canonical["exam_start_date"])
    return None
```

No manual guess. Recomputed on every report creation.

### Triggers

```text
WILL trigger staleness:
  - official PDF normalized hash changed
  - official page normalized semantic hash changed
  - apply_start_date or apply_end_date changed
  - total_vacancies changed
  - post count or post_names changed
  - corrigendum detected by detector
  - canonical recruitment critical field edited (via admin_trust.py hook)
  - source_registry trust changed

WILL NOT trigger staleness:
  - admin override added (consensus state update only)
  - resolver state changes after admin attach
  - raw HTML/CSS/ads/CDN noise (not in normalized snapshot)
  - lifecycle_status transitions
  - recommended_action recompute
  - report version supersession from non-hash reasons
```

### Poll cadence

```python
# verification_policy.py  (single home; no separate staleness_policy.py)
CORRIGENDUM_WATCH_LIMITS = {
    "tier_a_interval_hours": 24,
    "tier_b_interval_hours": 72,
    "tier_c_interval_hours": 168,
    "max_sources_per_run": 100,
    "max_reports_per_run": 300,
    "mass_change_batch_limit": 25,
}
```

### Mass corrigendum protection

When one source flips many reports in a single sweep:

```text
- first 25 reports → staleness_status = 'needs_reverification'
- remaining flipped reports → staleness_status = 'pending_reverification_batch'
- create one row in reverification_batches
- emit single admin batch alert (no per-report cards)
```

### Batch entity table

```sql
create table public.reverification_batches (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.source_registry(id),
  scrape_run_id uuid,
  trigger_reason text not null,
  total_reports_affected int not null default 0,
  promoted_to_needs_reverification int not null default 0,
  remaining_pending int not null default 0,
  notes text,
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_reverification_batches_unack
on public.reverification_batches(created_at desc)
where acknowledged_at is null;
```

Admin acknowledges the batch → service flips remaining `pending_reverification_batch` reports to `needs_reverification` in throttled chunks.

### Canonical edit hook

Hook in `admin_trust.py` recruitment-update path:

```python
def on_recruitment_critical_field_edit(recruitment_id: str, changed_fields: set[str]) -> None:
    if not (changed_fields & CRITICAL_FIELDS):
        return
    active = get_active_report(recruitment_id=recruitment_id)
    if not active:
        return
    new_hash = build_canonical_snapshot_hash(...)
    if new_hash == active["canonical_snapshot_hash"]:
        return
    # supersede with trigger_reason='canonical_field_edited'
    supersede_and_create(...)
```

`CRITICAL_FIELDS` = the consensus-compared field set (§4 PR3 list).

### Acceptance

```text
- corrigendum creates new report version via atomic RPC
- same normalized hash is noop
- raw HTML/CSS noise does not trigger version churn
- stale Tier A appears in admin needs-attention queue
- published items not auto-unpublished
- canonical edit hook fires only on CRITICAL_FIELDS changes
- mass corrigendum produces one batch row, not 300 cards
- pending_reverification_batch flips to needs_reverification only after admin acknowledges
- admin override and resolver re-runs do NOT trigger staleness
- await_corrigendum recommended_action enum lands
```

---

## 7. PR6 — Admin UI Simplification + API Surface

### Backend API (ship before any frontend component)

```text
GET  /api/admin/verification-reports?lifecycle=&tier=&recommended_action=&limit=&offset=
GET  /api/admin/verification-reports/{id}
POST /api/admin/verification-reports/bulk-dry-run
POST /api/admin/verification-reports/bulk-apply
POST /api/admin/verification-reports/{id}/promote
POST /api/admin/verification-reports/{id}/reject
POST /api/admin/verification-reports/{id}/override-conflict
POST /api/admin/verification-reports/{id}/confirm-suggested-proof
POST /api/admin/verification-reports/{id}/acknowledge-batch        (PR5+)
GET  /api/admin/reverification-batches?acknowledged=false
```

`promote` behavior:

```text
- calls promotion_gate.check_promotion
- on blocked: returns blocker shape; no state change
- on allowed: triggers existing promote-to-draft logic; does not bypass admin_trust.py
```

`bulk-dry-run` runs gate per item, returns aggregate.

`bulk-apply` mutates only items where dry-run passed in the same request payload. Blocked items returned unchanged.

### Bulk contract

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

`blocking_level` ∈ `{promotion_blocker, publish_blocker, warning}`.

### Permissions

PR6 creates permission constants if missing:

```text
sources.manage
scraping.manage
scraping.review
recruitments.manage
```

Role mapping:

```text
Setup & Run mode   → sources.manage OR scraping.manage
Review & Publish   → scraping.review OR recruitments.manage
Override conflict  → recruitments.manage AND role in (admin, super_admin)
Bulk apply         → same permission as underlying action
Acknowledge batch  → scraping.manage
```

Constants live in one module. No hardcoded role checks in components.

### Frontend files

```text
app/frontend/src/pages/admin/OperationsConsole.jsx
app/frontend/src/features/admin/workflow/CurrentActionCard.jsx
app/frontend/src/features/admin/workflow/WorkflowDetailsDrawer.jsx
app/frontend/src/features/admin/workflow/VerificationReportCard.jsx
app/frontend/src/features/admin/workflow/AdminPhaseRail.jsx
app/frontend/src/features/admin/workflow/useAdminNextActions.js
app/frontend/src/features/admin/workflow/BulkActionPreview.jsx
app/frontend/src/features/admin/workflow/ReverificationBatchAlert.jsx
```

### Mode split

```text
Setup & Run        Review & Publish
-----------        ----------------
source selector    queue item list
source trust       selected verification report
run live scrape    current blocker
dry scrape (debug) primary next action
recent run summary promote to draft
run detail drawer  draft readiness
                   publish gate
```

Hide by default: full checklist, crawler config, eligibility ops debug, source CRUD, org CRUD, audit trail.

### Checklist policy

```text
keep useAdminNextActions.js
hide AdminActionChecklist from default view
show CurrentActionCard (1 blocker, 1 next action, 1 primary button)
move full checklist into WorkflowDetailsDrawer
```

### Frontend truth boundary

```text
Backend owns business-truth labels:
  verified, eligible, official_resolved, ready_for_promotion, publish_ready,
  blocker.reason_code, recommended_action, lifecycle_status, staleness_status

Frontend owns local UI state:
  loading, optimistic update, error toasts, drawer open/closed,
  selection sets, filter inputs, pagination cursors
```

No frontend-derived business labels.

### Acceptance

```text
- admin sees one blocker + one next action + one primary button by default
- full checklist available only in drawer
- Setup actions separated from Review actions
- VerificationReportCard renders backend states verbatim
- official proof states visible: auto-resolved, suggested, unresolved, admin attached, rejected
- bulk action always runs dry-run before apply
- permission constants exist in one module
- mass corrigendum batches show as a single ReverificationBatchAlert
- no business-truth label derived in frontend
```

---

## 8. Final Cumulative Transition Matrix

End-state after PR1 → PR7 → PR2 → PR3 → PR4 → PR5 (PR6 frontend only):

```python
{
    "classified": {
        "superseded", "rejected",
        "consensus_pending",                    # PR3
        "complexity_detected",                  # PR4
        "stale_source_changed",                 # PR5
        "stale_canonical_changed",              # PR5
        "needs_reverification",                 # PR5
    },
    "backfilled_needs_review": {
        "classified", "superseded", "rejected",
    },
    "consensus_pending": {
        "classified", "conflict", "admin_override_required",
        "complexity_detected",                  # PR4 skip-to
        "stale_source_changed", "stale_canonical_changed", "needs_reverification",
        "superseded", "rejected",
    },
    "conflict": {
        "admin_override_required", "classified",
        "superseded", "rejected",
    },
    "admin_override_required": {
        "classified", "superseded", "rejected",
    },
    "complexity_detected": {
        "classified",
        "stale_source_changed", "stale_canonical_changed", "needs_reverification",
        "superseded", "rejected",
    },
    "stale_source_changed":    {"superseded", "rejected"},
    "stale_canonical_changed": {"superseded", "rejected"},
    "needs_reverification":    {"superseded", "rejected"},
    "rejected":   {"superseded"},
    "superseded": set(),
}
```

Tests assert this exact shape after each PR migration.

---

## 9. Per-PR Ship Gates

### PR7

```text
- emits only PR1 enum values
- canonical hash required, source hash null
- re-run noop on same hash
- one active report per recruitment
- no auto-unpublish
```

### PR2

```text
- ALTER migration applies cleanly to all existing PR1 + PR7 reports
- verification_gateway.py exists and is invoked after scrape_queue insert
- promotion_gate.py stub installed; Tier A blocks on unresolved/missing
- Tier B/C pass stub gate
- L1–L5 deterministic only; AI deferred
- suggested_official_urls Pydantic-validated
- run-resolver cooldown enforced
- confirm-suggested-proof sets admin_attached
- official_resolution_attempts populated
```

### PR3

```text
- consensus_pending/conflict/admin_override_required lifecycle states added
- transitions extended via extend_transitions (no dict |= )
- conflict_id stable uuid in jsonb
- override_scope rejects 'report'
- prior_value + chosen_value audited
- promotion gate blocks Tier A on unresolved conflict
- resolve_conflict recommended_action enum lands
```

### PR4

```text
- complexity_detected lifecycle state added
- EligibilityComplexitySignal validated
- evidence_summary_key cross-checked against report.evidence_summary
- Tier B publish blocked on detected-but-unrepresented rules
- complexity_contract.py consumed by admin_trust.py
- no new recommended_action; reuses block_publish
```

### PR5

```text
- staleness columns added
- staleness_status check constraint installed
- stale_* lifecycle states added
- pending_reverification_batch is a staleness_status value, not a lifecycle state
- reverification_batches table created
- canonical edit hook only fires on CRITICAL_FIELDS
- admin override and resolver re-runs do not trigger staleness
- await_corrigendum recommended_action enum lands
- mass corrigendum throttled via batch acknowledgment
- valid_until populated from apply_end_date / exam_start_date only
```

### PR6

```text
- backend API surface live before any component ships
- permission constants in one module
- bulk-dry-run runs before bulk-apply within same request
- frontend renders only backend-supplied business labels
- mass corrigendum surfaced as ReverificationBatchAlert (one card, not N)
- default admin view = 1 blocker + 1 action + 1 button
```

---

## 10. What This Plan Does NOT Cover

```text
- AI-assisted resolver (L6) — separate later PR with its own budget/circuit-breaker tests
- strict backfill mode (post-PR7)
- supersession cycle detection at DB level (app-level guard remains)
- evidence table (replaces evidence_summary_key FK target in a later PR)
- frontend mobile/responsive layout details
- async queue infrastructure (only flag and seam wired; queue worker is its own PR)
```

Plan is implementation-ready. Architecture decisions are closed. Open items are scoped, not designed in-line.
