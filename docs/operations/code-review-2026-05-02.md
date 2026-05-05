# Code Review — Dashboard & Related Components vs Docs

_Date: 2026-05-02_

## Scope

Focused implementation audit of:

- `app/dashboard/page.tsx`
- `app/dashboard/notifications/page.tsx`
- `components/dashboard/*`
- `lib/db/mission-control.ts`

Compared against governance and implementation expectations in:

- `docs/00-ai-context.md`
- `docs/operations/implementation-checklist.md`
- `docs/engineering/domain-model.md`
- `docs/operations/runbook.md`

## Executive summary

Dashboard architecture is broadly aligned with product direction (mission-control-first, deterministic prioritization, profile impact, and notification governance hooks), but there are immediate correctness/documentation gaps:

1. **P0 compile break on notifications page** (`ALERT_ICONS`, `timeAgo` undefined) blocks typecheck and release gating.
2. **P1 governance drift in admin/dashboard auth surface**: legacy `is_admin` values still drive layout/nav behavior in key paths.
3. **P1 code-health drift in dashboard orchestration comments/types**: stale implementation comments conflict with current `DashboardShell` props and can mislead future edits.
4. **P1 deterministic UX consistency gap**: fallback/error handling is good in data fetching, but some mapping logic remains heuristic and undocumented as heuristic.

## Detailed findings

### 1) P0 — Notifications page is not build-safe despite checklist completion claims

`app/dashboard/notifications/page.tsx` references symbols not declared in file imports/constants:

- `ALERT_ICONS`
- `timeAgo`

This is consistent with current typecheck failures and means the dashboard notifications surface is not release-ready.

### 2) P1 — Dashboard orchestration is resilient, but comments are stale and partially contradictory

`app/dashboard/page.tsx` fetches key datasets in parallel and applies defensive fallbacks (`catch(() => [])`, `catch(() => 0)`) which is good for user continuity when dependent views/functions are not yet available.

However, top-of-file implementation notes claim `DashboardShell` does not accept children, while `DashboardShell` currently *does* include `children?: React.ReactNode` in `Props`. This creates maintenance confusion and increases risk of incorrect refactors.

### 3) P1 — Deterministic prioritization implementation aligns with docs, but route intent can be sharper

`TodayPrioritiesPanel` ordering logic matches documented principles (urgency → confidence/profile completeness → execution tasks). This is a strong alignment point.

But profile blockers route users to `/onboarding/identity` universally; if blockers include education/exam credentials, a single static route may reduce action precision. Given checklist emphasis on deterministic next-actions, this can be improved by blocker-type-specific routing.

### 4) P1 — Governance surface still includes legacy boolean admin semantics

- `DashboardShell` passes `isAdmin={profile?.is_admin ?? false}` into dashboard nav.
- broader grep also shows legacy `is_admin` usage in admin layout paths.

This does not necessarily violate server-action enforcement directly, but it preserves a parallel boolean-admin mental model that docs explicitly aim to retire in favor of permission-bucket RBAC.

### 5) P1 — Mission-control data layer is robust but swallows error context completely

`getMissionControlData` uses protective fallback to `EMPTY` on both query error and thrown exceptions, keeping dashboard render stable.

Tradeoff: all failures collapse into silent empty-state behavior, making operational diagnosis harder unless observability exists elsewhere. For governance-heavy operations, returning a lightweight error reason (or logging hook) would better support incident triage without breaking UX.

### 6) P2 — Heuristic exam ID mapping in DashboardShell should be explicitly documented as non-canonical

`DashboardShell` maps recruitment names to exam registry IDs via substring matching. This is useful for current UX but should be explicitly tagged as a temporary heuristic path, because canonical domain rules prioritize deterministic `recruitment_id` relationships.

## What is aligned well

- Mission-control summary uses canonical recruitment-centric state (`user_recruitment_state`, `recruitment_id`) rather than introducing `public.exams` assumptions.
- Dashboard page uses parallel data fetching and safe fallbacks for partial migration environments.
- Priorities panel reflects deterministic-first UX and avoids AI autonomy over eligibility decisions.

## Priority recommendations

1. **Fix P0 notifications compile defects first** (`ALERT_ICONS`, `timeAgo`) and re-run lint/typecheck/build.
2. **Clean stale dashboard orchestration comments** so file headers match current component contracts.
3. **Reduce boolean-admin propagation in dashboard/admin UI layers** by shifting view gating to permission-derived flags.
4. **Improve deterministic next-action precision** by routing profile blockers to field-specific onboarding steps.
5. **Add structured warning telemetry for mission-control fallback paths** so silent empty states are diagnosable.
6. **Mark exam-name mapping as heuristic and plan deterministic replacement** (registry linkage keyed by canonical IDs).

## Evidence commands run

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
grep -R "public.exams\|from(\"exams\"\|from('exams'" app actions lib supabase --exclude-dir=node_modules || true
grep -R "is_admin\|profile?.is_admin" app actions lib components --exclude-dir=node_modules || true
```
