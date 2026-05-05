# Career Copilot Code Review Findings

_Last updated: 2026-04-30 — second audit + local build/runtime failure update_

Repo reviewed: `johnefficacy-crypto/career-copilot`  
Branch reviewed: `master`

This file records a second audit of the current codebase plus the latest local `npm run dev` and `npm run build` failures. It updates the earlier findings after rechecking README, CI, RBAC, notification runtime behavior, eligibility alert upserts, docs, admin actions, runtime logs, and production build output.

---

## 1. Executive summary

Career Copilot has a strong working foundation. The repo contains real implementations for Supabase data flows, admin surfaces, RBAC helpers, audit logging, notification preferences, notification governance UI, mission-control dashboard wiring, telemetry, deterministic eligibility logic, marketplace flows, and study/product surfaces.

However, the repo is still not release-clean.

Main current blockers:

- `npm run build` currently fails TypeScript in `actions/marketplace.ts`.
- `/admin/eligibility-queue` currently crashes at runtime because `.catch()` is called on a Supabase query builder result chain.
- Local dev performance is extremely slow; multiple routes take minutes to load and `.next/dev` cache writes/compactions are taking 40–100+ seconds.
- CI still does not run production build.
- RBAC permissions still have naming mismatch: `orgs` vs `organizations`.
- Multiple admin mutations still use broad `requireAdmin()` instead of permission-specific checks.
- Notification kill switch writes to `admin_settings`, but the email dispatcher does not read that flag.
- `upsertNotificationAlerts()` exists, but `runEligibilityForUser()` still directly upserts alerts with `ignoreDuplicates: true`.
- Root README required-reading links were partly fixed, but the documentation map still lists old paths.
- Implementation checklist still contains duplicate/stale historical content.

---

## 2. Latest local run/build blockers

These are confirmed from the latest local logs.

### 2.1 Runtime crash: `/admin/eligibility-queue`

Command:

```bash
npm run dev
```

Observed error:

```text
TypeError: supabase.rpc(...).maybeSingle(...).catch is not a function
at EligibilityQueuePage (app\admin\eligibility-queue\page.tsx:63:96)
```

Problem file:

```text
app/admin/eligibility-queue/page.tsx
```

Current problematic pattern:

```ts
const { data: stats } = await supabase
  .rpc("get_eligibility_queue_stats")
  .maybeSingle()
  .catch(() => ({ data: null }))
```

Root cause:

Supabase query builder chains are awaitable, but `.catch()` should not be appended this way. The chain does not expose `.catch()` like a normal Promise in this context.

Recommended fix:

```ts
let stats = null

try {
  const { data, error } = await supabase
    .rpc("get_eligibility_queue_stats")
    .maybeSingle()

  if (!error) stats = data
} catch {
  stats = null
}
```

Alternative smaller fix:

```ts
const statsRes = await supabase
  .rpc("get_eligibility_queue_stats")
  .maybeSingle()

const stats = statsRes.error ? null : statsRes.data
```

Release impact:

- Admin eligibility queue route is not stable.
- This blocks governance/operations because queue monitoring is part of the automation safety gate.

Priority:

```text
P0 — runtime crash
```

---

### 2.2 Production build failure: `actions/marketplace.ts`

Command:

```bash
npm run build
```

Observed result:

```text
Compiled successfully
Running TypeScript .Failed to type check.
```

Build-blocking error:

```text
./actions/marketplace.ts:300:7
Type error: Argument of type 'PostgrestFilterBuilder...' is not assignable to parameter of type 'readonly string[]'.
```

Problem file:

```text
actions/marketplace.ts
```

Current problematic code:

```ts
const { count: totalLessons } = await supabase
  .from("lessons")
  .select("id", { count: "exact", head: true })
  .in(
    "section_id",
    supabase.from("course_sections").select("id").eq("course_id", courseId)
  )
```

Root cause:

Supabase `.in()` expects an array of values, not another Supabase query builder.

Recommended fix:

