# Frontend audit — community / study-groups / partners / mentors / resources

Scope: `app/frontend/src/features/community/{CommunityScreen,StudyGroupsScreen,PartnersScreen,MentorsScreen,ResourcesScreen,data}.{jsx,js}`, plus the routes that mount them in `app/frontend/src/routes/appRoutes.jsx`. Backend cross-checks against `app/backend/app/api/community_runtime.py` (already audited at backend level — see `audit-p0-fixes.md`).

Total surface: 5 screens + 1 seed module = **3,808 LOC** across `features/community/`.

Severity legend:
- **P0** — crash or silent functional break in the live path.
- **P1** — wrong data shown / silently broken interaction.
- **P2** — accessibility, contract drift, dead code, polish.

---

## P0 — Crashes / silent functional breaks

### F-P0-1. `PartnersScreen` crashes on live backend response
**File:** `PartnersScreen.jsx:163-267, 79`
**Backend:** `community_runtime.py:572-602`

Live `/api/community/partner` returns `thisWeek: {}` (empty object). UI then does `state.thisWeek.self.hours`, `state.thisWeek.partner.checkedInDays.map(...)` — `TypeError: Cannot read properties of undefined (reading 'hours')` at `ThisWeekComparison`, and again at `PartnerHeroCard` (`thisWeek.self.hours + thisWeek.partner.hours`). Whole `/app/partners` page subtree errors out as soon as the backend resolves.

`setState((prev) => ({ ...prev, ...d }))` (line 42-43) overlays `{thisWeek: {}}` onto the seed state, so the seed's nested `self/partner` keys are wiped, not preserved.

**Fix:** either deep-merge, or filter falsy/empty backend keys before merging, or normalize via an adapter (same pattern as `MentorsScreen.adaptMentor` from the last pass).

### F-P0-2. `PartnersScreen` shows blank partner name / no streak after live load
**File:** `PartnersScreen.jsx:97-152, 19`

Backend returns `partner: {id, full_name, display_name, exam_focus, city}` and `partnership: <accountability_pairs row>`. Frontend reads `partner?.name` (renders blank), `partnership.streakDays` (renders "undefined**d**"), `partnership.since` (renders "since undefined"). Avatar receives `user={partner}` — Avatar reads `avatarColor` which backend never returns; falls back to a single default, so every live partner gets the same color.

Same problem on `you` — backend returns `{id, name}` only, missing `avatarColor`/`handle`/`exam` that the hero card and `Stat` rows display.

**Fix:** add a `adaptPartnerState(backendResponse)` adapter that fills in `name = full_name || display_name`, `avatarColor` (deterministic palette), `partnership.streakDays = 0` default, etc. — frontend-only, same approach as the mentor fix.

### F-P0-3. "New thread" / vote optimistic state silently diverges on POST failure
**File:** `CommunityScreen.jsx:535-560` (`ThreadCard`), `678-694` (`ThreadDetail`), `889-905` (`ReplyItem`)

All three vote handlers:
1. Optimistically `setLocalVote(wanted) / setLocalNet(v => v + delta)`.
2. POST.
3. `catch {}` — empty.

If the POST 4xx/5xx (auth lapse, 404 on a stale id, rate limit, server error), the UI shows the vote as accepted forever. The user has no idea their vote didn't land. On reload, the count silently corrects itself and the user concludes "votes don't work."

**Fix:** on error, roll back local state to its pre-call value AND surface a toast. The codebase already has `ToastProvider` (`src/shared/ui/ToastProvider.jsx` per graph index). Use it.

### F-P0-4. Channel-creation hits the deprecated seed-only endpoint
**File:** `CommunityScreen.jsx:1207-1235`

