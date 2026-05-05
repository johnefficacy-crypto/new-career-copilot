# Career Copilot — Strategy Chat Summary and Implementation Plan

_Last updated: 2026-04-29_

This document consolidates the strategy decisions, implementation priorities, and governance rules discussed in the April 29 strategy conversation.

---

## 1. Product positioning

Career Copilot should be treated as an **exam preparation operating system** for Indian government-job aspirants, not only as a notification or eligibility app.

The product must help an aspirant answer:

```text
What am I eligible for?
What is urgent?
Which exams are realistic for my situation?
Have I applied?
What should I study next?
How am I performing?
Who can help me stay accountable?
```

The user-facing product loop is:

```text
official recruitment discovery
→ deterministic eligibility check
→ application/form tracking
→ exam-specific preparation plan
→ study execution
→ performance analytics
→ community and mentorship
→ adaptive next actions
```

---

## 2. Canonical domain decision

The database model is non-negotiable:

```text
Database entity = recruitment
Frontend language = exam
Foreign key = recruitment_id
Avoid = public.exams
```

Rules:

- `public.recruitments` is canonical.
- `exam` is a UI/product abstraction only.
- `organizations` are first-class verified entities.
- `posts` represent post/vacancy-level records.
- `eligibility_results` are deterministic outputs.
- AI and automation must operate on canonical IDs: `recruitment_id`, `organization_id`, `post_id`.

No parallel domain model should be introduced unless there is a future architecture decision.

---

## 3. Claude implementation baseline discussed

Claude reportedly implemented the following fixes and features:

### Silent failure fixes

- `lib/db/mission-control.ts`
  - Problem: queried columns that do not exist in the new `user_recruitment_state` schema.
  - Intended fix: query `user_exam_summary` or derive dashboard fields from real columns.

- `app/api/exams/summary/route.ts`
  - Problem: wrong view name and wrong columns.
  - Intended fix: use `user_exam_summary` and actual migration 029 fields.

### User-facing features

- `app/dashboard/notifications/preferences/page.tsx`
  - Notification preferences UI with email toggle, digest frequency, and priority threshold.
  - Required before broad email rollout.

- `app/dashboard/exams/page.tsx`
  - Overlay personalized eligibility badges.
  - Eligible cards get stronger visual treatment.
  - Cards link to recruitment detail pages.

### Notification and promotion fixes

- `upsertNotificationAlerts` was reportedly wired into `runEligibilityForUser`.
- `admin_promote_recruitment_payload` RPC was reportedly wired into `approveScrapeItem`.

### Recruitment detail redesign

- `components/recruitments/Timeline.tsx`
- `components/recruitments/ApplyButton.tsx`
- `app/dashboard/recruitments/[id]/page.tsx`

New detail page concepts:

- timeline card
- apply CTA
- clicked-apply telemetry
- salary cards
- vacancy tables
- breadcrumb back to `/dashboard/exams`

Important caution:

```text
clicked_apply != form submitted
```

`clicked_apply` is telemetry only. It should not be treated as proof that the user completed the application form.

---

## 4. Repository verification warning

Before continuing new work, verify that the latest Claude changes are actually pushed to `master`.

Required checks:

