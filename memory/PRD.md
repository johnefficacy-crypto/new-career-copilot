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

### ⏳ Remaining

- **Session (iii)** — Scraper trust gate (source_registry → scrape_runs
  → scrape_queue → admin promote). Reference:
  `UI-career-copilot/lib/scraping/{extractor,alerts,runner}.ts`.
- **Session (iv)** — Razorpay payments (order/verify/webhook +
  subscription_plans / user_subscriptions sync). Backend secrets only.
- **Session (v)** — Cron + email/notification dispatch (Resend +
  in-process APScheduler with kill switch).

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
