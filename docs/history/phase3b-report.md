# Career Copilot — Phase 3B Implementation Report
**April 19, 2026 · Eligibility engine completed & notification trust restored**

---

## 1. Objective

Finish the eligibility engine (domicile, relaxation caps, ex-serviceman,
appearing candidates) and — critically — make the product trustworthy
end-to-end: users should only see "new match" notifications the engine
actually verified, and every path that produces an eligibility verdict
should share one rule engine.

This phase also folds in the P0/P1 items from the April 19 code review.

---

## 2. End-to-End Eligibility Flow (post-3B)

```
approveScrapeItem()
 ├─ promoteToRecruitments()                    (writes recruitments + posts)
 ├─ insert alert_events (audit row)
 └─ enqueue eligibility_recompute_queue        (one row per onboarded user)

cron (5 min) → eligibility-consumer (Edge Fn)
 └─ group queue rows by user
    └─ POST /api/eligibility/recompute  (service-role bearer)
       └─ runEligibilityForUser(userId, serviceClient)
          ├─ engine.checkEligibilityBatch()  ← SINGLE rule engine
          ├─ upsert eligibility_results      (cache for dashboard)
          └─ upsert notification_alerts      (only eligible/conditional,
                                              trustworthy explanation flags)
              └─ v_notification_feed
                 └─ NotificationsFeed (realtime refetch on INSERT)
                    └─ /dashboard/recruitments/[id]  (detail page)
```

---

## 3. Gap Analysis — Before vs After

| Gap | Before 3B | After 3B |
|---|---|---|
| Two rule engines (Edge Function vs `engine.ts`) | Consumer shipped its own minimal age+edu check; silently diverged on relaxation, domicile, appearing | ✅ Consumer POSTs to `/api/eligibility/recompute`; one engine |
| `approveScrapeItem` broadcast | Inserted `new_match` for every onboarded user with `explanation.{is_eligible,is_tracked,matched_*}=false` | ✅ Removed — engine path emits alerts only for users actually matched |
| `seedNotificationsForNewUser` fallback | "no eligibility data → seed ALL recruitments" | ✅ Eligibility-first; no fallback; engine runs before seeding |
| NotificationsFeed realtime | Cast raw `notification_alerts` row to `NotificationAlert` (enriched view shape) → half-empty rows | ✅ On INSERT refetches the row from `v_notification_feed` |
| NotificationsFeed resync | `useEffect(() => setLocalAlerts(initialAlerts))` commented out → stale after `router.refresh()` | ✅ Re-enabled |
| `/dashboard/recruitments/[id]` | 404 — notifications linked into nothing | ✅ Minimal detail page with verdict, dates, official URL, track toggle |
| Scraping education levels | returned `class_10` / `class_12`; engine expected `10th` / `12th` | ✅ Canonicalised to `10th` / `12th` |
| Domicile check | Not implemented | ✅ `org_state` wired through recruitments → organizations |
| Age relaxation caps | Stacked relaxations beyond DOPT OM 2019 caps | ✅ `Math.max(category, pwbd)` rather than sum |
| Ex-serviceman | Not handled | ✅ `effective_age = age − service_years − 3` + category relaxation |
| Appearing candidates | Hard-rejected | ✅ Marked `is_conditional` on engine verdict |
| `is_conditional` column | Missing | ✅ Added via migration `005_phase3b_eligibility_conditional.sql` |

---

## 4. Changes Made

| File | Change | Why |
|---|---|---|
| `lib/eligibility/engine.ts` | Extended (Phase 3B) | Domicile, relaxation caps, ex-serviceman, appearing conditional |
| `lib/eligibility/runner.ts` | **Rewritten** | Accept injected `SupabaseClient`; emit `notification_alerts` per engine verdict with trustworthy explanation flags |
| `app/api/eligibility/recompute/route.ts` | **New** | Service-role-gated POST; the unified entry into `runEligibilityForUser` |
| `supabase/functions/eligibility-consumer/index.ts` | **Rewritten** | Drain queue → POST to API route per user; deleted local rule engine |
| `lib/db/notifications.ts` → `approveScrapeItem` | Patched | Removed blind `new_match` broadcast; kept audit `alert_events` row; eligibility queue drives fan-out |
| `lib/db/notifications.ts` → `seedNotificationsForNewUser` | Rewritten | Eligibility-first; no "seed all" fallback; populates `explanation.is_tracked` / `is_eligible` |
| `components/dashboard/NotificationsFeed.tsx` | Patched | Realtime INSERT now refetches from `v_notification_feed`; resync effect re-enabled |
| `app/dashboard/recruitments/[id]/page.tsx` | **New** | Detail page so notification links resolve |
| `lib/scraping/runner.ts` → `mapEducationLevel` | Patched | `class_12`/`class_10` → `12th`/`10th` to match engine canonical |
| `supabase/migrations/004_phase3b_profiles_service_years.sql` | **New** (3B) | `profiles.service_years integer` for ex-serviceman formula |
| `supabase/migrations/005_phase3b_eligibility_conditional.sql` | **New** (3B) | `eligibility_results.is_conditional boolean` + partial index |
| `supabase/migrations/006_source_registry_org_state.sql` | **New** (3B) | `source_registry.org_state` + backfill for state PSCs |
| `supabase/migrations/011_auto_enqueue_eligibility_on_insert.sql` | **New** (3B) | Trigger to enqueue recompute for every new recruitment |

---

## 5. Root Cause Notes (April 19 code review — P0/P1 findings)