Posts to `POST /api/community/spaces/${space.id}/channels`. As verified in the previous backend audit (`audit-p0-fixes.md` → "Out of scope" list, P1 #1), this path exists only in `community_people.py` and writes to in-memory `COMMUNITY_SPACES`. The handler returns 200 with a fake channel id, the frontend navigates to it, then `refreshSpaces()` re-fetches and the new channel disappears. Admin gets to create channels that don't persist.

**Fix:** either disable the button until the backend route is moved to `community_runtime` (P1 from previous pass), or route the POST through a backend ticket queue. Don't ship a "create channel" button that lies.

### F-P0-5. "New" sort is broken — pinned-only, never sorts by recency
**File:** `CommunityScreen.jsx:217-219`

```js
case "new":
  return arr.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
```

That's just "float pinned to top, otherwise preserve original order." There's no `createdAt` compare. So clicking the "New" sort tab does nothing useful — and worse, it looks like it worked because pinned items move.

**Fix:**
```js
case "new":
  return arr.sort(
    (a, b) =>
      Number(!!b.pinned) - Number(!!a.pinned) ||
      Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)
  );
```
Note: seed `createdAt` strings are like `"4h"`, `"2d"` — not parseable. Live backend returns ISO strings. This sort works for live data; seed-only mode falls back to insertion order. Acceptable.

### F-P0-6. "My groups" tab silently empties when backend wins
**File:** `StudyGroupsScreen.jsx:50-56, 31-34`

Tab `"mine"` filters by `g.isMine`. Backend `_shape_group` (`community_runtime.py:362`) sets `isMine: joined or row.get("joined") or False`. If the user has no joined groups, every backend group has `isMine: false` → the tab shows `EmptyState` even when the user just clicked "Request to join." Worse, on a brand-new install (no `study_group_members` rows) every user sees an empty default tab.

Default tab is `"mine"`, so this is the user's first impression of the page.

**Fix:** default tab to `"open"` when `groups.filter(g => g.isMine).length === 0`; or compute and gate the tab choice from data.

### F-P0-7. ThreadCard / ResourceCard `onClick` are inaccessible
**File:** `CommunityScreen.jsx:562-570` (ThreadCard), `ResourcesScreen.jsx:236-241` (ResourceCard, less severe), `StudyGroupsScreen.jsx:113-165` (GroupListCard uses `<button>`, ok)

ThreadCard is `<article onClick={onOpen}>` — a non-interactive element with a click handler. No `role`, no `tabIndex`, no `onKeyDown` for Enter/Space. **Keyboard users cannot open a thread.** Mobile screen readers will not announce it as clickable.

**Fix:** wrap the card in a `<Link to=...>` (preferred — also fixes middle-click-to-open-in-new-tab), or add `role="link" tabIndex={0} onKeyDown` if the card must remain a `<div>`/`<article>`.

---

## P1 — Wrong-data / broken-interaction

### F-P1-1. Hard-coded fictional members rendered as real
**File:** `StudyGroupsScreen.jsx:367-405`

```js
{[ {u: "u_aarav", join: "Mar 11", hrs: 38.5, founder: true}, ...]
  .slice(0, group.members)
  .map(...)}
```

The members list is a literal array of seed user ids, sliced by `group.members` (a count). When backend returns a real group with `members: 6`, the UI renders the first 6 hard-coded seed names regardless of the actual members. Same for `joined` dates and `hours`. Real users see "Aarav Mehra · Kavya Iyer · …" in groups they're members of, which is misinformation.

Same class:
- `DailyCheckinCard` (lines 336-362): hard-coded 4 check-ins always rendered.
- `PostSessionLogCard` (442-497): three hard-coded session rows.
- `SharedResourcesCard` (408-440): three hard-coded resources.
- `CommunityScreen.ThreadSidebar` "Related threads" (1074-1097): three hard-coded titles.
- `PartnersScreen.DailyCheckinPartner` "Partner's last check-in" (349-356): hard-coded `u_aman`, May 14 timestamp, body string.
- `PartnersScreen.PartnerHeroCard` (146): `Stat k="Partnership age" v="64 days"` — hard-coded.
- `PartnersScreen.CommitmentDiffCard` (392): "last updated May 6 by partner" hard-coded.

**Fix:** any block that contains data that *looks* user-specific must be either (a) wired to an endpoint, or (b) gated behind `if (!liveData) return null`. Currently a logged-in user with no groups still sees "5/6 checked in" and four named teammates.

### F-P1-2. `groups`/`partner`/`sessions` seed leakage on empty backend
**File:** `StudyGroupsScreen.jsx:31-35, 38-42`; `PartnersScreen.jsx:39-44`; `ResourcesScreen.jsx:38-41`; `MentorsScreen.jsx:55-63, 70-74`

Same pattern in every screen:
```js
if (Array.isArray(d?.items) && d.items.length === 0) return;  // keep seed
setX(d.items);
```

An empty backend response is interpreted as "use seeds." Users on a fresh install therefore see fictional data they can't act on:
- Click "Request to join" on `g1` ("UPSC CSE 2026 — Morning Batch") → backend 404 on `g1`, swallowed.
- Click "RSVP" on `sr1` → 404 swallowed.
- Click "Invite" on `u_pooja` candidate (seed UUID, not real) → backend 400 ("Invalid candidate" — `_is_uuid` check), swallowed.
- Click "Book" on `ms1` mentor session → 404, swallowed.

Same bug class as Claim D (mentor crash) in the last audit — *that one* was fixed because it crashed; these don't crash, so the misleading state ships.

**Fix:** show the seed only when the backend is *unreachable*, not when it returns `[]`. An empty backend should render `EmptyState`, not seed. A flag like `setLive(true)` after the first successful (even empty) fetch and gating UI on that is the simplest path.

### F-P1-3. Optimistic counters never reconciled on `vote` / `join` / `rsvp` / `invite`
**File:** `StudyGroupsScreen.jsx:191-204, 549-560`; `PartnersScreen.jsx:467-473`; `ResourcesScreen.jsx:59-70`

None of these handlers:
- Update local state optimistically — buttons remain in their pre-click state forever.
- Re-fetch on success — `api.post(...).catch(() => {})` and that's it.

Result: user clicks "RSVP" → button still says "RSVP" → user clicks again → second RSVP. Same for "Request to join" (no `youRequested=true` update) and "Invite" (no `invited=true` update). The `invited` field of the candidate item is set in seed but never flipped by the click handler.

`ResourcesScreen.vote` does call `reload()` after — better — but `reload()` only `setItems(d.items)` if backend returns ≥1 row (P1-2 again), so on a fresh install, voting a seed resource does nothing visible.

**Fix:** after the POST resolves, either patch the local item in state (`setX(prev => prev.map(...))`) or re-fetch unconditionally. Optimistic update with rollback on error is the right pattern; pick one and apply consistently.

### F-P1-4. `ResourcesScreen` "Open" button is decorative
**File:** `ResourcesScreen.jsx:294-299`

```jsx
<button ... className="...">Open</button>
```

No `onClick`, no `href`. The button labeled "Open" on every resource card does nothing. Users can't actually access a resource from the library. (Resource detail route exists at `/app/marketplace/:id`, but it's never linked here.)

