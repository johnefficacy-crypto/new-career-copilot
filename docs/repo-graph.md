# Repository Graph

Generated from `D:\GovtExamAgent\ccp-mainbuild-v1` on 2026-05-11.

## Top-Level Runtime Map

```mermaid
flowchart LR
  User["Browser user"] --> Frontend["app/frontend<br/>React app"]
  Admin["Admin user"] --> AdminConsole["Admin console<br/>src/pages/admin"]
  Frontend --> ApiClient["src/lib/api.js"]
  AdminConsole --> ApiClient
  ApiClient --> Backend["app/backend<br/>FastAPI services"]
  Backend --> SupabaseClient["app/backend/app/db<br/>Supabase clients + helpers"]
  SupabaseClient --> Supabase["app/supabase<br/>schema, migrations, config"]
  Backend --> Scheduler["notifications/scheduler.py"]
  Scheduler --> Notifications["notifications<br/>dispatcher, next actions, recompute"]
  Backend --> Scraping["scraping<br/>extract, normalize, dedupe, promote"]
  Scraping --> Queues["queues<br/>priority helpers"]
  Backend --> Eligibility["eligibility<br/>engine, runner, schemas"]
  Eligibility --> Profile["profile<br/>eligibility mapper/profile"]
```

## Frontend Module Graph

```mermaid
flowchart TD
  Entry["src/index.js"] --> Providers["AuthProvider<br/>ToastProvider<br/>QueryClientProvider"]
  Providers --> App["src/App.js"]
  App --> PublicRoutes["routes/publicRoutes.jsx"]
  App --> AppRoutes["routes/appRoutes.jsx"]
  App --> AdminRoutes["routes/adminRoutes.jsx"]

  PublicRoutes --> PublicPages["pages/auth + Landing"]
  AppRoutes --> DashShell["pages/DashShell.jsx"]
  DashShell --> AppPages["pages<br/>Dashboard, Exams, Study, Community, Marketplace"]
  AppPages --> AppFeatures["features<br/>dashboard, notifications, onboarding, profile"]

  AdminRoutes --> AdminShell["pages/admin/AdminShell.jsx"]
  AdminShell --> AdminPages["admin pages<br/>Overview, Sources, Scraper, Plans, RBAC, Audit"]
  AdminPages --> AdminFeatures["features/admin<br/>eligibility, organizations, recruitments, sources, shared"]

  AppPages --> SharedUI["shared/ui<br/>tables, badges, fields, toasts, states"]
  AdminPages --> SharedUI
  AppFeatures --> SharedUI
  AdminFeatures --> SharedUI
  SharedUI --> Forms["shared/forms"]
  SharedUI --> A11y["shared/a11y"]

  AppPages --> Services["services"]
  Services --> Api["lib/api.js"]
  AdminPages --> Api
  AppFeatures --> Api
```

## Admin UX Graph

```mermaid
flowchart TD
  AdminShell["AdminShell.jsx<br/>sidebar + top frame"] --> Overview["Overview.jsx"]
  AdminShell --> RBAC["RBAC.jsx<br/>search/filter/sort users"]
  AdminShell --> Plans["Plans.jsx<br/>plan cards + editor drawer"]
  AdminShell --> Sources["Sources.jsx<br/>source registry"]
  AdminShell --> Scraper["Scraper.jsx<br/>queue trust review"]
  AdminShell --> Recruitments["Recruitments.jsx<br/>trust actions + edit panels"]
  AdminShell --> Organizations["Organizations.jsx<br/>organization edit panels"]
  AdminShell --> Eligibility["EligibilityQueue.jsx<br/>review drawer"]
  AdminShell --> Notifications["Notifications.jsx"]
  AdminShell --> Audit["Audit.jsx"]

  RBAC --> Toasts["ToastProvider.jsx"]
  Plans --> Toasts
  Eligibility --> AdminAction["features/admin/shared/useAdminAction.js"]
  AdminAction --> Toasts
  Recruitments --> RecruitmentEdit["features/admin/recruitments/RecruitmentEditPanel.jsx"]
  Organizations --> OrganizationEdit["features/admin/organizations/OrganizationEditPanel.jsx"]
  Eligibility --> EligibilityDrawer["features/admin/eligibility/EligibilityReviewDrawer.jsx"]
  Sources --> SourceBadge["features/admin/sources/SourceHealthBadge.jsx"]
```

## Backend Module Graph

```mermaid
flowchart TD
  Server["server.py"] --> ApiPackage["app/api"]
  Server --> Core["app/core<br/>auth, config, errors"]
  ApiPackage --> DB["app/db<br/>supabase_client, postgres, utils"]
  ApiPackage --> Models["app/models"]
  ApiPackage --> Services["app/services"]

  ApiPackage --> Eligibility["app/eligibility"]
  Eligibility --> EligibilityEngine["engine.py"]
  Eligibility --> EligibilityRunner["runner.py"]
  EligibilityRunner --> Profile["app/profile"]
  EligibilityRunner --> DB

  ApiPackage --> Scraping["app/scraping"]
  Scraping --> Extractor["extractor.py"]
  Scraping --> Normalizer["normalizer.py"]
  Scraping --> Dedup["dedup.py"]
  Scraping --> Runner["runner.py"]
  Runner --> Aggregator["aggregator.py"]
  Runner --> Sources["sources.py"]
  Runner --> DB

  ApiPackage --> Notifications["app/notifications"]
  Notifications --> Dispatcher["dispatcher.py"]
  Notifications --> NextActions["next_actions.py"]
  Notifications --> RecomputeWorker["recompute_worker.py"]
  Notifications --> Scheduler["scheduler.py"]
  RecomputeWorker --> EligibilityRunner
  Scheduler --> Dispatcher
  Scheduler --> RecomputeWorker
```

## Data And Deployment Assets

```mermaid
flowchart LR
  SupabaseDir["app/supabase"] --> Config["config.toml"]
  SupabaseDir --> Migrations["migrations / schema assets"]
  Docs["docs"] --> Architecture["admin, engineering, schema, product docs"]
  Scripts["scripts"] --> Validation["validation / repo automation"]
  Tests["app/backend/tests"] --> Backend["app/backend"]
```

## Hotspots

- Admin UX is centered on `app/frontend/src/pages/admin/AdminShell.jsx` and `app/frontend/src/routes/adminRoutes.jsx`.
- Shared admin feedback currently flows through `app/frontend/src/shared/ui/ToastProvider.jsx` and `app/frontend/src/features/admin/shared/useAdminAction.js`.
- Recruitment trust and scraping behavior spans `app/frontend/src/pages/admin/Scraper.jsx`, `app/frontend/src/pages/admin/Recruitments.jsx`, and `app/backend/app/scraping`.
- Eligibility behavior spans frontend review drawers in `app/frontend/src/features/admin/eligibility` and backend verdict logic in `app/backend/app/eligibility`.
