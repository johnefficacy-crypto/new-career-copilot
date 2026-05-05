# Career Copilot — Product Requirements Document

_Last updated: 2026-01 — Phase 1.5 (Supabase canonical, MongoDB removed)_

## Original problem statement (Phase 1.5)
> Phase 1.5 — Remove MongoDB and restore Supabase/Postgres canonical
> architecture. Keep all Phase 1 frontend screens, routes, layouts, and
> UI; replace the backend so authentication uses Supabase Auth and the
> canonical database is Supabase Postgres.

The repo on `commercial/main-build` is the new commercial build of Career
Copilot, an exam-preparation OS for Indian government-job aspirants.

## Architecture (Phase 1.5)
- **Frontend** — React 18 + Create React App, react-router v6, Tailwind 3,
  Recharts, lucide-react, framer-motion. Soft clay/sage/dusk palette with
  Fraunces serif headings + Satoshi/Cabinet body.
- **Backend** — FastAPI 0.110 + asyncpg + supabase-py admin client. Runs
  via supervisor on port 8001 (`uvicorn server:app --host 0.0.0.0 --port 8001`).
- **Auth** — Supabase Auth (email/password). Frontend calls
  `@supabase/supabase-js` directly for `signUp`, `signInWithPassword`,
  `signOut`, `resetPasswordForEmail`, `onAuthStateChange`. Backend
  validates the Supabase access token via `admin.auth.get_user(token)` on
  every protected route.
- **Database** — Supabase Postgres. `asyncpg` is used for direct queries
  where needed; the supabase-py admin client is the production path for
  health checks. Direct `db.<project>.supabase.co` hostnames are
  IPv6-only in this environment, so `/api/db-health` reports both the
  primary Supabase REST connection and best-effort `asyncpg`.
- **Supervisor layout** — backend at `/app/backend → /app/app/backend`,
  frontend at `/app/frontend → /app/app/frontend` (symlinks). MongoDB
  supervisor program is stopped and unused.

### What was removed in Phase 1.5
- `motor`, `pymongo`, `bson` (uninstalled and removed from
  `requirements.txt`).
- `MONGO_URL` / `DB_NAME` runtime requirement (gone from `.env` and code).
- Local JWT/bcrypt auth (`app/security.py`, `app/api_v1/auth.py`,
  `app/server_deps.py` deleted).
- Mongo-backed routers (`app/api_v1/*` deleted).
- The Phase-1 demo seed (super-admin / mentor / aspirant accounts in
  Mongo). Roles now live in Supabase Auth `app_metadata.role` /
  `user_metadata.role` and are surfaced through `/api/auth/me`.

### What replaced it
- `app/core/auth.py` — Supabase Bearer-token verification using the
  service-role admin client.
- `app/api/auth.py` — `/api/auth/me` returning the resolved Supabase user.
- `app/api/placeholders.py` — Phase-1 placeholder routers that keep all
  ~45 frontend endpoints navigable using deterministic in-memory data.
  Will be swapped to Supabase-backed implementations during Phase 2.
- `app/db/postgres.py` — asyncpg pool factory.
- `app/db/supabase_client.py` — admin/public Supabase clients.

> Note: MongoDB and the local JWT shim were a temporary Phase-1 prototype.
> The commercial product targets Supabase Auth + Supabase Postgres only.

## Environment variables

### Backend (`backend/.env`)
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (shared with frontend). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (frontend-safe). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Backend only.** Validates JWTs, manages users. |
| `DATABASE_URL` | Postgres DSN for asyncpg. |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Phase-2 only. Backend only. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Phase-2. Backend only. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Frontend-safe Razorpay key id. |
| `CORS_ORIGINS` | Comma-separated list of allowed origins. |

### Frontend (`frontend/.env`)
| Var | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | FastAPI base URL. |
| `REACT_APP_SUPABASE_URL` | Mirrors `NEXT_PUBLIC_SUPABASE_URL`. |
| `REACT_APP_SUPABASE_ANON_KEY` | Mirrors `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |

`.env` files are gitignored; only `.env.example` is committed.

## Routes (frontend) — preserved from Phase 1
- Public: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`
- User app (`/app/...`): mission control, today, profile, onboarding,
  exams, exam detail, saved, tracker, study-plan, focus, mocks,
  subjects, weekly review, community, thread detail, create thread,
  marketplace, resource detail, mentors, mentor detail, accountability,
  ai chat
- Admin (`/admin/...`): overview, recruitments, eligibility queue,
  sources, scraper, notifications, marketplace, audit, RBAC, mentors,
  community, AI policy

