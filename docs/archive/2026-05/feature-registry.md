# Career Copilot — Feature Registry

_Last updated: 2026-05-03_

This document maps product capabilities to their current implementation anchors.

## Governance and trust foundations

| Capability | Implementation anchors | Status |
|---|---|---|
| Admin RBAC enforcement | `lib/db/admin.ts`, `app/admin/*`, `actions/*` permission guards | ✅ |
| Admin audit visibility | `app/admin/audit/page.tsx`, `admin_audit_logs`, `logAdminAction` | ✅ |
| Eligibility queue operations | `app/admin/eligibility-queue/page.tsx`, `eligibility_recompute_queue`, queue RPC | ✅ |
| Notification governance | `app/admin/notifications/page.tsx`, `notification_templates`, kill switch controls | ✅ |

## Core aspirant experience

| Capability | Implementation anchors | Status |
|---|---|---|
| Mission-control dashboard | `app/dashboard/page.tsx`, `components/dashboard/MissionControlPanel.tsx`, `lib/db/mission-control.ts` | ✅ |
| Exam summary cards (UI term) | `app/dashboard/exams/page.tsx`, `app/api/exams/summary/route.ts`, `029_exam_summary_support.sql` | ✅ |
| Recruitment detail + timeline | `app/dashboard/recruitments/[id]/page.tsx`, `components/recruitments/Timeline.tsx` | ✅ |
| Apply tracker lifecycle | `app/dashboard/tracker/page.tsx`, `actions/apply-tracker.ts`, `lib/db/apply-tracker.ts` | ✅ |
| Light-theme foundation + dashboard shell | `app/layout.tsx`, `app/globals.css`, `components/dashboard/DashboardShell.tsx`, `components/dashboard/DashboardNav.tsx` | ✅ (Phase 1-2) |

## Intelligence and AI

| Capability | Implementation anchors | Status |
|---|---|---|
| Deterministic eligibility engine | `lib/eligibility/engine.ts`, eligibility consumer, queue claim RPC | ✅ |
| Ranking v1 | `supabase/migrations/038_ranking_v1.sql`, `lib/ranking/ranking.ts` | ✅ |
| Semantic retrieval foundations | `supabase/migrations/030_embeddings.sql` | 🔄 (schema only) |
| Explanation layer with provenance | planned `lib/explanations/*`, `app/api/explanations/route.ts` | ⏳ |

## Phase 8 active build target

| Capability | Planned anchors | Status |
|---|---|---|
| Community foundation | `community_*` tables, `/admin/community`, thread/reply notifications | ⏳ next |

## Domain invariant

```text
Database = recruitment
Frontend language = exam
Foreign key = recruitment_id
Avoid = public.exams
```