```bash
git status
git log --oneline -5
git branch --show-current
git push origin master
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Also check:

```bash
grep -R "public.exams\|from(\"exams\"\|from('exams'" app actions lib supabase --exclude-dir=node_modules || true
grep -R "is_admin\|profile?.is_admin" app actions lib components --exclude-dir=node_modules || true
```

Any `public.exams` usage must be removed unless explicitly part of a future architecture change. Any live admin authorization based directly on `is_admin` should be replaced with permission-based RBAC.

---

## 5. Research-report findings added to strategy

A deep research report reframed Career Copilot as a comprehensive aspirant support system.

The report’s priority hierarchy:

1. **Decision support and clarity**
   - eligibility mapping
   - exam-fit recommendations
   - realistic trade-offs

2. **Strategic guidance and career planning**
   - short-term vs long-term paths
   - backup exams
   - working-professional plans
   - rural/low-bandwidth plans
   - financially constrained plans

3. **Productivity and study planning**
   - weekly plans
   - daily tasks
   - calendar reminders
   - focus timer
   - mobile checklists

4. **Performance analytics**
   - study hours
   - mock scores
   - topic mastery
   - weak-area tracking
   - flashcard retention

5. **Accountability and motivation**
   - streaks
   - badges
   - accountability contracts
   - study partners
   - weekly reviews

6. **Community and mentorship**
   - exam-specific spaces
   - moderated discussions
   - mentor Q&A
   - study circles
   - local/virtual peer groups

These findings do not replace the current implementation plan. They expand the Phase 4 and Phase 5 roadmap.

---

## 6. Admin and automation strategy

A separate admin strategy was introduced and should govern backend/admin/AI work.

Career Copilot is:

```text
an eligibility-first, recruitment-canonical system with human-supervised automation
```

Admin is divided into three layers.

### Layer 1 — Governance

- RBAC
- permission enforcement
- append-only audit logging
- AI action policies

### Layer 2 — Operations

- source registry
- scrape dashboard
- recruitment workflow
- eligibility queue
- organization verification
- notification governance

### Layer 3 — Intelligence

- AI-assisted scrape triage
- confidence scoring
- anomaly detection
- eligibility explanation generation
- policy-gated automation

Strategic rule:

```text
Trust > Speed
Control > Automation
Determinism > Heuristics
```

---

## 7. Mandatory engineering order

The earlier product-facing roadmap was valid, but the admin strategy introduced a necessary control gate.

New engineering order:

```text
RBAC enforcement
→ audit viewer
→ eligibility queue monitor
→ source verification
→ recruitment workflow gating
→ organization verification
→ notification governance
→ AI action policy layer
→ application/form tracker
→ post-application preparation workflow
→ exam-fit ranking
→ exam intelligence
→ study analytics
→ community and mentorship
```

Automation expansion is blocked until the first three are complete:

1. Full RBAC enforcement
2. Admin audit viewer
3. Eligibility queue monitor

---

## 8. Immediate P0 tasks

### 8.1 Full RBAC enforcement

Required:

- Replace legacy `is_admin` checks.
- Enforce permission buckets at route and action level.
- Hide UI actions based on permission.
- Add super-admin-only role management later.

Recommended permission buckets:

```text
sources
scraper
recruitments
organizations
eligibility
notifications
audit
rbac
ai_policy
```

Acceptance criteria:

- No admin route authorizes access by directly reading `profiles.is_admin`.
- Every admin mutation calls central permission enforcement.
- Server actions cannot be called directly by unauthorized users.
- UI hides unauthorized actions.

### 8.2 Admin audit viewer

Route:

```text
/admin/audit
```

Build:

```text
app/admin/audit/page.tsx
lib/db/admin-audit.ts
components/admin/audit/AuditTable.tsx
components/admin/audit/AuditFilters.tsx
components/admin/audit/AuditPayloadInspector.tsx
```

Features:

- filter by admin user
- filter by action
- filter by entity type
- filter by entity ID
- filter by time range
- paginated table
- JSON payload inspector

### 8.3 Eligibility queue monitor

Route:

```text
/admin/eligibility-queue
```

Build:

```text
app/admin/eligibility-queue/page.tsx
lib/db/eligibility-queue.ts
actions/eligibility-admin.ts
components/admin/eligibility/EligibilityQueueTable.tsx
components/admin/eligibility/EligibilityJobInspector.tsx
```

Features:

- pending/running/completed/failed/dead-letter jobs
- retry count
- last error
- created/started/finished timestamps
- manual retry
- manual recompute for user
- manual recompute for recruitment
- rule version visibility or documented schema gap
- audit logging for mutations

---

## 9. Operational hardening tasks

After P0 governance:

### 9.1 Source verification console

Features:

- URL validation
- redirect chain inspection
- domain verification
- content-type detection
- official-domain confirmation
- suspicious change detection
- source testing sandbox

Suggested table:

```text
source_verification_checks
```

### 9.2 Recruitment workflow gating

Workflow states:

```text
draft
needs_review
verified
published
archived
withdrawn
```

Keep separate from recruitment lifecycle:

```text
upcoming | open | closed | result_declared
```

Publish must require:

- field completeness
- verified organization
- source provenance
- official URL
- sane dates
- at least one post
- eligibility-critical rules or explicit unavailable marker
- permissioned reviewer

### 9.3 Organization verification

Features:

- official website validation
- domain whitelist
- duplicate merge
- trust classification
- linked source count

### 9.4 Notification governance

Features:

- template editor
- audience preview
- send logs
- emergency disable control
- role-restricted sending

---

## 10. AI governance layer

AI is assistant, not authority.

Every AI action must specify:

- confidence score
- required permission
- whether automatic use is allowed
- whether human review is required
- audit logging status

Suggested table:

```text
ai_action_policies
```

AI may:

- propose
- score
- triage
- summarize
- explain deterministic results

AI may not independently:

- publish recruitments
- modify eligibility logic
- verify organizations
- assign official trust status
- override deterministic eligibility

---

## 11. Product expansion after governance

### 11.1 Application/Form tracker

Build durable application state:

```text
user_recruitment_applications
- user_id
- recruitment_id
- status
- application_number
- fee_paid
- fee_amount
- payment_reference
- documents_pending_json
- notes
- submitted_at
```

Status values:

```text
not_started
opened
in_progress
submitted
skipped
not_applicable
```

This must power dashboard next actions.

### 11.2 Post-application preparation workflow

After form submitted, switch the user from apply reminders to preparation tasks:

- save application number
- preserve PDF/receipt
- understand exam pattern
- create study plan
- start mock schedule
- join exam-specific community
- track admit card/result updates

### 11.3 Exam-fit ranking

Add recommendation logic based on:

- eligibility
- urgency
- vacancies
- syllabus overlap
- domicile/category fit
- language comfort
- available study hours
- financial pressure
- working status
- behavior signals

### 11.4 Exam intelligence

Separate durable exam knowledge from recruitment notifications.

Suggested tables:

```text
exam_families
exam_cycles
exam_stages
exam_syllabus_topics
exam_faq_items
exam_pyq_papers
exam_pyq_questions
exam_stats
learning_resources
```

Start with one pilot exam family: SSC CGL, SBI Clerk, IBPS PO, or SEBI Grade A.

### 11.5 Study performance analytics

Suggested tables:

```text
mock_tests
mock_subject_breakdowns
user_topic_proficiency
user_flashcards
flashcard_reviews
study_streaks
accountability_contracts
```

Metrics:

- weekly study hours
- task completion
- mock score trend
- accuracy trend
- topic mastery
- flashcard retention
- consistency/streaks

### 11.6 Community and mentorship

Community must be exam/recruitment-specific and moderated.

Spaces:

- official updates
- form help
- preparation strategy
- PYQ/mock discussion
- free resources
- local study groups
- mentor Q&A

Official updates must remain separate from user discussion.

---

## 12. Documentation decisions

Relevant docs should include:

```text
docs/admin_automation_strategy.md
docs/implementation_status_checklist.md
docs/runbook.md
docs/database-domain-model.md
docs/ai_automation_implementation_plan.md
docs/strategy_chat_summary_2026-04-29.md
```

Future docs proposed from the research report:

```text
docs/eligibility_framework.md
docs/tool_recommendations.md
docs/study_workflows.md
docs/community_models.md
docs/metrics_and_kpis.md
```

Docs policy:

- mark actual status only
- separate route existence from operational hardening
- separate API existence from UI existence
- separate UI existence from permission and audit readiness
- keep docs synchronized with code reality

---

## 13. Next Claude prompt

```text
New governing strategy: Admin & Automation Strategy.

