# Migration Reference — Eligibility and Scraper

The original implementation exists in another repository (UI-career-copilot).

Those files are NOT directly runnable here and should NOT be imported into Python runtime.

They should be used as logic references.

## Eligibility reference

Original files:

- `lib/eligibility/engine.ts`
- `lib/eligibility/runner.ts`
- `actions/eligibility.ts`
- `app/api/eligibility/recompute/route.ts`

Target implementation (Python):

- `backend/app/eligibility/schemas.py`
- `backend/app/eligibility/engine.py`
- `backend/app/eligibility/runner.py`
- `backend/app/api/eligibility.py`

## Scraper reference

Original files:

- `lib/scraping/extractor.ts`
- `lib/scraping/alerts.ts`

Target implementation (Python):

- `backend/app/scraping/fetcher.py`
- `backend/app/scraping/extractor.py`
- `backend/app/scraping/normalizer.py`
- `backend/app/scraping/runner.py`
- `backend/app/api/sources.py`
- `backend/app/api/scrape.py`

## Key rules

- Eligibility must be deterministic
- Scraper must not publish directly without review
- AI extraction must not fabricate data
- Maintain recruitment → post → criteria structure

## When to use

- Phase 2 only
- After Phase 1 UI and routing is stable
