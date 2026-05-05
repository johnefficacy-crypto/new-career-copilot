# Career Copilot implementation status checklist
_Last updated: 2026-05-03 — light-theme migration phases 1-2 landed; scraper trust hardening in progress_

This file is the single source of truth for implementation status and next build decisions.
Legend:
- Priority: P0 = block release / trust / correctness, P1 = next sprint, P2 = strategic follow-up
- Effort: S = <=1 day, M = 2-4 days, L = 1+ weeks
- Owner: frontend / backend / infra / ops / AI / QA
- Status: [ ] not started, [~] in progress, [x] done


## Sprint 8 trust-redesign progress (2026-05-01)

- [x] Removed `/demo/*` prototype routes after decommissioning prototype surface from mainline; production routing now relies only on canonical public/dashboard/admin paths.
- [x] Added auth integration tests covering callback redirect sanitization, first-login profile row bootstrap, sign-in redirect sanitization, and sign-out onboarding cookie cleanup invariants.
- [x] Mission-control feed now reads canonical `last_eligibility_computed_at` plus official/source URLs from `user_exam_summary` to backfill real `lastComputedAt` and deterministic evidence references.
- [x] Critical admin-action audit observability added: non-blocking audit writes now return success, and critical action audit failures emit error logs plus optional webhook alert via `ADMIN_ALERT_WEBHOOK_URL`.
- [x] Mission-control cards now surface deterministic evidence references and `last computed` metadata placeholder for explicit explainability affordance.
- [x] Admin unauthorized access now routes to explicit `/access-denied` experience instead of silent dashboard fallback redirect.
- [x] Mission-control data contract expanded with deterministic status fallback (`eligible`/`conditional`/`ineligible`/`needs_profile_data`/`not_computed`) and structured explanation payload plumbing from summary view fields.
- [x] Auth sign-out now clears onboarding session cookie in canonical auth action module to prevent stale onboarding state after logout.
- [x] Route-truth hardening pass: root shell navigation now points to canonical surfaces (`/pricing`, `/forum`, `/marketplace`, `/dashboard`) and legacy prototype roots (`/today`, `/exams`, `/study`, `/profile`, `/community`) now redirect to auth intent or dashboard/forum destinations to avoid volatile AppContext-only UX in production.
- [x] Auth action consolidation: `app/auth/actions.ts` now delegates to canonical `actions/auth.ts` to prevent signup/login drift across profile bootstrapping and redirect-safety behavior.
- [x] Admin navigation visibility is now permission-aware using role bucket checks (`hasAdminPermission`) so admins only see sections aligned with their RBAC grants.

- [x] Fixed Google OAuth sign-in entrypoint mismatch by adding canonical `/api/auth/google` route and retaining `/api/google` compatibility redirect to prevent broken login handoff from auth UI.

- [x] Fixed eligibility alert upsert behavior in shared runner so `new_match` alerts refresh deterministically on recompute (no duplicate-ignore path that could preserve stale explanation/state).
- [x] Migrated app foundation and dashboard shell to light theme tokens (`app/layout.tsx`, `app/globals.css`, `components/dashboard/DashboardShell.tsx`, `components/dashboard/DashboardNav.tsx`) while preserving existing data flow and governance constraints.
- [x] Fixed `050_community_foundation.sql` enum type creation for broader Postgres compatibility by replacing `create type if not exists` with guarded `DO $$` blocks.
- [x] Made `049_marketplace_setup.sql` idempotent for legacy replay by dropping/recreating marketplace RLS policies before `CREATE POLICY` statements (prevents duplicate-policy failures such as `Public reads published courses`).
- [x] Hardened migration idempotency for legacy replay: `020_ai_infrastructure.sql` now drops/recreates RLS policies (`user_next_actions_own`, `study_tasks_own`, `study_sessions_own`) to avoid duplicate-policy failure on partially provisioned environments.
- [x] Replaced user-facing `new_match` label copy with `Confirmed match` in dashboard bell and notifications list.
- [x] Removed `ProfileCard` from main dashboard shell sidebar to reduce duplicate profile surfaces.
- [x] Fixed `profileBlockers` summary computation to count `needs_profile_data` instead of mirroring `conditional`.
- [x] Updated profile-impact onboarding links to route-specific paths (`/onboarding/identity`, `/onboarding/education`) for deterministic CTAs.
- [x] Replaced static `StatsBar` with collapsible `LiveStatsBar` (collapsed by default, localStorage persistence, mobile defaults to collapsed).
- [x] Added Sprint 8 notification grouping foundation: `notification_group_state` migration + grouped notification read path with fallback for non-migrated environments.
- [x] Added `GET /api/dashboard/live-summary` to expose Sprint 8 LiveStats summary shape for API consumers.
- [x] Added notification feedback capture foundation: migration + `submitRecruitmentFeedback` action + user-facing "Report issue" control on notifications cards.
- [x] Added admin recruitment feedback queue (`/admin/recruitment-feedback`) with resolve/reject workflow and `logAdminAction('resolve_feedback', ...)` audit logging.
- [x] Added deadline-status derivation utility and surfaced explicit closed/open status hint in notifications cards.
- [x] Extended profile-impact missing-field routing to include exam credentials (`/onboarding/exam-credentials`).
- [x] Added `/onboarding/exam-credentials` step + save action + `aspirant_exam_credentials` persistence migration.
- [x] Wired notification explanation flags `matched_exam` / `matched_sector` to user preferences + recruitment metadata (removed hardcoded false TODO).
- [x] Published aspirant-centered platform strategy for forum, exam planning, productivity, community, marketplace, AI assistant/chat, and resource governance (`docs/product/aspirant-platform-strategy.md`).
- [x] Replaced static `StatsBar` with collapsible `LiveStatsBar` (collapsed by default, localStorage persistence, mobile defaults to collapsed).
- [x] Added dashboard `Today's priorities` deterministic orchestration block combining deadlines, profile blockers/confidence labels, and active study tasks.
- [x] Rebased top-level App Router shell and core aspirant routes (`/today`, `/exams`, `/study`, `/community`, `/marketplace`, `/profile`) to match `_prototype` baseline for UX restructuring.