```ts
const { data: sections, error: sectionsError } = await supabase
  .from("course_sections")
  .select("id")
  .eq("course_id", courseId)

if (sectionsError) {
  redirect(`/instructor/courses/${courseId}/edit?error=${encodeURIComponent(sectionsError.message)}`)
}

const sectionIds = (sections ?? []).map((s) => s.id)

let totalLessons = 0

if (sectionIds.length > 0) {
  const { count, error: lessonsCountError } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .in("section_id", sectionIds)

  if (lessonsCountError) {
    redirect(`/instructor/courses/${courseId}/edit?error=${encodeURIComponent(lessonsCountError.message)}`)
  }

  totalLessons = count ?? 0
}

await supabase
  .from("courses")
  .update({
    total_lessons: totalLessons,
    updated_at: new Date().toISOString(),
  })
  .eq("id", courseId)
```

Simpler alternative:

If the database supports a relationship from `lessons -> course_sections -> courses`, create a view or RPC for lesson count by course. That is cleaner for repeated usage.

Release impact:

- `next build` fails.
- Deployment should be blocked.
- CI currently misses this because CI does not run `npm run build`.

Priority:

```text
P0 — production build blocker
```

---

### 2.3 Local development performance problem

Observed route timings:

```text
GET /admin/rbac 200 in 20.5min
GET /admin/audit 200 in 29.4min
GET /dashboard 200 in 2.0min
GET /dashboard 200 in 112s
GET /marketplace 200 in 36.6s
```

Observed Next.js warning:

```text
Slow filesystem detected. The benchmark took 612ms.
```

Also observed:

```text
Finished writing to filesystem cache in 112s
Finished filesystem cache database compaction in 96s
```

Likely causes:

- `.next/dev` cache is huge, corrupted, or slow to compact.
- Project path on Windows may be hitting slow filesystem behavior.
- Turbopack filesystem cache writes are extremely slow.
- Admin pages may be loading too much data without pagination or heavy joins.
- Antivirus/indexing may be scanning `.next` and `node_modules`.

Immediate local cleanup:

```powershell
Ctrl + C
Remove-Item -Recurse -Force .next
npm run dev
```

Recommended local setup improvements:

```text
1. Move repo to a short local path, e.g. D:\projects\career-copilot.
2. Exclude repo folder, .next, and node_modules from antivirus scanning if safe.
3. Avoid OneDrive/Dropbox/network/synced folders.
4. Check admin pages for unbounded queries.
5. Add pagination/limits to heavy admin pages.
```

Operational impact:

- Development feedback loop is too slow.
- Admin pages may hide real performance problems.
- Slow dev cache can make small fixes feel broken even when code is correct.

Priority:

```text
P1 — developer productivity and admin performance
```

---

## 3. What improved since the previous audit

| Area | Previous finding | Current status |
|---|---|---|
| README required-reading links | Pointed to old docs paths | Partly fixed. Required-reading section now points to `docs/operations/implementation-checklist.md`, `docs/engineering/domain-model.md`, and `docs/operations/runbook.md`. |
| Review findings file | Did not exist before previous pass | Exists at `docs/operations/code-review-findings-2026-04-30.md`. |
| Admin settings migration | Needed confirmation | Exists. `admin_settings` table seeds `notifications_paused = false`. |
| Notification alert upsert helper | Needed confirmation | Exists in `lib/db/notifications.ts`. |
| Local build verification | Was recommended | Now confirmed: build currently fails in `actions/marketplace.ts`. |
| Local runtime verification | Was recommended | Now confirmed: `/admin/eligibility-queue` crashes. |

---

## 4. Documentation findings

### Current status

Root README now partly follows the new docs structure in the required-reading section.

Good current links:

```md
[`docs/operations/implementation-checklist.md`](docs/operations/implementation-checklist.md)
[`docs/engineering/domain-model.md`](docs/engineering/domain-model.md)
[`docs/operations/runbook.md`](docs/operations/runbook.md)
[`docs/engineering/admin-strategy.md`](docs/engineering/admin-strategy.md)
```

### Remaining doc drift

README documentation map still lists old paths:

```text
docs/database-domain-model.md
docs/implementation_status_checklist.md
docs/runbook.md
docs/admin_automation_strategy.md
docs/source-intelligence-strategy.md
docs/product_strategy_architecture_roadmap.md
docs/archive/
```

But current docs live under newer folders:

```text
docs/engineering/domain-model.md
docs/operations/implementation-checklist.md
docs/operations/runbook.md
docs/engineering/admin-strategy.md
docs/engineering/source-intelligence.md
docs/product/roadmap.md
docs/history/
```

### Checklist issue

`docs/operations/implementation-checklist.md` still contains two merged versions:

1. Newer checklist: “Last updated: 2026-04-30 — Sprints 5/6/7 complete”.
2. Older checklist: “Last updated: 2026-04-29”.

This makes the file unreliable as a single source of truth.

### Required fix

- Keep only one current checklist.
- Move older historical section to `docs/history/`.
- Fix root README documentation map.
- Do not claim “single source of truth” until stale duplicate content is removed.

---

## 5. Build and CI findings

### Package scripts

`package.json` has the required scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest"
}
```

### Local build status

Current local production build fails during TypeScript checking:

```text
actions/marketplace.ts:300:7
```

See section `2.2 Production build failure` above.

### CI current behavior

`.github/workflows/ci.yml` runs:

```yaml
- run: npm ci
- run: npm run lint
- run: npm run typecheck
- run: npm run test -- --run
```

Database job runs:

```yaml
- run: npm install -g supabase
- run: supabase db lint
```

### Gap

CI still does not run:

```bash
npm run build
```

README says build must be run before merging or marking a task complete. CI does not enforce that.

### Required fix

Add this after tests:

```yaml
- run: npm run build
```

### Minor dependency drift

Current versions:

```json
"next": "16.2.4",
"eslint-config-next": "16.2.1"
```

Align `eslint-config-next` with `next` unless there is a specific reason not to.

---

## 6. RBAC findings

### What exists

`requireAdminRole()` exists in `lib/db/admin.ts` and centralizes admin role checks.

Roles:

```ts
super_admin
ops_admin
content_admin
scraper_admin
support_admin
```

### Critical mismatch still present

`ROLE_PERMISSIONS` uses `orgs`:

```ts
ops_admin:     ["scrape", "sources", "queue", "recruitments", "orgs", "audit"],
content_admin: ["recruitments", "orgs", "posts"],
```

But code uses `organizations`:

```ts
requireAdminRole("organizations")
```

This mismatch can block `ops_admin` and `content_admin` from organization actions even though they are intended to have org access.

### Required fix

Use one permission vocabulary everywhere.

Recommended:

```ts
ops_admin:     ["scrape", "sources", "queue", "recruitments", "organizations", "audit", "rbac", "notifications"],
content_admin: ["recruitments", "organizations", "posts"],
scraper_admin: ["scrape", "sources", "queue"],
support_admin: ["users", "notifications"],
```

Then use:

```ts
await requireAdminRole("organizations")
```

---

## 7. Broad admin guards still remain

The checklist says full RBAC enforcement is done, but code still has broad admin guards.

### In `actions/admin.ts`

These still use `requireAdmin()`:

- `adminCreateOrganization`
- `adminUpdateOrganization`
- `adminSavePost`
- `adminDeletePost`
- `adminTriggerEligibilityRecompute`

### In `actions/notifications.ts`

A local `requireAdmin()` wrapper calls `requireAdminRole()` without a permission argument. That still accepts any admin role.

Broad admin access is used for:

- `adminApproveQueueItem`
- `adminRejectQueueItem`
- `adminSetExtractionStatus`
- `adminReviewEvidenceField`
- `adminToggleScrapeSource`
- `adminResetSourceFails`
- `adminFanOutNotifications`
- `adminTriggerScraper`
- `adminTriggerDeadlineSweep`

### Required fix

Replace broad checks with specific permission checks:

```ts
await requireAdminRole("organizations")
await requireAdminRole("posts")
await requireAdminRole("queue")
await requireAdminRole("scrape")
await requireAdminRole("sources")
await requireAdminRole("notifications")
await requireAdminRole("eligibility")
```

### RBAC verdict

RBAC foundation exists, but full RBAC enforcement is still partial.

---

## 8. Audit logging findings

### What exists

`logAdminAction()` exists and writes to `admin_audit_logs`.

It is intentionally non-blocking.

### Good coverage

Audit logging exists for several important actions:

- create recruitment
- update recruitment
- delete recruitment
- submit recruitment for review
- publish recruitment
- withdraw recruitment
- verify organization
- approve/reject scrape item
- set extraction status
- review evidence field
- notification pause/resume
- RBAC role update

### Gaps

Audit logging is still incomplete for:

- organization create
- organization update
- post create/update/delete
- eligibility recompute trigger
- scraper trigger
- deadline sweep trigger
- source toggle/reset actions in `actions/notifications.ts`

### Required fix

Every admin mutation should follow this pattern:

```ts
const ctx = await requireAdminRole("permission")
// perform mutation
void logAdminAction({
  actorId: ctx.userId,
  actorEmail: ctx.userEmail,
  action: "action_name",
  entityType: "entity_type",
  entityId,
  oldValue,
  newValue,
})
```

---

## 9. Notification system findings

### User preferences: implemented

Files:

```text
app/api/notifications/preferences/route.ts
app/dashboard/notifications/preferences/page.tsx
```

Supports:

- email opt-in/off
- digest frequency
- minimum email priority
- in-app notifications
- quiet hours
- DPDP consent note

### Admin governance page: implemented

File:

```text
app/admin/notifications/page.tsx
```

Includes:

- total/sent/pending/failed counts
- recent send log
- emergency kill switch
- audit link

### Admin setting exists

Migration exists:

```text
supabase/migrations/032_admin_settings.sql
```

It creates:

```sql
public.admin_settings
```

And seeds:

```sql
('notifications_paused', 'false')
```

### Critical runtime gap

`supabase/functions/email-dispatcher/index.ts` does not read `admin_settings.notifications_paused`.

So the admin UI can set the flag, but the dispatcher will still send emails if invoked.

### Required dispatcher fix

Add this near the start of the email dispatcher after creating the Supabase client:

```ts
const { data: pauseFlag } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "notifications_paused")
  .maybeSingle()