**Fix:** turn into `<Link to={`/app/marketplace/${r.id}`}>` or `<a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">`.

### F-P1-5. `ResourcesScreen` "Save" button is decorative
Same file `:300-305`. No handler. Implies functionality that doesn't exist. Either wire to `/api/community/resources/{id}/save` (not implemented backend-side either) or remove the button.

### F-P1-6. `ResourcesScreen` Report dialog is one-tap with hardcoded reason
**File:** `ResourcesScreen.jsx:66-70, 308-313`

```jsx
async function report(id, reason) { try { await api.post(`/api/community/resources/${id}/report`, { reason }); } catch {} }
...
onClick={() => onReport && onReport()}  // calls with reason="user-reported via UI"
```

Backend requires `min_length=3, max_length=300` (`community_runtime.py:341`), so the string passes — but the report has no actionable reason. Mods can't moderate "user-reported via UI" as anything useful. Also no feedback to the user that the report landed.

**Fix:** open a small modal asking for a reason (`spam`, `dmca`, `incorrect`, plus a free-text textarea) before POSTing. Toast on success.

### F-P1-7. `ResourcesScreen` filter sidebar defaults to `exam = "UPSC CSE"`
**File:** `ResourcesScreen.jsx:32`

```js
const [exam, setExam] = useState("UPSC CSE");
```

Users prepping for SSC CGL / IBPS PO / RBI Grade B always land on a page that filters them out by default. Profile-aware default would be `useAuth().exam || "all"`.

### F-P1-8. `ResourcesScreen.filtered` re-filters client-side after backend already filtered
**File:** `ResourcesScreen.jsx:36-46, 48-57`

`reload()` is called with no params at mount, so backend returns approved resources for all exams/types. The client then filters by `type/trust/exam`. That works, but it means:
- Switching filters never re-fetches → stale list as new resources are approved.
- Pagination (when added) won't work — server is paginating an unfiltered set.

**Fix:** call `reload({ exam, type, trust, sort })` from the filter setters via `useEffect`.

### F-P1-9. `CommunityScreen` "Unanswered" filter operates on a `?sort=hot` slice
**File:** `CommunityScreen.jsx:73-81, 229-230`

