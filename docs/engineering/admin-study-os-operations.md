# Admin Study OS Operations — Design Spec

Status: Proposal (no implementation yet)
Owners: Platform / Study OS
Branch: `claude/add-study-os-operations-FT79A`
Related docs:
- `docs/engineering/admin-governance.md`
- `docs/engineering/admin-strategy.md`
- `docs/engineering/study-os-mission-control-v1.md`
- `docs/engineering/exam-intelligence-contracts-v1.md`
- `docs/product/study-os-intelligence-contract.md`
- `docs/product/persona-study-policy-contract.md`

## 1. Problem

Admin today can operate the **platform pipeline** (recruitments, sources,
scraper, eligibility ops, notifications, audit, RBAC, persona, exam
intelligence review queue, KPIs, moderation, copyright). It cannot
operate the **per-user Study OS state**.

When an aspirant reports a problem — "my plan is stuck", "Today is
empty", "my mock score is wrong", "my flashcards disappeared", "the
report failed to download" — there is no admin surface that exposes the
user's Study OS state or lets a support operator intervene safely.

This doc specifies the missing admin surface, the backend contract, the
audit/RBAC model, and the rollout plan. **No code is being written in
this PR.**

## 2. Goals / non-goals

### Goals
- Give support operators a single read-first inspector for every Study
  OS surface a user can see.
- Give a smaller set of operators safe, audit-logged write actions to
  unblock common failure modes (stuck plan, stale Today, stuck focus
  session, mis-attested mock, broken report job).
- Cover every Study OS subsystem listed in the gap matrix below, not a
  subset.
- Reuse existing backend APIs and Mission Control / Plan engines —
  do not duplicate engine logic in admin handlers.
- Keep all writes idempotent, reversible where possible, and logged to
  the existing admin audit trail.

### Non-goals
- Replacing the Exam Intelligence review queue. That stays as-is; this
  doc only proposes adding full CRUD/import on top.
- Replacing community/moderation tools. Social Study admin is scoped
  to **Study OS social** (groups, partner pairs, sessions, trust,
  mentor feedback), not general community moderation.
- Changing aspirant-facing UX. This is admin-only.
- Migrating data. No schema changes are proposed in Phase 1.

## 3. Current state (verified)

Admin shell already mounts (frontend):
- Operations, Sources, Scraper, Recruitments, Eligibility Ops,
  Notifications, Audit, RBAC, Persona, Exam Intelligence, KPIs,
  Moderation, Copyright, Community, Mentors, Plans.

Aspirant Study OS surfaces (frontend):
- `/app/today`, `/app/study-plan`, `/app/exams`, `/app/saved`,
  `/app/tracker`, `/app/mocks`, `/app/subjects`, `/app/focus`,
  `/app/notes`, `/app/flashcards`, `/app/mistakes`, `/app/revision`,
  `/app/compare`, `/app/leaderboard`, `/app/groups`, `/app/reports`,
  `/app/weekly-review`, `/app/report-card`.

Backend Study OS routers:
- `app/backend/app/api/study_os.py`, `app/backend/app/api/canonical.py`
  (both serve `/api/study/*`; `study_os_router` is registered first so
  route order controls behavior — see §10).
- `app/backend/app/api/notes.py`, `flashcards.py`, `mistakes.py`,
  `revision.py`, `reports.py`, `study_compare.py`,
  `admin_exam_intelligence.py`.

### Gap matrix