- [x] Completed full codebase UI audit and prioritized action plan (`docs/operations/ui-audit-2026-05-03.md`).

- [x] Implemented UI-audit P0 shell hardening: root navigation moved from inline styles to tokenized classes and global focus-visible ring standardization (`app/layout.tsx`, `app/globals.css`).

- [x] Added automated root-shell accessibility smoke coverage (skip-link + nav landmark + main landmark assertions) in Vitest (`lib/ui/__tests__/root-layout.a11y-smoke.test.tsx`).
- [x] Added shared responsive UI baseline polish across global surfaces (control typography/inputs, media scaling, card overflow handling, and tighter mobile paddings) to reduce cross-screen layout regressions (`app/globals.css`).

- [x] Published UI pattern map for P1 standardization (`docs/engineering/ui-pattern-map.md`) covering shell patterns, primitive usage, accessibility baseline, and migration policy.

- [x] Simplified admin shell and overview UI to left-side panel style and converted landing (`/`) to matching left-panel structure for consistent light UI baseline (`app/admin/layout.tsx`, `app/admin/page.tsx`, `app/page.tsx`).
- [x] Replaced landing-page static recruitment preview with database-backed `public.recruitments` feed and reusable list component (`lib/db/landing.ts`, `components/landing/LandingRecruitmentList.tsx`, `app/page.tsx`).

- [x] Migrated `/admin/control-support` from legacy dark styling to the light admin surface pattern and added quick-action links for queue triage consistency (`app/admin/control-support/page.tsx`).
- [x] Replaced `/dashboard/community` preview shell with live forum-powered community hub (exam-space links, latest threads, and actionable resource-sharing guidance) to restore user-facing community functionality.

- [x] Fixed `/api/exams/summary` to query canonical `user_exam_summary` view and map recruitment-backed fields (removed stale `exam_user_summary`/`exam_id` assumptions).
- [x] Modernized the public landing experience with a refreshed light-theme hero, trust metrics panel, and upgraded card/navigation styling while preserving canonical recruitment feed wiring (`app/page.tsx`).

## Stakeholder control-support review (2026-05-02)

This review captures control-support tooling required for primary stakeholders and maps current gaps to delivery priorities.

### Aspirants

- [x] Execution control tools are operational: mission-control dashboard, exam summary, apply tracker, focus timer, mock tests, weekly review.
- [ ] Deterministic-to-human eligibility explanation layer with provenance (required for trust and appeals).
- [ ] Tracker next-actions integration (users need deterministic “what to do next” guidance by status).

### Managers / Ops

- [x] Core governance surfaces are operational: RBAC manager, audit viewer, eligibility queue monitor, notifications governance console.
- [ ] SLA-focused control dashboard (queue backlog age, retry spikes, stale alerts, failed sends, pending approvals).
- [ ] Incident timeline/export view for handoffs and compliance evidence.

### Admin governance owners

- [x] Permission-bucket model and server-side enforcement pattern are established.
- [ ] Source verification console remains a release-critical control gap (redirect/domain/content-type/suspicious change checks).
- [ ] Recruitment publish gate validation remains a release-critical control gap (org verification + required-field completeness + provenance gates).

### Community moderators (Phase 8+)

- [ ] `/admin/community` moderation queue with report triage and reversible hide actions.
- [ ] Mentor verification workflow and badge governance controls.
- [ ] Resource copyright/DMCA moderation workflow before public library scale-out.

### Priority order reaffirmed

1. P0: source verification console + publish gate validation + incident-ready audit exports.
2. P1: aspirant explanation layer + tracker next-actions.
3. P1/P2: community moderation and mentor/resource trust controls.

