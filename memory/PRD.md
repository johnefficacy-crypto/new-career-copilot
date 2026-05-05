# Career Copilot — Product Requirements Document

_Last updated: 2026-01 (Phase 1 commercial build)_

## Original problem statement
> Read EMERGENT_START_HERE.md and implement Phase 1; expand creatively across Study OS, Community, Marketplace, Exam Intelligence, Accountability, Mentor sessions.

The repo is the new commercial full-stack build of Career Copilot, an "exam preparation operating system" for Indian government-job aspirants on the `commercial/main-build` branch.

## Product doctrine (from `EMERGENT_START_HERE.md`)
- Canonical entity is `recruitment` (frontend may label as "exam"). FKs: `recruitment_id`, `post_id`, `organization_id`.
- Eligibility must be **deterministic**. AI explains, never overrides.
- Scraper output must clear source registry → queue → review → promotion.
- Never expose service-role keys, DB URLs, AI keys, payment secrets, or webhook secrets to the frontend.
- Two phases: Phase 1 = commercial app shell, Phase 2 = engines & automation.

## Architecture (Phase 1)
- **Frontend**: React 18 + CRA, react-router v6, Tailwind 3, Recharts, lucide-react. Soft clay/sage/dusk palette with Fraunces serif headings + Inter body.
- **Backend**: FastAPI + Motor (MongoDB) + bcrypt + PyJWT. Cookies (SameSite=None) and Bearer tokens both supported.
- **Auth shim**: Local JWT auth using MongoDB. Supabase scaffolding (`app/db/supabase_client.py`, `app/core/auth.py`) preserved but unused; `AUTH_MODE=local` in backend `.env`. To switch to Supabase, plug in env vars and re-route the `/api/auth/*` router.
- **Service layout**: supervisor runs backend on port 8001 from `/app/backend` and frontend on 3000 from `/app/frontend`. Both are symlinks to `/app/app/backend` and `/app/app/frontend`.

## Roles seeded on startup (idempotent)
| Role | Email | Password |
|---|---|---|
| `super_admin` | superadmin@careercopilot.in | SuperAdmin@2026 |
| `mentor` | mentor@careercopilot.in | Mentor@2026 |
| `user` (demo) | aspirant@careercopilot.in | Aspirant@2026 |

`super_admin` can create scoped admins (`scope` array — e.g. `["scraper"]`, `["content"]`) via `/api/admin/users/create`. Phase-2 will gate mutations by scope.

## Phase 1 — implemented (Jan 2026)
### Auth UX
- /login, /signup, /forgot-password, /reset-password, /app/onboarding (4-step wizard)
- AuthProvider with `null|guest|authed` states + `ProtectedRoute` (loading state, role gate)
- JWT (1d access + 30d refresh) stored in localStorage; cookies also issued

