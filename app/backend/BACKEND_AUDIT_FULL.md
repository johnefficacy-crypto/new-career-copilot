# Backend Full Audit (Deep Pass)

Date: 2026-05-16
Scope: `app/backend` (entrypoint `server.py`; packages `api`, `scraping`, `study_os`, `eligibility`, `notifications`, `core`, `db`, `persona`, `persona_questions`, `onboarding_unified`, `exam_intelligence`, `services`, `queues`, `profile`, `common`, `models`)

## Method

1. Read `AGENTS.md` and graph artifacts first per repository instructions.
2. Structural scan: `find app/backend/app -name "*.py"` for file counts; `wc -l` aggregates for LOC.
3. Exception-density measurement: `grep -rE "except\s+Exception" app/backend/app --include="*.py"` (counts only broad catches, not all `except` clauses).
4. TODO inventory: `grep -rn "TODO\|FIXME\|XXX" app/backend/app --include="*.py"`.
5. Hotspot inspection: each file >1,000 LOC was opened to cross-check claims with file:line evidence.
6. Runtime verification: full backend pytest suite executed in this environment.

## Quantitative Profile

- Python files under `app/backend/app`: **145**
- Total LOC (sum of `wc -l` across `*.py`): **44,675**
- Top sections by LOC:
  - `app/api`: **16,734** (34 files)
  - `app/scraping`: **10,644** (26 files)
  - `app/study_os`: **8,045** (23 files)
  - `app/eligibility`: **2,833** (8 files)
  - `app/onboarding_unified`: **1,581** (7 files)
  - `app/persona` + `app/persona_questions`: **2,157** (12 files)
  - `app/exam_intelligence`: **1,007** (6 files)
  - `app/notifications`: **815** (5 files)
  - `app/core`: **278** (6 files)
  - `app/db`: **137** (4 files)
- Files >1,000 LOC (refactor candidates):
  - `scraping/runner.py` — 3,212
  - `api/canonical.py` — 2,453
  - `api/admin_scrape.py` — 1,798
  - `study_os/mission_control.py` — 1,104
  - `scraping/fetcher.py` — 1,052
  - `api/community_runtime.py` — 1,040
  - `api/placeholders.py` — 1,035
  - `study_os/planner.py` — 1,030
- Broad `except Exception` occurrences backend-wide: **251**. Notable concentrations:
  - `scraping/runner.py`: 36
  - `eligibility/engine.py`: 12
  - `api/admin_scrape.py`: 12 (audit/evidence paths)
  - `api/canonical.py`: 4
- Tracked TODO/FIXME markers: **4**, all in `api/canonical.py:1156-1159` (P1.5-B scoring parity).

## Deep Analysis by Section

### 1) Entrypoint & composition (`app/backend/server.py`)

**Strengths**
- Clear separation of `/api/health` (`server.py:136-143`) and `/api/db-health` (`server.py:145-176`).
- Router registration order documented to preserve path precedence (`server.py:200` notes "canonical Supabase routes — must precede placeholders").
- Eager asyncpg pool warmup so `/api/db-health` is cheap (`server.py:75`).

**Gaps**
- `db-health` treats Supabase as a hard dependency (`server.py:159` raises HTTP 503 on failure) while Postgres failures are folded into status text. Operationally defensible, but the asymmetry needs an explicit alerting policy or operators may read "healthy" while Postgres is degraded.
- The `try/except` around the Postgres probe is broad; structured logs (level, error class, latency bucket) should accompany the status text for triage.

**Evidence**
- `server.py:150-159` (Supabase liveness) vs `server.py:160-176` (Postgres best-effort branch).

---

### 2) API section (`app/api/*`)

**Strengths**
- Typed request models and centralized role/permission dependencies (see `app/core/permissions.py`, `app/core/auth.py`).
- Broad feature coverage with deterministic, explicitly-versioned endpoint contracts.

**Gaps**
- **God-file concentration**: four `app/api/*` files exceed 1,000 LOC and together hold ~6,326 LOC of router logic (`canonical.py`, `admin_scrape.py`, `community_runtime.py`, `placeholders.py`). Blast radius for any change in these files is unusually high.
- Recommendation/ranking parity carries explicit P1.5-B debt at `api/canonical.py:1156-1159` (PwBD readiness, education parity, capacity parity, sector/state normalization).
- Several admin flows fall back to defaults on retrieval failure, which can mask outages from operators (see Section 3 for one in `admin_scrape.py`).
- `study_os.py` returns a graceful fallback envelope on any build failure; preserves UX but should be paired with a `degraded: true` flag (see Cross-Cutting Findings).

