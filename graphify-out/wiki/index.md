# Graph Wiki

This is the repository graph wiki entry point for `ccp-mainbuild-v1`.

## Status

Graphify is configured for this repository.

Current committed graph artifacts:

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/repo-graph.mmd`
- `graphify-out/repo-graph.json`
- `docs/repo-graph.md`

This wiki should be replaced by the real generated Graphify wiki when `graphify update .` produces `graphify-out/wiki/`.

## Main Knowledge Areas

### Frontend Runtime

Key files:

- `app/frontend/src/index.js`
- `app/frontend/src/App.js`
- `app/frontend/src/routes/publicRoutes.jsx`
- `app/frontend/src/routes/appRoutes.jsx`
- `app/frontend/src/routes/adminRoutes.jsx`
- `app/frontend/src/lib/api.js`

### Admin Console

Key files:

- `app/frontend/src/pages/admin/AdminShell.jsx`
- `app/frontend/src/pages/admin/Scraper.jsx`
- `app/frontend/src/pages/admin/Recruitments.jsx`
- `app/frontend/src/pages/admin/EligibilityQueue.jsx`
- `app/frontend/src/features/admin/shared/useAdminAction.js`
- `app/frontend/src/shared/ui/ToastProvider.jsx`

### Scraper And Trust Pipeline

Key files:

- `app/backend/app/scraping/runner.py`
- `app/backend/app/scraping/extractor.py`
- `app/backend/app/scraping/normalizer.py`
- `app/backend/app/scraping/dedup.py`
- `app/backend/app/scraping/sources.py`

Flow:

```text
sources
→ scrape_runs
→ scrape_queue
→ admin review
→ recruitments/posts/criteria
→ eligibility recompute
→ notifications/alerts