# Supabase Migrations — Summary for Emergent

The canonical database schema lives in Supabase migrations under:

- `supabase/migrations/` (outside `/app` in the full repo)

Since those files may not be visible in the `/app` workspace, this file summarizes their intent.

## Core tables (expected)

- `organizations`
- `recruitments`
- `posts`
- `age_criteria`
- `education_criteria`
- `attempt_limits`
- `eligibility_results`
- `profiles`
- `source_registry`
- `scrape_runs`
- `scrape_queue`
- `notification_alerts`

## Important notes

- Do NOT introduce `public.exams`.
- Recruitment is the canonical entity.
- Eligibility results are stored, not computed on every request.
- Scraper writes to queue first, not directly to canonical tables.

## Migration constraints

Some migrations depend on earlier schema state and may fail if run blindly.

If you need schema definitions:

- Inspect tables via Supabase dashboard
- Or request explicit schema definitions from user

Do NOT assume schema from scratch.

## Phase usage

- Phase 1: do not modify migrations
- Phase 2: integrate eligibility + scraper with existing schema