Strategic rule remains unchanged: `Trust > Speed`, `Control > Automation`, `Determinism > Heuristics`.

## P0 release blockers

- [x] Drop legacy blind-notification trigger and enforce engine-only alert creation
  - Effort: S
  - Owner: backend
  - Paths:
    - `supabase/migrations/022_drop_legacy_recruitment_open_trigger.sql` ✓ created
    - `supabase/migrations/scraping_setup.sql` (reference only; do not edit historical migration)
    - `lib/db/notifications.ts`
  - Suggested PR title: `fix(db): remove legacy recruitment-open trigger and enforce engine-only alerts`

- [x] Tighten service-role RLS policies for notification preferences, alerts, and audit log
  - Effort: S
  - Owner: backend
  - Paths:
    - `supabase/migrations/023_fix_service_role_policies.sql` ✓ created
    - `supabase/migrations/014_notification_preferences.sql` (reference only)
    - `supabase/migrations/019_admin_rbac_audit.sql` (reference only)
  - Suggested PR title: `fix(rls): restrict service policies to service_role and narrow admin access`

- [x] Fix email dispatcher to read from feed view and derive subject/body
  - Effort: S
  - Owner: backend
  - Paths:
    - `supabase/functions/email-dispatcher/index.ts` ✓ FeedRow type + buildSubject/buildBody added; query switched to v_notification_feed
    - `types/notifications.ts`
  - Suggested PR title: `fix(email): read notification feed view and derive email copy safely`

- [x] Make eligibility queue claiming atomic and add retry metadata
  - Effort: M
  - Owner: backend
  - Paths:
    - `supabase/migrations/024_claim_eligibility_queue_rpc.sql` ✓ created
    - `supabase/functions/eligibility-consumer/index.ts` ✓ uses claim_eligibility_queue RPC + exponential backoff
  - Suggested PR title: `fix(queue): atomically claim eligibility jobs with retry fields`

- [x] Make recruitment promotion transactional
  - Effort: M
  - Owner: backend
  - Paths:
    - `supabase/migrations/025_admin_promote_recruitment_payload.sql` ✓ created
    - Wire `admin_promote_recruitment_payload` RPC into `approveScrapeItem` / `promoteToRecruitments` callers
  - Suggested PR title: `fix(scraper): promote approved scrape payloads transactionally`

- [x] Update notification upsert behavior so alert state stays current
  - Effort: M
  - Owner: backend
  - Paths:
    - `supabase/migrations/026_notification_alert_state_uniqueness.sql` ✓ created
    - `lib/db/notifications.ts` ✓ upsertNotificationAlerts() added
    - Wire `upsertNotificationAlerts` into `runEligibilityForUser` callers
  - Suggested PR title: `fix(alerts): upsert current alert state instead of ignoring duplicates`

- [x] Replace boolean admin checks in source actions with permission-based RBAC
  - Effort: S
  - Owner: backend
  - Paths:
    - `actions/sources.ts` ✓ all guards replaced with requireAdminRole("sources")
    - `lib/db/admin.ts`
  - Suggested PR title: `fix(admin): use requireAdminRole for source actions`

- [x] Block confidence-only auto-approval in legacy manual scraper path
  - Effort: S
  - Owner: backend
  - Paths:
    - `lib/scraping/runner.ts` ✓ status now always `pending` (no confidence-based `approved`)
  - Notes:
    - Admin evidence review remains mandatory before promotion.
  - Suggested PR title: `fix(scraper): disable confidence-based auto-approval in legacy runner`

- [x] Add aggregator official-host validation before queue-item promotion
  - Effort: S
  - Owner: backend
  - Paths:
    - `lib/db/notifications.ts` ✓ validation rejects aggregator items where `official_notification_url` host matches aggregator host
  - Notes:
    - Prevents treating aggregator/listing URLs as canonical official notifications.
  - Suggested PR title: `fix(scraper): require distinct official host for aggregator promotions`

- [x] Add explicit official-source resolution flags for scrape queue rows
  - Effort: S
  - Owner: backend
  - Paths:
    - `supabase/migrations/043_aggregator_official_source_gate.sql` ✓ created
    - `supabase/functions/scheduled-scraper/index.ts` ✓ writes `official_source_resolved` + `official_source_host`
    - `lib/db/notifications.ts` ✓ promotion validator blocks rows where `official_source_resolved=false`
  - Notes:
    - Adds durable database-level state instead of relying only on inline hostname checks.
  - Suggested PR title: `feat(scraper): persist and enforce official-source resolution before promotion`

