# Backend Full Audit (Deep Pass)

Date: 2026-05-16  
Scope: `app/backend` (API, scraping, study_os, eligibility, notifications, core, db, persona, onboarding, exam_intelligence)

## Method

1. Followed repository instructions by reading `AGENTS.md` and graph artifacts first.
2. Performed backend-wide structural scan (file count, LOC, exception density, largest files).
3. Re-ran deep section analysis with targeted file inspection.
4. Executed full backend test suite for runtime verification.

## Quantitative Profile

- Python files under `app/backend/app`: **136**
- Approx LOC: **42,433**
- Highest complexity concentrations:
  - `app/api`: 14,470 LOC
  - `app/scraping`: 10,670 LOC
  - `app/study_os`: 8,068 LOC
- Largest single hotspots:
  - `scraping/runner.py` (~3213 LOC)
  - `api/canonical.py` (~2454 LOC)
  - `api/admin_scrape.py` (~1799 LOC)

## Deep Analysis by Section

### 1) Entrypoint & composition (`server.py`)

#### What is strong
- Clear health and db-health separation.
- Router registration order is intentionally documented to preserve path precedence.

#### Gaps
- `db-health` treats Supabase as hard dependency and Postgres as best-effort. This asymmetry may be correct, but it requires explicit operational policy because alerts can read as "healthy" even with Postgres failure.
- Broad exception handling at health checks can blur root-cause categories unless logs are strongly structured.

#### Evidence
- Supabase failure raises 503 while Postgres failures are folded into status text.

---

### 2) API section (`app/api/*`)

#### What is strong
- Broad use of typed request models and role/permission dependencies.
- Large functional coverage with deterministic, explicit endpoint contracts.

#### Gaps
- **God-file concentration** in `canonical.py` and `admin_scrape.py` creates very high blast radius.
- Recommendation/ranking path still carries explicit TODO debt for parity/coverage.
- In several admin workflows, fallback-to-default behavior can hide data retrieval failures from operators.

#### Specific risks
- `canonical.py` scoring parity TODOs affect recommendation consistency.
- `admin_scrape.py` audit writes and evidence load are best-effort under broad catches.
- `study_os.py` returns graceful fallback object for any build exception; excellent UX continuity, but can mask latent outages.

---

### 3) Scraping section (`app/scraping/*`)

#### What is strong
- Separation into fetch/extract/normalize/dedup/promotion modules.
- `fetcher` has structured `FetchResult` and supports conditional HTTP semantics (`If-None-Match`, `If-Modified-Since`, 304).

#### Gaps
- `runner.py` is extremely large and multi-responsibility, increasing regression risk.
- Compatibility-driven catch blocks (e.g., returning empty conflict sets) may also suppress genuine runtime faults if not discriminated.

#### Risk profile
- This is the highest backend operational risk area due to complexity + exception density.

---

### 4) Study OS section (`app/study_os/*` + `api/study_os.py`)

#### What is strong
- Rich and resilient response-shaping for mission control.
- Defensive composition allows frontend to remain renderable even when upstream data is partial.

#### Gaps
- Silent degradation risk: fallback payload can look valid while upstream dependencies are failing.
- Test warnings show timezone hygiene debt (`datetime.utcnow()` deprecation warning in plan_by_subject).

---

### 5) Eligibility section (`app/eligibility/*`)

#### What is strong
- Rule engine appears explicit and explainable (`EligibilityCheck` objects and conditional/unverifiable semantics).
- Good handling of unverifiable criteria states in deterministic checks.

#### Gaps
- Broad exception handling remains in data access paths and can produce silent "no results" states.
- Some parsing failures are downgraded into conditional states; this is user-safe but should be tracked as data-quality defects for admins.

---

### 6) Notifications section (`app/notifications/*`)

#### What is strong
- Kill switch, idempotency logic, channel adapters, and delivery tracking shape are all present.

#### Gaps
- Fail-open behavior for kill switch lookup failure is operationally pragmatic, but may conflict with strict pause semantics during incidents.
- Scheduler shutdown suppresses errors completely, reducing shutdown observability.

---

### 7) Core/Auth/DB foundations

#### What is strong
- Auth and permission checks are centralized and reusable.
- DB utility layer provides both soft-fail and hard-fail execution patterns.

#### Gaps
- Auth error details can include provider exception text.
- Config is simple env-loader style without strict schema validation.

---

## Cross-Cutting Findings

1. **Resilience-first error handling is widespread** (good uptime posture) but frequently suppresses failure visibility.
2. **Complexity is concentrated** in a small set of large files, making these high-priority refactor targets.
3. **Audit and observability posture** for admin mutations should be strengthened to ensure post-incident forensic certainty.
4. **Quality debt is explicit and localized** in ranking and timezone handling; these are tractable improvements.

## Recommended Prioritized Actions

### P0 (Immediate)
- Add explicit degraded-state flags/diagnostic metadata whenever fallback defaults are returned.
- Strengthen admin mutation audit durability (at least strong error telemetry when audit write fails).

### P1 (Near-term)
- Split `api/canonical.py` and `scraping/runner.py` into bounded domain slices.
- Replace broad exception catches in high-impact paths with typed exceptions and branch-specific handling.

### P2 (Debt burn-down)
- Resolve recommendation parity TODOs in canonical ranking path.
- Replace `datetime.utcnow()` usage with timezone-aware UTC throughout.

## Runtime Verification

- Full backend suite passed in this environment:
  - `1252 passed, 79 deselected, 8 warnings`
- Warning observed: deprecation warning tied to `datetime.utcnow()` usage.
