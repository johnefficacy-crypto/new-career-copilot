# Frontend audit — Study OS (Today, StudyPlan, Tracker, Mocks, Focus, WeeklyReview, Subjects, Dashboard, Compare + 32 components)

_Last updated: 2026-05-16_

Scope (read in full):

**Pages:**
- `app/frontend/src/pages/Today.jsx` (413 LOC)
- `app/frontend/src/pages/StudyPlan.jsx` (494 LOC)
- `app/frontend/src/pages/Tracker.jsx` (85 LOC)
- `app/frontend/src/pages/Dashboard.jsx` (66 LOC, very dense — many JSX statements per line)
- `app/frontend/src/pages/study/Focus.jsx` (353 LOC)
- `app/frontend/src/pages/study/Mocks.jsx` (775 LOC)
- `app/frontend/src/pages/study/WeeklyReview.jsx` (537 LOC)
- `app/frontend/src/pages/study/Subjects.jsx` (96 LOC)
- `app/frontend/src/pages/study/Compare.jsx` (422 LOC)

**Components (`features/study/components/` — 32 files, ~3.4k LOC, plus `features/dashboard/components/TodaysActions.jsx`):**
EngineTrace, TaskReasoningPanel, PlanByTopic, PlanChangeLogCard, PlanPreferencesCard, NextBestActionCard, UpdateIntelligencePanel, TruthPanelCard, IntelligenceLayersPanel, SafeExplanationCard, PlanReasoningCard, ExamContextCard, CompetitionContextCard, StudyPolicyPreview, FocusReflectionPanel, StudyMetricCard, MissionControlSkeleton, StudyTaskCard, SubjectCards, SubjectCard, TopicTreePanel, TopicRow, NextRecommendedActions, MasteryDistribution, MockCorrectionPreview, PlannedVsActualChart, PhaseBandTimeline, CycleProgressRail, CycleSubjectProgress, ExamCycleTimeline, PlanRiskFlags, SourceTrustBadge, TodaysActions.

Total audited: ~6.6k LOC across 41 files.

Backend cross-checks against:
- `app/backend/app/api/study_os.py` (`/study/mission-control`, `/study/plan/*`, `/study/mocks/*`, `/study/weekly-review/*`, `/study/subjects`, `/study/topics`, `/study/task-reasoning/*`)
- `app/backend/app/api/canonical.py` (`/study/plan/toggle`, `/study/tasks/carry-forward`, `/applications/*`)

Severity legend:
- **P0** — crash or silent functional break in the live path.
- **P1** — wrong data shown / silently broken interaction.
- **P2** — accessibility, contract drift, dead code, polish.

---

## P0 — Crashes / silent functional breaks

### S-P0-1. `Today.toggleTask` swallows POST errors with no rollback
**File:** `pages/Today.jsx:99-129`
**Backend:** `canonical.py:1815` (`POST /study/plan/toggle`)

```js
setMc((prev) => ({ ...prev, today_tasks: prev.today_tasks.map((x) =>
  x.id === t.id ? { ...x, done: nextDone, status: nextStatus } : x) }));
...
try { await api.post("/api/study/plan/toggle", { task_id: t.id }); }
catch (e) { if (process.env.NODE_ENV !== "production") console.error(e); }
```

Optimistic flip, POST, error swallowed. If the POST 4xx/5xx (auth lapse, stale task id, rate limit), the checkbox stays checked forever in this session. User believes the task is logged as complete; on reload the count silently corrects itself. Truth Panel ("Tasks completed") will then disagree with the visible checkboxes — exactly the trust-corrosion failure mode the Study OS doc warns against.

**Fix:** roll back to pre-call state on error AND surface a toast. `ToastProvider` exists at `shared/ui/ToastProvider.jsx` (same one community audit recommended).

### S-P0-2. `StudyPlan.toggle / updateStatus / carryForward` — no error handling at all
**File:** `pages/StudyPlan.jsx:100-121`

`toggle` (line 100) does optimistic flip, then `await api.put(...)` — no `try/catch`. Unhandled promise rejection on failure. `updateStatus` (line 110) and `carryForward` (line 116) skip the optimistic flip entirely; they `await` and then `await load()`. If the PUT/POST fails, click does nothing visible, the user has no idea anything happened, and a stack trace lands in the console (in dev). In prod the error is just dropped.

`updateStatus` is wired to the three status pills ("In progress" / "Skip" / "Mark missed", lines 245-263) — the three most-used controls on the page.

**Fix:** wrap in `try/catch`, show toast, roll back optimistic state in `toggle`.

### S-P0-3. `Focus.start / finish` — no error handling on session lifecycle
**File:** `pages/study/Focus.jsx:74-83, 87-105`

```js
async function start() {
  const s = await api.post("/api/study/focus/start", {...});
  setSessionId(s.id);
  setRunning(true);
  ...
}
```

If `/study/focus/start` rejects (network, auth, server), the assignment to `s.id` throws. `setRunning` never fires. Button click looks dead. `finish()` is worse: if `/study/focus/stop` fails after the user worked a 50-minute session, the timer dies, the session is lost, and the reflection drawer never opens — no toast, no retry. **The "Truth panel uses what you logged" promise breaks silently.**

**Fix:** wrap both in `try/catch`; on `start` failure, keep the page in READY state and show a toast; on `stop` failure, preserve `sessionId` so the user can retry, and persist a draft in `localStorage` so the work isn't lost.

### S-P0-4. `Today` shallow-merges mission-control over `EMPTY_MC`
**File:** `pages/Today.jsx:20-45, 70`

```js
setMc({ ...EMPTY_MC, ...(data || {}) });
```

Top-level keys overlay, nested keys are wiped — same bug as the community audit's `PartnersScreen`. If `/study/mission-control` returns `{ metrics: { tasks_total: 5 } }` (partial — backend often does), the merged `mc.metrics` becomes `{tasks_total: 5}` and loses defaults for `tasks_completed`, `task_completion_rate`, `hours_studied_7d`, `hours_planned_week`, `adherence`, `backlog_count`, `mocks_taken`. The metric cards (lines 287-329) then read `metrics.tasks_completed || 0` and render `0` even when the backend has data on the other 6 metric fields it didn't include in `metrics`.

Same hazard on `user_context.dimensions`, `truth_panel.warnings`, `truth_panel.corrections` if the backend returns top-level keys with empty nested objects.

**Fix:** deep-merge defaults, or adapter pattern (`adaptMissionControl(response)`), or stop relying on `EMPTY_MC` defaults and use `?.` everywhere with explicit `||` fallbacks at read sites (already done in some places — inconsistent).

### S-P0-5. `WeeklyReview` cells render "0% adherence" for users with no data
**File:** `pages/study/WeeklyReview.jsx:15-34, 53, 97`

```js
const EMPTY = { ..., adherence: 0, ..., revision_coverage: null, ... };
...
adherence: num(r.adherence) ?? 0,
...
const adherencePct = Math.round((d.adherence || 0) * 100);
```