if (pauseFlag?.value === "true") {
  return new Response(
    JSON.stringify({ dispatched: 0, errors: 0, message: "Notifications paused" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}
```

### Notification verdict

Notification UI and preferences are real. Emergency kill switch is not fully operational until dispatcher enforcement is added.

---

## 10. Notification alert upsert findings

### Helper exists

`lib/db/notifications.ts` defines:

```ts
upsertNotificationAlerts(alerts)
```

It uses:

```ts
ignoreDuplicates: false
```

This is correct for keeping alert state current.

### But runner still bypasses helper

`runEligibilityForUser()` still directly writes to `notification_alerts` using:

```ts
.upsert(alertInserts, {
  onConflict: "user_id,recruitment_id,alert_type",
  ignoreDuplicates: true,
})
```

This conflicts with the checklist claim:

```text
Wire upsertNotificationAlerts into runEligibilityForUser callers
```

### Required fix

Use the helper from `lib/db/notifications.ts`, or change the direct runner upsert to update duplicates:

```ts
await upsertNotificationAlerts(alertInserts)
```

If Edge Function/service-role client compatibility is required, modify the helper to accept an optional Supabase client:

```ts
upsertNotificationAlerts(alerts, supabaseOverride?)
```

### Alert verdict

The helper is correct, but it is not wired into the main eligibility alert path yet.

---

## 11. Eligibility findings

### Completed

`runEligibilityForUser()` performs the core flow:

- loads profile
- loads education
- loads exam attempts
- loads tracked recruitments
- loads active posts
- runs deterministic eligibility
- writes `eligibility_results`
- creates `notification_alerts`

### Good architecture

The deterministic engine remains the source of truth for eligibility. This matches the product rule:

```text
Determinism > Heuristics
```

### Runtime issue

The eligibility queue admin page currently crashes because of the Supabase `.catch()` usage described in section `2.1`.

### Scaling risk

Manual recompute in `actions/admin.ts` is sequential and broad:

```ts
users.map((u) => runEligibilityForUser(u.id))
```

This is acceptable for small data but not for scale.

### Required future fix

Admin-triggered recompute should enqueue jobs into `eligibility_recompute_queue`, not directly run every user in one server action.

---

## 12. Marketplace findings

### Production build blocker

`actions/marketplace.ts` currently fails TypeScript because `.in()` receives a query builder instead of an array.

Problem area:

```ts
.in(
  "section_id",
  supabase.from("course_sections").select("id").eq("course_id", courseId)
)
```

### Correct pattern

Fetch section IDs first, then pass the array to `.in()`:

```ts
const { data: sections } = await supabase
  .from("course_sections")
  .select("id")
  .eq("course_id", courseId)

const sectionIds = (sections ?? []).map((s) => s.id)

const { count } = sectionIds.length > 0
  ? await supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .in("section_id", sectionIds)
  : { count: 0 }
```

### Better long-term option

Create a DB view or RPC that returns lesson counts by `course_id`.

Example RPC idea:

```sql
create or replace function public.count_course_lessons(p_course_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.lessons l
  join public.course_sections cs on cs.id = l.section_id
  where cs.course_id = p_course_id;
$$;
```

Then call:

```ts
const { data: totalLessons } = await supabase.rpc("count_course_lessons", {
  p_course_id: courseId,
})
```

---

## 13. Mission-control dashboard findings

### Completed

Dashboard page fetches:

- dashboard data
- eligible recruitments
- notifications
- unread count
- study plans
- chat sessions
- next actions
- mission-control data

`getMissionControlData()` queries:

```text
user_recruitment_state
```

It safely returns an empty object if the view errors.

### Good

This prevents dashboard crashes during migration rollout.

### Risk

Silent fallback can hide DB/migration problems.

### Required improvement

Keep empty fallback for users, but log failures server-side:

```ts
if (error) console.error("getMissionControlData", error.message)
```

---

## 14. Telemetry findings

### Completed

`POST /api/events` exists and writes to:

```text
user_events
```

It validates:

- `entity_type`
- `entity_id` presence
- `event_type`
- `metadata`

### Gap

`entity_id` only checks that it is a non-empty string.

### Required improvement

For entity types that should use UUIDs, validate format:

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

Allow non-UUID only for dashboard/global events if needed.

---

## 15. Domain model findings

The domain rule remains correct:

```text
Database = recruitment
Frontend language = exam
Foreign key = recruitment_id
Avoid = public.exams
```

Current source search did not show active app/action/lib usage of:

```ts
from("exams")
```

or direct canonical usage of:

```sql
public.exams
```

The domain model is good. The problem is mostly README/checklist path drift, not domain design.

---

## 16. Completed vs partial vs future

### Completed / mostly complete

| Item | Status |
|---|---|
| Next.js + Supabase foundation | Done |
| Package scripts | Done |
| CI lint/typecheck/test/db lint | Mostly done |
| Domain model | Done |
| Operational runbook | Done |
| RBAC helper | Done |
| Source actions granular RBAC | Done |
| Audit logging helper | Done |
| Notification preferences API | Done |
| Notification preferences UI | Done |
| Notification governance UI | Done |
| Admin settings table | Done |
| Mission-control fetcher | Done |
| Dashboard mission-control wiring | Done |
| Telemetry API | Done |
| Eligibility runner | Done |
| Notification alert upsert helper | Done, but not wired into runner |

### Partial / needs correction

| Item | Gap |
|---|---|
| Root README docs map | Still old paths |
| Implementation checklist | Duplicate/stale historical section |
| CI release gate | Missing `npm run build` |
| Local production build | Fails in `actions/marketplace.ts` |
| Admin eligibility queue | Runtime crash in `page.tsx` |
| Full RBAC | Broad `requireAdmin()` checks remain |
| Organization permission | `orgs` vs `organizations` mismatch |
| Notification kill switch | UI writes flag, dispatcher ignores it |
| Alert state updates | Helper exists, runner bypasses it |
| Audit coverage | Some admin mutations not logged |
| Telemetry validation | No UUID validation |
| Mission-control errors | Silent fallback hides DB issues |
| Local dev performance | Very slow route loads and cache writes |

### Future / not implemented

| Item | Status |
|---|---|
| Source URL verification console | Future |
| Domain verification tool | Future |
| Redirect/content-type inspection | Future |
| Recruitment publish gate validation | Future |
| Recruitment version history | Future |
| Change diff viewer | Future |
| Eligibility dead-letter view | Future |
| Rule version tracking | Future |
| Eligibility explanation inspector | Future |
| AI runtime policy enforcement | Future |
| Marketplace trust filters | Future |
| Community/mentorship module | Future |
| Topic proficiency and spaced repetition | Future |

---

## 17. P0 action list

Fix these before calling the codebase release-ready:

1. Fix `app/admin/eligibility-queue/page.tsx` Supabase `.catch()` runtime error.
2. Fix `actions/marketplace.ts` `.in()` type error.
3. Add `npm run build` to CI.
4. Fix `orgs` vs `organizations` permission mismatch.
5. Replace broad `requireAdmin()` checks in admin mutations.
6. Add dispatcher enforcement for `notifications_paused`.
7. Wire `upsertNotificationAlerts()` into `runEligibilityForUser()` or update direct upsert behavior.
8. Clean `docs/operations/implementation-checklist.md` duplicate sections.
9. Fix root README documentation map.
10. Add missing audit logs for admin mutations.

---

## 18. Recommended next PRs

### PR 1 — Build/runtime blockers

```text
fix(build): resolve marketplace type error and eligibility queue runtime crash
```

Scope:

- Fix Supabase `.catch()` usage in eligibility queue page.
- Fix `.in()` usage in marketplace lesson-count logic.
- Run `npm run build` locally.

### PR 2 — CI and documentation truth

```text
ci+docs: enforce build gate and align docs map
```

Scope:

- Add `npm run build` to CI.
- Fix README documentation map.
- Remove duplicated checklist section.

### PR 3 — RBAC cleanup

```text
fix(rbac): normalize permissions and remove broad admin guards
```

Scope:

- Replace `orgs` with `organizations`.
- Add missing permission keys.
- Replace broad `requireAdmin()` calls.
- Ensure every admin mutation has permission-specific guard.

### PR 4 — Notification runtime safety

```text
fix(notifications): enforce kill switch and update alert state
```

Scope:

- Email dispatcher checks `notifications_paused`.
- `runEligibilityForUser()` uses current-state alert upsert.
- Add tests or manual verification notes.

### PR 5 — Audit coverage

```text
fix(audit): log all admin mutations
```

Scope:

- Organization create/update.
- Post save/delete.
- Eligibility recompute trigger.
- Scraper/deadline trigger.
- Source toggle/reset.

---

## 19. Verification checklist after fixes

Run locally:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run dev
```

Manually verify:

```text
/admin/eligibility-queue loads without crashing
/instructor/courses/[id]/edit can add lesson
course total_lessons updates correctly
/admin/notifications kill switch prevents dispatcher sends
/admin/rbac and /admin/audit load in acceptable time
/dashboard loads without 2-minute server time
```

Optional local cleanup before re-test:

```powershell
Ctrl + C
Remove-Item -Recurse -Force .next
npm run dev
```

---

## 20. Final verdict

The codebase has a strong architecture and meaningful implementation, but the release gate should remain closed until the current build/runtime blockers and governance issues are corrected.

Current status:

```text
Product foundation: strong
Docs structure: improving, still drifting
RBAC: implemented, not fully enforced
Notifications: UI complete, runtime kill switch incomplete
Eligibility: real engine, queue page currently crashes
Marketplace: useful module, production build currently fails
CI: useful but missing production build
Local dev: very slow, cache/filesystem issue likely
```

Best immediate focus:

```text
Fix runtime/build blockers first, then trust cleanup before feature expansion.
```