### User app surface (24 screens)
- Mission control dashboard (KPIs, recruitments, focus widget, weekly truth panel, today's plan)
- Today, Profile, Onboarding
- Exams listing (filters + status pills + 5-stage timeline) + Exam detail with eligibility preview
- Saved recruitments, Application tracker (6-stage history)
- Study OS: Plan, **functional Pomodoro timer** (start/pause/reset/preset, persists session), Mocks logger with trend, Subjects gauge, Weekly truth panel
- Community: channel list, hot/new/unanswered sort, thread detail with reply + vote, create thread
- Marketplace: resource cards, resource detail (curriculum + reviews), Mentors (browse + filter), mentor detail (availability slots + booking flow)
- Accountability: partner suggestions + request, study groups + join, mentor bookings list
- AI Copilot: scripted multi-turn chat with quick prompts and history persistence

### Admin / RBAC (12 screens)
- Overview (KPIs from real Mongo counters + recent audit)
- Recruitments review, Eligibility queue placeholder (promote/reject UI), Source registry, Scraper monitor
- Notification controls + kill switch placeholder
- Marketplace admin (counts + flag queue)
- RBAC & users — table with role dropdown + Invite admin/mentor (super_admin only)
- Mentor verification, Community moderation, AI policy panel
- Audit log (real Mongo collection)

### Backend APIs (~45 endpoints)
- `/api/health`, `/api/db-health`
- `/api/auth/{register,login,logout,me,refresh,forgot-password,reset-password}` with brute-force lockout
- `/api/recruitments` list/detail/save + `/saved`
- `/api/profile/me` get/put + `/api/tracker` CRUD
- `/api/community/{categories,threads,threads/{slug},posts,vote}`
- `/api/marketplace/{resources,resources/{id},mentors,mentors/{id},providers,affiliates}`
- `/api/study/{plan,plan/toggle,focus/start,focus/stop,focus/summary,mocks,subjects,weekly-review}`
- `/api/accountability/{partners,partners/request,groups,groups/join,mentors/book,mentors/bookings}`
- `/api/ai/{guidance,chat,history}` (scripted)
- `/api/admin/{overview,users,users/create,users/{id}/role,audit,sources,scraper/runs,eligibility-queue,notifications,marketplace,community/flags,ai-policy}`

### Test status (iteration 1)
- Backend: **32/32 pytest pass** (full auth + RBAC + route coverage)
- Frontend: ~95% — one bug found and fixed (`ThreadDetail` wrong endpoint), reverified manually with playwright (reply flow now works end-to-end).

## Phase 2 — backlog (do not start until Phase 1 reviewed)
- **Eligibility engine**: deterministic rules ported from `docs/migration-reference/eligibility/`. Endpoints `POST /api/eligibility/recompute`, `GET /api/eligibility/results/me`, `GET /api/eligibility/results/me/all`.
- **Scraper trust gate**: source registry, dry run, queue writes, admin promote (`POST /api/admin/scrape/promote`).
- **Razorpay payments**: order/verify/webhook + plan entitlement sync; Pro/Elite gating.
- **Cron + idempotent jobs**: scraper schedule, deadline checks, eligibility recompute, notification fanout.
- **Email/SMS**: templates, preferences, kill switch (live), deadline alerts.
- **Real AI**: swap scripted `/api/ai/chat` for Claude Sonnet (already verified Emergent LLM key flow); preserve "AI never overrides" guardrails.
- **Supabase Auth swap**: drop `AUTH_MODE=local` for `AUTH_MODE=supabase`; reuse the existing Supabase client + JWT verification. Frontend stays untouched.
- **Mobile-only sidebar polish**: current overlay works; needs swipe & focus trap.
- **Audit redaction**: surface IP and user-agent on audit entries; redact before showing to non-super_admin.

## Backlog ideas (P2)
- Eligibility "what-if" simulator UI (frontend exists; needs backend recompute hook in Phase 2).
- Mentor hourly Razorpay flow + post-session feedback.
- Scoped admin badges everywhere a scope is required.
- Topper AMA scheduling within community.
- Public-facing /exams browsable as SEO landing pages.

## Files to know
- Auth: `backend/app/api_v1/auth.py`, `backend/app/security.py`, `frontend/src/lib/{api,authContext,ProtectedRoute}.{js,jsx}`
- Routers: `backend/app/api_v1/{recruitments,profile,tracker,community,marketplace,study,accountability,ai,admin,seed}.py`
- Pages: `frontend/src/pages/*.jsx` and `frontend/src/pages/admin/*.jsx`
- Layout: `frontend/src/pages/DashShell.jsx`, `frontend/src/pages/admin/AdminShell.jsx`
- Theme: `frontend/src/index.css`, `frontend/tailwind.config.js`

## Notes for future contributors
- Don't import `frontend/src/lib/supabase.js` until Supabase env vars are added — it throws at import time.
- `requirements.txt` was rewritten as UTF-8 (was UTF-16 BOM).
- All `_id` ObjectIds are stringified before returning JSON.
- `datetime.now(timezone.utc)` used everywhere; never `utcnow()`.
