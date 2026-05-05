# Reference Context Visible to Emergent

Emergent appears to mount this repository from the `/app` directory only. Therefore, important project context that originally lived outside `/app` is mirrored here.

## Read order

1. `/app/EMERGENT_START_HERE.md`
2. `/app/reference/README.md`
3. `/app/reference/MIGRATIONS.md`
4. `/app/reference/MIGRATION_REFERENCE.md`

## Important external folders in the full GitHub repo

These exist in the repository but may not be visible inside Emergent's `/app` workspace:

- `../docs/`
- `../supabase/migrations/`
- `../docs/migration-reference/`

If Emergent cannot access parent folders, use the summaries in this `/app/reference/` folder.

## Current active paths from `/app`

- Frontend: `frontend/`
- Backend: `backend/`
- Backend entrypoint: `backend/server.py`
- Backend auth: `backend/app/core/auth.py`
- Backend DB: `backend/app/db/postgres.py`
- Backend Supabase client: `backend/app/db/supabase_client.py`
- Frontend API client: `frontend/src/lib/api.js`
- Frontend auth client: `frontend/src/lib/auth.js`
- Frontend Supabase client: `frontend/src/lib/supabase.js`
- Eligibility skeleton: `backend/app/eligibility/`
- Scraper skeleton: `backend/app/scraping/`

## Non-negotiable product doctrine

- Canonical database entity: `recruitment`
- Frontend may say `exam`
- Use `recruitment_id`, `post_id`, `organization_id`
- Do not create `public.exams`
- Eligibility must be deterministic
- Scraper output must pass source registry / queue / review / promotion before becoming canonical
- Never expose backend secrets to frontend