- [~] Move from queue-item approval to candidate-centric trusted promotion
  - Effort: L
  - Owner: backend + ops
  - Paths:
    - `supabase/migrations/044_aggregator_candidate_layers.sql` ✓ foundation tables created
    - `supabase/functions/scheduled-scraper/index.ts` ✓ writes candidate/listing observation rows
    - `lib/db/notifications.ts` ✓ `approveCandidate()` delegates to validated queue promotion path
    - `actions/notifications.ts` ✓ `adminApproveCandidate` server action added for admin workflows
    - `lib/eligibility/runner.ts` (pending) — no trust-state filter yet
  - Notes:
    - Current pipeline is safer than before but still partial: candidate workflow + eligibility trust gating remain required before declaring trusted ingestion complete.
  - Suggested PR title: `feat(scraper): complete candidate-centric promotion and eligibility trust gating`


- [x] Full RBAC enforcement — replace is_admin checks across all admin routes and actions
  - Effort: M
  - Owner: backend
  - Paths:
    - `app/admin/eligibility/page.tsx` ✓ requireAdminRole("eligibility")
    - `app/admin/organizations/page.tsx` ✓ requireAdminRole("organizations")
    - `app/admin/recruitments/page.tsx` ✓ requireAdminRole("recruitments")
    - `app/admin/scrape/page.tsx` ✓ requireAdminRole("scraper")
    - `app/admin/sources/page.tsx` ✓ requireAdminRole("sources")
    - `app/admin/sources/guide/page.tsx` ✓ requireAdminRole("sources")
    - `actions/inspect-source.ts` ✓ local requireAdmin() replaced with imported requireAdminRole("sources")
  - Suggested PR title: `fix(rbac): enforce requireAdminRole across all admin routes and actions`

- [x] Add telemetry tables and event ingestion endpoint
  - Effort: M
  - Owner: backend + frontend
  - Paths:
    - `supabase/migrations/027_user_events_and_form_submissions.sql` ✓ created
    - `app/api/events/route.ts` ✓ created
  - Notes:
    - Telemetry must run before `user_recruitment_state` because the materialized view depends on `public.user_events`.
  - Suggested PR title: `feat(telemetry): add user event pipeline for ranking and UX signals`

- [x] Ship mission-control dashboard v1 on top of a unified user_recruitment_state view
  - Effort: L
  - Owner: frontend + backend
  - Paths:
    - `supabase/migrations/028_user_recruitment_state.sql` ✓ created
    - `lib/db/mission-control.ts` ✓ server-side data fetcher
    - `app/api/dashboard/mission-control/route.ts` ✓ REST API
    - `components/dashboard/MissionControlPanel.tsx` ✓ summary cards + tabs + opportunity feed
    - `app/dashboard/page.tsx` ✓ wired — getMissionControlData in parallel fetch
    - `components/dashboard/DashboardShell.tsx` ✓ EligibleRecruitmentsWidget replaced
  - Notes:
    - Depends on `public.user_events`; keep this after telemetry migrations.
  - Suggested PR title: `feat(dashboard): launch mission-control dashboard powered by user state view`

- [x] Launch notification preferences page before broad email rollout
  - Effort: M
  - Owner: frontend
  - Paths:
    - `app/api/notifications/preferences/route.ts` ✓ GET + POST created
    - `app/dashboard/notifications/preferences/page.tsx` ✓ UI page created (Sprint 1)
  - Suggested PR title: `feat(notifications): add user preferences page and save API`

- [x] Add minimum CI gate for lint, typecheck, tests, and Supabase DB lint
  - Effort: S
  - Owner: infra + QA
  - Paths:
    - `.github/workflows/ci.yml` ✓ created
  - Suggested PR title: `ci: add app and database verification gates`

## P1 next sprint

- [x] Redesign recruitment detail page around actionability and explanation
  - Effort: L
  - Owner: frontend
  - Paths:
    - `app/dashboard/recruitments/[id]/page.tsx` ✓ Timeline wired
    - `components/recruitments/StatusPanel.tsx` ✓ created
    - `components/recruitments/Timeline.tsx` ✓ created — 5-stage visual timeline with live/done/upcoming states
  - Suggested PR title: `feat(recruitments): redesign detail page with status, evidence, and timeline`

- [x] Add profile impact module to show fields that unlock more opportunities
  - Effort: M
  - Owner: frontend + backend
  - Paths:
    - `app/api/dashboard/profile-impact/route.ts` ✓ created — returns missing fields + estimated impact count
    - `components/dashboard/ProfileImpactCard.tsx` ✓ created — progress ring + impact rows wired into DashboardShell
  - Suggested PR title: `feat(profile): show missing fields and unlock impact`

- [x] Upgrade exams page from official-URL-only view to summary cards
  - Effort: L
  - Owner: frontend + backend
  - Paths:
    - `app/dashboard/exams/page.tsx` ✓ wired to user_exam_summary view with eligibility badges; falls back to exam_summary if view has no rows
    - `app/api/exams/summary/route.ts` ✓ created
    - `supabase/migrations/029_exam_summary_support.sql` ✓ created
    - `lib/exams/form-status.ts` ✓ created
  - Notes:
    - `exam` is a UI/product term. Database queries must use `public.recruitments` and `recruitment_id`; do not assume `public.exams` exists.
    - See `docs/database-domain-model.md`.
  - Suggested PR title: `feat(exams): add personalized exam summary cards and fit states`

