# Code Review & Pipeline Analysis — Implementation Steps

This plan translates `Code Review and Pipeline Analysis.docx` into an execution roadmap with sequencing, owners, and deliverables.

## Phase 0 — Baseline and guardrails (Week 1)

1. **Create a workstream board and ownership map**
   - Define owners for backend platform, data/DB, API, QA, and DevOps.
   - Track all items below as epics with measurable acceptance criteria.

2. **Freeze a baseline for comparison**
   - Capture current latency/error metrics for eligibility runner and admin APIs.
   - Snapshot queue throughput (scrape queue + recompute queue) and p95 response times.

3. **Set quality gates**
   - Minimum CI checks: lint, unit tests, integration smoke tests.
   - Coverage threshold target (start with 60–70%, then ratchet upward).

---

## Phase 1 — Correctness & operability first (Weeks 1–3)

### 1) Consolidate common helpers

**Implementation tasks**
- Introduce `app/db/utils.py` and move duplicated DB helper logic (for example `_safe_select`) into it.
- Refactor `eligibility/runner.py` and `profile/eligibility_mapper.py` to import shared helpers.
- Add helper-level tests for success/failure/empty-state behavior.

**Definition of done**
- No duplicate helper implementations remain.
- Tests cover helper behavior for exception and retry-safe cases.

### 2) Improve error propagation

**Implementation tasks**
- Add domain exceptions (for example `DatabaseError`, `ValidationError`).
- Replace silent fallbacks with structured API errors (`HTTPException` with proper status codes).
- Standardize logging format to include request id, user id (if present), function, and traceback.

**Definition of done**
- API surfaces explicit error payloads instead of silent empty responses.
- Logs are actionable enough to debug failures without repro.

### 3) Security & permissions hardening

**Implementation tasks**
- Audit all admin endpoints for `require_permission()` coverage.
- Move all secrets to env/secret manager references only.
- Add/verify admin audit-log writes on all privileged actions.
- Add dependency vulnerability checks in CI (`pip-audit` or equivalent).

**Definition of done**
- Permission checks are complete and enforced by tests.
- Security scanning runs on every PR.

---

## Phase 2 — Performance & scalability (Weeks 3–6)

### 4) Optimize queue queries

**Implementation tasks**
- Add indexes in migrations for:
  - `scrape_queue(status)`
  - `scrape_queue(reviewed_at)`
  - `eligibility_recompute_queue(status)`
- Run `EXPLAIN ANALYZE` for dashboard-critical queries.
- Confirm API pagination limits are enforced and client-compatible.
- Add archival/cleanup job for stale queue rows.

**Definition of done**
- Query plans use indexes for queue list/filter operations.
- Admin queue views maintain acceptable p95 under expected load.

### 5) Introduce asynchronous APIs (incrementally)

**Implementation tasks**
- Verify async capabilities in current Supabase client layer.
- Convert I/O-heavy eligibility paths to `async def` where beneficial.
- Reduce query count using batched/filter queries before deeper async migration.
- Benchmark before/after; keep a rollback path if complexity outweighs gains.

**Definition of done**
- Measured throughput/latency improvements are documented.
- No regression in correctness compared to synchronous baseline.

---

## Phase 3 — Documentation and developer productivity (Weeks 4–7, parallel)

### 6) Enhance documentation

**Implementation tasks**
- Expand README with architecture, data flow, and local setup.
- Add `CONTRIBUTING.md` with coding/testing/review workflow.
- Ensure OpenAPI docs are complete with endpoint examples.
- Add migration history doc and ADRs for major decisions.

**Definition of done**
- A new engineer can run, test, and modify the system using docs only.
- High-impact architectural decisions are traceable in ADRs.

### 7) Add unit + integration tests

**Implementation tasks**
- Build eligibility rule unit tests with parameterized edge cases.
- Add integration tests for runner/API with seeded fixtures or mocks.
- Add explicit failure-path tests for DB/API error scenarios.
- Enforce CI-required test suite on pull requests.

**Definition of done**
- Deterministic engine behavior is proven across edge cases.
- Critical API paths have integration coverage.

---

## Phase 4 — Architecture evolution path (Optional, after stabilization)

If load/scale goals exceed monolith limits, progress toward an event-driven split:

1. Scraper service emits scrape events.
2. Trust-gate service manages admin verification queue.
3. Recruitment service handles promotion-to-recruitment writes.
4. Eligibility service consumes recompute events and publishes results.
5. Notification service consumes eligibility outcomes.
6. API gateway centralizes auth/routing.

**Adoption strategy**
- Start with event boundaries around existing modules while keeping one database.
- Migrate one workflow at a time behind feature flags.
- Prefer strangler pattern over big-bang rewrite.

---

## Suggested execution order (highest ROI)

1. Error propagation + logging
2. Security/permissions audit
3. Helper consolidation
4. Test foundation + CI gates
5. Queue indexing and query plans
6. Async migration (only where benchmark-proven)
7. Documentation/ADRs hardening
8. Event-driven decomposition (if/when needed)

---

## Success metrics to track

- Eligibility API p95 latency and error rate.
- Queue API p95 latency with real data volume.
- Mean time to detect/resolve incidents.
- Test coverage for eligibility and admin paths.
- Number of privileged actions with audit trail coverage.
- Deployment frequency and change failure rate.
