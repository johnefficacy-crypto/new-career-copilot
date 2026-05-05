# Career Copilot — AI/Agent Context

_Last updated: 2026-05-03 — Sprint 8 in progress, light-theme migration phases 1-2 complete_

This file gives AI agents and new contributors the minimum context needed to work effectively on this codebase. Read this first, then follow the links for depth.

---

## What this product is

Career Copilot is an **eligibility-first, recruitment-canonical exam preparation operating system** for Indian government-job aspirants.

It helps aspirants:

1. Discover official government exam notifications from verified sources.
2. Check personalized eligibility matched to their profile.
3. Understand exams via PYQ trends, cutoff analysis, vacancy history, and competition metrics.
4. Prepare using AI-generated study plans, mock-test tracking, and focus sessions.
5. Track applications, deadlines, admit cards, and results.
6. Connect with peers, accountability partners, and verified mentors.

See [product/vision.md](product/vision.md) for the full positioning and principles.

---

## Non-negotiable domain rules

```
Database entity  = recruitment        (public.recruitments)
Frontend label   = exam               (UI/product language only)
Foreign key      = recruitment_id
Avoid            = public.exams
```

- `public.recruitments` is the canonical entity. Never create `public.exams` to satisfy old code.
- `exam` may be used in routes, component names, and UI copy (`/dashboard/exams`, `ExamSummaryCard`).
- All joins, migrations, and new APIs must use `recruitment_id`, `organization_id`, `post_id`.
- Eligibility verdicts must come from the deterministic engine, not AI or heuristics.
- AI may propose, summarize, score, and explain. AI must not publish, verify, or override determinism.

See [engineering/domain-model.md](engineering/domain-model.md).

---

## Current implementation state (Sprint 8 in progress)

### Done and operational

- Eligibility engine (age, category, education, domicile, PwBD, ex-serviceman, appearing-candidate)
- Full RBAC enforcement across admin routes and server actions
- Admin governance: audit viewer, eligibility queue monitor, RBAC manager
- Scraper: source registry, 6-hour scheduled scraper, queue review, evidence approval
- Notifications: email dispatcher, preferences UI, templates, kill switch
- Recruitment publish workflow (draft → needs_review → verified → published)
- Organization trust fields and verification
- Mission-control dashboard, exam summary cards, recruitment detail pages
- Light-theme foundation + dashboard shell migrated (Phase 1-2), with page-by-page light migration pending
- Apply tracker (durable application state, fee, notes)
- Study OS: focus timer, mock-test log, subject breakdowns, weekly review
- Ranking v1 (eligibility × urgency × org trust × behavior)
- Telemetry pipeline (`user_events`, `form_submissions`)
- CI gate (lint, typecheck, tests, DB lint)

### Not yet built (current roadmap)

- Community forum (exam-specific spaces, threads, upvotes)
- Mentor session marketplace (verified toppers, paid video sessions)
- Study groups and accountability partners
- Resource sharing library
- WhatsApp notifications
- PYQ intelligence (analytics, question-level data)
- Exam master entity (`exam_families`, `exam_cycles`, `exam_pyq_*`)
- Semantic search (embeddings pipeline partially scaffolded)

See [operations/implementation-checklist.md](operations/implementation-checklist.md) for the full status.

---

## Governance rules that apply to all code changes

- Governance before automation. RBAC, audit, and eligibility queue monitoring are P0.
- Admin route visibility is not enough. Server actions must enforce permissions independently.
- Admin mutations must call `logAdminAction` where the audit utility exists.
- Eligibility-triggered `new_match` alerts must come from engine verdicts, not blind broadcasts.
- Official sources are canonical. Aggregator URLs must never be user-facing primary URLs.
- AI-generated content in admin flows must pass the AI action policy layer before use.

See [engineering/admin-strategy.md](engineering/admin-strategy.md).

---

## Before editing code — read order

For any task, read in this order:

1. This file (`docs/00-ai-context.md`) — you are here.
2. [operations/implementation-checklist.md](operations/implementation-checklist.md) — current implementation truth.
3. [engineering/domain-model.md](engineering/domain-model.md) — DB and domain rules.
4. [operations/runbook.md](operations/runbook.md) — operational procedures.
5. The module-specific doc if one exists (e.g., `docs/engineering/admin-strategy.md` for admin work, `docs/product/community-platform.md` for community work).

---

## Verification commands (run before marking work complete)

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Domain regression checks:

```bash
grep -R "public.exams\|from(\"exams\"\|from('exams'" app actions lib supabase --exclude-dir=node_modules || true
grep -R "is_admin\|profile?.is_admin" app actions lib components --exclude-dir=node_modules || true
```

---

## Key file paths

| Area | Path |
|---|---|
| Eligibility engine | `lib/eligibility/engine.ts` |
| Mission control data | `lib/db/mission-control.ts` |
| Admin RBAC | `lib/db/admin.ts` |
| Notifications | `lib/db/notifications.ts` |
| Apply tracker | `lib/db/apply-tracker.ts` |
| Mock tests | `lib/db/mock-tests.ts` |
| Ranking | `lib/ranking/ranking.ts` |
| Study planner | `lib/db/study-planner.ts` |
| Source registry | `lib/db/source-registry.ts` |
| Billing plans | `lib/billing/plans.ts` |
| Admin audit log | `logAdminAction` in `lib/db/admin.ts` |
| Migrations | `supabase/migrations/` (001–038 applied) |

---

## Migration dependency order (critical)

```
027_user_events_and_form_submissions.sql
028_user_recruitment_state.sql
029_exam_summary_support.sql
```

Telemetry must exist before user state views. User state must exist before exam summary.

---

## Strategic rule

```
Trust > Speed
Control > Automation
Determinism > Heuristics
```