- [x] Launch notification preferences page before broad email rollout
  - Effort: M
  - Owner: frontend
  - Paths:
    - `app/api/notifications/preferences/route.ts` ✓ GET + POST created
    - `app/dashboard/notifications/preferences/page.tsx` ✓ created — email/in-app toggles, digest frequency, quiet hours, DPDP compliance note
  - Suggested PR title: `feat(notifications): add user preferences page and save API`

- [x] Add admin tools: source registry UI, queue monitor, scraper monitor, audit viewer, RBAC manager, notification governance
  - Effort: L
  - Owner: frontend + backend + ops
  - Paths:
    - `app/admin/sources/page.tsx` ✓ existing
    - `app/admin/scrape/page.tsx` ✓ existing
    - `app/admin/eligibility-queue/page.tsx` ✓ created (Sprint 2) — status tabs, paginated table, retry/error columns
    - `app/admin/audit/page.tsx` ✓ created (Sprint 2) — entity-type tabs, action color coding
    - `app/admin/rbac/page.tsx` ✓ created (Sprint 2) — super_admin role management
    - `app/admin/notifications/page.tsx` ✓ created (Sprint 3) — send logs, emergency kill switch, stat counts
    - `supabase/migrations/032_admin_settings.sql` ✓ created — key-value store for operational flags
    - `actions/admin.ts` ✓ adminUpdateAdminRole + toggleKillSwitch
    - `app/admin/layout.tsx` ✓ all pages in sidebar nav
    - `app/admin/page.tsx` ✓ quick links for all new pages
  - Suggested PR title: `feat(admin): add operational control surfaces for sources, queues, audit, and notifications`

- [x] Refresh README and docs to match real product and release criteria
  - Effort: S
  - Owner: ops
  - Paths:
    - `README.md`
    - `docs/operations/implementation-checklist.md`
    - `docs/engineering/domain-model.md` ✓ canonicalized
    - `docs/operations/runbook.md` ✓ canonicalized
  - Suggested PR title: `docs: align repo documentation with current implementation and ops`


## Sprint 8 execution plan (next practical order)

- [~] Phase A — Trust/documentation alignment
  - Owner: ops + frontend
  - Scope:
    - Align top-level docs with current phase state and governance baseline
    - Keep implementation checklist and feature registry as current truth
- [ ] Phase B — Community foundation (Phase 8)
  - Owner: frontend + backend + ops
  - Scope:
    - `community_spaces`, `community_channels`, `community_threads`, `community_replies`, `community_votes`, `community_reports`
    - `/admin/community` moderation queue with RBAC + audit
    - In-app notification for thread replies
    - Enforce `official_updates` as admin-write only
- [ ] Phase C — AI hardening follow-up
  - Owner: AI + backend
  - Scope:
    - Deterministic-to-LLM explanation layer with provenance
    - `jobs/embeddings-sync.ts` to activate semantic retrieval pipeline

## P2 strategic follow-up

- [~] Add semantic search and embeddings for recruitments and exams
  - Effort: L
  - Owner: AI + backend
  - Paths:
    - `supabase/migrations/030_embeddings.sql` ✓ created (pgvector table + ivfflat index)
    - `jobs/embeddings-sync.ts` (pending — ETL sync job)
  - Notes:
    - Embeddings should use `recruitments` as the canonical entity. `exam` remains acceptable as a UI label.
  - Suggested PR title: `feat(ai): add vector embeddings for semantic retrieval`

- [~] Build aggregator discovery and candidate-merge data layers (trusted ingestion Phase 2 foundation)
  - Effort: M
  - Owner: backend
  - Paths:
    - `supabase/migrations/044_aggregator_candidate_layers.sql` ✓ created
    - `supabase/functions/scheduled-scraper/index.ts` ✓ writes `aggregator_listings`, `recruitment_candidates`, and `candidate_observations` for aggregator sources
  - Notes:
    - This establishes the data model and write-path foundation; admin review UX and promotion via candidates remain pending.
  - Suggested PR title: `feat(scraper): add aggregator listings and candidate observation layers`

- [x] Add ranking v1 using eligibility, urgency, and org trust
  - Effort: L
  - Owner: AI + backend
  - Paths:
    - `supabase/migrations/038_ranking_v1.sql` ✓ — v_recruitment_ranking view (Sprint 7)
    - `lib/ranking/ranking.ts` ✓ — getRankedRecruitments, getTopMatchScore helpers
  - Suggested PR title: `feat(ranking): prioritize opportunities by fit, urgency, and behavior`