`revision_coverage` correctly distinguishes `null` from `0`, but `adherence`, `hours_studied`, `mocks_taken`, `tasks_completed` all coerce missing values to `0`. The headline cell then reads "**0% adherence** · 7-day rolling". For a brand-new aspirant on day one (no telemetry yet), the page says "you're at 0% adherence", which is the **exact shame-loop UX** the strategy doc bans ("No streaks. No shame.").

**Fix:** treat null/undefined explicitly. Show "—" or "Not enough data yet — log a focus session" when telemetry is empty. Same pattern as `revision_coverage` already follows.

### S-P0-6. `Mocks` error/dismiss handlers all silently fail
**File:** `pages/study/Mocks.jsx:143-212`

Five handlers (`changeReviewState`, `draftCorrections`, `applyCorrection`, `dismissCorrection`, plus `submit` partially) `try/catch` only to `console.error`. No state rollback, no toast. "Mark reviewed" looks like it worked because the local state updates first (`setItems(...)`, `setAnalysis(...)`) — but those updates run only on the success path. Wait — actually look more carefully: `setItems` is inside the `try` block at lines 150-153, so on failure the state stays unchanged. That's *worse* in one way: the button shows no feedback at all. Click → silence.

`draftCorrections` (line 159) and `applyCorrection` (line 174) are particularly bad: failure here means "we drafted corrections from your mock and… nothing happened on screen." The user clicks again and now potentially submits twice.

**Fix:** spinner/disabled while in-flight + toast on error.

### S-P0-7. Tracker uncontrolled inputs diverge from server state after every save
**File:** `pages/Tracker.jsx:69-75, 13-24`

Every input uses `defaultValue` + `onBlur` (uncontrolled). After blur, `update()` PUTs and then awaits `load()` which calls `setItems` with fresh server data. React re-renders, but **`defaultValue` is read-once on mount**, so already-mounted inputs keep whatever the user last typed. The visible value and the server value can quietly disagree.

Worse: when a second user (or a tab) updates an application, the next refetch into `setItems` does not update the input contents — only the surrounding text. Users will trust the input value and not the row metadata that says otherwise.

**Fix:** make these controlled (`value` + `onChange`) with a local pending-edits map keyed by `recruitment_id`, or `key={a.updated_at}` to force remount on server data change.

### S-P0-8. `Mocks` form does not validate score ≤ max_score or correct ≤ attempted
**File:** `pages/study/Mocks.jsx:101-141, 700-727`

```js
score: Number(form.score),
max_score: Number(form.max_score),
...
attempted: Number(form.attempted),
correct: Number(form.correct),
```

User can submit `score=300, max_score=200` or `correct=50, attempted=20`. The backend may or may not reject; the trend chart (line 590+) divides by `max` = `100` hardcoded which clips silently; subject breakdown (lines 387-413) shows `correct/total` ratios that exceed 1.0 and renders bars wider than 100%.

**Fix:** native validation (`max={form.attempted}` on `correct`, `max={form.max_score}` on `score`) + a guard in `submit` before the POST.

### S-P0-9. `TruthPanelCard.TruthCol` crashes on unrecognised `tone`
**File:** `features/study/components/TruthPanelCard.jsx:6-13`

`TruthCol` looks up `palette = {sage, rose, amber}[tone]` then immediately reads `palette.bg`. Today's two callers pass `"amber"` and `"rose"` (safe). The moment a future channel adds any other tone — or an operator typo — `palette` is `undefined` and the inline `style={{ background: palette.bg }}` throws `TypeError: cannot read 'bg' of undefined`, taking down the Truth Panel — the single most trust-load-bearing card on Today.

**Fix:** `const palette = TONES[tone] || TONES.amber;` with a module-level `TONES` map.

### S-P0-10. `PlanPreferencesCard.save` failure leaves local prefs diverged from server
**File:** `features/study/components/PlanPreferencesCard.jsx:86-117`

On a 4xx from `PUT /plan/preferences` the catch sets `error` but `dirty` stays true and `prefs` keeps the local-only value. User sees a red error, clicks "Save & regenerate plan" again — same PUT fails. The segmented buttons display the locally-changed value as if persisted; the user's mental model is "my settings are saved." Local state and server state silently diverge for the whole session.

**Fix:** on save error, refetch via `load()` to reset `prefs` to server truth, or keep a `pendingPrefs` shadow separate from `prefs`.

### S-P0-11. `TaskReasoningPanel` silently degrades to inline fallback on fetch failure
**File:** `features/study/components/TaskReasoningPanel.jsx:151-168, 186-196`

`api.get(/api/study/task-reasoning/:id)` failure sets `failed=true` and renders `<FallbackView>` with whatever `fallbackReasoning` was inlined from mission-control. The user sees a complete-looking reasoning panel and has no idea the detailed channels (`reasoning_trace`, `evidence`, multi-channel signals) failed to load. Worst case: the fallback shows generic `FALLBACK_SUMMARY` text that reads like a real explanation, not an error. Direct violation of the Truth Panel promise.

**Fix:** render a small "Couldn't load full reasoning — showing summary" banner inside `FallbackView` when `failed`; offer a retry.

### S-P0-12. `PlanByTopic` divides by zero / produces `NaN` widths when no hours allocated
**File:** `features/study/components/PlanByTopic.jsx:56, 94`

`maxMinutes = items.reduce((m, it) => Math.max(m, it.planned_minutes || 0), 0)`. If all items have `planned_minutes: 0` (a fresh weight-only plan), `maxMinutes` is `0` and the bar width math produces `NaN`. The header reads "Where your hours go · 0h planned" while rows render unlabelled empty bars — the user can't distinguish "planner returned no allocations" from "chart broke."

**Fix:** the existing `maxMinutes ? ... : 0` guard at line 94 prevents the NaN, but render an explicit "Hours not yet allocated to subjects" message when `totalHours === 0 && items.length > 0`.

### S-P0-13. `FocusReflectionPanel.handleSave` flips `saved=true` regardless of `onSave` result
**File:** `features/study/components/FocusReflectionPanel.jsx:63-76`

`onSave(reflection)` is called and then `setSaved(true)` runs unconditionally. If the parent's `onSave` is async and rejects (e.g., a future planner endpoint 4xxs), the panel shows "Reflection noted for this session" as a success state but nothing was persisted. Today the contract is local-only, so the failure mode is dormant — but the moment this wires to a real endpoint, the success banner lies.

**Fix:** `await onSave(reflection)` inside try/catch; only `setSaved(true)` on resolved promise; surface error otherwise.

### S-P0-14. `Compare` Behavior Index `MiniBar` always renders 0%
**File:** `pages/study/Compare.jsx:175`

