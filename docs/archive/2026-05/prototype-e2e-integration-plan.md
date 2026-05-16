# Prototype → Production E2E Integration Plan

Source of truth for taking every prototype surface (`/prototype/*`) into a
real, backend-backed production surface (`/app/*`, `/admin/*`).

Inputs lifted from `app/frontend/src/prototype/screens/Handoff.jsx`:
- `COMPONENTS` — component inventory
- `SURFACE_MATRIX` — screen × surface × state × backend
- `BACKEND_GAPS` — known gaps to close

## Ground rules

- `/prototype/*` stays mock-only. We do not paste prototype screens into the
  app — we lift primitives and wire them to real APIs.
- Working routes are not replaced. New surfaces are additive.
- Any UI that is not connected to a real backend must show a "Preview /
  Not connected" label using `StatusDot` / `TrustStamp`.
- Truth labels (`eligible`, `high_yield`, `verified`, `locked`,
  `priority_score`, `why_this_task`, `reasoning_trace`) come from the
  backend only — the frontend never derives them.

## Surface tracker

| Prototype route | Production route | Status | API | Missing backend | Missing frontend | Test required |
|---|---|---|---|---|---|---|
| `/prototype` (today section) | `/app/today` | live | `/api/study/mission-control`, `/api/study/task-reasoning/:id` | `reasoning_trace[]` (layer, rule_key, label, evidence_id, confidence, status) added below the existing channels | StudyTaskCard renders the new trace if present | mission-control contract; task-reasoning trace |
| `/prototype` (plan section) | `/app/study-plan` | partial → live | `/api/study/plan`, `/api/study/plan/draft` (new), `/api/study/plan/apply` (new) | draft endpoint must not mutate the active plan; apply must be idempotent and emit `study_plan_versions` + `study_adaptation_events` rows | "Preview regenerated plan" button → before/after diff drawer → Apply; PlanChangeLogCard from real adaptation events | plan draft does not mutate active plan; plan apply creates version + adaptation event |
| `/prototype/subjects` | `/app/study/subjects` | partial → live | `/api/study/subjects`, `/api/study/topics` (new) | `/api/study/topics?exam_id&subject_id` returns locked-only rows enriched with mastery / pyq / priority / high-yield | TopicTree below subject cards; TopicEvidenceDrawer; keep empty state when no locked topics exist | topics endpoint returns locked rows only; high_yield never returned for unlocked rows |
| `/prototype` (focus section) | `/app/study/focus` | partial | `/api/study/focus/{start,stop,summary}` | reflection signal write path stubbed (best-effort) | — | — |
| `/prototype` (mocks section) | `/app/study/mocks` | partial → live | `/api/study/mocks`, `/api/study/mocks/:id/review` (new), `/api/study/mocks/:id/correction-tasks` (new) | persist `topic_id`, `subject_id`, totals, `error_types`, notes; recompute mastery; create correction tasks on request; regen on signal | Review Mock drawer; topic breakdown rows; error-type tags; generated correction tasks; answer-sheet parsing labelled Not connected | mock review persists error_types; correction tasks created |
| `/prototype` (review section) | `/app/study/review` | partial | `/api/study/weekly-review` | apply next-week adaptation gated behind admin/user — uses new `/api/study/plan/apply` | next-week diff card | (covered by plan apply tests) |
| `/prototype/eligibility` (blog/funnel CTA) | `/go/check-eligibility/...`, `/app/onboarding/chat` | live | `/api/onboarding-unified/*`, `/api/eligibility/*` | If authenticated and intent is `check_eligibility`, surface `recompute_enqueued`; no fake "matches increased" copy | CTA wiring from homepage + blog + recruitment detail to `/go/check-eligibility/...` | onboarding anonymous resolve/answer/stitch/complete |
| `/prototype/library` / `/prototype/seller` | `/app/marketplace` + new flows | preview | `/api/marketplace/*` (existing list/detail), new cart/checkout/library/orders/refunds/seller | full cart/checkout/library/orders/refunds/seller routes and matching backend (cart, checkout, orders, library, refunds, seller dashboard, seller listings, admin listing approval) | marketplace tabs + flows (Preview / Not connected until backend lands) | future work |
| `/prototype/groups` | `/app/community` (Groups tab) or `/app/groups` | preview | `/api/community/*` (existing forum) + new groups | study group flow: `/api/groups/recommended`, `/api/groups/:id`, `/api/groups/:id/{join,checkin,sessions}` | Groups tab inside Community (Preview / Not connected until backend lands) | future work |
| `/prototype/admin-eligibility` | `/admin/eligibility-queue`, `/admin/eligibility-ops` | live | existing eligibility admin | — | — | covered by existing admin tests |
| `/prototype/admin-community` | `/admin/community` | live | existing community admin | — | — | — |
| `/prototype/admin-marketplace` | `/admin/marketplace` | partial | existing marketplace admin | listing-draft approval endpoint (`PATCH /api/admin/marketplace/listings/:id/review`) | listing review UI | future work |
| `/prototype/admin-funnel` | `/admin/persona`, `/admin/operations` | partial | existing admin | — | — | — |
| `/prototype/handoff` | (n/a — internal doc) | — | — | — | — | — |
| (n/a) | `/admin/exam-intelligence` | partial → live | `/api/admin/exam-intelligence/*`, `/api/evidence/:kind/:id` (new), `PATCH /api/admin/exam-intelligence/topic-coverage/:id` (new — data fields) | universal evidence endpoint; topic-coverage data PATCH (`coverage_depth`, `expected_difficulty`, `exam_priority_score`, `is_high_yield`, `confidence_score`, `source_basis`, `reviewer_notes`) | EvidenceDrawer on review queue / topic coverage / competition / policy; edit drawer for coverage data fields | admin evidence endpoint permission; policy update official-only trust gate |

