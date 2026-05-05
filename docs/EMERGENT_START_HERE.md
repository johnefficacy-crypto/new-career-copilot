# Emergent Start Here — Career Copilot Commercial Build

This repository is the new commercial full-stack build of Career Copilot.

## Current stack

- Frontend: React / Create React App in `app/frontend`
- Backend: FastAPI in `app/backend`
- Database: Supabase Postgres
- Auth: Supabase Auth
- Backend DB: `asyncpg` and Supabase admin client

## Already working

- FastAPI backend starts with `uvicorn server:app --reload --host 127.0.0.1 --port 8000`
- `/api/health` works
- `/api/db-health` works
- Supabase Auth loop works
- Frontend has:
  - `src/lib/supabase.js`
  - `src/lib/auth.js`
  - `src/lib/api.js`
- Backend has:
  - `app/core/config.py`
  - `app/core/auth.py`
  - `app/db/postgres.py`
  - `app/db/supabase_client.py`
  - `app/api/auth.py`

## Product doctrine

- Canonical database entity: `recruitment`
- Frontend may use label: `exam`
- Foreign keys: `recruitment_id`, `post_id`, `organization_id`
- Do not create `public.exams`
- Eligibility must be deterministic
- AI may explain or extract, but must not override official data
- Scraper output must go through source registry, queue, review, and promotion

## First implementation phase

Do not implement scraper or eligibility engine internals yet.

First stabilize the commercial app shell:

1. Keep the backend working.
2. Keep Supabase Auth working.
3. Create clean frontend routing.
4. Create login/signup/logout screens.
5. Create authenticated dashboard.
6. Show current user from `/api/auth/me`.
7. Add placeholders for:
   - recruitments/exams
   - eligibility
   - profile
   - admin
   - scraper/source registry
8. Do not delete existing skeleton files.
9. Do not commit `.env`.
10. Use `REACT_APP_*` variables in frontend.

## Future modules

Skeletons already exist for:

- `app/backend/app/eligibility/`
- `app/backend/app/scraping/`
- `app/backend/app/api/eligibility.py`
- `app/backend/app/api/sources.py`
- `app/backend/app/api/scrape.py`

Old reference logic may exist under:

- `docs/migration-reference/`

Use those references later to port old logic into Python/FastAPI.