The Components grid passes `<MiniBar value={Number(components[k] || 0)} />`, but `MiniBar` (`shared/ui/studyos/primitives.jsx:151`) only accepts a `pct` prop. `value` is unknown — falls through to default `pct=0`, so every one of the seven behavior bars renders empty. The numeric percentage to the right is correct, so the chart and the numbers visibly disagree — a confidence-corroding contradiction on the page the spec calls "the fair-comparison surface."

**Fix:** `<MiniBar pct={Number(components[k] || 0)} />` (values are already 0..1).

### S-P0-15. `Compare` cohort/leaderboard pill tones fall through to neutral
**File:** `pages/study/Compare.jsx:30-34, 228, 253-254`

`rankBandTone` returns `"green" | "amber" | "rose" | "stone"`, but `PILL_TONE` in `primitives.jsx:15-23` only knows `outline | sage | clay | dusk | amber | ink | rose`. `"green"` and `"stone"` silently fall through to `pill-outline`. "Ahead" / "Behind" / "On track" / private-listing pills all render with the same neutral chrome — users can't tell at a glance whether they're ahead or behind in their cohort, defeating the visual semantics of the page.

**Fix:** map `ahead → "sage"`, `on_track → "ink"`, `behind → "rose"`, `default → "outline"`.

### S-P0-16. `Compare.updateSetting` privacy toggle swallows errors with no rollback
**File:** `pages/study/Compare.jsx:110-117`

Privacy toggles (solo mode, public leaderboard, friends leaderboard, cohort comparison) call `api.put` and swallow errors to a dev-only `console.error`. If the PUT 4xx/5xx, the user's last visible toggle position came from the DOM event itself; `settings` was never updated, so the next render flips the box back, with no toast. For "Solo mode (hide me from all comparisons)" this is a **privacy-relevant** silent failure: the user believes they've gone solo, the backend hasn't acted.

**Fix:** optimistic-update `settings`, roll back on error, surface a toast via `ToastProvider`.

### S-P0-17. `TodaysActions` renders "Resolve 0 pending docs" when only forms are in progress
**File:** `features/dashboard/components/TodaysActions.jsx:8`

```js
if (pendingDocs > 0 || inProgressForms > 0) list.push({ label: `Resolve ${pendingDocs} pending docs`, ... });
```

The OR lets `inProgressForms` open the gate, but the label only counts `pendingDocs`. A user with 0 pending docs and 3 forms in progress sees "**Resolve 0 pending docs**" as the top dashboard CTA.

**Fix:** branch labels — prefer `pendingDocs` when > 0, otherwise `Resume ${inProgressForms} in-progress forms`.

### S-P0-18. `TodaysActions` builds `/app/exams/undefined` when `topMatches[0].slug` is missing
**File:** `features/dashboard/components/TodaysActions.jsx:9`

`if (topMatches[0]?.next_action) list.push({ to: `/app/exams/${topMatches[0].slug}` })` — only `next_action` is guarded. Matching engines often emit a `next_action` without a populated `slug` (transient match without a fully-resolved canonical recruitment). Click navigates to `/app/exams/undefined`, where the route 404s or crashes the exam-detail loader.

**Fix:** gate on `topMatches[0]?.slug && topMatches[0]?.next_action`.

### S-P0-19. `TopicRow.loadEvidence` fabricates a successful `trust` payload on fetch failure
**File:** `features/study/components/TopicRow.jsx:37-51`

On `catch`, `setEvidence({ trust: { status: t.trust_status || "locked" } })`. The render path (line 181) then treats `evidence && !evidence.row` as "admin-only, trust status above is server-confirmed." A 500 / network error becomes a **confidence-positive** message produced from an actual failure. `loadingEvidence` clears, so the drawer never retries.

**Fix:** keep `evidence = null` on failure, set a separate `evidenceError` flag, render "Evidence couldn't load — retry" with a retry button.

---

## P1 — Wrong-data / broken-interaction

### S-P1-1. `WeeklyReview` "Preview adaptation" / "Discuss with mentor" buttons are decorative
**File:** `pages/study/WeeklyReview.jsx:328-334`

Two visually prominent CTAs at the bottom of `NextWeekChanges` have **no `onClick`**. Same dead-button class the community audit flagged. Users will click them, nothing will happen, trust corroded.

