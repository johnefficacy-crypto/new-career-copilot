# Career Copilot — Technical Build Report & Commercial Roadmap
**Phase 2 Complete · April 14, 2026**

| Field | Value |
|---|---|
| Project | Career Copilot — Indian Govt Exam Prep Platform |
| Stack | Next.js 16 · Supabase · Claude AI · TypeScript · Deno Edge Functions |
| Sessions covered | Phase 1–2 + Phase 3 debugging |
| Report date | April 14, 2026 |
| Status | Scraper live · Billing live · Eligibility partial · Notifications blocked |

---

## 1. What Was Built — Complete Inventory

### 1.1 Infrastructure & Database

| Object | Type | Purpose |
|---|---|---|
| source_registry | Table (50 rows) | Master scraping source table — 14 categories, tiers 1–4, 6 adapter types |
| scrape_source_etags | Table | HTTP ETag + Last-Modified + SHA-256 hash cache |
| scrape_pdf_cache | Table | SHA-256 dedup for PDF notifications |
| eligibility_recompute_queue | Table | Queue populated when new recruitment opens |
| v_notification_feed | View | JOIN across notification_alerts + recruitments + organizations |
| v_admin_queue_review | View | Admin scrape queue with joined recruitment data |
| source_health_metrics | Table | Per-source HTTP/parse metrics |
| alert_events | Table | Broadcast events for fan-out system |
| notification_alerts | Table | Per-user notification records |
| tracked_recruitments | Table | User watchlist |
| fn_fanout_alert_event | RPC | Fan-out a single alert event to eligible users |
| fn_deadline_approaching_sweep | RPC | Daily sweep for deadline alerts |

### 1.2 Edge Functions (Deno — Supabase)

| Function | Version | Status |
|---|---|---|
| scheduled-scraper | v4 | Deployed — runs every 6h via pg_cron |
| deadline-sweep | v2 | Deployed — runs daily 8am IST |

---

## 2. Bugs Fixed — Root Cause Analysis

### 2.1 401 'Invalid Token' when triggering scraper
Both `Authorization: Bearer <service_role_key>` AND `apikey: <anon_key>` headers required.

### 2.2 Add New Source silently not saving
Duplicate `upsertSourceRegistry()` in notifications.ts diverged from authoritative version. Fixed by re-exporting from source-registry.ts.

### 2.3 React 'state update before mount' warning
`SourceRegistryManager.tsx` used `Promise.resolve().then()` — microtasks fire before React mount. Fixed: `useRef` + `useEffect`.

### 2.4 TypeScript GenericStringError in runner.ts
`.select()` with string concatenation loses literal type. Fixed: `.select('*')`.

### 2.5 PostgreSQL 42P16: cannot drop columns from view
`CREATE OR REPLACE VIEW` cannot remove columns. Fixed: `DROP VIEW IF EXISTS` before `CREATE VIEW`.

### 2.6 notification_preferences table missing
Stubbed `getUserNotifPrefs()` / `upsertUserNotifPrefs()` to no-op until migration is written.

### 2.7 fn_fanout_for_recruitment RPC does not exist
Actual function is `fn_fanout_alert_event(p_event_id)`. Fixed in fanOutNotificationAlerts().

---

## 3. Architecture Decisions

- **Single Source of Truth Pattern**: All enum values in `lib/constants/source-registry.ts`
- **lib/db/source-registry.ts as the only DB writer**: All source_registry INSERT/UPDATE/DELETE here
- **SourceRegistryEntry re-exported, never duplicated**
- **Edge Function time budget over hard source limit**: 42s budget replaces MAX_SOURCES=20
- **Exponential backoff preserves source availability**: 2^n × base interval, capped at 168h

---

## 4. Current State

### Working (as of Phase 3B — April 19, 2026)
- Scraper runs every 6h
- Admin can trigger scraper manually
- Admin CRUD for sources, queue review
- Eligibility engine — age, education, attempts, nationality, **domicile,
  PwBD / ex-serviceman relaxation caps, appearing-candidate conditional**
- Unified eligibility path — in-app Server Actions AND the Edge Function
  consumer both go through `lib/eligibility/engine.ts`
  (via `/api/eligibility/recompute`)
- Notification trust — `new_match` alerts emerge from the engine's own
  verdict, not from blind broadcast on approval
- Recruitment detail page at `/dashboard/recruitments/[id]`
- Billing (Razorpay subscriptions)
- AI Career Chat (Pro/Elite)
- Onboarding (5-step flow)

### Broken / Incomplete (remaining)
- Email notifications — not built ← **Phase 3C**
- WhatsApp notifications — not built ← **Phase 4**
- `notification_preferences` migration — `getUserNotifPrefs`/`upsertUserNotifPrefs`
  still stubs ← **Phase 3C prerequisite**
- `explanation.matched_exam` / `matched_sector` / `matched_type` flags —
  wiring from `preferences.target_exams` / `preferred_sectors` pending
- proxy.ts adds 15–48s latency in dev ← **Phase 3D**
- Full recruitment detail page (salary table, vacancies breakdown, syllabus,
  apply tracker) — current page is the minimal version ← **Phase 4**

---

## 5. Prioritised Roadmap

### Phase 3A: Close the scraper → user loop ✅ COMPLETE
See `docs/phase3a_report.md`

### Phase 3B: Complete the eligibility engine ✅ COMPLETE
See `docs/phase3b_report.md`

### Phase 3C: Email notifications
- Provider: Resend or AWS SES
- `supabase/functions/email-dispatcher/index.ts`
- Respect notification_preferences.email_enabled
- DPDP Act compliance

### Phase 3D: Production hardening
- Remove proxy.ts
- Add error boundaries
- Set up Sentry / LogSnag

### Phase 4: Growth features
- WhatsApp notifications
- Playwright adapter
- PDF OCR
- Recruitment detail page
- Apply tracker
- Android app / PWA

---

## 6. Technical Debt Register

| Item | Risk | Resolution |
|---|---|---|
| lib/scraping/runner.ts reads scrape_sources (legacy) | Low | Migrate in Phase 4 |
| notification_preferences table missing | Medium | Write migration |
| source_health_metrics has two FK columns | Low | Drop source_id after backfill |
| proxy.ts adds 15–48s dev latency | High in dev | Remove proxy.ts |
| Playwright adapter not implemented | Medium | Browserless.io |
| PDF OCR not implemented | Medium | Tesseract.js |