## Backend gap → endpoint

| Gap (from Handoff `BACKEND_GAPS`) | Endpoint / contract |
|---|---|
| Engine trace per task | `GET /api/study/task-reasoning/:task_id` extended with `reasoning_trace[]` |
| Plan adaptation | `GET/POST /api/study/plan/draft`, `POST /api/study/plan/apply` |
| Plan change log | `study_adaptation_events` already emitted; PlanChangeLogCard reads them via `/api/study/plan/changelog` |
| Update intelligence trust gating | `policy_update_context` filters aggregator-only rows out of `official_updates` (already enforced in update_context) |
| Topic coverage high-yield | server-side flag from `exam_topic_coverage.is_high_yield` AND `reviewer_status = 'locked'` |
| Competition trust status | every metric carries `trust_status`; only `locked` flows to planner |
| Mock correction | `POST /api/study/mocks/:id/review`, `POST /api/study/mocks/:id/correction-tasks` |
| Reflection signal | best-effort write on `/api/study/focus/stop` |
| Persona snapshot | already exposed via mission-control |
| Plan impact rollouts | admin lock lifecycle + `plan_impact` already handles draft/staged/live |
| Universal evidence | `GET /api/evidence/:kind/:id` |

## Shared UI primitives

Consolidation target: `app/frontend/src/shared/ui/`.

| Primitive | Location | Notes |
|---|---|---|
| StatusDot | `shared/ui/studyos/primitives.jsx` | re-exported from `shared/ui` for consistency |
| TrustStamp | `shared/ui/studyos/primitives.jsx` | re-exported |
| SourceTrustBadge | `shared/ui/SourceTrustBadge.jsx` | existing |
| ConfidencePill | `shared/ui/ConfidencePill.jsx` | existing |
| EvidenceDrawer | `shared/ui/EvidenceDrawer.jsx` | existing |
| SurfaceStateBanner | `shared/ui/SurfaceStateBanner.jsx` | new — banner version of StatusDot |
| EmptyState | `shared/ui/EmptyState.jsx` | existing |
| PlanChangeLogCard | `features/study/components/PlanChangeLogCard.jsx` | new — reads `/api/study/plan/changelog` |

## Test plan

| Concern | Test file |
|---|---|
| task reasoning 404 / user ownership | `app/backend/tests/study_os/test_study_os_api.py` (exists) |
| task reasoning trace shape | `app/backend/tests/study_os/test_study_os_api.py` (extend) |
| plan draft does not mutate active plan | `app/backend/tests/study_os/test_plan_draft_apply.py` (new) |
| plan apply creates version + adaptation event | `app/backend/tests/study_os/test_plan_draft_apply.py` (new) |
| topics endpoint returns locked rows only | `app/backend/tests/study_os/test_topics_endpoint.py` (new) |
| high_yield not returned for unlocked rows | same file |
| mock review persists error_types | `app/backend/tests/study_os/test_mock_review.py` (new) |
| correction tasks created | same file |
| onboarding anonymous resolve/answer/stitch/complete | `app/backend/tests/onboarding_unified/*` (exists) |
| admin evidence endpoint permission | `app/backend/tests/admin/test_evidence_endpoint.py` (new) |
| policy update official-only trust gate | `app/backend/tests/study_os/test_competition_update_context.py` (exists) |

## Out of scope for this PR

The marketplace E2E (cart / checkout / library / orders / refunds / seller
dashboard / admin listing approval) and the community-groups E2E
(`/api/groups/*`) are large, cross-cutting projects that need their own
schema. They stay preview-only and are documented as future work. The
prototype screens (`/prototype/library`, `/prototype/seller`,
`/prototype/groups`) continue to live under `/prototype/*` as mock
references; the production routes (`/app/marketplace`, `/app/community`)
keep their existing behaviour with a "Preview / Not connected" label on
the unbuilt surfaces.