Career Copilot is an eligibility-first, recruitment-canonical system with human-supervised automation.

Non-negotiables:
- public.recruitments is canonical.
- exam is UI language only.
- all automation uses recruitment_id, organization_id, post_id.
- AI is assistant, not authority.
- governance before automation.
- trust > speed.

Before new product features, implement Governance Hardening Phase.

Task 0 — Repo verification
- Confirm latest fixes are pushed to master.
- Run npm run typecheck.
- Run npm run lint.
- Run npm test -- --run.
- Run npm run build.
- Confirm no code references public.exams.
- Confirm no admin route still directly relies on profiles.is_admin.

Task 1 — Full RBAC enforcement
- Search all app/admin, actions, lib/db, components/admin for is_admin checks.
- Replace route-level checks with requireAdminRole(permission).
- Replace action-level checks with requireAdminRole(permission).
- Add permission-based UI hiding for admin buttons/actions.
- Ensure super_admin has all permissions.
- Use permission buckets: sources, scraper, recruitments, organizations, eligibility, notifications, audit, rbac, ai_policy.

Task 2 — Admin Audit Viewer
Build /admin/audit with filtering, pagination, and JSON payload inspection.

Task 3 — Eligibility Queue Monitor
Build /admin/eligibility-queue with job state, retry controls, manual recompute, failure diagnostics, and audit logging.

Task 4 — Docs update
Update implementation checklist, runbook, and admin automation strategy. Do not start Application/Form Tracker, AI automation, community, or exam intelligence until Tasks 1–3 are complete.
```

---

## 14. Final decision

The correct engineering sequence is:

```text
RBAC
→ audit viewer
→ eligibility queue monitor
→ source/recruitment/org verification
→ notification governance
→ AI policy
→ application tracker
→ study and performance OS
→ community and mentorship
```

This sequence preserves trust while still moving toward the larger aspirant operating-system vision.
