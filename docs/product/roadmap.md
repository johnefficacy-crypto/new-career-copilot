# Career Copilot — Product Roadmap

_Last updated: 2026-04-30 — Phases 0–7 complete, Phase 8 next_

This is the canonical phased roadmap. Each phase has a clear goal, scope, and definition of done. Historical sprint details are in [history/](../history/).

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Complete |
| 🔄 | In progress / partial |
| ⏳ | Planned — next up |
| 📋 | Planned — later |

---

## Phase 0 — Infrastructure Stabilization ✅

**Goal:** Reliable development environment and clean Next.js setup.

- Fixed `next/server` typing, regenerated `next-env.d.ts`
- Aligned `eslint-config-next` with Next.js version
- Standardized auth routes (`/auth/login`, `/auth/signup`)
- Cleared Turbopack file-watch pressure

---

## Phase 1 — Scraper → User Loop ✅

**Goal:** Approved scrape items reach users as notifications.

- `approveScrapeItem()` promotes to recruitments, creates alert events, triggers fanout
- `v_notification_feed` view created and granted
- `fn_fanout_alert_event` RPC wired correctly
- Eligibility consumer Edge Function deployed
- Dashboard and notifications pages read real data

---

## Phase 2 — Eligibility Engine ✅

**Goal:** Deterministic eligibility covering all rule dimensions.

- Age, category, education, domicile, PwBD, ex-serviceman, attempts, appearing-candidate
- Unified engine path: Server Actions and Edge Function consumer both call `lib/eligibility/engine.ts`
- `new_match` alerts emerge from engine verdicts only (no blind broadcast)
- Atomic eligibility queue claim RPC with retry metadata
- Transactional recruitment promotion RPC

---

## Phase 3 — Email Notifications ✅

- Resend-based email dispatcher (`supabase/functions/email-dispatcher`)
- `notification_preferences` table with per-user opt-in/out controls
- DPDP Act compliance: email and WhatsApp default `false`
- Notification preferences UI at `/dashboard/notifications/preferences`

---

## Phase 4 — Admin Governance Hardening ✅

**Goal:** Operational control plane before automation expansion.

- Full RBAC enforcement across all admin routes and server actions
- `requireAdminRole(permission)` replaces all `is_admin` checks
- Admin audit viewer at `/admin/audit` (filterable, paginated, JSON inspector)
- Eligibility queue monitor at `/admin/eligibility-queue` (status tabs, retry controls)
- RBAC manager at `/admin/rbac` (super_admin role management)
- Source registry, scrape dashboard, queue review
- Notification governance console with emergency kill switch and template editor
- Recruitment publish workflow: `draft → needs_review → verified → published`
- Organization trust fields and `adminVerifyOrganization` action
- AI action policy table and governance UI at `/admin/ai-policy`
- Admin settings key-value store

---

## Phase 5 — Dashboard and User-Facing Surface ✅

**Goal:** Dashboard as aspirant mission control, not a generic shell.

- Mission-control dashboard powered by `user_recruitment_state` materialized view
- Exam summary cards with eligibility badges at `/dashboard/exams`
- Recruitment detail page with 5-stage timeline, status panel, apply CTA
- Profile impact card showing missing fields and estimated unlock impact
- Apply tracker: durable `user_recruitment_applications` table, status lifecycle
- Tracker UI at `/dashboard/tracker` with inline status selector
- Telemetry pipeline: `user_events`, `form_submissions`, `/api/events` ingestion endpoint

---

## Phase 6 — Study OS ✅

**Goal:** Structured daily preparation execution and performance tracking.

- Focus timer with session start/stop and logging
- Mock-test tracking with subject breakdowns and score trends
- Weekly review dashboard (study time, task completion, subject breakdown, mock summary)
- Study plan foundation with daily tasks

---

## Phase 7 — Intelligence and Ranking ✅

**Goal:** Smarter prioritization and automation foundation.

- Ranking v1: `v_recruitment_ranking` view (eligibility × urgency × org trust × behavior signals)
- `getRankedRecruitments` and `getTopMatchScore` helpers
- Notification template editor with variable placeholder chips
- Notification templates seeded to database
- CI gate: lint + typecheck + tests + DB lint

---

## Phase 8 — Community Foundation ⏳

**Goal:** Exam-specific community spaces that drive retention and trust.

**Scope:**
- Forum spaces per exam (one space per canonical recruitment family)
- Channel types: `official_updates` (admin-write only), `form_help`, `preparation`, `pyq_discussion`
- Thread creation, replies, upvotes
- Verified-topper badge on user accounts (admin-granted)
- Report/hide flow for moderation
- In-app notification on thread reply
- Admin moderation queue at `/admin/community`
- Free users: read access + limited post quota (5/day)
- Pro/Elite users: unlimited posting

**Data model sketch:**
```
community_spaces         — one per exam family
community_channels       — typed channels within a space
community_threads        — posts/questions
community_replies        — replies to threads
community_votes          — upvotes
community_reports        — moderation queue
```

**Key constraint:** `official_updates` channels must be admin-write only. User discussion must never appear in the same feed as official notifications. This protects the trust model.

See [product/community-platform.md](community-platform.md) for full design.

---

## Phase 9 — Study Coordination Layer ⏳

**Goal:** Social accountability structures that anchor aspirants to the platform for months.