## Backend endpoints
- `GET /api/health` — service heartbeat.
- `GET /api/db-health` — Supabase + Postgres status.
- `GET /api/auth/me` — Supabase-authenticated current user.
- `GET/POST /api/recruitments[/saved/{slug}/save]`, `/api/profile/me`,
  `/api/tracker`, `/api/community/...`, `/api/marketplace/...`,
  `/api/study/...`, `/api/accountability/...`, `/api/ai/{guidance,chat,history}`,
  `/api/admin/...` — Phase-1 placeholder endpoints (in-memory or static).

## Phase 2 — backlog

### ✅ Session (i) — Eligibility engine (Jan 2026)
Direct port of the reference TypeScript engine
(`UI-career-copilot/lib/eligibility/engine.ts` master). Pure, deterministic,
fully unit-tested.

Files:
- `backend/app/eligibility/schemas.py` — Pydantic shapes (UserProfile,
  UserEducation, PostCriteria, EligibilityCheckResult, …).
- `backend/app/eligibility/engine.py` — `check_eligibility` +
  `check_eligibility_batch`. Six rules: age (with category, PwBD
  max-replace, ex-serviceman formula), education (level rank, percentage,
  cgpa→pct fallback, allowed disciplines, appearing → conditional),
  attempts, required exam credentials, nationality, domicile (state PSC).
- `backend/app/eligibility/runner.py` — Supabase-admin runner. Joins
  `posts → recruitments → organizations`, fetches
  `age_criteria`/`education_criteria`/`attempt_limits` per post, runs
  the engine, upserts to `eligibility_results` (`on_conflict=user_id,post_id`),
  emits one `notification_alerts` row per matched recruitment
  (`on_conflict=user_id,recruitment_id,alert_type`).
- `backend/app/api/eligibility.py` — three endpoints:
  - `POST /api/eligibility/recompute` — `Authorization: Bearer <service_role>`
    accepts `{ user_id }` in body. With a regular Supabase access token,
    body's `user_id` is ignored and the caller's own id is used.
  - `GET  /api/eligibility/results/me` — eligible + conditional rows
    only, eligible first.
  - `GET  /api/eligibility/results/me/all` — every row.

Tested:
- `tests/test_engine.py` — **16/16 unit tests pass** covering every rule
  (basic eligible, age below min, OBC relaxation, PwBD-replace-not-stack,
  ex-serviceman formula, appearing-candidate conditional, education
  below required, percentage below min, cgpa→pct fallback, attempts
  exceeded, exam credential missing, state PSC match/mismatch, central
  post skipping domicile, non-Indian nationality, batch).
- Live Supabase end-to-end: seeded recruitment → post → criteria →
  user with profile + graduate edu → `recompute` returned
  `processed=1 eligible=1 conditional=0 alerts_inserted=1`; user token
  read `/results/me` and got the row back with full nested join data.

Schema notes:
- The reference repo filtered by `recruitments.ingestion_trust_status`;
  this Supabase project uses `publish_status` (per migration 033). The
  runner now filters `publish_status IN ('verified','published')` —
  i.e. only trust-gated rows are visible to the engine.
- `recruitment_required_exam_credentials` is treated as optional; if it
  doesn't exist in this deployment the runner logs and continues.

### ✅ Session (ii) — Canonical Supabase queries (Jan 2026)

Replaced the in-memory placeholders for **recruitments, profile, tracker,
community/forum, marketplace, study OS** with real queries against
canonical tables. Wired `Exams.jsx` and `ExamDetail.jsx` to the
deterministic eligibility engine.

Files:
- `backend/app/api/canonical.py` — single consolidated router (~720 lines)
  exposing the same paths the React app already calls but backed by
  Supabase admin client queries:
  - `GET /api/recruitments` — joins `recruitments → organizations`,
    filters `publish_status IN ('verified','published')`, merges
    `eligibility_results` per user, derives UI status pill (`eligible`/
    `urgent`/`conditional`) from the engine verdict + apply-window
    urgency (≤7d).
  - `GET /api/recruitments/saved` — `tracked_recruitments` join.
  - `GET/POST /api/recruitments/{id_or_slug}` + `/save` — UUID and
    slug-suffix lookup.
  - `GET/PUT /api/profile/me` — `profiles` keyed to `auth.users.id`,
    with first-time bootstrap insert.
  - `GET/POST/PUT/DELETE /api/tracker[/{id}]` —
    `user_recruitment_applications` with UI-stage ↔ enum mapping
    (`saved → not_started`, `applied → submitted`, etc.).
  - `GET /api/community/categories` + `threads[/{id}]` +
    `POST /threads` + `/posts` + `/vote` — `forum_categories`,
    `forum_posts`, `forum_comments`, `forum_post_upvotes`.
  - `GET /api/marketplace/{resources,resources/{id},mentors,mentors/{id},providers,affiliates}`
    — `courses`, `lessons`, `course_sections`, `reviews`, `profiles`
    (instructor join). Affiliates returns empty (no canonical table).
  - `GET /api/study/{plan,subjects,weekly-review}`,
    `POST /api/study/plan/toggle`, `POST /api/study/focus/{start,stop}`,
    `GET /api/study/focus/summary`, `GET/POST /api/study/mocks` —
    `study_plans`, `study_tasks`, `study_sessions`, `mock_tests`.