- [ ] Add deterministic-to-LLM explanation layer with provenance
  - Effort: M
  - Owner: AI + backend
  - Paths:
    - `lib/explanations/*` (new)
    - `app/api/explanations/route.ts` (new)
  - Suggested PR title: `feat(ai): generate human-friendly eligibility explanations with provenance`

- [x] Add apply tracker and saved/apply lifecycle
  - Effort: M
  - Owner: frontend + backend
  - Paths:
    - `supabase/migrations/031_apply_tracker.sql` ✓ created — user_recruitment_applications table, RLS, enum
    - `lib/db/apply-tracker.ts` ✓ created — getUserApplications, getApplication, upsertApplication helpers
    - `actions/apply-tracker.ts` ✓ created — updateApplicationStatus, updateApplicationDetails server actions
    - `app/dashboard/tracker/page.tsx` ✓ created — filter tabs, status cards with inline status selector
    - `app/dashboard/recruitments/[id]/page.tsx` ✓ apply tracker CTA + status selector added
    - `components/dashboard/DashboardNav.tsx` ✓ Tracker nav link added
    - `components/nav/UserNav.tsx` ✓ Application Tracker mobile nav item added
  - Notes:
    - clicked_apply in user_events is telemetry only; this table is durable product state.
  - Suggested PR title: `feat(tracker): add durable application tracker with status lifecycle`

- [ ] Expand marketplace filters and trust models
  - Effort: L
  - Owner: frontend + backend
  - Paths:
    - `[UNSPECIFIED] marketplace routes and schema`
  - Suggested PR title: `feat(marketplace): add trust-aware filters and personalized recommendations`
# Career Copilot — Implementation Status Checklist

_Last updated: 2026-04-29_

This checklist reflects the audited implementation state. It separates:

- route exists
- API exists
- UI exists
- permission enforced
- audit visible
- operationally hardened

Priority legend:

- P0 = blocks trust, release, or automation safety
- P1 = next sprint / operational hardening
- P2 = strategic product expansion

Status legend:

- [x] done
- [~] partial / exists but not hardened
- [ ] not implemented

## Governing rule

Career Copilot is an eligibility-first, recruitment-canonical system with human-supervised automation.

Automation expansion is blocked until these are complete:

1. Full RBAC enforcement
2. Admin audit viewer
3. Eligibility queue monitor

See `docs/admin_automation_strategy.md`.

---

## 1. Admin governance layer

### 1.1 RBAC

- [x] Roles defined: `super_admin`, `ops_admin`, `content_admin`, `scraper_admin`, `support_admin`
- [x] Permission buckets defined
- [x] `admin_audit_logs` table exists
- [x] `logAdminAction` utility exists
- [x] Full permission enforcement across all admin routes (Sprint 3)
- [x] Full permission enforcement across all admin server actions (Sprint 3)
- [x] Super-admin role management UI — `app/admin/rbac/page.tsx` ✓ (Sprint 5)
- [~] Legacy `is_admin` in admin layout guard (acceptable — layout-level check only)

Status: operational (Sprint 5).

P0 next tasks:

- Search `app`, `actions`, `lib`, and `components` for `is_admin` authorization checks.
- Replace admin route checks with `requireAdminRole(permission)`.
- Replace admin mutation checks with `requireAdminRole(permission)`.
- Hide UI actions based on permissions.

### 1.2 Audit viewer

- [x] Audit table exists
- [x] Logging utility exists
- [x] `/admin/audit` page — `app/admin/audit/page.tsx` ✓ (Sprint 5)
- [x] Filter by entity type (tab filters)
- [x] Payload JSON inspector (expandable `<details>` rows with before/after diff)
- [x] Pagination
- [ ] Export capability

Status: operational (Sprint 5).

---

## 2. Scraper and source operations

### 2.1 Source registry

- [x] Structured source metadata
- [x] Source health metadata
- [x] Trust score
- [x] Anti-bot risk tracking
- [x] Source registry page exists
- [~] Source actions partially permission guarded
- [ ] URL verification console
- [ ] Domain verification tool
- [ ] Redirect inspection
- [ ] Content-type detection
- [ ] Suspicious change detection
- [ ] Source testing sandbox

Status: operational but missing verification tooling.

### 2.2 Scrape dashboard

- [x] Queue pagination
- [x] Runs pagination
- [x] Source health snapshots
- [x] Stats overview
- [~] Evidence review exists for scrape queue items
- [ ] Anomaly detection
- [ ] Auto-throttle rules
- [ ] Policy-gated auto-approval

Status: operational, not automated-intelligent yet.

---

## 3. Recruitment management

- [x] Admin recruitment list
- [x] Scraper-origin visibility
- [x] Confidence indicators
- [x] Transactional promotion RPC exists
- [~] `admin_promote_recruitment_payload` wiring has been reported as implemented; verify on `master`
- [x] Formal workflow states: `draft`, `needs_review`, `verified`, `published`, `archived`, `withdrawn`
  - `supabase/migrations/033_recruitment_publish_workflow.sql` ✓ created
  - `actions/admin.ts` ✓ adminSubmitForReview, adminPublishRecruitment, adminWithdrawRecruitment added
  - `app/admin/recruitments/[id]/page.tsx` ✓ publish status panel + transition buttons added
  - `app/admin/recruitments/page.tsx` ✓ publish_status badge added to list rows
