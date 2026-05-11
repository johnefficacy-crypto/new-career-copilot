# Graphify Report

Generated for `D:\GovtExamAgent\ccp-mainbuild-v1` on 2026-05-11.

## Status

- `graphify`  is configured for this repository through `AGENTS.md` and Codex hooks.
- During this report generation, the local `graphify` executable was not available on PATH.
- This report and companion graph files were generated as a fallback from repository layout and major import relationships.
- Full Graphify wiki output should be added under `graphify-out/wiki/` when generated locally.

## God Nodes

- `app/frontend/src/index.js`: frontend provider root.
- `app/frontend/src/App.js`: route composition root.
- `app/frontend/src/routes/adminRoutes.jsx`: admin route registry.
- `app/frontend/src/pages/admin/AdminShell.jsx`: admin console shell.
- `app/frontend/src/shared/ui/index.js`: shared UI export surface.
- `app/frontend/src/lib/api.js`: frontend API boundary.
- `app/backend/server.py`: backend entry point.
- `app/backend/app/db/supabase_client.py`: Supabase client boundary.
- `app/backend/app/db/utils.py`: backend database helper boundary.
- `app/backend/app/eligibility/runner.py`: eligibility execution coordinator.
- `app/backend/app/scraping/runner.py`: scraping and promotion coordinator.
- `app/backend/app/notifications/scheduler.py`: background notification scheduler.

## Community Structure

### Frontend Runtime

`src/index.js` wraps the app with React Query, routing, auth, and toast providers. `src/App.js` composes public, authenticated app, and admin route groups.

### Admin Console

`src/pages/admin/AdminShell.jsx` owns the admin sidebar/top-level shell. Admin screens are registered in `src/routes/adminRoutes.jsx` and share primitives from `src/shared/ui` plus admin-specific components under `src/features/admin`.

### Shared Frontend Infrastructure

`src/shared/ui` contains shared tables, badges, toasts, form fields, loading and empty/error states. `src/shared/forms`, `src/shared/a11y`, `src/shared/api`, and `src/shared/config` provide supporting helpers.

### Backend Core

`app/backend/server.py` wires the backend. `app/core` contains auth, settings, and domain errors. `app/db` owns Supabase and Postgres access helpers.

### Eligibility

`app/eligibility` contains schemas, engine, runner, and recompute queue. It depends on `app/profile` to map user data into eligibility profiles and on `app/db` for persistence.

### Scraping And Trust Pipeline

`app/scraping` contains source normalization, extraction, aggregation, dedupe, trust signals, runner orchestration, and alert helpers. It feeds admin review surfaces in the frontend.

### Notifications

`app/notifications` contains dispatcher, scheduler, next-actions generation, and recompute worker. The recompute worker calls the eligibility runner.

## Cross-File Relationships

- Admin pages call `src/lib/api.js`, render inside `AdminShell.jsx`, and reuse `src/shared/ui`.
- `features/admin/shared/useAdminAction.js` centralizes admin mutation feedback through `ToastProvider.jsx`.
- `pages/admin/Recruitments.jsx` uses `features/admin/recruitments/RecruitmentEditPanel.jsx` and trust actions.
- `pages/admin/Organizations.jsx` uses `features/admin/organizations/OrganizationEditPanel.jsx`.
- `pages/admin/EligibilityQueue.jsx` uses `features/admin/eligibility/EligibilityReviewDrawer.jsx`.
- Backend notification recompute calls eligibility runner.
- Backend scraping runner depends on extractor, normalizer, dedupe, source registry, aggregator, common string/time helpers, and DB utilities.

## Renderable Graphs

- Mermaid source: `graphify-out/repo-graph.mmd`
- JSON edge list: `graphify-out/repo-graph.json`
- Human-readable copy: `docs/repo-graph.md`