**5.1 Split-brain rule engine.** The consumer Edge Function duplicated
eligibility logic so it could run server-side from pg_cron without a Next
route. Every rule we added to `engine.ts` in Phase 3B (relaxation, domicile,
appearing, ex-serviceman) was NOT mirrored in the consumer, so the same
`(user, post)` pair could come back "eligible" from one path and
"ineligible" from the other depending on whether the cache was populated
by the in-app runner or by the Edge Function. **Fix:** the consumer now
just authenticates with the service-role key and POSTs the user id to
`/api/eligibility/recompute`, which runs the canonical engine inside
Next.js.

**5.2 Broadcast "new match" was a lie.** `approveScrapeItem` inserted a
`new_match` notification for every onboarded user with every
`explanation.*` flag set to `false`. The UI advertises those as
personalised matches, so users saw UPSC notifications they were
categorically not eligible for, tagged as "new match for you". **Fix:**
`approveScrapeItem` only records an audit `alert_events` row and enqueues
eligibility recompute. The engine — which has actual verdict data — is
now the sole path that inserts `new_match` rows.

**5.3 Seed fallback was the same bug in a different place.** The onboarding
"seed your feed" step, when `eligibility_results` was empty, shovelled
every open recruitment into the user's alerts. Same over-claim, different
trigger. **Fix:** seed only off eligibility results; if empty, the feed
is empty (which is honest — the engine runs on completion of onboarding
so in practice the feed is never empty for eligible users).

**5.4 Realtime cast gave half-populated cards.** The INSERT payload is the
raw `notification_alerts` row; the UI expects the enriched
`v_notification_feed` shape (recruitment_name, org_name, days_to_deadline,
is_tracked, explanation). Casting across was silent — TypeScript
accepted the cast — and produced cards with most fields undefined.
**Fix:** refetch the row from `v_notification_feed` by id after any
INSERT event.

**5.5 Dead link.** `/dashboard/recruitments/[id]` didn't exist. Every
"new match" link 404'd. **Fix:** minimal server component with the
essentials — verdict, dates, official notification URL, track toggle,
per-post fail reasons.

**5.6 Scraper / engine string mismatch.** `mapEducationLevel` returned
`class_12` but the engine rank table keyed on `12th`. Every 12th-pass or
matric-pass criterion silently evaluated as "unknown level = not met".
**Fix:** one character of mismatch replaced with the canonical string.

---

## 6. Architecture Decisions

| Decision | Rationale |
|---|---|
| Edge Function as proxy, not engine | Keeps pg_cron's "hit a URL" model while collapsing logic into one place |
| Service-role bearer auth on `/api/eligibility/recompute` | Endpoint must be unreachable from browsers; a bearer check is simpler and traceable than IP allowlisting |
| Group queue rows by user before POSTing | `runEligibilityForUser` recomputes all posts for the user; calling it per-(user, recruitment) is wasted work |
| Alerts emerge from engine verdict, not from approval event | "New match" is a claim — only the engine has the data to back it up |
| Keep `alert_events` audit row on approval | Still useful for ops/observability; not the same as user-visible alerts |
| Defensive top-up in `seedNotificationsForNewUser` | Idempotent via `(user_id, recruitment_id, alert_type)` unique index; costs a no-op query if everything already landed |
| Detail page kept minimal | Full detail UI (salary, vacancies breakdown, syllabus, tracker) is Phase 4; 3B just needs the link to resolve |

---

## 7. Runbook

| # | Action | Where |
|---|---|---|
| 1 | Apply migrations 004, 005, 006, 011 | Supabase SQL Editor |
| 2 | Set `APP_BASE_URL` secret on Edge Function | `supabase secrets set APP_BASE_URL=https://career-copilot.app` |
| 3 | Deploy eligibility-consumer | `supabase functions deploy eligibility-consumer` |
| 4 | Verify pg_cron schedule (5 min) | `select * from cron.job` |
| 5 | Smoke test | Approve a queue item → check `eligibility_recompute_queue` drains → check `notification_alerts` rows appear for eligible users only |
| 6 | Smoke test detail page | Click a notification → expect detail page (not 404) |
| 7 | Verify education level fix | Onboard a 12th-pass user → confirm 12th-only posts show as eligible in `/dashboard/recruitments/[id]` |

---

## 8. Known Follow-ups (Phase 3B+ / moved to Phase 3C or 4)

- `explanation.matched_exam` / `matched_sector` / `matched_type` wired from
  `preferences.target_exams` / `preferred_sectors`. Table exists; wiring is
  straightforward but out of scope here.
- Full recruitment detail page with salary, vacancies breakdown, apply
  tracker. Phase 4.
- Email / WhatsApp fan-out on top of the engine-emitted alerts. Phase 3C.
- `notification_preferences` migration so `getUserNotifPrefs` stops being
  a stub. Phase 3C prerequisite.
- Delete the orphan `app/onboarding/education/EducationStep.tsx` (the live
  file is `components/onboarding/EducationStep.tsx`). Pure cleanup, no
  behavioural impact.

---

## 9. Definition of Done

Phase 3B is complete when:

1. A single approved queue item triggers exactly one eligibility recompute
   per onboarded user, and the resulting `notification_alerts` rows are
   restricted to users the engine verifies as eligible or conditional. ✅
2. Clicking any `new_match` alert opens a working recruitment detail page
   showing the user's own verdict. ✅
3. The same rule engine (`lib/eligibility/engine.ts`) drives both the
   in-app Server Action path and the Edge Function consumer path. ✅
4. 12th/10th-pass users see 12th/10th-only posts as eligible. ✅
5. No code path inserts a `new_match` alert without a corresponding
   engine verdict. ✅

Phase 3C (email notifications) and Phase 4 (growth features) to follow.