- [ ] Publish gate validation (org verified, fields complete)
- [ ] Version history
- [ ] Change diff viewer

Status: workflow states implemented; gate validation pending.

P1 next tasks:

- Add publishing workflow separate from recruitment lifecycle status.
- Require organization verification, provenance, field completeness, and reviewer permission before publish.

---

## 4. Organization admin

- [x] Admin route exists
- [x] Official domain field — `supabase/migrations/036_org_trust_fields.sql` ✓ (Sprint 5)
- [x] Trust classification — `trust_tier` enum: verified/trusted/unknown/unverified
- [x] `adminVerifyOrganization` server action — marks verified, logs audit
- [x] `adminUpdateOrganization` extended with domain/trust fields
- [ ] Duplicate merge tool
- [ ] Official domain whitelist
- [ ] Source count by organization

Status: trust fields implemented (Sprint 5).

---

## 5. Eligibility system

- [x] Deterministic eligibility engine exists
- [x] Eligibility recompute action exists
- [x] Admin route exists
- [x] Atomic eligibility queue claim RPC exists
- [x] `/admin/eligibility-queue` monitor — `app/admin/eligibility-queue/page.tsx` ✓ (Sprint 5)
- [x] Retry control UI (failed jobs show Retry button)
- [x] Status filter tabs + per-status counts
- [ ] Dead-letter view
- [ ] Rule version tracking
- [ ] Explanation inspector
- [ ] Failure diagnostics

Status: operational (Sprint 5).

P0 next tasks:

- Build eligibility queue monitor.
- Add retry and manual recompute actions.
- Audit-log all queue mutations.

---

## 6. Notifications

- [x] Notification preferences API exists
- [x] Notification preferences UI has been reported as implemented; verify on `master`
- [x] Email dispatcher exists
- [x] `upsertNotificationAlerts` helper exists
- [x] Notification template editor — `app/admin/notifications/templates/page.tsx` ✓ (Sprint 6)
  - `supabase/migrations/037_runbook_schema.sql` ✓ — notification_templates table + seeded defaults
  - Editable subject, body_text, body_html per template key
  - Variable placeholder chips
- [x] Send logs — `app/admin/notifications/page.tsx` ✓ (Sprint 3)
- [x] Emergency kill switch — `app/admin/notifications/page.tsx` ✓ (Sprint 3)
- [ ] Audience preview
- [ ] Role-restricted send

Status: templates and governance console implemented (Sprint 6).

---

## 7. AI governance layer

- [x] Base `ai_jobs` / `ai_review_queue` infrastructure exists from previous AI infrastructure migration
- [x] AI action policy table
  - `supabase/migrations/035_ai_action_policies.sql` ✓ created — policy enum, mode enum, seeded defaults
  - `app/admin/ai-policy/page.tsx` ✓ created — per-action allow/require_approval/deny toggles with audit logging
  - `app/admin/layout.tsx` ✓ AI Policy nav item added
  - `app/admin/page.tsx` ✓ AI Policy quick link added
- [ ] Confidence thresholds per action
- [ ] Auto-action gating (runtime enforcement)
- [ ] AI audit classification
- [ ] Human-review-required flag
- [ ] Fine-grained admin UI for AI job/policy review

Status: policy table and governance UI implemented; runtime enforcement pending.

---

## 8. User-facing product surface

### 8.1 Dashboard and exams

- [x] Mission-control dashboard exists
- [~] Mission-control data-contract fix has been reported as implemented; verify on `master`
- [x] Exam/recruitment browse page exists
- [~] Eligibility badges on `/dashboard/exams` have been reported as implemented; verify on `master`
- [x] Recruitment detail route exists
- [~] Timeline/apply/salary/vacancy redesign has been reported as implemented; verify on `master`

Status: core surface exists; latest pushed state must be verified.

### 8.2 Application/Form tracker

- [x] Durable application tracker table
  - `supabase/migrations/031_apply_tracker.sql` ✓
- [x] User-facing form status controls
  - `app/dashboard/tracker/page.tsx` ✓ filter tabs, inline status selector
  - `app/dashboard/recruitments/[id]/page.tsx` ✓ CTA with status selector
- [x] Application number storage
- [x] Fee/payment fields
- [x] Form submitted state distinct from telemetry click
- [x] Dashboard summary for pending/submitted forms
- [ ] Next-actions integration

Status: implemented (Sprint 3).

Important rule:

```text
clicked_apply != form submitted
```

`clicked_apply` is telemetry only. Application status must be durable product state.

### 8.3 Study OS and performance analytics