```js
api.get(`/api/community/channels/${cid}/threads?sort=hot`)
...
case "unanswered": return arr.filter((t) => (t.replies || 0) === 0);
```

Backend already returns at most ~100 hot threads (or whatever default the backend caps at — `community_runtime.list_channel_threads` selects without limit but the server may default). "Unanswered" is a *server-side concept* — old threads with 0 replies are precisely the ones that won't be hot. Sorting by hot first means almost every unanswered thread is *not in the list*.

**Fix:** pass `sort` to the backend (`?sort=${sort}`), let backend's `unanswered` filter handle it (which it already does: `q.eq("reply_count", 0)` at `community_runtime.py:226`).

### F-P1-10. `CommunityScreen` URL sync writes on every render
**File:** `CommunityScreen.jsx:96-104`

```js
useEffect(() => {
  if (!space || !channel) return;
  const wanted = thread ? `/app/community/${space.id}/${channel.id}/${thread.id}` : `/app/community/${space.id}/${channel.id}`;
  if (window.location.pathname !== wanted) navigate(wanted, { replace: true });
}, [space, channel, thread, navigate]);
```

`space`/`channel`/`thread` come from `useMemo` over an array `find`. Their identity changes whenever `spaces` / `threads` array re-renders (e.g., after `refreshChannelThreads` runs). The `window.location.pathname !== wanted` guard prevents a navigate loop, but `navigate(..., {replace: true})` still resets the browser's history entry → **users can't share a URL and have it persist** because the URL is overwritten the moment data refreshes, even when it was already correct.

Also: bypassing React Router's `useLocation` (`window.location.pathname`) is a smell. Mixed sources of truth.

**Fix:** sync URL once when the user picks a space/channel, not from a derived-state effect. Move the `navigate` calls into `pickSpace` / `pickChannel` / `openThread` (they already exist) and remove the effect.

### F-P1-11. Sorting state isn't lifted into the URL
**File:** `CommunityScreen.jsx:50` — `const [sort, setSort] = useState("hot");`

Refreshing a thread list loses your sort selection. Shareable URLs don't include it. Minor UX, but inconsistent with the existing URL-sync ambition.

### F-P1-12. `CommunityScreen.refreshChannelThreads` ignores the user's chosen sort
**File:** `CommunityScreen.jsx:73-81`

Hard-coded `?sort=hot`. See F-P1-9.

### F-P1-13. `CommunityScreen.ThreadDetail.liveThread.replies_list` is dead code
**File:** `CommunityScreen.jsx:653`

```js
const replies = liveThread.topReplies || liveThread.replies_list || thread.topReplies || [];
```

Neither backend nor frontend ever sets `replies_list`. `refreshThread` does `setLiveThread({ ...d.thread, topReplies: d.replies || [] })`, so the middle branch can never fire. Cosmetic, but suggests a half-finished migration. Remove.

### F-P1-14. `CommunityScreen.NewChannelDrawer` has stale error state on success
**File:** `CommunityScreen.jsx:1214-1235`

If submit succeeds, `onCreated(d?.channel)` fires and `onClose()` closes the drawer — but `error` state persists. Reopen the drawer immediately and the old error still shows. Same pattern in `ComposerDrawer` (1103-1131).

**Fix:** clear `error` on close, or reset state on open by keying the drawer.

### F-P1-15. `StudyGroupsScreen.UpcomingStudyRooms.Open link` builds a URL with `https://` prefix
**File:** `StudyGroupsScreen.jsx:561-569`

```jsx
<a href={`https://${s.platformLink}`} target="_blank" rel="noopener noreferrer">
```

Seed data stores `platformLink: "meet.google.com/abc-xxxx"`. Backend may return either bare hosts or full URLs. If backend ever returns `https://meet.google.com/...`, this becomes `https://https://meet.google.com/...` → broken link. No `try` to normalize.

**Fix:** `href={s.platformLink.startsWith("http") ? s.platformLink : `https://${s.platformLink}`}`. Or normalize on the backend.

### F-P1-16. `StudyGroupsScreen` "Create group", "Group settings", "Find a group →", "+ Upload", "+ Schedule a session" buttons are decorative
**File:** `StudyGroupsScreen.jsx:66-72, 186-188, 415-417, 512-514`

No `onClick`. No `disabled`. Implies functionality that doesn't exist. There is no backend endpoint for "create group" or "settings."