**Fix:** either wire them up (`Preview adaptation` should reuse `StudyPlan.previewRegenerate`'s draft drawer — the contract already exists at `/api/study/plan/draft` + `/api/study/plan/apply`) or remove them until they do something.

### S-P1-2. `WeeklyReview.UserCorrectionChecklist` Answer/Skip buttons are decorative
**File:** `pages/study/WeeklyReview.jsx:378-389`

Same problem: two buttons per item × 3 items = 6 dead buttons. No state, no handler.

**Fix:** wire to a real "questionnaire" persistence endpoint, or drop until designed.

### S-P1-3. `StudyPlan` status pills don't show which status is currently selected
**File:** `pages/StudyPlan.jsx:245-268`

The three buttons (In progress / Skip / Mark missed) plus the status `Pill` at line 267 are siblings in the same row. Users get no visual feedback that clicking "In progress" worked — the pill on the right updates from "planned" to "in progress", but the three buttons all look identical regardless of state. No `aria-pressed`, no disabled state when already selected, no visual selected style. Clicking the active state again silently no-ops on the server but the user can't tell.

**Fix:** mark the matching button selected (`aria-pressed` + a `bg-clay-200` style), and disable it.

### S-P1-4. `StudyPlan` "% of 7h" assumes a hardcoded 7h/day target
**File:** `pages/StudyPlan.jsx:18, 38`

```js
const pct = Math.max(0, Math.min(100, Math.round((d.hrs / 7) * 100)));
...
<div className="text-[10.5px] text-clay-700 mt-1 num-mono">{pct}% of 7h</div>
```

7h is hardcoded. A user with a 4h/day plan studying 3h will see "75% of 7h" — which is just wrong; their actual adherence is `3/4 = 75%` only by coincidence. A user with a 10h/day plan studying 7h will see "100% of 7h" — also wrong.

**Fix:** read the daily target from `plan.daily_target_hours` (or whatever the planner emits) and use it. Fall back to a clearly-labelled "% of 7h reference" only if no target is available.

### S-P1-5. `StudyPlan.isToday` weekday match silently breaks across DST / timezones
**File:** `pages/StudyPlan.jsx:124-128`

```js
const todayKey = new Date().toLocaleDateString("en-US", { weekday: "short" });
const week = (focus.week || []).map((d) => {
  const label = new Date(d.date).toLocaleDateString("en-US", { weekday: "short" });
  return { label, hrs: ..., isToday: label === todayKey };
});
```

`d.date` comes from the backend as a UTC string. Parsing it as a Date and asking for the local weekday will be off by one for users near midnight in IST/PST/etc. The "Today" tile floats to the wrong day in those windows — and the rest of the chart misaligns.

**Fix:** compare on `YYYY-MM-DD` ISO date strings normalised to a single timezone (probably the user's local) on both sides.

### S-P1-6. `Mocks` exam slug dropdown is hardcoded
**File:** `pages/study/Mocks.jsx:50, 704-708`

```js
exam_slug: "ssc-cgl-2026",
...
{["ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026", "sbi-clerk-2026"].map(...)}
```

Five hardcoded recruitment slugs. New recruitments don't appear. Closed ones stay. Will rot. Also the *default* `ssc-cgl-2026` is forced on every user even if they're prepping for UPSC.

**Fix:** fetch from `/api/recruitments?status=active` (already exists at `canonical.py`) or `/api/exam-intelligence/exams` (Phase 12 PR I just shipped).

### S-P1-7. `Focus` default subject/topic are fictional seed strings
**File:** `pages/study/Focus.jsx:18-19`

```js
const [subject, setSubject] = useState("Quant");
const [topic, setTopic] = useState("Percentage & Ratio");
```

Every new aspirant who opens Focus sees "Quant" / "Percentage & Ratio" pre-filled. They will start the timer with these values, never notice the placeholder, and the session gets logged against the wrong subject. Pollutes per-subject focus telemetry that the Truth Panel relies on.

**Fix:** start empty (placeholder text only). If the user has linked a task or a plan exists, default to that subject/topic instead.

### S-P1-8. `Focus` timer drifts in background tabs and after sleep
**File:** `pages/study/Focus.jsx:48-62`

```js
setInterval(() => setRemaining((r) => r - 1), 1000)
```

Browsers throttle background tabs and pause intervals on sleep. A user who starts a 50-minute focus, switches to a video, comes back 30 minutes later will see ~25 minutes left (interval ran ~half-speed). The session length recorded against `completed_min` is wrong, and the Truth Panel's "focus hours" undercounts.

**Fix:** record `started_at` in state, compute `remaining = duration*60 - (Date.now() - started_at) / 1000` on every tick; use the interval just to trigger re-renders.

### S-P1-9. `WeeklyReview.BacklogMovementChart` doesn't autoscale
**File:** `pages/study/WeeklyReview.jsx:412-481`

Y-axis is hardcoded to `[0, 1, 2, 3]` (lines 418-432), but the bars use `Math.min(140, start * 30)` and `Math.max(0, 140 - start * 30)`. If `start = 5` or higher, the bar height exceeds the chart frame and the rect Y goes negative — the bar visually overflows the top of the SVG. Realistic backlog sizes (>= 4) are common; this will render broken on any user who actually has backlog.

**Fix:** compute `max = Math.max(start, end, 3)` and scale the axis labels and bar geometry off that.

### S-P1-10. `Mocks` SVG score axis hardcodes 100% ceiling but ignores 0
**File:** `pages/study/Mocks.jsx:619-641`

Grid lines at `[25, 50, 75, 100]`. No `0` line, no baseline label. If all logged mocks are below 25%, there are no horizontal references between the X-axis and the first grid line — points appear to float at the bottom. Minor compared to others but reads as carelessness.

**Fix:** add `0` to the array.

### S-P1-11. `Tracker` `datetime-local` round-trip is UTC-vs-local broken
**File:** `pages/Tracker.jsx:73`

```js
defaultValue={a.submitted_at ? new Date(a.submitted_at).toISOString().slice(0, 16) : ""}
onBlur={(e) => update(a.recruitment_id, { submitted_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
```

`toISOString().slice(0,16)` produces a UTC `YYYY-MM-DDTHH:MM`. `<input type="datetime-local">` interprets it as local time. A user in IST who submitted at 9:00 PM IST sees "15:30" pre-filled (UTC representation of 21:00 IST), then on blur the browser converts "15:30 local" back to UTC → midnight UTC = different timestamp.

**Fix:** convert to local time on display:
```js
const d = new Date(a.submitted_at);
const tz = d.getTimezoneOffset() * 60000;
const local = new Date(d.getTime() - tz).toISOString().slice(0, 16);
```

### S-P1-12. `StudyPlan.applyDraft` failure leaves the drawer open and silent
**File:** `pages/StudyPlan.jsx:86-98`

```js
try {
  await api.post("/api/study/plan/apply", {});
  setDraftOpen(false); ...
} catch (e) {
  if (process.env.NODE_ENV !== "production") console.error(e);
}
```

User clicks "Apply", waits, nothing happens, drawer stays open. They likely click Apply again — second POST. If the first one actually succeeded but timed out before the response, this is a double-apply.

**Fix:** toast + leave the drawer open OR close-with-failure-banner. Definitely disable the button until the call completes (already does that via `applying` state).

### S-P1-13. `UpdateIntelligencePanel` renders hardcoded fictional sample updates when backend returns `[]`
**File:** `features/study/components/UpdateIntelligencePanel.jsx:8-60, 153-163`

When `official` or `unverified` props are `[]`, the component falls back to `SAMPLE_OFFICIAL` / `SAMPLE_UNVERIFIED`. A "Preview · static example" pill is shown at the panel header, but individual cards still render full fictional titles like "Exam cycle notification (example)" with detailed `summary` and "Source · (static example)" rows. Aspirants skim cards, not the header pill. Same class as F-P1-1/F-P1-2 from the community audit — on a fresh install every user sees 5 fake updates.

**Fix:** render an `EmptyState` ("No verified updates for your exam this week") when both lists are empty. Reserve `SAMPLE_*` for Storybook, or gate behind a `previewMode` prop.

### S-P1-14. `PlanByTopic` shows `0h · 0%` rows indistinguishable from unallocated subjects
**File:** `features/study/components/PlanByTopic.jsx:118-122`

`{s.planned_hours ?? 0}h · {Math.round((s.weight || 0) * 100)}%`. If the backend emits a row with weight 0 (or null) and planned_minutes 0, the row renders "0h · 0%" — visually indistinguishable from a subject that was actively allocated 0 hours this week. Null-vs-zero confusion (same class as S-P0-5).

**Fix:** if `weight == null && planned_minutes == null`, render "Not in this week's plan" instead of "0h · 0%".

### S-P1-15. `CompetitionContextCard.fmtRatio` produces "1 in 0" / "1 in 1" for misformatted ratios
**File:** `features/study/components/CompetitionContextCard.jsx:21-27`

`return `1 in ${Math.round(1 / n).toLocaleString()}` `. For `n` slightly > 0.5, `1/n` rounds to 1; for `n = 1.5` (impossible but defensive — e.g., backend stores ratio as percent by mistake → `60.0` → "1 in 0"), the output is nonsense. The card is the only number users see for "how competitive is this exam"; garbage display erodes trust.

**Fix:** treat anything `n > 0.5` as an explicit percentage display (`Math.round(n*100)%`); restrict "1 in N" to small ratios.

### S-P1-16. `PlanChangeLogCard` uses `toLocaleString()` — timezone-ambiguous on an audit log
**File:** `features/study/components/PlanChangeLogCard.jsx:58, 73`

`new Date(row.created_at).toLocaleString()` produces a locale-specific string in the browser's local timezone with no timezone label. For a panel labelled "event log" — meant to be auditable — users on different timezones reading the same shared screen see different timestamps with no way to know which is which.

**Fix:** use `formatRelative` ("12 minutes ago") with the ISO timestamp in `title`, or render with explicit timezone (`toLocaleString(undefined, {timeZoneName: "short"})`).

### S-P1-17. `PlanPreferencesCard` sends `auto_regenerate: undefined` on first interaction
**File:** `features/study/components/PlanPreferencesCard.jsx:67, 92-97, 167-178`

`setPrefs(d || {})` — if `/plan/preferences` returns sparse data (no `auto_regenerate` key), the switch's `aria-checked={!!prefs.auto_regenerate}` correctly renders `false`, but the PUT body sends `auto_regenerate: undefined`. JSON.stringify drops the key, and the backend's PUT handler may interpret "missing" as "no change". The user's toggle never travels — silent contract drift.

**Fix:** initialise `setPrefs({focus: "balanced", auto_regenerate: false, max_tasks_per_day: null, preferred_task_size: null, ...(d || {})})` so every PUT body has explicit values.

### S-P1-18. `ExamContextCard` displays negative `days_remaining` literally
**File:** `features/study/components/ExamContextCard.jsx:48-51`

`{ec.days_remaining} days remaining`. Backend likely emits negative values for past cycles. Card renders "-12 days remaining" — confusing.

**Fix:** `ec.days_remaining >= 0 ? `${ec.days_remaining} days remaining` : `${Math.abs(ec.days_remaining)} days ago``.

### S-P1-19. `NextBestActionCard` button is dead when consumer omits `onPrimary`
**File:** `features/study/components/NextBestActionCard.jsx:6-13, 50-61`

`study_task` and `progressive_question` action types map to `link=null`. When `link` is null, the component renders a `<button onClick={onPrimary}>`. But `onPrimary` is optional — if the consumer doesn't pass it, the button silently does nothing. Same dead-button class as WeeklyReview's "Preview adaptation."

**Fix:** default `onPrimary` to a no-op that toasts "Open the task list below" or focuses the task list anchor; or render `<a href="#tasks">` when no handler is wired.

### S-P1-20. `IntelligenceLayersPanel` documentation reads as live data
**File:** `features/study/components/IntelligenceLayersPanel.jsx:14-20, 101-126`

The component is preview-only (an inline `pill-amber "Preview"` and italic footer say so). But the inline rows read like real values ("Hours you said you have", "From mocks, drills, focus signals"). A user could mistake "Mock history: Scores, trend, weak topics" for a real mock-history summary. A panel that *looks* like a dashboard but is documentation.

**Fix:** rework copy in future tense ("Will show your scores and trend"), or hide the panel entirely until at least one layer has live data.

### S-P1-21. `FocusReflectionPanel` claims "kept on this device" but never persists
**File:** `features/study/components/FocusReflectionPanel.jsx:55-77`

After save, panel shows "Reflection noted for this session. It is kept on this device for now." Nothing is actually persisted to localStorage — `handleSave` calls `onSave` and flips local state. On reload/remount the reflection is gone. The copy lies.

**Fix:** drop "kept on this device" copy until persistence is wired, or actually `localStorage.setItem("focus.reflection." + session.id, JSON.stringify(reflection))`.

### S-P1-22. `NextRecommendedActions` ranking mixes incompatible scales
**File:** `features/study/components/NextRecommendedActions.jsx:30-33`

`score = (t.exam_priority_score || 0) * 10 - (t.mastery_score || 100) + (t.error_pattern_count ? 25 : 0)`. Per `study_os.py:379` / `planner.py:231`, `exam_priority_score` is a 0..1 fraction. `mastery_score` is 0..100. So `priority*10` is in `[0,10]` and `-mastery` is in `[-100,0]` — **mastery dominates by 10×**, and "highest priority" collapses to "lowest mastery wins" regardless of exam weight. Default `|| 100` for missing mastery also penalises topics with no signal.

**Fix:** normalise both inputs to `[0,1]` before weighting, and treat missing mastery as low-confidence (skip from ranking, or use a neutral midpoint), not perfect.

### S-P1-23. `TopicRow` priority badge always shows `0` or `1`
**File:** `features/study/components/TopicRow.jsx:87-88`

`priority {Math.round(t.exam_priority_score || 0)}` — when `exam_priority_score` is the 0..1 backend fraction (S-P1-22), every row rounds to either 0 or 1. The chip becomes uninformative for differentiating topics, exactly where the spec wants exam-weight legibility.

**Fix:** `priority {Math.round((t.exam_priority_score || 0) * 100)}` and label as percent (or pass a normalised field from backend).

### S-P1-24. `CycleProgressRail` collapses to a 1-day rail with a single milestone
**File:** `features/study/components/CycleProgressRail.jsx:33-38`

When only one milestone has a date (a freshly registered exam with just `exam_start`), `min === max` and the fallback adds 1 day to `max`. The "today" dot renders at 0% or 100% with no visible cycle, no scale, no explanation. Same effect when phase bands resolve to identical start/end dates.

**Fix:** require at least two distinct dated milestones before rendering the rail; otherwise show the existing "Cycle dates will appear here…" empty state.

### S-P1-25. `CycleProgressRail` index-based React keys collide on refetch
**File:** `features/study/components/CycleProgressRail.jsx:67-68, 105-106`

`key={`${m.kind}-${i}`}` — if two milestones share `kind` (e.g., two `application_start` rows for two recruitments), keys collide on the second pass after a refetch. React mis-reconciles popovers and the `title` tooltip jumps to the wrong date.

**Fix:** key on `${m.kind}-${m.date}-${i}` and use `m.date` for the legend key.

### S-P1-26. `PhaseBandTimeline` "Current/Past/Upcoming" computed across timezones
**File:** `features/study/components/PhaseBandTimeline.jsx:35, 41-47`

`todayMs = today ? new Date(today).valueOf() : Date.now()` — when `today` is a `YYYY-MM-DD` backend string it's parsed as UTC midnight, but `b.start`/`b.end` could be ISO timestamps or date-only strings. Cross-DST or for IST users near midnight, a phase flips from "Current" to "Past" up to ~5.5 hours early. The visual cue users rely on to know "what phase am I in?" is wrong on the boundary day.

**Fix:** compare `YYYY-MM-DD` ISO strings (`String(today).slice(0,10) <= b.end.slice(0,10)`) so the comparison is timezone-free.

### S-P1-27. `CycleSubjectProgress` defaults `planned_pct` to 100, masking unscheduled subjects
**File:** `features/study/components/CycleSubjectProgress.jsx:27-29`

`const planned = Number(s.planned_pct || 100); ratio = actual / planned;` — defaulting missing/zero `planned_pct` to 100 means subjects the backend hasn't scheduled report `ratio = actual/100`. With `actual_pct === 0` it shows "not started" (fine), but as soon as the user logs any session, the bar shows progress against an imaginary 100% plan — masking the fact that no plan exists.

**Fix:** when `planned_pct` is missing or zero, render `Pill="not planned"` with a TrustStamp=`preview`; never coerce planned to 100.

### S-P1-28. `PlannedVsActualChart` empty state hides the chart for day-1 users
**File:** `features/study/components/PlannedVsActualChart.jsx:10`

`if (points.length < 2) return null;` — a single point (week 1 of a cycle, the most common case for a new aspirant) drops to "will appear once tasks are scheduled across the cycle." But the user *just* scheduled tasks; they just don't have two weeks yet. Users on day 1–7 will believe the planner failed.

**Fix:** render a single dot with a "Week 1 of the cycle — chart appears from week 2" caption.

### S-P1-29. `SubjectCard` "below 65%" hardcoded threshold contradicts `MasteryDistribution` target
**File:** `features/study/components/SubjectCard.jsx:49`

`{pct < 65 ? <Pill tone="amber">below 65%</Pill> : <Pill tone="sage">on target</Pill>}`. `MasteryDistribution` accepts a `target` prop (default 65) plumbed from policy. If admin policy raises the target to 70%, the distribution panel updates but per-card pills on the same page still claim "on target" at 65–69%. Two sources of truth on the same page.

**Fix:** thread `target` down to `SubjectCard` via `SubjectCards`.

### S-P1-30. `SubjectCards` activeId can match across subjects sharing a name
**File:** `features/study/components/SubjectCards.jsx:31`

`isActive = activeId && (s.subject_id === activeId || s.subject === activeId)` — falls back to comparing the subject *name*. If two recruitments share the name "Quant" (one per exam), clicking Quant in exam A lights up both rows.

**Fix:** match on `subject_id` only; require the parent to pass the id.

### S-P1-31. `Compare` privacy pill flashes wrong state during settings hydration
**File:** `pages/study/Compare.jsx:253, 370-388`

Card header renders `<Pill>{...? "You are listed" : "Private (opt-in)"}</Pill>` before `settings` has loaded. A user who has previously opted in sees "Private" for a few hundred ms before the page hydrates, then watches it flip — confusing on a leaderboard-listing pill.

**Fix:** show a `—` / skeleton until `settings` is non-null.

### S-P1-32. `ExamCycleTimeline` fabricates a fictional `planner_v1` label
**File:** `features/study/components/ExamCycleTimeline.jsx:164-166`

`<span>{plan.planner_version || "planner_v1"}</span>` — when the backend hasn't shipped a planner version, the UI claims `planner_v1` was used. This is a Truth-Panel-relevant fact (which engine produced this plan) and must not be invented client-side.

**Fix:** render `—` or hide the chip when `planner_version` is missing.

---

## P2 — A11y / contract drift / polish

### S-P2-1. `Mocks` modal lacks dialog semantics and focus trap
**File:** `pages/study/Mocks.jsx:689-766`

No `role="dialog"`, no `aria-modal`, no `aria-labelledby`, no autofocus on first input, no focus trap, no Escape-to-close. Only a backdrop click closes the modal — keyboard-only users are stuck inside.

**Fix:** convert to use the existing `Drawer` primitive in `shared/ui/studyos` (used elsewhere) or add proper dialog semantics + a focus-trap util.

### S-P2-2. `Dashboard.jsx` is one massive line of inline JSX
**File:** `pages/Dashboard.jsx:55, 59, 61`

Three of the four data sections live in single-line JSX expressions ~1.5kB each. Diffs are unreadable, code review is impossible, and several `Math.round((review.adherence || 0) * 100)` etc. expressions are duplicated rather than extracted. No real bug, but the next person touching this will introduce one.

**Fix:** reformat. The codebase already follows clear-line conventions elsewhere; this file is the outlier.

### S-P2-3. `Tracker` re-fetches the entire list on every blur
**File:** `pages/Tracker.jsx:24`

```js
await api.put(`/api/applications/${recId}`, patch);
await load();
```

Every input blur on every row triggers a full PUT → GET round trip. For a user with 30 applications, opening one row, editing four fields = four full reloads. Slow on mobile.

**Fix:** PATCH only the modified row in local state on success; reload-on-error only.

### S-P2-4. Tracker uncontrolled inputs miss the disabled-during-save signal
**File:** `pages/Tracker.jsx:64-75`

`disabled={saving === a.recruitment_id}` is applied to the `<select>` only. The text inputs, checkbox and textarea below it remain editable during the PUT. Race conditions on rapid edits.

**Fix:** propagate the saving flag to all fields on the row.

### S-P2-5. `Today` falls back to legacy `/api/study/plan` when mission-control fails
**File:** `pages/Today.jsx:73-88`

The fallback path is a reasonable resilience pattern, but the user gets a much-degraded UI with no signal beyond a small clay banner saying "Showing a simplified plan view". The trust-policy footer, plan-reasoning sidebar, exam context, competition context, engine trace, intelligence layers and update intelligence panels all disappear. **Aspirant has no idea why their dashboard suddenly looks 80% smaller.**

**Fix:** show a more prominent "Mission Control is degraded — some panels are unavailable" banner with a Retry button.

### S-P2-6. `Subjects` `Promise.allSettled` swallows individual failures silently
**File:** `pages/study/Subjects.jsx:23-49`

Three parallel requests; on partial failure the corresponding section just stays empty with `Loading subjects…` flipping to nothing. The user can't distinguish "no data yet" from "endpoint broke."

**Fix:** track per-request error state, surface inline ("Topics failed to load — retry").

### S-P2-7. `StudyPlan.toggle` returns `done: nextStatus === "completed"` but server may emit different statuses
**File:** `pages/StudyPlan.jsx:101-109`

Frontend forces `done = nextStatus === "completed"` locally. If the server canonically tracks `carried_forward` or `rescheduled` (per `StudyTaskCard.STATUS_COPY`) and emits one of those after toggle, the frontend will have flipped to "completed" optimistically and never reconciled.

**Fix:** refetch `/api/study/plan` after toggle if you care about server-truth display, or accept the response payload as state-of-record.

### S-P2-8. `Focus` "End session" button visible before Start
**File:** `pages/study/Focus.jsx:247-253`

`End session` always renders. With no `sessionId`, `finish()` runs through but never calls the API. Confusing affordance — looks like the user can "end" something they never started.

**Fix:** hide the button until `sessionId` exists, mirroring `Start`/`Pause`.

### S-P2-9. `MockScoreTrend` x-label slices to 6 characters
**File:** `pages/study/Mocks.jsx:667`

```js
{(p.name || "").slice(0, 6) || `M${i + 1}`}
```

Mock names like "SSC CGL Tier 1 Mock #3" render as "SSC CG" on the chart — useless. No tooltip to see the full name.

**Fix:** render the name as `<title>` so SVG accessibility tooltips work, or truncate with ellipsis + show full name on hover/focus.

### S-P2-10. `WeeklyReview` ImprovedDeclined coerces strings to `{label}` but no `delta`
**File:** `pages/study/WeeklyReview.jsx:225, 244-277`

```js
const list = (items && items.length ? items : highlights || []).map((x) =>
  typeof x === "string" ? { label: x } : x,
);
```

When backend returns plain strings, `it.delta` is undefined → the right-hand cell renders "—". Fine for strings. But the fallback to `highlights || corrections` means when `improved` is empty, it shows highlights styled as improvements; when `declined` is empty, it shows corrections styled as declines. This mixes semantically distinct lists.

**Fix:** don't conflate; only fall back when the backend explicitly indicates these are interchangeable.

### S-P2-11. Hardcoded subject names in `STATUS_TONE`, `ERROR_ROWS`, `CORRECTION_LABEL` are not i18n-ready
**File:** `Mocks.jsx:13-27, StudyPlan.jsx:9-15`

User-visible English strings are inlined throughout. The strategy doc mentions language preference as a matching dimension; the UI doesn't yet support it. Not a blocker now, but worth noting.

**Fix:** if/when i18n lands, route these through a translation module.

### S-P2-12. `EngineTrace` SVG is `aria-hidden="true"` but contains the only narrative
**File:** `features/study/components/EngineTrace.jsx:49`

The middle column is a 720×220 SVG with all the diagram text inside `<text>` elements. The whole SVG is marked `aria-hidden="true"`. Screen-reader users get only the left eyebrow and the right "Provenance key" — they miss the core diagram and the live `planSummary` value entirely.

**Fix:** drop `aria-hidden`, add `<title>` and `<desc>` inside the SVG describing the four-layer flow plus `planSummary`, and `role="img"` on the SVG.

### S-P2-13. `PlanChangeLogCard` renders raw enum values verbatim
**File:** `features/study/components/PlanChangeLogCard.jsx:66`

`<Pill tone="ink">{row.event_type}</Pill>` shows literal `plan_regenerated`, `task_carry_forward`, etc. Users see snake_case. Same for `trigger_source` (line 68).

**Fix:** `EVENT_LABEL = { plan_regenerated: "Plan regenerated", ... }`.

### S-P2-14. `SafeExplanationCard` alternates tone by index
**File:** `features/study/components/SafeExplanationCard.jsx:18`

`tone={i % 2 === 0 ? "sage" : "clay"}`. Pill colours flip with array order — same signal sage on one render, clay on the next if the backend reorders. Defeats the colour-coding promise.

**Fix:** drop alternation, hash on signal text, or expect `signal.tone` from backend.

### S-P2-15. `StudyMetricCard` cannot distinguish 0 from missing
**File:** `features/study/components/StudyMetricCard.jsx:18`

`value === null || undefined || ""` renders "—", but `value === 0` renders "0". For metrics where 0 is genuine "no telemetry," the card shows "0" — same class as S-P0-5.

**Fix:** accept an explicit `unknown` boolean or a sibling `hasData` prop.

### S-P2-16. `CompetitionContextCard` enum verbatim "unknown pressure"
**File:** `features/study/components/CompetitionContextCard.jsx:69`

`label={`${level} pressure`}` produces "unknown pressure" / "high pressure" — fine for the four canonical values, but no titlecase, and "unknown pressure" reads ambiguously.

**Fix:** explicit labels (`{high: "High competition", unknown: "Pressure not measured"}`).

### S-P2-17. `PlanReasoningCard` uses `key={i}`
**File:** `features/study/components/PlanReasoningCard.jsx:34`

React key-by-index. If the backend reorders or filters reasoning entries between renders, React keeps stale DOM state.

**Fix:** `key={`${r.reason_type}-${r.summary?.slice(0,32)}-${i}`}`, or accept `r.id` from backend.

### S-P2-18. `UpdateIntelligencePanel.normalizeUpdate` accepts both camelCase and snake_case
**File:** `features/study/components/UpdateIntelligencePanel.jsx:62-74`

`source_url || sourceUrl`, `received_at || receivedAt`, `kind || sourceType` — defensive against unknown contract. FastAPI emits snake_case; the either-or accommodation is a code smell that suggests nobody owns the schema. Pick one and drop the other.

**Fix:** confirm backend payload shape, drop the alternates.

### S-P2-19. `FocusReflectionPanel` "5+" button stores literal `5`
**File:** `features/study/components/FocusReflectionPanel.jsx:70, 138-153`

Button labelled "5+" stores `distractions: 5`. When eventually persisted, "I had 8 distractions" rounds to 5 with no signal that it was clamped.

**Fix:** add a numeric input for >5, or store `distractions_min: 5, distractions_clamped: true`.

### S-P2-20. `StudyPolicyPreview` boolean-only constraint contract is undocumented
**File:** `features/study/components/StudyPolicyPreview.jsx:14-16, 66`

The truthy-only filter at line 15 drops anything non-boolean. If the backend ever ships numeric constraints like `min_break_minutes`, they vanish silently.

**Fix:** support `{key, value, kind}` objects from backend, or document the boolean-only contract.

### S-P2-21. `PlanByTopic` skeleton fixed at 3 rows regardless of expected count
**File:** `features/study/components/PlanByTopic.jsx:76-84`

Three pulsing bars while loading. If the list resolves to 8 subjects, layout jumps significantly.

**Fix:** render skeleton rows matching a remembered `lastKnownCount` from session storage, or accept an `expectedCount` prop.

### S-P2-22. `TodaysActions.jsx` is a single-line JSX expression
**File:** `features/dashboard/components/TodaysActions.jsx:15`

~600-char single line. Unreviewable diffs — same anti-pattern flagged in S-P2-2 for Dashboard.jsx.

**Fix:** reformat to multi-line JSX.

### S-P2-23. `TopicRow` renders raw `JSON.stringify(evidence.row)` to users
**File:** `features/study/components/TopicRow.jsx:177-180`

`<pre>{JSON.stringify(evidence.row, null, 2)}</pre>`. If the evidence endpoint ever returns rows to non-admins (a perms regression on the backend), aspirants see raw DB JSON. Even in admin mode this is unstyled and bypasses calibrated trust language.

**Fix:** render structured `<Fact>` rows for known keys; show raw JSON only when `?debug=1`.

### S-P2-24. `SubjectCard` has no `:focus-visible` ring
**File:** `features/study/components/SubjectCard.jsx:18-27`

The card switches between `<button>` and `<div>` based on `onSelect` presence, but has no focus ring. The parent's `ring-2 ring-[#2E2218]` selected indicator (`SubjectCards.jsx:35`) wraps the card *outside* the button — so it animates on click but is invisible on keyboard focus.

**Fix:** add `focus-visible:ring-2 focus-visible:ring-clay-900` to the RootTag className when `active`.

### S-P2-25. `TopicRow` "View PYQ tags" button no-ops after first click
**File:** `features/study/components/TopicRow.jsx:165-171`

After `evidence` is set, `loadEvidence` early-returns. Second click silently does nothing.

**Fix:** scroll to / focus the rendered evidence block, or hide the button once evidence is loaded.

### S-P2-26. `MockCorrectionPreview` "Preview" pill is honest but unactionable
**File:** `features/study/components/MockCorrectionPreview.jsx:7-13, 33`

Component is intentionally a preview (no planner endpoint exists). But it ships on user-facing pages — the five category labels read like recommendations the system makes. Users could mistake them for queued tasks. The "Preview" pill is below the heading rather than above.

**Fix:** prepend "Preview only — Study OS doesn't generate these tasks yet" inside the card body, not just as a pill.

### S-P2-27. `Compare.MiniSparkline` uses array index as React key
**File:** `pages/study/Compare.jsx:60`

`key={i}` for a 7-day history. When a new day rolls in, React reorders bar heights against stale keys → animation glitches.

**Fix:** `key={p.date}`.

### S-P2-28. `Compare` leaderboard renders every entry as "Aspirant" / "Group" / "Pair"
**File:** `pages/study/Compare.jsx:270-272`

Every user-row shows the literal word "Aspirant", every group-row shows "Group". Leaderboards exist to differentiate; rendering everyone as the same word makes the ranking decorative. Spec calls for anonymised display name or rank-only — pick one.

**Fix:** `e.display_name || `Aspirant ${e.rank}``, gated on the backend's privacy setting.

### S-P2-29. `Compare.allSettled` swallows secondary fetch failures
**File:** `pages/study/Compare.jsx:93-103`

Four secondary endpoints; on failure the corresponding section silently renders empty-state copy as if the user simply doesn't have data. Same class as S-P2-6 on Subjects.

**Fix:** track per-request errors; surface inline "Couldn't load cohort comparison — retry."

### S-P2-30. `CycleSubjectProgress` TrustStamp coerces unknown to `preview`
**File:** `features/study/components/CycleSubjectProgress.jsx:54-55`

`<TrustStamp kind={s.trust_status === "locked" ? "locked" : "preview"} />` — any non-locked status (including `not_connected`, `needs`) labels as "Preview." Users read "Preview" as "we made this up" even when the actual status is "needs verification."

**Fix:** pass `s.trust_status` through; let `TrustStamp`'s STAMP_MAP pick the label; fall back to preview only when undefined.

### S-P2-31. `PlanRiskFlags` keys on `f.code` with no fallback for collisions
**File:** `features/study/components/PlanRiskFlags.jsx:31-32`

If the backend ever emits two flags with the same code (e.g., two `subject_behind` flags for different subjects), React drops the duplicate silently. Backend audit needs to confirm uniqueness; in the meantime defend with `key={`${f.code}-${i}`}`.

---

## Well-built (no findings)

- `MissionControlSkeleton.jsx` — short, pure presentational.
- `SourceTrustBadge.jsx` — clean variant map, defensive `if (!variant) return null`, proper `role="status"` and `aria-label`.
- `PhaseBandTimeline.jsx` — barring the timezone nit (S-P1-26), pure presentational and contract-aligned.
- `PlanRiskFlags.jsx` — non-shaming language, empty state, no client-side fabrication.
- `MasteryDistribution.jsx` — explicit target line, server-provided values only.

---

## Counts

| Severity | Total |
|---|---|
| P0 | 19 |
| P1 | 32 |
| P2 | 31 |
| **Total** | **82** |

---

## What I did not verify

- Backend response shapes for `/api/study/mission-control` and `/api/study/weekly-review` — assumed the documented shape; should be cross-checked against actual responses against a populated DB.
- No live rendering: cannot confirm the SVG charts (`MockScoreTrend`, `BacklogMovementChart`, `CycleProgressRail`, `PlannedVsActualChart`) look right at edge values without running the dev server.
- `TopicTreePanel.jsx` itself (the parent wrapping `TopicRow`) — read but no findings beyond what `TopicRow` already surfaces.

---

## Recommended ship order

1. **Error-handling sweep (P0):** S-P0-1, S-P0-2, S-P0-3, S-P0-6, S-P0-10, S-P0-11, S-P0-13, S-P0-16, S-P0-19. Same pattern, same fix (try/catch + toast + rollback). Bundle into one PR — touches Today, StudyPlan, Focus, Mocks, PlanPreferencesCard, TaskReasoningPanel, FocusReflectionPanel, Compare, TopicRow.
2. **Crash fixes (P0):** S-P0-9 (TruthPanelCard tone crash — one-line fix), S-P0-14 (Compare MiniBar wrong prop — one-line fix), S-P0-15 (Compare pill tones — five-line fix), S-P0-17 + S-P0-18 (TodaysActions wrong label + undefined slug — small PR).
3. **Data-shape and empty-state correctness:** S-P0-4 (EMPTY_MC merge), S-P0-5 (WeeklyReview "0%" shame loop), S-P1-14 (PlanByTopic 0h·0%), S-P0-12 (PlanByTopic NaN).
4. **Fictional data leaking to live users (P1):** S-P1-7 (Focus defaults), S-P1-13 (UpdateIntelligencePanel sample updates), S-P1-20 (IntelligenceLayersPanel docs-as-data), S-P1-21 (FocusReflectionPanel "kept on device" lie), S-P1-32 (ExamCycleTimeline fake `planner_v1`).
5. **Tracker + Mocks data correctness:** S-P0-7 (Tracker uncontrolled inputs), S-P0-8 (Mocks validation).
6. **Dead buttons:** S-P1-1, S-P1-2, S-P1-19 (NextBestActionCard fallback). Either wire or delete.
7. **Ranking and scale bugs (P1):** S-P1-22 (NextRecommendedActions scale mix — high-impact, affects what users do next), S-P1-23 (TopicRow priority 0/1).
8. **Telemetry correctness:** S-P1-5, S-P1-8, S-P1-11, S-P1-16, S-P1-26 (all timezone / timer / locale issues). Needed before Truth Panel numbers can be trusted.
9. **Layout / chart correctness:** S-P1-4, S-P1-9, S-P1-10, S-P1-24, S-P1-27, S-P1-28.
10. **UX correctness:** S-P1-3, S-P1-6, S-P1-15, S-P1-17, S-P1-18, S-P1-29, S-P1-30, S-P1-31.
11. **P2 batch:** a11y (S-P2-1 modal semantics, S-P2-12 EngineTrace SVG, S-P2-24 SubjectCard focus ring) — fast and high-leverage for keyboard / screen-reader users; then enum labels (S-P2-13, S-P2-16), polish, and contract cleanup.