- [x] Study planner foundation exists
- [x] Daily tasks foundation exists
- [x] Study sessions table exists
- [x] Focus timer UI
  - `app/dashboard/study-plan/focus/page.tsx` ✓ client-side timer ring, session start/stop, logged via beginFocusSession/finishFocusSession
- [x] Mock-test tracking
  - `supabase/migrations/034_mock_tests.sql` ✓ mock_tests + mock_subject_breakdowns tables
  - `lib/db/mock-tests.ts` ✓ CRUD + stats helpers
  - `actions/mock-tests.ts` ✓ saveMockTestAction, deleteMockTestAction
  - `app/dashboard/study-plan/mock-tests/page.tsx` ✓ stats row, trend badge, test log, add form
  - `components/study-plan/MockTestForm.tsx` ✓ subject breakdowns, score entry
- [x] Subject/topic breakdown (via mock_subject_breakdowns)
- [ ] Topic proficiency
- [ ] Flashcards and spaced repetition
- [x] Weekly review dashboard — `app/dashboard/study-plan/weekly-review/page.tsx` ✓ (Sprint 6)
  - Study time this week, sessions count
  - Task completion progress bars
  - Subject breakdown with time allocation
  - Mock test performance summary
  - Focus session + mock test CTAs

Status: weekly review implemented (Sprint 6).

### 8.4 Community and mentorship

- [ ] Exam/recruitment community spaces
- [ ] Official updates channel separated from discussion
- [ ] Form-help channel
- [ ] Preparation/PYQ/mock discussion channels
- [ ] Mentorship/Q&A model
- [ ] Moderation/reporting

Status: not implemented.

---

## 9. Documentation integrity

- [x] `docs/database-domain-model.md`
- [x] `docs/admin_automation_strategy.md`
- [x] `docs/ai_automation_implementation_plan.md`
- [x] `docs/implementation_status_checklist.md` updated to distinguish route existence from operational hardening
- [ ] `docs/runbook.md`
- [ ] Architecture diagram refresh
- [ ] Admin operational playbooks
- [ ] AI policy playbook

Status: documentation improved; operational playbooks still needed.

---

## Mandatory priority order

### P0 — governance hardening

1. Verify latest Claude implementation is actually pushed to `master`.
2. Run lint/typecheck/test/build.
3. Full RBAC enforcement.
4. Admin audit viewer.
5. Eligibility queue monitor.

### P1 — operational hardening

6. Source verification console.
7. Recruitment workflow gating.
8. Organization verification console.
9. Notification governance.
10. AI action policy layer.

### P2 — product expansion

11. Application/Form tracker.
12. Post-application preparation workflow.
13. Exam-fit ranking.
14. Exam intelligence schema.
15. Study performance analytics.
16. Community/mentorship MVP.

---

## Migration/domain rules

Correct dependency order for the current mission-control/exam-summary stack:

```text
027_user_events_and_form_submissions.sql
028_user_recruitment_state.sql
029_exam_summary_support.sql
```

Canonical model rule:

```text
Database = recruitment
Frontend language = exam
Foreign key = recruitment_id
Avoid = public.exams
```

---

## Strategic rule

Automation expansion is blocked until RBAC enforcement, audit visibility, and eligibility queue monitoring are operational.

```text
Trust > Speed
Control > Automation
Determinism > Heuristics
```


## Pending P1/P2 tasks

- [ ] P1: Execute real environment rollout for `ADMIN_ALERT_WEBHOOK_URL` across dev/staging/prod.
- [ ] P1: Run staging forced audit-failure drill and archive log/webhook artifacts.
- [ ] P1: Regenerate `types/supabase.ts` from connected live schema and remove dynamic table bridges for `community_reports` / `forum_reports`.
- [ ] P2: Optional warning-free lint baseline cleanup (unused vars, image optimization refactors, hook dependency audits).

- [x] Standardized root product shell navigation and dashboard exams screen to light-indigo UI baseline (sticky white nav, compact cards/table, and tokenized styling) for screenshot parity pass.

- [x] Redesigned public root landing (`/`) to premium dark/gold mission-control positioning with marketing-only nav and eligibility-first messaging (`app/page.tsx`, `app/globals.css`, `app/layout.tsx`).

- [x] Added project-wide dark/light theme architecture with hydration-safe init script, ThemeProvider/useTheme, landing nav toggle, and tokenized legacy class theming (`app/layout.tsx`, `app/components/ThemeProvider.tsx`, `app/components/ThemeToggle.tsx`, `app/globals.css`).

- [x] Modernized public landing with premium interactive storytelling (hero 3D product stack, carousel, mission-control visuals, trust pipeline, lifecycle, and aspirant mode preview) while preserving app-wide dark/light theme system.

- [x] Refined landing visual polish with modern glow overlays, stronger section hierarchy, richer gradient surfaces, and cleaner comparison/mode-selector styling while preserving theme architecture.