**Hotspot risks**
- `api/canonical.py`: scoring parity TODOs affect recommendation consistency between backend and frontend fallback heuristics.
- `api/admin_scrape.py`: audit writes and evidence load happen under 12 broad `except Exception` catches; failures may be swallowed silently.
- `api/community_runtime.py` and `api/placeholders.py`: both >1,000 LOC and not previously called out — recommend bounded slicing before they grow further.

---

### 3) Scraping section (`app/scraping/*`)

**Strengths**
- Pipeline modularity: fetch / extract / normalize / dedup / promotion are separate modules.
- `scraping/fetcher.py` exposes a structured `FetchResult` and supports conditional HTTP semantics (`If-None-Match`, `If-Modified-Since`, 304 short-circuit).

**Gaps**
- `runner.py` (3,212 LOC) is multi-responsibility with **36 broad `except Exception` blocks**. Highest single-file regression and observability risk in the backend.
- `fetcher.py` (1,052 LOC) is also above the refactor threshold and was missing from prior hotspot lists.
- Compatibility-driven catches that return empty conflict sets can suppress genuine runtime faults if they are not narrowed by exception class.

**Risk profile**
- Highest backend operational risk area: complexity × broad-catch density × admin/job orchestration role.

---

### 4) Study OS section (`app/study_os/*` + `app/api/study_os.py`)

**Strengths**
- Rich response shaping for the mission-control surface.
- Defensive composition lets the frontend stay renderable when upstream data is partial.

**Gaps**
- Silent-degradation risk: fallback payloads can look valid while upstream dependencies are down. The response shape does not currently include a degraded-state marker (see P0).
- Timezone hygiene debt: `datetime.utcnow()` is used at `study_os/plan_by_subject.py:224` for `computed_at` — the only remaining occurrence in the backend. Replacement with `datetime.now(timezone.utc)` is a one-line fix.
- Two more files now exceed the 1,000 LOC threshold and warrant slicing: `mission_control.py` (1,104) and `planner.py` (1,030).

---

### 5) Eligibility section (`app/eligibility/*`)

**Strengths**
- Rule engine is explicit and explainable via `EligibilityCheck` objects with conditional / unverifiable semantics.
- Unverifiable-criteria handling is clean and user-safe.

**Gaps**
- `eligibility/engine.py` carries 12 broad `except Exception` blocks in data-access paths; can produce silent "no results" states.
- Parsing failures are downgraded to conditional outcomes. User-safe, but these should emit a data-quality signal so admins can fix source records rather than rely on perpetual conditional verdicts.

---

### 6) Notifications section (`app/notifications/*`)

**Strengths**
- Kill switch, idempotency logic, channel adapters, and delivery-tracking shape are all present (`notifications/__init__.py:14`, `notifications/dispatcher.py:40-204`).

**Gaps**
- Fail-open kill-switch lookup: `dispatcher.py:55` warns and returns falsy on lookup failure, so a Supabase blip during an active pause could resume dispatch. Operationally pragmatic but conflicts with strict-pause semantics; document the trade-off or invert to fail-closed during declared incidents.
- Scheduler shutdown at `scheduler.py:138` calls `_scheduler.shutdown(wait=False)` inside a broad suppressor, reducing shutdown observability. Log + re-raise (or at minimum log at warning level with traceback) before suppressing.

---

### 7) Persona & Persona Questions (`app/persona/*`, `app/persona_questions/*`)

**Strengths**
- Two cohesive packages (6 files each); no single file exceeds the 1,000 LOC threshold.
- Question metadata is separated from runtime persona logic, easing iteration on prompt content.

**Gaps**
- Not previously covered in this audit. Recommend a follow-up pass focused on: (a) deterministic ordering of question banks across sessions, (b) version pinning for persona schema migrations, (c) cache invalidation behavior shared with `study_os`.

---

### 8) Onboarding (`app/onboarding_unified/*`)

**Strengths**
- Unified package replaces earlier per-step modules; 1,581 LOC across 7 files keeps the surface bounded.

**Gaps**
- Not previously covered. Verify: (a) idempotency of restart flows, (b) consistency of partially-saved onboarding state with the persona snapshot consumed downstream, (c) defaults that bypass eligibility checks.

---

### 9) Exam Intelligence (`app/exam_intelligence/*`)

**Strengths**
- Compact (1,007 LOC, 6 files); good signal-to-noise for a domain module.

**Gaps**
- Not previously covered. Spot-check needed for: (a) source-of-truth reconciliation against `scraping` outputs, (b) caching/TTL of computed intelligence used by `study_os/mission_control.py`.

---