- `backend/app/api/placeholders.py` — trimmed: kept accountability +
  AI + admin (no canonical tables for partner/group, AI is scripted,
  admin is mostly KPI placeholders). All other routers removed from the
  aggregate.

- `backend/server.py` — includes the canonical router **before** the
  placeholder router so canonical routes win on path conflicts.

- `frontend/src/pages/Exams.jsx` — rewritten:
  - Uses `e.id` (UUID) for routing instead of synthetic slug.
  - New `<StatusPill>` component (eligible / conditional / urgent).
  - "Recompute eligibility" button hits `POST /api/eligibility/recompute`
    and shows a result toast (`processed/eligible/conditional` counts).
  - Renders `e.eligibility.fail_reasons[0]` as a coachable hint.
  - Stage progress bar (Notification → Open → Closed → Result).
  - Empty state when no published recruitments exist.

- `frontend/src/pages/ExamDetail.jsx` — rewritten:
  - `<VerdictBadge>` component.
  - Eligibility panel surfaces full `fail_reasons[]` from
    `eligibility_results`, computed-at timestamp, and
    "AI does not decide eligibility" disclaimer.
  - Sidebar lists real `posts` from the join (post_name + group_type
    + pay_level).
  - "Save" + "Track application" + "Official site" actions hit
    canonical endpoints.

Tested:
- Live Supabase E2E (UI + API): seeded 2 recruitments + posts + criteria
  + a Supabase user with profile (OBC, DOB 2000) + graduate B.A. 72%
  → logged in via UI → Exams page renders 2 recruitments → clicked
  Recompute → "Recomputed: 2 posts evaluated · 2 eligible · 0
  conditional" toast appears → counts update to `Eligible · 2` →
  Eligible filter shows both with green ELIGIBLE pill and
  "You're eligible — apply window closes 31 May" → clicked through
  to detail page → verdict "eligible", "All eligibility checks
  passed. You can apply within the window above.", computed-at
  timestamp, post listed.
- Canonical CRUD round-trips: recruitments list/detail/save,
  profile get/put, tracker add/list/put/delete (with proper
  enum mapping), community categories, marketplace
  resources/mentors, study focus session start/stop/summary,
  mock add/list, weekly-review aggregation.

Schema fixes during the session:
- `application_status` enum is `not_started/opened/in_progress/submitted/skipped/not_applicable`,
  not the colloquial "applied/admit_card/result". Added
  `_STAGE_TO_STATUS` and reverse map.
- `recruitments` uses `publish_status` (migration 033), not
  `ingestion_trust_status`.
- `profiles` has both `dob` and `date_of_birth` columns; runner
  prefers `dob` then falls back.

### ✅ Session (iii) — Scraper trust gate (Jan 2026)

Direct port of `UI-career-copilot/lib/scraping/{extractor,runner,alerts}.ts`
(master). Two governance gates now exist in the data plane:

    source_registry  ─►  scrape_runs  ─►  scrape_queue  ─►  recruitments
                                                  │
                                                  └──►  notification_alerts

Files:
- `backend/app/scraping/schemas.py` — `ExtractedRecruitment`,
  `ExtractedPost` (mirrors `types/scraping.ts`).
- `backend/app/scraping/extractor.py` — HTML fetch + Claude extractor +
  **deterministic mock fallback** when `ANTHROPIC_API_KEY` is empty/
  placeholder/`mock`. Mock encodes the source URL into the synthesised
  output so dedup keys are stable across runs. Confidence is calibrated
  to 0.7 for mocks (forces admin review).
- `backend/app/scraping/runner.py` — `run_scraping_pass` (loads active
  `scrape_sources`, dedups against existing `recruitments` + open
  `scrape_queue`, inserts every new item with **`status='pending'`**
  per the May-2026 hardening), `promote_to_recruitments` (writes
  organisations/recruitments/posts/age_criteria/education_criteria with
  `publish_status='needs_review'`), `promote_run` (per-run promotion).
