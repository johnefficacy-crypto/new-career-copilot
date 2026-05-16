# Career Copilot — Admin & Automation Strategy

_Last updated: 2026-04-29_

## 1. Strategic positioning

Career Copilot is an **eligibility-first, recruitment-canonical system with human-supervised automation**.

The architecture is designed around:

- Canonical entity: `public.recruitments`
- Deterministic eligibility engine
- Structured source registry
- Human-in-the-loop review
- AI-assisted but policy-governed automation

Admin tooling is not auxiliary. It is operational infrastructure. A trust-heavy product that scrapes official recruitment data, computes eligibility, sends alerts, and later powers AI guidance needs a strong control plane before automation is expanded.

## 2. Canonical domain model

The system must treat:

- `public.recruitments` as the canonical recruitment/exam-notification entity
- `exam` as a frontend and product-language abstraction only
- `public.organizations` as first-class verified entities
- `public.posts` as the post/vacancy-level entity
- `public.eligibility_results` as deterministic outputs tied to rule versions

All automation and AI agents must operate on canonical IDs:

- `recruitment_id`
- `organization_id`
- `post_id`

No parallel domain models are allowed. Do not introduce `public.exams` as a canonical table unless a future architecture decision explicitly changes the domain model.

## 3. Admin system philosophy

Admin is divided into three layers.

### Layer 1 — Governance / control

- RBAC
- Permission enforcement
- Append-only audit logging
- AI action policies
- Role-restricted workflow transitions

### Layer 2 — Operations / execution

- Source registry
- Scrape dashboard
- Recruitment workflow
- Eligibility queue
- Organization verification
- Notification governance

### Layer 3 — Intelligence / automation

- AI-assisted scrape triage
- Confidence scoring
- Anomaly detection
- Eligibility explanation generation
- Automated policy-gated actions

## 4. Current state summary

### Already implemented

- Admin layout and navigation shell
- Source registry with structured metadata
- Scrape dashboard with queue, runs, and health surfaces
- Recruitment admin with scraper-origin tracking
- RBAC data model with roles and permission buckets
- `admin_audit_logs` table and `logAdminAction` utility
- Baseline eligibility and organization admin routes
- Mission-control dashboard and personalized exam/recruitment surfaces
- Notification preferences API and UI foundation

### Critical gaps

1. RBAC is not fully enforced across all admin routes and server actions.
2. Legacy `is_admin` checks still need to be removed from operational authorization paths.
3. No audit log viewer exists for operational review.
4. No eligibility queue monitor exists for job state, retry, and dead-letter visibility.
5. No URL/source verification console exists.
6. No formal recruitment publish workflow exists.
7. No organization verification console exists.
8. No eligibility explanation inspector exists.
9. No notification governance console exists.
10. Documentation must distinguish between routes that merely exist and routes that are operationally hardened.

## 5. Mandatory next phase — governance hardening

Before expanding automation, complete the following.

### 5.1 Full RBAC enforcement

Required work:

- Replace legacy `is_admin` checks in admin routes and actions.
- Enforce permission buckets at route and action level.
- Hide UI actions based on permission.
- Add a super-admin-only role management interface.

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

Definition of done:

- No admin route authorizes access by directly reading `profiles.is_admin`.
- Every admin mutation calls the central permission helper.
- Unauthorized users cannot bypass the UI by calling server actions directly.
- UI hides unauthorized controls.
- `super_admin` has all permissions.

### 5.2 Admin audit viewer

Route: `/admin/audit`

Required features:

- Filter by admin user.
- Filter by action.
- Filter by entity type and entity ID.
- Filter by time range.
- Paginated table.
- JSON payload inspector.
- Export capability later.

Definition of done:

- All audit rows are visible to permitted admins.
- Payloads can be inspected safely.
- Audit logs remain append-only.
- The audit viewer itself is protected by the `audit` permission bucket.

### 5.3 Eligibility queue monitor

Route: `/admin/eligibility-queue`

Required features:

