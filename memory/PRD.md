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

## Phase 2 — backlog (not started)
- Eligibility engine (deterministic) → `app/eligibility/`.
- Scraper trust gate (source registry → queue → review → promote) →
  `app/scraping/`.
- Razorpay payments (order/verify/webhook) — secrets backend-only.
- Cron + idempotent jobs (scrape, deadline, eligibility, fanout).
- Email/SMS dispatch with kill switch + preferences.
- Real AI (Claude Sonnet via Emergent integrations) replacing scripted
  `/api/ai/chat`, with deterministic-eligibility guardrails.
- Migrate placeholder routers to Supabase/Postgres-backed implementations
  using the existing canonical tables (`recruitments`, `posts`,
  `organizations`, `profiles`, `eligibility_results`, `source_registry`,
  `scrape_queue`, `scrape_runs`, `notification_alerts`).

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