**Scope:**
- Study groups (create, join, capacity 2–8)
- Accountability partner matching (same exam, similar level, similar schedule)
- Accountability contracts: weekly commitment + daily check-in + streak tracking
- Study room scheduling with external video link (Zoom/Meet user provides)
- Shared session agenda and post-session hour logging
- Private resource sharing within a group
- Group-level progress comparison

**Key constraint:** Do not build video conferencing. Users bring their own Zoom/Meet link. The platform provides the coordination, scheduling, and post-session logging layer.

---

## Phase 10 — Mentor Session Marketplace ⏳

**Goal:** Live, small-cohort access to verified toppers and senior government officers.

**Scope:**
- Mentor application with admin verification workflow
- Verification evidence: UPSC/SSC rank/roll number from official result PDFs
- `Career Copilot Verified` badge on approved mentor profiles
- Session creation: topic, date/time, capacity cap (max 50), price per aspirant
- Razorpay booking per seat (existing integration)
- Embedded video session via Daily.co or self-hosted Jitsi
- Post-session ratings and reviews
- Mentor earnings dashboard
- Payout flow (T+2 bank transfer)
- Admin moderation: verify mentor, approve session, review reports

**Pricing model:** ₹99–₹299 per aspirant × up to 50 aspirants. Platform takes 30%. Mentor receives 70%.

**Key risk:** Government employees have conduct rules around private honoraria. Verify legal framing as "educational content honorarium" before launch. This is the riskiest assumption in the feature.

See [product/community-platform.md](community-platform.md) for full design.

---

## Phase 11 — Resource Library and Public Community ⏳

**Goal:** Free resources drive acquisition; public community creates SEO moat.

**Scope:**
- Public resource library (free PDFs, strategy guides, PYQ papers) browsable without login
- Resource types: `pyq_paper`, `notes`, `strategy`, `video_link`, `course_link`
- Visibility levels: `public`, `group`, `private`
- Community-contributed and verified resources
- Admin DMCA/copyright moderation tooling
- Public read-only forum preview for logged-out users
- SEO-optimized thread pages per exam
- "Join to participate" conversion gate from public threads

---

## Phase 12 — Exam Intelligence Hub 📋

**Goal:** Every exam becomes a complete decision page, replacing the fragmented research an aspirant currently does across 10 sites.

**Scope:**
- `exam_families` table (UPSC CSE, SSC CGL, IBPS PO, etc.) separate from recruitment cycles
- `exam_cycles` — per-year notification, apply window, exam date, result date
- `exam_pyq_papers` — official PYQ links per year/stage
- `exam_pyq_analysis` — subject/topic/question count/difficulty/weight
- `exam_cutoffs` — category-wise cutoff by year and stage
- `exam_vacancy_history` — post-wise vacancy by year and category
- `exam_competition_metrics` — applicants/appeared/qualified/vacancies/ratio
- Exam detail page at `/dashboard/exams/[examSlug]` with visual analytics
- PYQ trend line, cutoff trend chart, vacancy bar chart, difficulty heatmap
- Pilot exam: SSC CGL or SBI Clerk (choose one, do it thoroughly)

**Start with one pilot.** Don't build the schema for 50 exams and fill none of them.

---

## Phase 13 — AI Intelligence Expansion 📋

**Goal:** AI-powered personalization that goes beyond study plan generation.

**Scope:**
- Eligibility explanation with provenance (deterministic result → human-readable "why")
- Semantic search across recruitments using pgvector (migration 030 already scaffolded)
- ETL sync job for embeddings
- AI exam-fit ranking incorporating behavioral signals, study hours, mock performance
- Aspirant career path advisor (beyond single-exam focus)
- AI moderation assist for community (flag/classify, human reviews)

**Key constraint:** AI proposes, humans decide. All AI actions must pass `ai_action_policies` before going live.

---

## Phase 14 — Growth and Monetization Optimization 📋

**Goal:** Complete the commercial flywheel.

**Scope:**
- WhatsApp notification integration (Business API or Gupshup/WATI)
- Android app / PWA with push notifications
- Public landing page redesign with demo eligibility checker
- Referral program
- Affiliate/partnership with coaching institutes for marketplace listing fees
- Downloadable reports (Pro/Elite)
- Batch / cohort mentor program (recurring monthly sessions)

---

## Success metrics

### User

| Metric | Target |
|---|---|
| Profile completion rate | >70% of signed-up users |
| Free-to-paid conversion | >8% within 30 days of signup |
| Eligibility demo → signup | >25% |
| Forum posts per active user/week | >2 (Phase 8+) |
| Study group membership rate | >30% of paid users (Phase 9+) |
| Mentor session attendance rate | >80% of booked seats |

### Admin/operations

| Metric | Target |
|---|---|
| Sources active and healthy | >90% of registry |
| Scraper success rate | >95% of runs |
| Queue items pending >24h | 0 |
| Recruitments with official URL | >99% |
| Eligibility recompute duration | <5 min per wave |

### Product quality

| Metric | Target |
|---|---|
| Recruitments with complete post criteria | >80% |
| Exams with PYQ analytics (Phase 12+) | Pilot: 100% coverage of chosen exam |
| Notifications personalized | >95% |
| Time to dashboard load (p95) | <2s |
