# Emergent Implementation Prompt — Eligibility + Scraper Migration

This repository is the new commercial Career Copilot build.

Older reference logic has been copied into `docs/migration-reference/`.

## Task

Port the eligibility engine and scraper from the old TypeScript/Next.js implementation into the new FastAPI backend.

## Do not do this

- Do not import TypeScript into Python runtime.
- Do not invent fake eligibility logic.
- Do not bypass the source registry/review flow.
- Do not expose service role key or database URL to frontend.

## Build first

1. Implement `app/backend/app/eligibility/schemas.py`
2. Implement `app/backend/app/eligibility/engine.py`
3. Implement `app/backend/app/eligibility/runner.py`
4. Implement `app/backend/app/api/eligibility.py`
5. Register eligibility router in `app/backend/server.py`

## Then build scraper

1. Implement `app/backend/app/scraping/fetcher.py`
2. Implement `app/backend/app/scraping/extractor.py`
3. Implement `app/backend/app/scraping/normalizer.py`
4. Implement `app/backend/app/scraping/runner.py`
5. Implement `app/backend/app/api/sources.py`
6. Implement `app/backend/app/api/scrape.py`
7. Register sources/scrape routers in `app/backend/server.py`

## Expected API endpoints

Eligibility:

- `POST /api/eligibility/recompute`
- `GET /api/eligibility/results/me`
- `GET /api/eligibility/results/me/all`

Scraper:

- `GET /api/sources`
- `POST /api/scrape/run-dry`
- `GET /api/scrape/runs`

## Use existing modules

Use:

- `app/backend/app/db/postgres.py`
- `app/backend/app/db/supabase_client.py`
- `app/backend/app/core/auth.py`
- `app/backend/app/core/config.py`

## Product doctrine

- Database language = recruitment
- Frontend language may say exam
- Canonical keys = `recruitment_id`, `post_id`, `organization_id`
- Avoid `public.exams`