- `backend/app/scraping/alerts.py` — `alert_users_for_new_recruitment`,
  `send_deadline_alerts` (3-day + 1-day windows). Idempotent on
  `(user_id, recruitment_id, alert_type)`.
- `backend/app/api/admin_scrape.py` — admin router with audit logging
  on every write:
  - `GET  /api/sources` + `/api/admin/sources` — source registry list
    (falls back to `scrape_sources` when registry is empty).
  - `POST /api/admin/scrape/run-dry` — mock pass, no model call.
  - `POST /api/admin/scrape/run` — real Claude pass.
  - `GET  /api/admin/scrape/runs` — recent `scrape_runs` rows.
  - `GET  /api/admin/scrape/queue` — pending queue items (paginated).
  - `POST /api/admin/scrape/promote/{run_id}` — promote all pending
    items from a run.
  - `POST /api/admin/scrape/items/{queue_id}/{promote,reject}` —
    per-item review.
  - `GET  /api/admin/eligibility-queue` — KPI view (pending count,
    promoted_24h, rejected_24h, recompute_backlog).
  - Auto-bootstraps an `admin_role`-tagged `profiles` row on first
    admin call (the `scrape_runs.triggered_by_user` FK requires it).
- `frontend/src/pages/admin/Scraper.jsx` — rewritten with "Run dry-scrape"
  + "Reload" buttons, status pills (completed/failed/partial), per-run
  trigger/sources/seen/new/dup columns, runs sourced from
  `/api/admin/scrape/runs`.
- `frontend/src/pages/admin/EligibilityQueue.jsx` — rewritten with live
  per-item Reject/Promote buttons calling
  `/api/admin/scrape/items/{id}/{promote,reject}`, success toast showing
  the new recruitment id + alerts-fanned-out count, "queue is empty"
  state, "canonical" header pill (replaced "placeholder").
- `frontend/src/pages/admin/Sources.jsx` — already wired to
  `/api/admin/sources` (no changes needed).

Tested:
- Live Supabase end-to-end (UI + API): created admin user with
  `app_metadata.role='super_admin'` → logged in → visited
  `/admin/sources` (rendered all 109 entries from `source_registry`),
  `/admin/scraper`, `/admin/eligibility-queue` → clicked **Run
  dry-scrape** → backend ran the runner over active `scrape_sources`,
  the mock extractor produced one ExtractedRecruitment per source, all
  inserted into `scrape_queue` with `status='pending'` → toast
  "Dry-run XXX… completed · found N, new N, dup 0" → switched to the
  Eligibility queue → 50 fresh items rendered with confidence 70% and
  the source name → `admin_audit_logs` captured `scrape.run_dry`
  → API-level promote test promoted one item to canonical:
  `recruitments` row created with `publish_status='needs_review'`
  + `status='upcoming'` (correctly derived from apply dates) +
  posts (Inspector + Junior Assistant) + age_criteria +
  education_criteria → `scrape_queue.status='approved'` →
  `admin_audit_logs` captured `scrape.promote_run`.
- Dedup verified: a second dry-run for the same source produced
  `items_duplicate=1` (the in-queue similarity key catches it).
- Per-item reject + per-item promote endpoints both 200 + audit-logged
  + emit `notification_alerts`.

Schema reconciliation:
- `scrape_runs.triggered_by_user` FKs into `profiles.id` (not
  `auth.users.id`), so `_require_admin` lazily upserts a profile row
  when the admin first acts. The same upsert sets `is_admin=true` and
  `admin_role` so RLS policies key off the right column.
- `scrape_sources.base_url` is `UNIQUE`, so test harnesses must use a
  unique suffix when seeding fixture sources (this was a one-time
  E2E-test fix, not a runtime concern).
- `recruitments.publish_status` is the trust gate (verified/published
  visible to engine; needs_review for newly promoted items).

### ✅ Session (v) — Cron + email/notification dispatch (Jan 2026)

In-process APScheduler with three jobs, a Resend dispatcher (log-only
fallback when `RESEND_API_KEY` is unset), and an `admin_settings`
kill switch.

Files:
- `backend/app/notifications/dispatcher.py` — pulls `notification_alerts`
  with `email_sent=false`, filters by `notification_preferences`
  (in_app_enabled / email_enabled / min_priority_*), renders subject +
  text body for `new_match` / `deadline_3day` / `deadline_1day`, sends
  via Resend if configured else logs to `backend.err.log`, marks
  `email_sent=true` on success or opt-out.
