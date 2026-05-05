# Migration Reference Files

This folder contains source references copied from the older `UI-career-copilot` repo.

These files are NOT active runtime code.

They exist so Emergent and other AI/code agents can port the old Career Copilot logic into the new FastAPI + React commercial build.

## Target architecture

Active backend code must be implemented in Python/FastAPI under:

- `app/backend/app/eligibility/`
- `app/backend/app/scraping/`
- `app/backend/app/api/`

Do not import or execute the old TypeScript files directly.

## Eligibility migration target

Source reference:

- `eligibility/old-engine.ts`
- `eligibility/old-runner.ts`
- `eligibility/old-eligibility-action.ts`
- `eligibility/old-recompute-route.ts`

Target files:

- `app/backend/app/eligibility/schemas.py`
- `app/backend/app/eligibility/engine.py`
- `app/backend/app/eligibility/runner.py`
- `app/backend/app/api/eligibility.py`

Rules:

- Eligibility must be deterministic.
- Backend owns eligibility.
- AI must not override eligibility verdicts.
- Preserve conditional eligibility logic.
- Preserve category/PwBD/ex-serviceman/domicile/attempt/exam-credential checks.
- Use `recruitments`, `posts`, `organizations`; do not create `public.exams`.

## Scraper migration target

Source reference:

- `scraping/old-extractor.ts`
- `scraping/old-alerts.ts`

Target files:

- `app/backend/app/scraping/fetcher.py`
- `app/backend/app/scraping/extractor.py`
- `app/backend/app/scraping/normalizer.py`
- `app/backend/app/scraping/runner.py`
- `app/backend/app/api/sources.py`
- `app/backend/app/api/scrape.py`

Rules:

- Scraper reads from `source_registry`.
- Scraper output goes to review/queue first.
- Do not publish scraped data directly as canonical official truth.
- AI extraction can parse text but must not fabricate missing fields.
- Promotion to canonical `recruitments/posts` should be admin/trust gated.