- Pending, running, completed, failed, and dead-letter jobs.
- Retry counts.
- Last error.
- Created, started, and finished timestamps.
- Manual retry for failed jobs.
- Manual recompute for a user.
- Manual recompute for a recruitment.
- Rule-version visibility.

Definition of done:

- Admin can identify stuck recomputes.
- Admin can retry failed jobs.
- Admin can manually recompute by user or recruitment.
- Queue actions are permission-protected and audit-logged.

## 6. Operational hardening phase

Begin after governance hardening.

### 6.1 Source verification console

Required features:

- URL validation.
- Redirect inspection.
- Domain verification.
- Content-type detection.
- Suspicious change detection.
- Official-domain confirmation.
- Source testing sandbox.

Suggested table:

```text
source_verification_checks
- id
- source_id
- checked_url
- final_url
- status_code
- content_type
- redirect_chain_json
- domain_match_status
- suspicious_change_score
- checked_by
- checked_at
```

### 6.2 Recruitment workflow states

Recruitment publishing workflow must support:

```text
draft
needs_review
verified
published
archived
withdrawn
```

Do not confuse recruitment publishing workflow with recruitment lifecycle status.

```text
Recruitment lifecycle:
upcoming | open | closed | result_declared

Publishing workflow:
draft | needs_review | verified | published | archived | withdrawn
```

Publish must require:

- Required field completeness.
- Organization verified.
- Source provenance attached.
- Official notification URL present.
- Apply dates sane.
- At least one post exists.
- Eligibility-critical rules attached or explicitly marked unavailable.
- AI-origin fields meet threshold when applicable.
- Reviewer has the correct permission.

### 6.3 Organization verification console

Required features:

- Official website validation.
- Duplicate merge tool.
- Trust status.
- Domain whitelist.
- Source count linked to organization.

Suggested fields:

```text
organizations.trust_status
organizations.official_domain
organizations.domain_verified_at
organizations.verified_by
```

### 6.4 Notification governance

Required before broad outbound notification expansion:

- Template editor.
- Audience preview.
- Send logs.
- Emergency kill switch.
- Role-restricted publishing.

Suggested tables:

```text
notification_templates
notification_send_logs
notification_kill_switches
```

## 7. AI automation architecture

AI is assistant, not authority.

### 7.1 AI action policy layer

Before AI automates operational decisions, every AI action must specify:

- `confidence_score`
- `required_permission`
- `auto_allowed`
- `human_review_required`
- `audit_logged`

Suggested table:

```sql
create table if not exists public.ai_action_policies (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique,
  description text,
  required_permission text not null,
  min_confidence numeric(4,3) not null default 0.850,
  auto_allowed boolean not null default false,
  human_review_required boolean not null default true,
  audit_logged boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Example policies:

```text
scrape_triage_suggest_status
source_anomaly_flag
eligibility_explanation_generate
recruitment_publish
organization_merge_suggest
```

### 7.2 Human-in-the-loop pattern

Automation may:

- Propose.
- Score.
- Triage.
- Flag anomalies.
- Generate explanations from deterministic evidence.

Automation may not, without policy-gated permission and review:

- Publish recruitments.
- Modify canonical eligibility logic.
- Change recruitment workflow status.
- Verify organizations.
- Assign official trust badges.
- Override deterministic eligibility results.

## 8. Long-term intelligence layer

After governance and operational hardening:

- Anomaly detection for broken sources and sudden vacancy/date changes.
- Eligibility reasoning debugger.
- Suspicious scrape-pattern flags.
- AI-assisted organization deduplication.
- AI-assisted source prioritization.
- AI-generated admin summaries with source evidence.

## 9. Documentation policy

Docs must reflect reality.

The implementation checklist must:

- Mark actual completion state.
- Avoid marking existing routes as “not started.”
- Separate “route exists” from “operationally hardened.”
- Separate “API exists” from “UI exists.”
- Separate “UI exists” from “permission enforced and audit-visible.”

Docs are part of governance.

## 10. Strategic rule

We scale automation only after governance is airtight.

```text
Trust > Speed
Control > Automation
Determinism > Heuristics
```
