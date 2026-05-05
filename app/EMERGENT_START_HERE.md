# Emergent Start Here — Career Copilot Commercial Build

This repository is the new commercial full-stack build of Career Copilot.

IMPORTANT: Emergent workspace may be rooted at `/app`. If so, this file is intentionally duplicated here from `docs/EMERGENT_START_HERE.md` so the instructions are visible inside the active workspace.

## Current stack

- Frontend: React / Create React App in `frontend`
- Backend: FastAPI in `backend`
- Database: Supabase Postgres
- Auth: Supabase Auth
- Backend DB: `asyncpg` and Supabase admin client

## Already working

- FastAPI backend starts from `backend` with `uvicorn server:app --reload --host 127.0.0.1 --port 8000`
- `/api/health` works
- `/api/db-health` works
- Supabase Auth loop works
- Frontend has:
  - `frontend/src/lib/supabase.js`
  - `frontend/src/lib/auth.js`
  - `frontend/src/lib/api.js`
- Backend has:
  - `backend/app/core/config.py`
  - `backend/app/core/auth.py`
  - `backend/app/db/postgres.py`
  - `backend/app/db/supabase_client.py`
  - `backend/app/api/auth.py`

## Product doctrine

- Canonical database entity: `recruitment`
- Frontend may use label: `exam`
- Foreign keys: `recruitment_id`, `post_id`, `organization_id`
- Do not create `public.exams`
- Eligibility must be deterministic
- AI may explain or extract, but must not override official data
- Scraper output must go through source registry, queue, review, and promotion
- Never expose service role keys, database URLs, AI keys, payment secrets, or webhook secrets to frontend code

## Two-phase implementation strategy

### Phase 1 — Commercial app shell, auth, routing, RBAC, and user-facing product surface

Phase 1 should make the app feel like a complete commercial platform, even where deep backend logic is still represented by safe placeholders.

Implement Phase 1 before scraper, payments, eligibility internals, cron jobs, or email dispatch.

Phase 1 includes:

1. Authentication UX
   - Login
   - Signup
   - Logout
   - Protected routes
   - Current user session handling
   - Auth error states

2. Routing and layout
   - Public layout
   - Auth layout
   - User app layout
   - Admin/RBAC layout
   - Responsive navigation
   - Mobile-friendly sidebar/topbar

3. User dashboards and dependent pages
   - Main dashboard / mission control
   - Today page
   - Profile page
   - Onboarding/profile-completion pages
   - Recruitments/exams listing page with backend-ready placeholders
   - Recruitment/exam detail placeholder
   - Saved/tracked recruitments placeholder
   - Application tracker placeholder

4. RBAC and admin-facing pages
   - Admin dashboard placeholder
   - RBAC/users page placeholder
   - Audit log placeholder
   - Source registry placeholder
   - Eligibility queue placeholder
   - Scraper monitor placeholder
   - Notification controls placeholder
   - Marketplace admin placeholder

5. Community and forum surface
   - Community home
   - Forum categories
   - Thread list
   - Thread detail placeholder
   - Create post placeholder
   - Moderation placeholder

6. Marketplace surface
   - Marketplace home
   - Course/resource cards
   - Coaching/provider cards
   - Resource detail placeholder
   - Affiliate/partner listing placeholder

7. Study OS surface
   - Study planner page
   - Focus session/timer placeholder
   - Mock-test tracker placeholder
   - Weekly review placeholder
   - Subject progress placeholder

8. AI and accountability surfaces
   - AI chat UI shell
   - AI guidance placeholder
   - Accountability partner page
   - Study group placeholder
   - Mentor/session placeholder

9. API connection hygiene
   - Use `frontend/src/lib/api.js` for backend calls
   - Use `frontend/src/lib/auth.js` for Supabase Auth
   - Use `frontend/src/lib/supabase.js` for frontend Supabase client
   - Use `REACT_APP_*` variables in frontend only
   - Keep backend secrets server-side only

Phase 1 acceptance criteria:

- `npm start` works in `frontend`
- `uvicorn server:app --reload --host 127.0.0.1 --port 8000` works in `backend`
- User can login/signup/logout
- Protected dashboard can call `/api/auth/me`
- Public routes and protected routes behave correctly
- Admin/RBAC pages exist as safe placeholders
- Community/forum/marketplace/study/AI/accountability pages exist as navigable screens
- No `.env` files are committed
- No scraper, payment, email, cron, or eligibility internals are implemented prematurely

### Phase 2 — Commercial backend engines and automation

Phase 2 begins only after Phase 1 shell/routing/auth/RBAC/user pages are stable.

Phase 2 includes:

1. Eligibility engine
   - Port old deterministic eligibility logic into Python/FastAPI
   - Implement `backend/app/eligibility/schemas.py`
   - Implement `backend/app/eligibility/engine.py`
   - Implement `backend/app/eligibility/runner.py`
   - Implement `backend/app/api/eligibility.py`
   - Endpoints:
     - `POST /api/eligibility/recompute`
     - `GET /api/eligibility/results/me`
     - `GET /api/eligibility/results/me/all`

2. Scraper and source intelligence
   - Implement source registry API
   - Implement scraper dry-run first
   - Implement scrape queue writes
   - Implement admin review/promote flow
   - Preserve trust gate: scraper output must not become canonical without review/promotion
   - Endpoints:
     - `GET /api/sources`
     - `POST /api/scrape/run-dry`
     - `GET /api/scrape/runs`
     - later `POST /api/admin/scrape/promote`

3. Payment gateway
   - Razorpay order creation
   - Razorpay verification
   - Webhook handling
   - Plan/entitlement sync
   - Pro/Elite gating
   - Never expose payment secrets in frontend

4. Cron scheduling and automation
   - Scheduled scraper runs
   - Deadline checks
   - Eligibility recomputation jobs
   - Notification fanout jobs
   - Idempotency and run logs

5. Email and notification system
   - Email templates
   - User notification preferences
   - Kill switch
   - Deadline alerts
   - New-match alerts only after deterministic eligibility verdicts

6. Admin control plane
   - Source registry CRUD
   - Scrape run monitor
   - Eligibility queue monitor
   - Audit logging
   - RBAC enforcement
   - Notification controls
   - Payment/subscription admin views

Phase 2 acceptance criteria:

- Eligibility results come from deterministic backend engine only
- Scraper reads from `source_registry`
- Scraper writes to queue/review layer before promotion
- Admin actions are permission-protected and audit-ready
- Payment/webhook secrets remain backend-only
- Scheduled jobs are idempotent and observable
- No `public.exams` table is introduced

## Immediate instruction for Emergent

Start with Phase 1 only.

Do not implement Phase 2 internals until Phase 1 is stable and reviewed.