| Subsystem | Aspirant | Admin today | Gap |
|---|---|---|---|
| Exams / recruitments | `/app/exams`, `/app/saved`, `/app/tracker` | Recruitments, Sources, Scraper, Eligibility | Per-user saved/tracker state not inspectable |
| Notifications | Channel prefs | Kill switch, jobs, runs | Mostly OK |
| Study plan | Plan, cycle timeline, draft/apply, changelog | none | No admin inspector or repair |
| Today / Mission Control | Tasks, reasoning, context, trace | none | No admin per-user view of MC payload |
| Focus timer | Start/stop/summary | none | No stuck-session repair |
| Mock tests | Mocks, review, correction tasks, mastery | Mock attestation API only | No moderation/repair dashboard |
| Subjects / topics | Subjects, locked-only topics | Exam Intelligence topic coverage | No per-user subject progress support view |
| Weekly review / report card | Read/compute/history | none | No admin recompute / debug |
| Compare / leaderboard / social | Compare, cohort, titles, leaderboard, groups, sessions, partner, trust, attestation, mentor feedback | none Study-OS-scoped | No governance for Study OS social |
| Notes | CRUD | none | No support/moderation/export |
| Flashcards | Deck/card CRUD + SRS | none | No deck/card support |
| Mistake book | CRUD + promote to flashcard | none | No support / safety |
| Revision calendar | Schedule/complete/skip/cancel | none | No queue repair |
| Reports | Exports (weekly, mistakes, flashcards, mocks, study log, mastery, report card) | none | No report job admin |
| Exam intelligence CRUD | n/a | Review queue, topic coverage, policy updates, plan impact | No create/import/edit/delete lifecycle |
| Endpoint hygiene | n/a | n/a | `study_os.py` and `canonical.py` overlap on `/api/study/*` |

## 4. Proposed admin surface

All routes mount under the existing `AdminShell` and route to a new
section `/admin/study-os`. Each sub-route is a single page so RBAC can
be scoped per-page.

```
/admin/study-os                      → User Study Inspector (search + dashboard)
/admin/study-os/plan-ops             → Plan Ops tools (per-user actions)
/admin/study-os/artifacts            → Notes / Flashcards / Mistakes / Revision support
/admin/study-os/mocks                → Mock & Score Trust Console
/admin/study-os/social               → Compare / Groups / Sessions / Mentor governance
/admin/study-os/reports              → Report Job Admin (queue + failures)
/admin/study-os/exam-intel-cms       → Full Exam Intelligence CRUD / import
```

### 4.1 User Study Inspector (`/admin/study-os`)

Search input: email, user_id, or username. On select, the page renders
read-only panels for one user:

- **Identity**: id, email, persona, exam set, timezone, last-seen.
- **Active plan**: current cycle, phase, current week, plan version,
  last regen timestamp, blockers count, changelog tail (10).
- **Today payload**: a verbatim render of `/api/study/mission-control`
  for that user as of "now", including reasoning trace and engine
  preferences. Stamped with admin-fetch timestamp.
- **Focus**: active session (if any), 24h focus minutes, last 10
  sessions, stuck-session flag (started > 6h ago, no stop event).
- **Mocks**: last 20 mocks, attestation state, topic breakdown
  completeness, mastery delta.
- **Subjects**: progress matrix, locked-only topic count, last
  recompute timestamp.
- **Weekly review / Report card**: latest review id, computed-at, last
  3 report cards (read-only).
- **Artifacts counts**: notes, flashcards (decks + cards), mistakes,
  revision queue size, overdue revisions.
- **Social**: compare cohort, leaderboard visibility, trust score,
  groups joined, active partner pair, recent mentor feedback.
- **Reports**: last 20 report-job rows with status and download link
  expiry.

This page issues **read-only** requests only. No mutating endpoints.

### 4.2 Plan Ops (`/admin/study-os/plan-ops`)

Audit-gated write actions for the selected user:

- Recompute Mission Control (force `mission-control` regeneration).
- Regenerate plan draft from current persona + exam set.
- Apply pending plan draft / discard pending plan draft.
- Reset carried-forward backlog (clear, keep, or partial-keep).
- Mark stuck task as `skipped` with reason.
- Force-close a stuck focus session (sets `stopped_at = now`, marks
  `closed_by_admin`).
- View raw `study_adaptation_events` for the user, with filter by
  source (`engine`, `policy`, `admin`).
- Replay last N adaptation events into a dry-run plan for diffing.

Every write must:
1. Require a typed reason string.
2. Write a row to admin audit (`admin_actions` or equivalent) with
   actor, target user, action, payload, before/after snapshot key.
3. Emit a `study_adaptation_events` row with `source='admin'`.

### 4.3 Learning Artifact Admin (`/admin/study-os/artifacts`)

