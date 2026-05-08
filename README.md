# reference-UI-for-ccp

Reference UI for ccp from Replit.

## Repository layout

- `app/backend` — Backend service code and Python dependencies.
- `memory` — Product and testing notes.

## Quick start

1. Install backend dependencies from `app/backend/requirements.txt`.
2. Run backend tests from `app/backend` with `pytest`.

| Stage                      | Responsible modules/files                                                                                               | Description                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scraping**               | `app/scraping/runner.py`, `app/scraping/intelligence.py`, SQL migrations for `scrape_sources`                           | External career portals are scraped either in **dry** or **real** mode.  Each run produces rows in the `scrape_queue` table along with extracted fields (`title`, dates, vacancies, etc.).  Scrape runs are initiated via admin endpoints in `app/api/admin_scrape.py`.                                                                                                        |
| **Trust gate**             | `app/api/admin_scrape.py` (routes `/admin/scrape/queue`, `/admin/scrape/items/{id}/promote`), `EligibilityQueue.jsx`    | Scraped items enter a trust gate queue where admins must **approve**, **verify fields**, or **reject** each row.  High‑risk fields (closing dates, notification URL, organisation name, total vacancies and eligibility text) must be verified or corrected before promotion.  Promoting an item inserts a draft recruitment row; rejecting or delaying keeps it in the queue. |
| **Recruitment & criteria** | `app/supabase/migrations/` (age, education, certification, attempt limit tables), `app/backend/app/api/admin_scrape.py` | Once a recruitment is promoted, a set of criteria (age, education, attempt limits, required certifications, required exam keys, domicile) is associated with it.  These are used by the eligibility engine.                                                                                                                                                                    |
| **Eligibility engine**     | `app/backend/app/eligibility/engine.py`                                                                                 | A pure, deterministic Python module that evaluates a user’s profile against a post’s criteria.  It handles complex rules such as age relaxations, category normalisation, education rank and marks, attempt limits, required exam credentials and certifications, nationality and domicile checks.  It returns detailed pass/fail reasons and conditional eligibility flags.   |
| **Eligibility runner**     | `app/backend/app/eligibility/runner.py`                                                                                 | Orchestrates the pipeline for a single user: loads the user’s profile, education, attempts and certifications via Supabase, fetches active posts and their criteria, runs the eligibility engine in batch, writes results to `eligibility_results`, emits notifications, and updates alerts.                                                                                   |
| **Recompute queue**        | `app/backend/app/eligibility/recompute_queue.py`, SQL migrations for `eligibility_recompute_queue`                      | When a user edits their profile or when criteria change, a row is enqueued for recomputation.  Pending recompute tasks are shown in the admin eligibility queue.                                                                                                                                                                                                               |
| **API routes**             | `app/backend/app/api/eligibility.py`, `app/backend/app/api/admin_scrape.py`                                             | Provide HTTP endpoints for users to recompute eligibility and retrieve their results, as well as admin‑only routes to manage scraping, queue operations and promotions.  The API never uses AI to decide eligibility; it always calls the deterministic engine.                                                                                                                |

## Runbook progress

### Step 1 completed: Consolidate common helpers
- **Files changed**
  - `app/backend/app/db/utils.py`
  - `app/backend/app/eligibility/runner.py`
  - `app/backend/app/profile/eligibility_mapper.py`
  - `app/backend/tests/test_eligibility_mapper.py`
- **Helpers consolidated**
  - Moved duplicated Supabase select helper logic into `app.backend.app.db.utils.safe_select`.
  - Replaced local `_safe_select` implementations in eligibility runner and profile eligibility mapper.
- **Commands run**
  - `cd app/backend && pytest tests/test_eligibility_mapper.py tests/test_recompute_queue_behaviour.py`
- **Known follow-ups**
  - Step 1 only is complete; no Step 2+ runbook changes were started.

### Step 2 completed: Improve error propagation
- **Files changed**
  - `app/backend/app/core/error_utils.py`
  - `app/backend/app/db/utils.py`
  - `app/backend/app/eligibility/runner.py`
  - `app/backend/tests/test_error_utils.py`
- **Error-handling helpers consolidated**
  - Added `format_error_context(...)` and `log_warning_with_context(...)` for consistent warning logs with operation/context.
  - Updated `safe_select(...)` warning logging to include standardized operation and context.
  - Updated eligibility runner warning paths to use shared contextual logging helper.
  - Fixed remaining `safe_select` call-site consistency in eligibility runner (no behavior change intended).
- **Commands run**
  - `cd app/backend && pytest tests/test_error_utils.py tests/test_eligibility_mapper.py tests/test_recompute_queue_behaviour.py`
- **Known follow-ups**
  - Step 3 (asynchronous APIs) has not been started.

### Step 3 completed: Introduce asynchronous APIs
- **Files changed**
  - `app/backend/app/db/utils.py`
  - `app/backend/app/eligibility/runner.py`
  - `app/backend/app/api/eligibility.py`
  - `app/backend/tests/test_db_utils_async.py`
- **Async boundaries added**
  - Added `async_safe_select(...)` as an async wrapper around sync `safe_select(...)` using `asyncio.to_thread`.
  - Added async wrappers in eligibility runner:
    - `run_eligibility_for_user_async(...)`
    - `get_eligible_recruitments_async(...)`
    - `get_all_eligibility_results_async(...)`
  - Updated eligibility API endpoints to await async runner/read wrappers.
  - Preserved existing sync implementations and fallback behavior to avoid risky broad conversion.
- **Commands run**
  - `cd app/backend && pytest tests/test_db_utils_async.py tests/test_error_utils.py tests/test_eligibility_mapper.py tests/test_recompute_queue_behaviour.py`
  - `rg \"asyncio.run\" app/backend/app`
  - `rg \"create_task\" app/backend/app`
  - `rg \"_safe_select\" app/backend/app app/backend/tests`
- **Known follow-ups**
  - Async wrappers currently run sync Supabase calls in worker threads; evaluate native async client support in a later step.