- `backend/app/notifications/recompute_worker.py` — drains
  `eligibility_recompute_queue` (oldest first, respects
  `next_attempt_at`), runs the deterministic engine via
  `app.eligibility.runner.run_eligibility_for_user`, marks
  `status='completed'` on success or exponential backoff on failure
  (max 5 attempts).
- `backend/app/notifications/scheduler.py` — APScheduler singleton,
  three jobs:
  - `notif:dispatch` every 2m (interval)
  - `notif:deadline_sweep` daily 06:00 IST = 00:30 UTC (cron)
  - `elig:recompute` every 5m (interval)
  All job runs land in an in-memory `_last_run` map for the admin UI.
- `backend/app/api/notifications.py` — REST surface:
  - `GET /api/notifications/me`, `/me/unread-count`
  - `POST /api/notifications/me/read` (all or specific ids)
  - `GET/PUT /api/notifications/preferences/me`
  - `GET /api/admin/notifications` (pending count, sent_24h, channels,
    kill switch state)
  - `POST /api/admin/notifications/kill-switch` ({paused: bool})
  - `GET /api/admin/jobs` — APScheduler-backed job listing with
    next/last-run state.
  - `POST /api/admin/jobs/run/{job_id}` — manual trigger; audited.
- `backend/server.py` — scheduler started in lifespan startup,
  shut down in lifespan teardown.
- `frontend/src/pages/admin/Notifications.jsx` — rewritten:
  Kill-switch toggle with PAUSED/ACTIVE pill, success toast, three
  KPI cards (pending dispatch / sent 24h / channels active), per-channel
  status (in-app · email · WhatsApp Phase-3), per-job table with
  "Run now" button + next/last-run timestamps + ok/failed badge.

Tested:
- E2E (API): admin user → eligibility recompute created 2
  `notification_alerts` → user feed returned them → unread count = 2 →
  preferences GET/PUT round-trip → manual dispatch with email_enabled=false
  → `checked=N, emailed=0` (correctly skipped) → re-enabled email →
  `checked=2, emailed=2` (logged-only fallback worked) → kill switch ON
  → `checked=0, killed=1` (dispatch correctly paused) → kill switch OFF
  → resumed → mark-all-read updated 2, unread = 0.
- E2E (UI): admin/notifications page rendered all three jobs with
  next-run timestamps; kill-switch toggle worked + showed banner +
  flipped pill colour; manual `Run now` on `notif:dispatch` while paused
  returned `killed:1` and updated last-run cell.
- Scheduler started cleanly in lifespan (`APScheduler started:
  ['notif:dispatch', 'elig:recompute', 'notif:deadline_sweep']`).

Notes:
- `RESEND_API_KEY` is unset → dispatcher uses **log-only fallback**.
  Bodies appear in `backend.err.log` with subject + recipient. Plug a
  real key into `backend/.env` and restart — no code change.
- `notification_preferences.min_priority_*` storage was `"medium"` not
  the enum I assumed; pattern relaxed to accept low|normal|medium|high|critical.
- `eligibility_recompute_queue.recruitment_id` is NOT NULL (per-user
  per-recruitment), so manual queue inserts must specify both. The
  worker handles whatever is queued.
- `DISABLE_SCHEDULER=1` env var disables APScheduler boot for tests/
  multi-worker setups.

### ⏳ Remaining
- **Session (iv)** — Razorpay payments. Order create + verify + webhook
  + `subscription_plans` / `user_subscriptions` / `payment_history` sync.
  Backend secrets only. (Skipped earlier; user can pick this up next.)

## Files to know
- Backend auth: `backend/app/core/auth.py`, `backend/app/api/auth.py`,
  `backend/app/db/supabase_client.py`
- Backend DB: `backend/app/db/postgres.py`, `backend/app/core/config.py`
- Backend placeholders: `backend/app/api/placeholders.py`
- Backend entrypoint: `backend/server.py`
- Frontend auth: `frontend/src/lib/{supabase,auth,api,authContext,ProtectedRoute}.{js,jsx}`
- Frontend pages: `frontend/src/pages/**/*.jsx`

## Notes for future contributors
- Never create `public.exams` — recruitment is the canonical entity.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, AI keys,
  Razorpay secrets, or webhook secrets to the frontend.
- Existing migrations live in `/app/supabase/migrations/`. Inspect them
  before generating new ones; new migrations should be added there for
  manual review (do not auto-apply).
- Supabase Auth in this project rejects disposable TLDs (`.test`, etc.)
  and currently requires email confirmation for sign-ups. For local
  testing, create users via the admin API with `email_confirm: true`.
