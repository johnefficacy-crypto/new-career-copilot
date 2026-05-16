# Frontend audit — Study OS (Today, StudyPlan, Tracker, Mocks, Focus, WeeklyReview, Subjects, Dashboard)

_Last updated: 2026-05-16_

Scope (read in full):
- `app/frontend/src/pages/Today.jsx` (413 LOC)
- `app/frontend/src/pages/StudyPlan.jsx` (494 LOC)
- `app/frontend/src/pages/Tracker.jsx` (85 LOC)
- `app/frontend/src/pages/Dashboard.jsx` (66 LOC, very dense — many JSX statements per line)
- `app/frontend/src/pages/study/Focus.jsx` (353 LOC)
- `app/frontend/src/pages/study/Mocks.jsx` (775 LOC)
- `app/frontend/src/pages/study/WeeklyReview.jsx` (537 LOC)
- `app/frontend/src/pages/study/Subjects.jsx` (96 LOC)
- `app/frontend/src/features/study/components/StudyTaskCard.jsx` (78 LOC, sampled)

Total user-facing Study OS surface: ~3.2k LOC across 8 pages + ~3.4k LOC across 32 components in `features/study/components/`. The 32-component layer was only spot-checked; a follow-up pass should walk each component against its backend contract.

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

---

## What I did not verify

- `features/study/components/` (32 components, ~3.4k LOC) — sampled `StudyTaskCard` only. Components like `EngineTrace`, `PlanByTopic`, `MasteryDistribution`, `TopicTreePanel`, `NextRecommendedActions`, `TaskReasoningPanel`, `PlanPreferencesCard`, `PlanChangeLogCard`, `CompetitionContextCard`, `UpdateIntelligencePanel`, etc. need a separate pass.
- `features/dashboard/components/TodaysActions.jsx` — used by both Dashboard and Today.
- `Compare.jsx` (422 LOC) — sampled at the top only.
- Backend response shapes for `/api/study/mission-control` and `/api/study/weekly-review` — assumed the documented shape; should be cross-checked against actual responses against a populated DB.
- No mock-up rendering: cannot confirm the SVG charts (`MockScoreTrend`, `BacklogMovementChart`) look right at edge values without running the dev server.

---

## Recommended ship order

1. **S-P0-1, S-P0-2, S-P0-3, S-P0-6**: error-handling sweep. Same pattern, same fix (try/catch + toast + rollback). Bundle into one PR.
2. **S-P0-4, S-P0-5**: data-shape and empty-state correctness. The `EMPTY_MC` merge bug will manifest as soon as the backend returns sparse payloads; the WeeklyReview "0%" bug is a strategy-doc violation and is visible from minute one.
3. **S-P0-7, S-P0-8**: Tracker controlled-inputs + Mocks validation. Ship together — both are data-correctness bugs that lie quietly.
4. **S-P1 dead buttons (S-P1-1, S-P1-2)**: either wire or delete. Cheap.
5. **S-P1 telemetry correctness (S-P1-5 timezone, S-P1-8 timer drift, S-P1-11 datetime UTC)**: needed before Truth Panel numbers can be trusted.
6. **S-P1-3, S-P1-6, S-P1-7**: UX correctness — selected state, dropdown, fictional defaults.
7. **P2 batch**: a11y + polish (especially S-P2-1 modal semantics — fast and high-leverage for keyboard/screen-reader users).