**Fix:** Either disable + tag as "coming soon" or wire to the eventual endpoint.

### F-P1-17. `PartnersScreen` "End partnership" has no confirmation
**File:** `PartnersScreen.jsx:65-71`

```jsx
<button onClick={() => api.post("/api/community/partner/end", {}).catch(() => {})}>End partnership</button>
```

One-click destructive action with no confirmation, no loading state, no success/error feedback. End partnership, refresh page, partnership is "back" (because seed still wins per F-P1-2).

**Fix:** Confirmation modal, loading state, optimistic local state update, toast on success.

### F-P1-18. `PartnersScreen` "Pause this week" / "Edit your commitment" / "Add to calendar" / "Open meet link" / "Full log →" are decorative
**File:** `PartnersScreen.jsx:72-74, 380-382, 405-409`; `StudyGroupsScreen.jsx:261-266`

Same class as F-P1-16.

### F-P1-19. `MentorsScreen.MentorProfileDrawer` "Request 1:1", "View public sessions" are decorative
**File:** `MentorsScreen.jsx:354-365`

No `onClick`. Yet the drawer is the primary surface for the 1:1 booking funnel. The actual "Request 1:1" endpoint exists (`POST /api/accountability/mentors/book`, `community_runtime.py:695`) but is not wired here.

**Fix:** wire to `/api/accountability/mentors/book` — that endpoint requires `mentor_id` (uuid), `slot` (string), optional `agenda`. Drawer needs a slot picker.

### F-P1-20. `MentorsScreen.MentorProfileDrawer` filters sessions by seed `MENTOR_SESSIONS`, not live
**File:** `MentorsScreen.jsx:372-385`

```jsx
{MENTOR_SESSIONS.filter((s) => s.mentorId === mentor.id).map(...)}
```

Uses the imported seed constant directly. Live sessions from `/api/community/mentor-sessions` (in `MentorsScreen` state) are not threaded through. If a real mentor has live sessions, the drawer shows "No public sessions scheduled" — and conversely, seed mentor `u_kavya` always shows seed session `ms1` even when the live data has none.

**Fix:** pass `sessions` from `MentorsScreen` state down to the drawer.

### F-P1-21. `MentorsScreen.MentorEarningsView` does `E.total / E.completed` without zero guard
**File:** `MentorsScreen.jsx:416-419`

```js
v={`₹${Math.round(E.total / E.completed).toLocaleString()}`}
```

If `E.completed === 0` (a new mentor or a fresh user clicking the "You as mentor" toggle), this renders `₹NaN`. Crash-adjacent because `NaN.toLocaleString()` returns `"NaN"` which then renders harmlessly, but the KPI is broken.

**Fix:** `E.completed > 0 ? Math.round(E.total / E.completed) : 0`.

### F-P1-22. `MentorEarningsView` hard-codes Y-axis cap at 14k
**File:** `MentorsScreen.jsx:443-475`

`fill="#54794E"`, `height={(m.v / 14000) * 120}`. Any month earning > ₹14,000 overflows the chart area. Real top mentors will see clipped bars.

**Fix:** compute `max = Math.max(...E.monthly.map(m=>m.v), 14000)` and scale accordingly.

### F-P1-23. `CommunityScreen.QuickLink` to `/app/marketplace` (no `:id`) doesn't exist
**File:** `CommunityScreen.jsx:363`; routes: `appRoutes.jsx:58` — `<Route path="/app/marketplace/:id" element={<ResourceDetail />} />`

The link `<QuickLink to="/app/marketplace" .../>` doesn't match any route. React Router renders the fallback (404 page or empty). The intended target is presumably `/app/resources` (the resource library).

**Fix:** change to `/app/resources`.

### F-P1-24. `CommunityScreen.QuickLink` to `/app/community/general/g-groups` may misfire
**File:** `CommunityScreen.jsx:360`

Hard-coded to a *seed* channel id. If the backend's General space exists with different channel ids (uuids), the link resolves to a missing channel. `CommunityScreen` then renders whatever `spaces[0].channels[0]` falls back to.

**Fix:** resolve "find a study group" via space slug + channel slug at navigation time, not hard-coded ids.

### F-P1-25. `MentorsScreen` `view` effect missing dep
**File:** `MentorsScreen.jsx:81-89`

```js
useEffect(() => {
  if (view !== "earnings") return;
  api.get("/api/community/mentor-earnings").then((d) => { ... }).catch(() => {});
}, [view]);
```