Scoped, audit-gated support tools. These touch **user-owned learning
records**, so they are RBAC-gated to a `study_support` role and **never**
return content by default — they return counts and metadata. Content
read requires an explicit "open content" action which is logged.

- Notes: list metadata, soft-delete on user request, restore, export
  one note to user-provided email (uses existing reports pipeline).
- Flashcards: list decks/cards metadata, deck restore from soft-delete,
  SRS state inspector for one card, reset SRS state with reason.
- Mistake book: list metadata, restore deleted entry, force-promote to
  flashcard (re-uses existing promote endpoint).
- Revision calendar: view queue, re-schedule an item, cancel a
  scheduled item, bulk cancel for a date range (caps at N=50 per
  action).

### 4.4 Mock & Score Trust Console (`/admin/study-os/mocks`)

- Review attestation queue (existing API; new UI).
- Flag suspicious self-reported scores (heuristics already computed
  server-side; this page just renders them).
- Trigger correction-task generation for a mock.
- Inspect topic breakdown quality score and force-recompute.
- Adjust leaderboard trust weighting for one mock with reason. No
  rewrites of historical scores — only the weighting field changes.

### 4.5 Study Compare / Social Admin (`/admin/study-os/social`)

- Groups: list, view members, archive, transfer ownership.
- Partner pairs: list, dissolve pair with reason.
- Social sessions: list active, force-end stuck session.
- Trust breakdown: per-user view, recompute.
- Leaderboard abuse: hide entry, restore entry, audit list.
- Mentor feedback: list, hide entry, restore entry.

### 4.6 Report Job Admin (`/admin/study-os/reports`)

- Queue view: pending, running, failed, expired.
- Inline export expiry list.
- Retry a failed PDF generation job (idempotent, capped to 3 retries
  per job).
- Cancel a stuck job.
- Show last error per failed job.

### 4.7 Exam Intelligence CMS (`/admin/study-os/exam-intel-cms`)

Adds the **lifecycle layer** the review queue doesn't have:

- Create / edit / soft-delete: exam family, exam, cycle, phase.
- Upload / replace: syllabus documents (versioned).
- Create / edit: PYQ paper, question, option set.
- Topic coverage: add/edit/delete coverage rows.
- Policy updates: create/edit/publish a policy update record.

This wraps the existing `admin_exam_intelligence` router with write
endpoints. The review queue keeps its current "review existing rows"
behavior — this is **additive**, not a replacement.

## 5. Backend contract

All new endpoints live under `/api/admin/study-os/...` and are mounted
in a new router `app/backend/app/api/admin_study_os.py`. They reuse
existing engine / service modules; they do not duplicate them.

| Path | Method | Purpose |
|---|---|---|
| `/api/admin/study-os/users/search` | GET | Resolve email/username/id → user envelope |
| `/api/admin/study-os/users/{id}/snapshot` | GET | All read-only panels combined |
| `/api/admin/study-os/users/{id}/mission-control` | GET | Pass-through to study engine |
| `/api/admin/study-os/users/{id}/plan-ops/{action}` | POST | Plan write actions (see §4.2) |
| `/api/admin/study-os/users/{id}/focus/force-close` | POST | Close stuck focus session |
| `/api/admin/study-os/users/{id}/artifacts/{kind}` | GET | Metadata listings |
| `/api/admin/study-os/users/{id}/artifacts/{kind}/{artifact_id}` | GET | Metadata for one |
| `/api/admin/study-os/users/{id}/artifacts/{kind}/{artifact_id}/open` | POST | Audited content read |
| `/api/admin/study-os/mocks/queue` | GET | Attestation queue |
| `/api/admin/study-os/mocks/{id}/...` | POST | Trust console actions |
| `/api/admin/study-os/social/...` | GET/POST | Social admin actions |
| `/api/admin/study-os/reports/queue` | GET | Report job queue |
| `/api/admin/study-os/reports/{job_id}/retry` | POST | Retry job |
| `/api/admin/study-os/exam-intel/...` | * | Full lifecycle CRUD |

All write endpoints accept a body shape:

```json
{
  "reason": "string, required, >= 8 chars",
  "payload": { ... },
  "expected_version": "optional optimistic-concurrency token"
}
```

