# Study OS Frontend Full Audit (Code-Only)

## Scope
- Audit target: Study OS frontend runtime and UI surfaces under `app/frontend/src`.
- Coverage: **46 files** (components, hooks, study pages, dashboard integration, and study UI primitives).
- Method: file-by-file, line-by-line static inspection of the Study OS surface; no docs or external design notes used.

## Major gaps (actionable)

1. **No automated tests for Study OS frontend behavior**
   - The Study OS pages/components are large and stateful but there are no colocated `*.test.*` / `*.spec.*` files in the Study OS frontend scope.
   - Risk: regressions in planner workflows (apply/toggle/carry-forward, compare, mocks lifecycle, focus timer) can ship silently.

2. **High complexity concentration in single page modules**
   - `Mocks.jsx` (775 LOC), `WeeklyReview.jsx` (537 LOC), `StudyPlan.jsx` (494 LOC), `Compare.jsx` (422 LOC), `Today.jsx` (413 LOC), `Focus.jsx` (353 LOC) carry heavy orchestration + render logic.
   - Risk: fragile edits, duplicated state transitions, and difficult edge-case validation.

3. **Suppressed hook dependency safety in production flow**
   - `WeeklyReview.jsx` disables `react-hooks/exhaustive-deps` for a core fetch effect.
   - Risk: stale closure behavior and hidden data-sync bugs during future refactors.

4. **Fire-and-forget API flows and silent failure paths**
   - Multiple screens catch/ignore failures (`catch(() => {})` or broad catches with thin user feedback), especially in focus session refresh and fallback chains.
   - Risk: users observe stale data without clear recovery path; support/debugging cost increases.

5. **Tight API coupling in page components**
   - Large pages call many endpoints inline instead of centralizing domain actions behind dedicated feature hooks/services.
   - Risk: inconsistent retries/error normalization and harder migration when backend contracts evolve.

6. **Timer/session lifecycle fragility in Focus flow**
   - Focus timer relies on interval ticks + async start/stop side effects in one component.
   - Risk: race conditions around tab visibility/network delays and session-finalization mismatch.

7. **Limited backend-sync guard granularity for study UX**
   - Route-level backend gating exists, but component-level fallback behaviors still mix legacy/data fallback pathways.
   - Risk: inconsistent screen readiness where some panels show partial state while others block.

## File-by-file audit ledger

### Dashboard + entry surfaces
- `app/frontend/src/pages/Dashboard.jsx` — reviewed, no critical security issue; moderate maintainability coupling to dashboard hook.
- `app/frontend/src/pages/Today.jsx` — reviewed, **major** reliability/complexity concerns (multi-endpoint fallback and mutation orchestration).
- `app/frontend/src/features/dashboard/hooks/useDashboardData.js` — reviewed, basic hook; needs stronger error typing and retry policy alignment.
- `app/frontend/src/features/dashboard/components/TodaysActions.jsx` — reviewed, low risk.
- `app/frontend/src/services/dashboardService.js` — reviewed, thin service; expand as canonical Study OS data facade.

### Study planning + execution pages
- `app/frontend/src/pages/StudyPlan.jsx` — reviewed, **major** complexity concentration and inline API orchestration.
- `app/frontend/src/pages/study/Subjects.jsx` — reviewed, low-to-medium risk.
- `app/frontend/src/pages/study/Mocks.jsx` — reviewed, **major** complexity and lifecycle breadth (create/analyze/review/corrections).
- `app/frontend/src/pages/study/WeeklyReview.jsx` — reviewed, **major** maintainability risk + suppressed hook dependency guard.
- `app/frontend/src/pages/study/Focus.jsx` — reviewed, **major** timer/session lifecycle risk.
- `app/frontend/src/pages/study/Compare.jsx` — reviewed, **major** multi-source async coupling and partial-settlement behavior.

### Study feature components (all reviewed)
- `app/frontend/src/features/study/components/CompetitionContextCard.jsx`
- `app/frontend/src/features/study/components/CycleProgressRail.jsx`
- `app/frontend/src/features/study/components/CycleSubjectProgress.jsx`
- `app/frontend/src/features/study/components/EngineTrace.jsx`
- `app/frontend/src/features/study/components/ExamContextCard.jsx`
- `app/frontend/src/features/study/components/ExamCycleTimeline.jsx`
- `app/frontend/src/features/study/components/FocusReflectionPanel.jsx`
- `app/frontend/src/features/study/components/IntelligenceLayersPanel.jsx`
- `app/frontend/src/features/study/components/MasteryDistribution.jsx`
- `app/frontend/src/features/study/components/MissionControlSkeleton.jsx`
- `app/frontend/src/features/study/components/MockCorrectionPreview.jsx`
- `app/frontend/src/features/study/components/NextBestActionCard.jsx`
- `app/frontend/src/features/study/components/NextRecommendedActions.jsx`
- `app/frontend/src/features/study/components/PhaseBandTimeline.jsx`
- `app/frontend/src/features/study/components/PlanByTopic.jsx`
- `app/frontend/src/features/study/components/PlanChangeLogCard.jsx`
- `app/frontend/src/features/study/components/PlanPreferencesCard.jsx`
- `app/frontend/src/features/study/components/PlanReasoningCard.jsx`
- `app/frontend/src/features/study/components/PlanRiskFlags.jsx`
- `app/frontend/src/features/study/components/PlannedVsActualChart.jsx`
- `app/frontend/src/features/study/components/SafeExplanationCard.jsx`
- `app/frontend/src/features/study/components/SourceTrustBadge.jsx`
- `app/frontend/src/features/study/components/StudyMetricCard.jsx`
- `app/frontend/src/features/study/components/StudyPolicyPreview.jsx`
- `app/frontend/src/features/study/components/StudyTaskCard.jsx`
- `app/frontend/src/features/study/components/SubjectCard.jsx`
- `app/frontend/src/features/study/components/SubjectCards.jsx`
- `app/frontend/src/features/study/components/TaskReasoningPanel.jsx`
- `app/frontend/src/features/study/components/TopicRow.jsx`
- `app/frontend/src/features/study/components/TopicTreePanel.jsx`
- `app/frontend/src/features/study/components/TruthPanelCard.jsx`
- `app/frontend/src/features/study/components/UpdateIntelligencePanel.jsx`

Assessment across this set:
- UI decomposition is present, but container pages remain too large.
- Several components still perform API requests directly (`PlanPreferencesCard`, `TaskReasoningPanel`) instead of using dedicated hooks.

### Study UI primitives (all reviewed)
- `app/frontend/src/shared/ui/studyos/primitives.jsx`
- `app/frontend/src/shared/ui/studyos/community.jsx`
- `app/frontend/src/shared/ui/studyos/index.js`

Assessment:
- Reusable primitives are helpful, but page-level orchestration is still bypassing consistency benefits.

## Recommended remediation sequence
1. Add test coverage for the 6 highest-risk pages first (`StudyPlan`, `Mocks`, `WeeklyReview`, `Focus`, `Compare`, `Today`).
2. Split each of those pages into feature hooks (`useStudyPlan`, `useMocksLifecycle`, etc.) and presentational slices.
3. Remove exhaustive-deps suppression and make effects deterministic with explicit dependency ownership.
4. Standardize error surfacing: no silent catches for user-impacting calls.
5. Consolidate study API interactions into a dedicated Study OS service layer with typed response normalization.
6. Add timer/session invariants for Focus (single active session, reconcile on resume, explicit completion reasons).

## Verification notes
- Attempted to run `graphify update .` after audit update per repo policy, but CLI is unavailable in this environment (`command not found`).