### 10) Core / Auth / DB foundations (`app/core/*`, `app/db/*`)

**Strengths**
- Auth and permission checks are centralized and reusable (`core/auth.py`, `core/permissions.py`).
- DB utility layer (`db/utils.py`, 137 LOC total across `db/`) provides both soft-fail and hard-fail execution patterns.
- Two distinct DB transports are clearly separated: `db/postgres.py` (asyncpg pool) and `db/supabase_client.py` (REST/admin client).

**Gaps**
- Auth error details can leak provider exception text into responses; sanitize before returning.
- `core/config.py` is env-loader style without strict schema validation — a Pydantic `BaseSettings` (or equivalent) would catch typos and missing required values at boot.
- `db/` has no consolidated retry/backoff policy; each caller decides individually, contributing to the broad-catch pattern elsewhere.

---

## Cross-Cutting Findings

1. **Resilience-first error handling is widespread** (good uptime posture) but frequently suppresses failure visibility. 251 backend-wide `except Exception` catches, concentrated in `scraping/runner.py` (36), `eligibility/engine.py` (12), and `api/admin_scrape.py` (12).
2. **Complexity is concentrated** in 8 files >1,000 LOC totaling ~12,724 LOC (~28% of backend). These are the highest-leverage refactor targets.
3. **Audit & observability** for admin mutations is fragile where audit writes sit inside broad catches (e.g., `api/admin_scrape.py`). Failed audits should be alertable, not silent.
4. **Quality debt is explicit and localized**: 4 ranking-parity TODOs in `api/canonical.py:1156-1159` and 1 `datetime.utcnow()` remaining at `study_os/plan_by_subject.py:224`.
5. **Coverage gaps in prior audits**: `persona`, `onboarding_unified`, and `exam_intelligence` had no prior section; included here at survey depth and flagged for follow-up deep passes.

## Recommended Prioritized Actions

### P0 (Immediate)
- **Degraded-state flag**: add a `degraded: true` + `diagnostics` metadata field to any fallback envelope returned by `api/study_os.py` and `study_os/mission_control.py`. *Acceptance*: response schema documents the field; at least one integration test asserts it is set when an upstream dependency raises.
- **Admin audit durability**: in `api/admin_scrape.py`, when an audit write fails, emit a structured error log with actor, mutation, and exception class, and bump a counter metric. *Acceptance*: failure path covered by a test that monkeypatches the audit writer to raise.
- **Timezone fix**: replace `datetime.utcnow()` at `study_os/plan_by_subject.py:224` with `datetime.now(timezone.utc)`. *Acceptance*: backend warnings drop from 8 to ≤7 on the next full suite run.

### P1 (Near-term)
- **Split god files**: extract bounded domain slices from `api/canonical.py` (start with recommendation ranking), `scraping/runner.py` (separate job orchestration from per-source pipelines), and `api/admin_scrape.py` (separate evidence/audit writers from request handlers). *Acceptance*: no single file >1,500 LOC after the split; imports updated; suite green.
- **Narrow exception catches in high-impact paths**: convert the 36 broad catches in `scraping/runner.py` and the 12 in `eligibility/engine.py` to typed exceptions with branch-specific handling. *Acceptance*: backend-wide broad-catch count drops below 200.
- **Kill-switch fail-mode policy**: document or invert the fail-open behavior at `notifications/dispatcher.py:55` so operators know the semantics during incidents.

### P2 (Debt burn-down)
- Resolve the 4 P1.5-B recommendation parity TODOs at `api/canonical.py:1156-1159`.
- Add Pydantic schema validation to `app/core/config.py`.
- Schedule deep-pass audits for `persona`, `onboarding_unified`, and `exam_intelligence` packages (none have had one).

## Runtime Verification

- Full backend pytest suite was executed in this environment on 2026-05-16:
  - **1252 passed, 79 deselected, 8 warnings**
- Warning observed: deprecation warning tied to `datetime.utcnow()` usage in `study_os/plan_by_subject.py:224`.

## Limitations & Out of Scope

- Frontend code (`app/frontend/**`) was not inspected; cross-stack contract verification is out of scope.
- No live database, network, or load testing was performed; runtime checks are limited to the pytest suite.
- Security review was structural only; no SAST, dependency CVE scan, or auth-flow penetration testing was run.
- LOC is a coarse proxy for complexity; no cyclomatic-complexity or maintainability-index measurement was taken.
- Persona, onboarding, and exam-intelligence sections are survey-depth pending a dedicated deep pass.
- Counts (files, LOC, exception blocks) are point-in-time as of the date above; rerun the commands in **Method** to refresh.
