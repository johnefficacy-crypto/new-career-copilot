# Runbook: Code Review and Pipeline Analysis Implementation

This runbook is adapted directly from `docs/engineering/Code Review and Pipeline Analysis.docx` and turns its recommendations into execution-ready steps.

## 1) Consolidate common helpers

### Goal
Reduce duplication (especially `_safe_select`) and improve maintainability.

### Implementation steps
1. Create shared helper module `app/db/utils.py`.
2. Move duplicated Supabase helpers (including `_safe_select`) into this module.
3. Refactor imports in `eligibility/runner.py` and `profile/eligibility_mapper.py` to use `app.db.utils`.
4. Remove local duplicate helper definitions.
5. Search for additional duplicate helper patterns and centralize them.
6. Add/adjust tests for helper behavior under success and failure paths.

### Exit criteria
- No duplicate implementations of `_safe_select` remain.
- Helper tests cover exception and empty-result behavior.

---

## 2) Improve error propagation

### Goal
Stop masking failures with empty lists and provide actionable API/runtime errors.

### Implementation steps
1. Add predictable domain exceptions (e.g., `DatabaseError`, `ValidationError`).
2. Replace broad exception swallowing in runner/admin API code paths.
3. Raise structured FastAPI errors (`HTTPException`) with correct status codes.
4. Log stack traces with contextual metadata (route, request id, user id when present).
5. Document failure modes in API docs (retryable vs non-retryable).

### Exit criteria
- Failed DB calls return explicit error responses instead of silent fallbacks.
- Logs are sufficient for root-cause analysis.

---

## 3) Introduce asynchronous APIs

### Goal
Improve throughput/responsiveness for sequential Supabase I/O workloads.

### Implementation steps
1. Verify async support in current `supabase-py` usage.
2. Convert DB-I/O-heavy functions (e.g., `run_eligibility_for_user`) to `async def` where feasible.
3. Update endpoints to `async def` and `await` the runner.
4. Batch fetches with `.in_()` filters to reduce round trips.
5. Evaluate `asyncpg` via pooler DSN when connection pooling is available.
6. Benchmark before/after latency and throughput.

### Exit criteria
- Performance gains are measured and documented.
- No behavioral regression versus the sync baseline.

### Implementation status (verified May 9, 2026)
- `supabase==2.29.0` is installed with async support (`acreate_client` / `AsyncClient`) and the backend client factory exposes `get_supabase_admin_async()`.
- Eligibility **result read** helpers use true async Supabase calls when given an async client:
  - `get_eligible_recruitments_async`
  - `get_all_eligibility_results_async`
- Eligibility **recompute** remains a compatibility async wrapper around sync runner writes to preserve deterministic write ordering and existing safety semantics.
- Existing read query batching remains in place (notably `.in_(...)` on posts/recruitment-linked criteria). No additional round-trip reduction was introduced in this pass.

---

## 4) Enhance documentation

### Goal
Improve onboarding, integration clarity, and architecture traceability.

### Implementation steps
1. Expand `README.md` with architecture, data flow, key tables, and local run instructions.
2. Add `CONTRIBUTING.md` with test/style/review workflow.
3. Ensure FastAPI OpenAPI docs are complete with endpoint examples and docstrings.
4. Add `docs/migrations.md` summarizing migration history.
5. Add ADRs under `docs/adr/` for major engineering decisions.

### Exit criteria
- A new contributor can set up, run, and test with docs only.
- Major architecture decisions are captured with rationale.

---

## 5) Add unit and integration tests

### Goal
Validate deterministic eligibility behavior and end-to-end pipeline reliability.

### Implementation steps
1. Standardize on `pytest` and required mocking tools in dev dependencies.
2. Add `tests/eligibility/test_engine.py` with parametrized edge-case rules:
   - age bounds
   - category relaxations
   - education mark availability
   - attempt limits
   - exam credentials
   - domicile conditions
3. Add runner/API integration tests with seeded fixtures or mocked Supabase.
4. Add explicit failure-path tests for DB/API error scenarios.
5. Add CI workflow to run tests + coverage threshold on PRs.

### Exit criteria
- Eligibility engine rule coverage includes major edge cases.
- Integration suite validates runner/API path and error handling.

---

## 6) Optimize queue queries

### Goal
Keep admin queue APIs fast as data volume grows.

### Implementation steps
1. Add indexes via Supabase migrations:
   - `scrape_queue(status)`
   - `scrape_queue(reviewed_at)`
   - `eligibility_recompute_queue(status)`
   - relevant join/foreign-key columns
2. Run `EXPLAIN ANALYZE` on `eligibility_queue()` and `list_scrape_queue()` query paths.
3. Confirm index usage; refine index strategy where scans persist.
4. Enforce bounded pagination (API currently capped to 50 rows).
5. Add archival/cleanup jobs for stale queue rows.

### Exit criteria
- Queue endpoints maintain acceptable p95 under production-like load.
- Query plans show index usage for primary filter paths.
- If local DB is unavailable, document exact SQL for manual `EXPLAIN ANALYZE` verification.

---

## 7) Security and permissions

### Goal
Harden access controls and reduce operational security risk.

### Implementation steps
1. Ensure all service-role keys/API keys/DB credentials are injected via env/secret manager.
2. Audit admin endpoints in `admin_scrape.py` and `eligibility.py` for `require_permission()` enforcement.
3. Add secret rotation runbook and cadence.
4. Ensure `admin_audit_logs` consistently records approvals/verifications/promotions.
5. Add eligibility recomputation audit events if missing.
6. Minimize returned personal data in eligibility responses.
7. Add dependency vulnerability checks (`pip-audit` or `safety`) in CI.

### Exit criteria
- Privileged operations are permission-guarded and auditable.
- Security checks run automatically in CI.
- CI includes `pytest`, coverage threshold, and dependency vulnerability check (`pip-audit` or equivalent).

---

## Optional architecture evolution: event-driven services

If scale requirements outgrow the current architecture, evolve incrementally:

1. Scraper service emits scrape events.
2. Trust-gate service handles review queue + verification events.
3. Recruitment service handles promotions into `recruitments` + criteria writes.
4. Eligibility service consumes recompute events and publishes eligibility outcomes.
5. Notification service handles alert delivery and writes to `notification_alerts`.
6. API gateway centralizes authentication/authorization/routing.

### Migration strategy
- Prefer strangler pattern over big-bang rewrite.
- Keep shared Postgres initially; add event boundaries first.
- Roll out workflow-by-workflow behind feature flags.

---

## Recommended implementation order (highest ROI)

1. Error propagation
2. Security/permission audit
3. Helper consolidation
4. Test + CI foundation
5. Queue indexing/query tuning
6. Async migration (only where benchmark-proven)
7. Documentation and ADR completion
8. Event-driven decomposition (only if needed)
