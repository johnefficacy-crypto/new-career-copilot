# Career Copilot — Phase 3A Implementation Report
**April 2026 · Scraper → User Loop Closed**

---

## 1. Objective
Close the scraper → user visibility loop end-to-end. Approved `scrape_queue` items were not
reaching users — the promotion, alert, fanout, and dashboard layers existed but were disconnected.
Phase 3A wires them together with the minimum surgical changes.

---

## 2. End-to-End Flow

```
scrape_queue → approveScrapeItem() → promoteToRecruitments() → recruitments
→ alert_events → fn_fanout_alert_event() → notification_alerts
→ v_notification_feed → /dashboard + /dashboard/notifications
```

---

## 3. Gap Analysis — Before vs After

| Gap | Before Phase 3A | After Phase 3A |
|---|---|---|
| approveScrapeItem() | Sets status='approved' only | ✅ Promotes → alert → fanout |
| v_notification_feed | View never created — throws on load | ✅ Created, GRANT applied |
| getUserNotifications() | Commented out / stubbed | ✅ Live, queries real view |
| promoteToRecruitments() | Existed in runner.ts, never called | ✅ Called on every approval |
| alert_event creation | Not triggered from approval | ✅ Inserted after promotion |
| fn_fanout_alert_event | Wrong RPC name called | ✅ Correct RPC called |
| eligibility_recompute_queue | Populated, nothing consuming | ✅ Edge Function consumer deployed |
| dashboard/page.tsx | Called getEligibleRecruitments() — no data | ✅ Works once recruitments exist |
| Import type mismatch | types/notifications vs types/scraping | ✅ Fixed |

---

## 4. Changes Made

| File | Change Type | What Changed |
|---|---|---|
| lib/db/notifications.ts | PATCH | approveScrapeItem() — promotion + alert_event + fanout |
| lib/db/notifications.ts | PATCH | Import type fixed: types/scraping for ExtractedRecruitment |
| supabase/migrations/003_v_notification_feed.sql | NEW | DROP + CREATE v_notification_feed + GRANT |
| supabase/functions/eligibility-consumer/index.ts | NEW | Deno Edge Function — batch drains eligibility_recompute_queue |
| app/dashboard/page.tsx | UNCHANGED | Already correct |
| lib/scraping/runner.ts | UNCHANGED | promoteToRecruitments() already correct |

---

## 5. Root Cause Notes

**5.1 approveScrapeItem()** — only SET status='approved'. Never called promoteToRecruitments().
Fix: load row → idempotency check → promoteToRecruitments() → update queue → insert alert_event → call fn_fanout_alert_event().

**5.2 v_notification_feed** — migration SQL written but never applied. Fixed: apply 003_v_notification_feed.sql.

**5.3 Type mismatch** — Two ExtractedRecruitment types exist. Fixed: import from types/scraping.

**5.4 Idempotency** — duplicate_of UUID column reused as promoted_recruitment_id tracker.

---

## 6. Architecture Decisions

| Decision | Rationale |
|---|---|
| Reuse duplicate_of column | No migration needed — existing FK already points to recruitments |
| alert/fanout non-fatal after promotion | Recruitment is canonical truth; fanout failure doesn't roll back |
| `as unknown as ExtractedRecruitment` cast | Json and ExtractedRecruitment share runtime shape |
| DROP TRIGGER trg_promote_approved_scrape recommended | Trigger conflicts with idempotency use |

---

## 7. Runbook

| # | Action | Command / Location |
|---|---|---|
| 1 | Apply v_notification_feed migration | Supabase SQL Editor → paste 003_v_notification_feed.sql |
| 2 | Patch approveScrapeItem() | lib/db/notifications.ts |
| 3 | Deploy eligibility-consumer | `supabase functions deploy eligibility-consumer` |
| 4 | Add cron job (5 min) | Supabase Dashboard → Database → Cron Jobs |
| 5 | Drop old trigger (recommended) | `DROP TRIGGER IF EXISTS trg_promote_approved_scrape ON public.scrape_queue;` |
| 6 | Verify loop end-to-end | Insert test row → approve → check recruitments + alert_events |

---

## 8. Definition of Done

Phase 3A complete when one approved scrape_queue item produces:
1. A row in recruitments
2. A row in alert_events with fanout_status='completed'
3. Rows in notification_alerts for every eligible user
4. Recruitment visible in /dashboard
5. Notification visible in /dashboard/notifications
6. Repeat approval produces no duplicate

**Phase 3B (eligibility engine completion) and Phase 3C (email notifications) to follow.**