Responses include the audit row id so the UI can link the operator
straight to the audit trail.

## 6. RBAC

Two new roles, layered on the existing RBAC system:

- `study_support` — read-only inspector, plus low-risk writes:
  reschedule revision, retry report job, restore soft-deleted artifact
  on user request.
- `study_ops` — `study_support` + plan ops, focus force-close, mock
  trust actions, social admin, exam intel CMS.

Existing super-admin role inherits both. Page-level guards live in
`adminRoutes.jsx`; endpoint-level guards live in
`admin_study_os.py`. Both must agree — UI guard alone is not enough.

## 7. Audit & safety

- Every write goes through the existing admin audit middleware. No
  side-channel writes.
- Force-close, plan regen, and trust-weight changes are reversible:
  store before/after snapshots keyed by audit row id, retain 90 days.
- "Open content" actions on user artifacts are written to a separate
  `support_content_access` log so privacy reviews can see who read what.
- Rate limits per actor: 30 writes / 5 min, 200 reads / 5 min. Bulk
  actions capped to N=50 items per request.
- All endpoints emit `study_adaptation_events` rows with
  `source='admin'` when they change anything an engine consumes, so
  Mission Control reasoning traces remain explainable.

## 8. Frontend

New section in `AdminShell` nav: "Study OS". Sub-routes mounted in
`adminRoutes.jsx`. Each sub-route is its own page component under
`app/frontend/src/pages/admin/studyos/`. Reuse the existing admin table,
filter, and audit-modal primitives — no new design system surface.

The User Study Inspector page is the only one that takes a query
parameter (`?user=...`); the rest are queue/list pages.

## 9. Telemetry

Add admin-side counters:
- `admin.study_os.read_total{panel}`
- `admin.study_os.write_total{action, outcome}`
- `admin.study_os.force_close_total`
- `admin.study_os.report_retry_total{outcome}`
- `admin.study_os.exam_intel_cms_total{entity, action}`

Existing aspirant-side Study OS metrics are unchanged.

## 10. Endpoint consolidation (separate workstream)

`app/backend/app/api/study_os.py` and `app/backend/app/api/canonical.py`
both register handlers under `/api/study/*` (mocks, subjects, weekly
review, plan operations). Currently `study_os_router` is registered
before `canonical_router` in `server.py`, so route precedence controls
behavior at runtime. This is fragile.

Proposed cleanup (not part of Phase 1):
1. Inventory every overlapping path between the two files.
2. Pick one router as canonical per path.
3. Move the loser's logic into the winner; delete the duplicate.
4. Add a route-collision test to CI so new duplicates fail fast.

Tracking issue should be opened before this branch ships any code.

## 11. Rollout

- **Phase 1**: User Study Inspector (read-only) + Plan Ops. Behind
  `admin.study_os.enabled` feature flag, `study_support` and
  `study_ops` roles wired up.
- **Phase 2**: Learning Artifact Admin + Mock Trust Console + Report
  Job Admin.
- **Phase 3**: Study Compare / Social Admin.
- **Phase 4**: Exam Intelligence CMS (full lifecycle).
- **Phase 5**: Endpoint consolidation (§10).

Each phase ships behind the same flag, with the nav entry hidden until
the phase's pages render without errors against staging data.

## 12. Open questions

1. Should "open content" on user notes/flashcards/mistakes require a
   second operator's approval (4-eyes)? Default proposed: no for
   `study_ops`, yes for any role below.
2. Should plan regen be allowed to overwrite a user's pending draft, or
   only the applied plan? Default proposed: overwrite applied only,
   draft is untouched.
3. Mock trust-weight changes — should they recompute leaderboards
   immediately or on next scheduled recompute? Default proposed: next
   scheduled, to avoid live leaderboard churn.
4. Exam Intelligence CMS — should it bypass the existing review queue
   or feed into it? Default proposed: feed into the queue; nothing
   created by CMS is auto-published.

## 13. Out of scope for this doc

- Aspirant UX changes.
- Schema migrations beyond two new log tables
  (`support_content_access`, snapshot store).
- Mobile admin app.
- Public API for Study OS ops.