`MENTOR_EARNINGS` is a module-level constant (stable identity), so the lint warning would be benign. But the bigger issue: this is the only effect that fetches earnings, and there's no error feedback if it 401s — user toggling "You as mentor" silently sees seed data.

### F-P1-26. `PartnersScreen.PartnerCandidatesCard.invite` doesn't validate UUID
**File:** `PartnersScreen.jsx:467-473`; backend: `community_runtime.py:625` (`if not _is_uuid(payload.candidate_id) ...`)

Seed candidates have ids like `"u_pooja"` (not a UUID). When the user clicks "Invite" on a seed candidate, backend returns 400. Frontend swallows it; button stays "Invite" forever. The user can't tell whether they invited or not.

**Fix:** combine with F-P1-2 (don't show seed candidates as actionable) and F-P1-3 (surface failures).

---

## P2 — Polish, contract, dead code

### F-P2-1. Inconsistent error handling — every screen swallows
Every `api.post`/`api.get` write in these files uses `.catch(() => {})` or `try { ... } catch {}`. There is a `ToastProvider` in the codebase. No screen audited here uses it for community write paths. Recommendation: introduce a thin `useApiAction` hook (or use existing `useAdminAction` pattern) and standardize on toast-on-error.

### F-P2-2. Cross-screen duplication of "seed → live merge" logic
Same code in 5 files:
```js
if (cancelled || !Array.isArray(d?.items) || d.items.length === 0) return;
setX(d.items);
```
Extract to a shared `useApiCollection(url, seed)` hook that:
1. Returns `{items, status: "seed" | "loading" | "live"}`.
2. Calls the adapter (if provided) before storing.
3. Surfaces empty-vs-error distinction so screens render `EmptyState` vs seed appropriately (closes F-P1-2 systematically).

### F-P2-3. `data.js` has 369 lines of fictional names + timestamps shipped to every user
The seed has rich detail (`Aarav Mehra`, `Kavya Iyer`, `Apr 28 joined`, ratings, prices, dates). That's deliberate for the prototype port — but it's now bundled into every production build. Treeshake check: nothing here is dynamic-imported. ~30KB before gzip travels to every visitor.

**Fix:** in production builds, swap seed for a minimal placeholder via Vite/webpack alias or a build-time flag. Or accept the cost and document it.

### F-P2-4. `MentorsScreen.MentorTopBadge` brittle string-parsing for badge
**File:** `MentorsScreen.jsx:138-144`

```js
if (mentor.badge.includes("AIR")) return <VerifiedTopperBadge rank={mentor.badge.split(" · ")[0]} exam={mentor.badge.split(" · ")[1]} compact />;
if (mentor.badge.includes("IPS")) return <VerifiedOfficerBadge post={mentor.badge} />;
if (mentor.badge.includes("Mentor")) return <MentorBadge />;
```

The previous P0 audit fixed the crash here (badge defaulting). But the *parsing* — substring-matching "AIR" / "IPS" / "Mentor" out of a free-text badge — is fragile. Add "AIR 8 · CSE 2022 · also IPS" and the wrong badge wins. Should be a structured `{kind: "topper"|"officer"|"mentor", ...}` shape on the backend, with the adapter producing it.

### F-P2-5. `CommunityScreen.ReplyComposer` swallows error but shows error text
**File:** `CommunityScreen.jsx:947-964`

Good: this one *does* `setError(e?.message)`. But the toolbar buttons `B / I / “ ” / </> / ·` (970-980) do nothing — they have no `onClick`. Markdown buttons that don't insert markdown.

### F-P2-6. `CommunityScreen.ComposerDrawer.flair` is uncontrolled vs FLAIRS keys
`flairOptions = Object.keys(FLAIRS).slice(0, 7);` takes the first 7. Order depends on insertion order in `data.js`. If `data.js` adds a flair before `notice`, the default visible set shifts. Brittle.

### F-P2-7. `StudyGroupsScreen.NextSessionCard` parses time with string split
**File:** `StudyGroupsScreen.jsx:244-275`

```js
const [whenDay, whenTime] = s.at.split("·").map((x) => x.trim());
```

Seed has `at: "Tomorrow · 06:00"`. Live backend returns `null` for `at` (`community_runtime.py:644-646` — `"at": None`). Then `null.split` throws. Same crash risk class as F-P0-1 but only when `NextSessionCard` mounts with backend-shaped data.

`group.nextSession` comes from backend `_shape_group.next_session: row.get("next_session")` (line 373) which the schema likely doesn't have — so this card is only rendered for seed groups today. Verify before it ever renders with live data.

**Fix:** null-guard the split, or normalize on the backend.

### F-P2-8. `PartnersScreen.CheckinHistory` uses `c.partner.includes("Skipped")` to color the cell
**File:** `PartnersScreen.jsx:426`

Treats free-text strings as a status enum. Real check-ins won't include the literal "Skipped"; they'll have `did_study: false` on a sibling field. Once wired to live data this stops working.

### F-P2-9. `ResourcesScreen.TYPE_ICONS` keys vs backend `resource_type` enum
Backend check constraint (`088_community_resources_runtime.sql:8-9`): `'pyq_paper','notes','strategy_guide','video_link','course_link','book'`. Frontend `TYPE_ICONS` keys match exactly. Good. But backend `_shape_resource` returns `"type": row.get("resource_type") or row.get("type")` (good), and ContributeDrawer posts `{type: form.type}` (frontend key `type`, mapped server-side via `ResourceContribute.type`). Contract is fine; just flagging the mapping as a hotspot.

### F-P2-10. `StudyGroupsScreen.GroupListCard` progress div uses unbounded division
**File:** `StudyGroupsScreen.jsx:114, 155`

```js
const pctH = g.weeklyHoursDone / g.weeklyHoursGoal;
```

When `weeklyHoursGoal === 0` (new group with no goal set) → `Infinity` → `width: Infinity%`. The `Math.min(100, ...)` clamps it, but the bar shows as 100% even when nothing was done. Same in `GroupKPI`.

**Fix:** `g.weeklyHoursGoal > 0 ? g.weeklyHoursDone / g.weeklyHoursGoal : 0`.

### F-P2-11. `PartnersScreen.ThisWeekComparison` divides by partner commitments
**File:** `PartnersScreen.jsx:196, 202, 215, 221`

Same div-by-zero risk on `A.partnerCommitment.hoursPerWeek` / `.tasksPerWeek` if the live shape doesn't include these.

### F-P2-12. `key={i}` everywhere there's an array
Examples: `PartnersScreen.jsx:344` `key={i}` for check-ins (date is stable, use it), `MentorsScreen.jsx:443` `key={i}` for months (`m.m`), `StudyGroupsScreen.DailyCheckinCard` `key={i}`. React reordering / inserts will produce wrong UI state. Convert to stable keys.

### F-P2-13. `PartnersScreen.ACCOUNTABILITY.candidates.map` → `c.user` set once at module load
**File:** `PartnersScreen.jsx:26-30`

```js
candidates: ACCOUNTABILITY.candidates.map((c) => ({ ...c, user: COMMUNITY_USERS[c.id], invited: false })),
```

This computes `c.user` from seed at module load. When live data comes in via `setState((prev) => ({ ...prev, ...d }))`, the `candidates` array is *replaced* — but live candidates won't have a `user` field. The component falls back to `COMMUNITY_USERS[c.id]` (which is a uuid → undefined). Renders `{c.id}` as name.

### F-P2-14. SVG `aria-label` vs `aria-hidden` mix
Most icon SVGs are `aria-hidden="true"` — correct. But some `<svg>` blocks (the partnership streak ring in `PartnersScreen.jsx:111-127`) have no `aria-hidden`, and the streak number is rendered as SVG `<text>` — screen reader output is "graphic 34d consecutive days both checked in" awkwardly. Either set `aria-label` on the SVG and `aria-hidden` on the `<text>`, or move the number out of the SVG.

### F-P2-15. `MentorsScreen.adaptMentor` is only applied to backend data, not seed
**File:** `MentorsScreen.jsx:26-43, 70-75, 56-62`

Seed `MENTORS` already has all the fields. Backend mentors go through `adaptMentor`. Inconsistent: if a future change to `adaptMentor` adds derived fields, seed-mode mentors won't have them. **Apply `adaptMentor` to the seed at module load** for safety:
```js
const SEED_MENTORS = MENTORS.map((m, i) => adaptMentor(m, i));
```

### F-P2-16. `ResourcesScreen.ContributeDrawer` doesn't clear form on close
Same class as F-P1-14. Reopen → old values persist.

### F-P2-17. `ResourcesScreen.ContributeDrawer.size` field hard-coded to `"link"`
**File:** `ResourcesScreen.jsx:362`

Backend `ResourceContribute` accepts `size: str = Field(default="link", max_length=16)`. UI never lets the user pick or specify it. So every community contribution is recorded as size=link even when it's actually a 2 MB PDF.

### F-P2-18. `CommunityScreen.ChannelRulesRibbon` rules key inference is fuzzy
**File:** `data.js:246-257` (`rulesKeyFor`)

```js
if (n.includes("form")) return "form";
```

Any channel with "form" in its name (e.g., a hypothetical "transform-tips") gets form-help rules. Use slug equality, not substring matching.

### F-P2-19. `data.js` `THREADS` keyed by channel id but those ids only exist in seed
**File:** `data.js:96-205`

When backend takes over, `THREADS["u-prep"]` is empty for the live channel ids (uuids). The screen falls back to seed only when `refreshChannelThreads` *fails* (empty array isn't falsy here; the screen sets `threadsByChannel[cid] = []` when backend returns `items: []`). OK, but the merge in `refreshSpaces` (`setThreadsByChannel((prev) => ({ ...prev, ...d.threads }))`) keeps both seed and live keys in the same object → memory leak as channels rotate.

### F-P2-20. `StudyGroupsScreen.UpcomingStudyRooms` JOIN by `groupId` is brittle
**File:** `StudyGroupsScreen.jsx:531`

```js
const g = s.groupName ? { name: s.groupName } : groups.find((x) => x.id === s.groupId);
```

Backend study-rooms returns `groupId` (camelCase per `_shape_room` if it exists) — confirm. If backend returns `group_id` instead, the JOIN fails silently and the column renders blank.

### F-P2-21. No skeleton / loading state on any screen
All five screens render seed (or empty) while loading. Users get no signal that data is being fetched. After fetch resolves, the page mutates underneath them. Particularly bad on slow connections — looks like the page is already final, then numbers change.

Minimal fix: a `loading` flag in `useApiCollection` + a `<LoadingSkeleton/>` (already exists per graph) gated on first load.

### F-P2-22. PageHeader `right` slot is freeform JSX — duplicated layout per screen
Each screen passes a `<div className="flex gap-2">` of action buttons. Extract to a `<ActionGroup>` for consistent spacing.

---

## Routing surface

`appRoutes.jsx:50-61`:
- `/app/community/:spaceId?/:channelId?/:threadId?` — works.
- `/app/groups` → `StudyGroupsScreen`. OK.
- `/app/partners` → `PartnersScreen`. OK.
- `/app/resources` → `ResourcesScreen`. OK.
- `/app/marketplace/:id` → `ResourceDetail`. Inconsistent: list at `/app/resources`, detail at `/app/marketplace/:id`. Should be `/app/resources/:id`. **F-P1-23** depends on this.
- `/app/mentors`, `/app/mentors/:id` — OK.
- `/app/accountability` → `PartnersScreen` (alias for `/app/partners`). Two URLs for the same screen, no canonical redirect. SEO + history pollution. Pick one.

---

## Summary count

- **P0:** 7 issues (1 confirmed crash, 1 partial crash, 1 broken sort, 1 inaccessible card, 3 silent-failure paths).
- **P1:** 26 issues (mostly: seed-leaks-as-real-data, optimistic-no-rollback, decorative-buttons, contract drift).
- **P2:** 22 issues (polish, accessibility nits, dead code, missing loading states).

**Top three to fix next (highest user-visible impact / smallest blast radius):**
1. **F-P0-1 + F-P0-2** — apply a `adaptPartnerState` adapter so `/app/partners` stops crashing on real data. Same pattern as the mentor fix from `audit-p0-fixes.md`.
2. **F-P1-2** — introduce `useApiCollection(url, seed)` and replace the 5 copy-pasted "merge or keep seed" blocks. Stops the silent-fictional-data class of bugs in one PR.
3. **F-P0-3 + F-P1-3** — wire vote/RSVP/join/invite/report through a `useApiAction` hook with toast-on-error and optimistic rollback. Restores user trust in mutation buttons across all five screens.

After those three, the next cluster is **F-P1-4, F-P1-5, F-P1-16, F-P1-18, F-P1-19** — the seven or so "decorative button" cases. Either wire or remove. Don't ship UI that lies about what it can do.
