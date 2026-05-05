# Career Copilot — Dashboard, Notification & Eligibility Trust Redesign
**PRD / Implementation Spec — v2**
_Created 2026-05-01 | Sprint 8 candidate_
_Verified against codebase (migrations 001–043, components, lib/eligibility/engine.ts)_

---

## Guiding Data Collection Principle

> **Collect only data that improves eligibility accuracy, decision-making, preparation, or application execution.**

Every field added to onboarding, every stat shown on the dashboard, and every registry table must earn its place against this test. The dashboard must answer four questions: _What am I eligible for? What is urgent? What is missing? What should I do next?_ Nothing else belongs on the main screen.

---

## Problem Statement

The Career Copilot dashboard shows aspirants **static, self-known profile data** instead of live opportunity and readiness signals. More critically, the eligibility engine classifies recruitments that require external exam credentials (GATE, CTET, NET) as matches even when the aspirant has never sat those exams — surfacing a "New exam match" notification that is demonstrably false. A secondary failure: CGPA-to-percentage conversion is done without authority-specific rules, creating false eligibility on marks-cutoff checks. Both erode the product's core trust contract. Government-job aspirants will not tolerate repeated incorrect eligibility claims; one false "confirmed match" permanently damages retention.

**Who is affected:** Every aspirant with a partially complete profile; specifically engineering graduates receiving GATE-gated PSU notifications (NPCIL ET 2026 confirmed live case), and aspirants from universities using CGPA/letter-grade systems.

**Cost of not solving:** Notification fatigue → opt-out → loss of the entire ranking and scraper pipeline's engagement loop.

---

## Goals

1. **Eliminate false-positive confirmed matches** — No recruitment may be labelled `confirmed_match` unless all mandatory criteria (including external exam credentials) are satisfied and the deadline is open.
2. **Raise dashboard actionability with low distraction** — Replace static profile-summary stats with a collapsible live command strip. Default collapsed state keeps cognitive load minimal.
3. **Build a trust-repair loop** — Aspirants report wrong matches and stale deadlines; reports enter a governed admin queue.
4. **Improve eligibility accuracy through education normalisation** — University/board name variants, CGPA conversion ambiguity, and stream-naming mismatch must not produce false eligibility verdicts.
5. **Group and de-duplicate notifications** — One grouped card per recruitment across its entire event lifecycle.
6. **Version eligibility rules** — When a corrigendum changes age, deadline, GATE year, or marks criteria, the platform recomputes matches and updates notifications.

---

## Non-Goals

- **Visual redesign / rebrand** — No colour palette, typography, or layout grid changes.
- **Making college/institution name a required field** — College name does not determine eligibility for government posts. It remains optional for form autofill support only.
- **Community forum** — Phase 8. Notification cards may link to community once Phase 8 ships.
- **WhatsApp notifications** — Phase 14.
- **Semantic search / embeddings** — Phase 13.
- **Full exam-family intelligence (PYQ, cutoffs, vacancy history)** — Phase 12.
- **Mobile screen-time tracking** — Requires privacy/consent documentation before build.
- **AI-generated eligibility override** — AI explains verdicts; determinism produces them.

---

## User Stories

### Aspirant — Opportunity Discovery

- As an aspirant, I want the dashboard stats bar to be collapsed by default so the screen is not overwhelming — but I can expand it to see details when I want them.
- As an aspirant, I want to see "Potential match — GATE details required" instead of "New exam match" for a GATE-gated recruitment I have not sat, so I do not waste time on an actionless notification.
- As an aspirant, I want a recruitment with a passed apply deadline to be clearly labelled "Closed" even if its database status still says "open", so I know what is still actionable.
- As an aspirant, I want a notification card to show exactly which profile field is missing, with a button routing me directly to that specific onboarding step.
- As an aspirant using a CGPA system, I want the platform to tell me when my CGPA cannot be reliably converted to percentage rather than silently applying a wrong formula.

### Aspirant — Education Onboarding

- As an aspirant, I want to enter my degree-awarding university or board (not my college name) as the required field, because that is what recruitments verify.
- As an aspirant with a B.E. in Mechanical Engineering, I want the platform to suggest "You may need a GATE credential for PSU ET posts — have you appeared?" so I know what to add to my profile.

### Aspirant — Trust Repair

- As an aspirant, I want to flag a notification as "wrong match", "deadline incorrect", or "official link broken", so I can help correct the system.
- As an aspirant, I want duplicate notifications for the same recruitment grouped into one card showing the event timeline.

### Admin — Governance

- As an admin, I want a moderation queue for aspirant-reported wrong matches and deadline disputes.
- As an admin, I want to publish a new eligibility rule version when a corrigendum changes criteria, triggering automatic recompute and notification updates.

---

## Requirements

### P0 — Must-Have (Trust & Correctness)

---

#### P0-1: Eligibility engine — Exam credential dimension

**Files:** `lib/eligibility/engine.ts`, migration `039_aspirant_exam_credentials.sql`

New tables:

```sql
create table public.recruitment_classification (
  recruitment_id uuid primary key references public.recruitments(id) on delete cascade,
  recruitment_type text not null check (recruitment_type in (
    'direct_recruitment','exam_based_recruitment','score_gated_recruitment',
    'certificate_gated_recruitment','experience_gated_recruitment',
    'departmental_recruitment','apprenticeship','physical_standard_recruitment',
    'contractual_recruitment','opportunity'
  )),
  requires_external_exam      boolean default false,
  requires_certificate        boolean default false,
  requires_experience         boolean default false,
  requires_physical_standard  boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table public.recruitment_required_exam_credentials (
  id              uuid primary key default gen_random_uuid(),
  recruitment_id  uuid not null references public.recruitments(id) on delete cascade,
  exam_name       text not null,
  valid_years     int[],
  accepted_paper_codes text[],
  min_score       numeric,
  is_mandatory    boolean default true
);

create table public.aspirant_exam_credentials (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  exam_name           text not null,
  exam_year           int not null,
  paper_code          text,
  discipline          text,
  score               numeric,
  marks               numeric,
  rank                int,
  percentile          numeric,
  valid_until         date,
  verification_status text default 'self_declared'
    check (verification_status in ('self_declared','document_uploaded','verified')),
  created_at          timestamptz default now()
);
```

Engine rule (after domicile check): if `requires_external_exam = true` and no matching aspirant credential exists → push `missing_exam_credential:{exam_name}` to fail_reasons; verdict = `needs_profile_data`.

**Acceptance criteria:**
- [ ] NPCIL ET 2026 (GATE ME mandatory) + aspirant with no GATE credential → verdict `needs_profile_data`
- [ ] Same recruitment + aspirant with GATE 2025 ME → verdict `eligible` (if all other checks pass)
- [ ] `requires_external_exam = false` → dimension skipped, no regression

---

#### P0-2: Verdict model — Add `needs_profile_data` and `expired` states

**Files:** `lib/eligibility/engine.ts`, `lib/db/mission-control.ts`, `components/dashboard/MissionControlPanel.tsx`

```ts
type EligibilityVerdict = 'eligible' | 'conditional' | 'needs_profile_data' | 'not_eligible' | 'expired'
```

- `needs_profile_data` — profile incomplete; verdict may change if data added.
- `expired` — `apply_end_date < today`; derived in query layer, not engine.

**Acceptance criteria:**
- [ ] MissionControlPanel "Needs info" tab shows `needs_profile_data` items separately from `conditional`
- [ ] `expired` items appear only in a "Closed / Track" section — never in Eligible, Urgent, or Conditional tabs

---

#### P0-3: Deadline status — Derive from `apply_end_date`

**Files:** `lib/db/mission-control.ts`, `components/dashboard/NotificationsFeed.tsx`

```ts
type DeadlineStatus = 'upcoming' | 'open' | 'closing_soon' | 'closes_today' | 'closed' | 'unknown'
```

Derivation rule:
```
apply_end_date null      → 'unknown'
apply_end_date < today   → 'closed'
apply_end_date = today   → 'closes_today'
days_to_deadline ≤ 7    → 'closing_soon'
otherwise                → 'open'
```

UI rule: never render "Open" when `deadline_status = closed`. When DB lifecycle status conflicts with date-derived status, show both (aids admin QA).

**Acceptance criteria:**
- [ ] NPCIL ET 2026 (apply_end 30 Apr 2026) renders "Closed" on 1 May 2026 regardless of `recruitments.status`
- [ ] Recruitment with no `apply_end_date` shows "Deadline unknown" — not "Open"

---

#### P0-4: LiveStatsBar — Collapsible by default, live metrics only

**Files:** `components/dashboard/StatsBar.tsx` → `components/dashboard/LiveStatsBar.tsx`, `app/api/dashboard/live-summary/route.ts` (new)

**Collapsed state (default — four metrics only):**

| Stat | Source |
|---|---|
| Eligible now | mission-control view, verdict = eligible |
| Potential matches | needs_profile_data count |
| Closing soon | deadline ≤ 7 days, not closed |
| Study today | tasks_done / tasks_total |

**Expanded state (user-triggered):**
- Eligible now → inline list of recruitment names
- Potential matches → list with primary missing field per recruitment + CTA
- Closing soon → list with days remaining
- Study today → focus minutes, mock score trend
- Profile readiness → expandable missing-field summary with exact route CTAs

**Persistence:**
- Collapsed/expanded preference stored in `user_preferences` (or `localStorage` as fallback)
- Mobile: always default collapsed, user must explicitly expand

**Removed entirely:** "Exams targeted", "Attempts used", "Education", "Sectors" — static self-known data that does not motivate action.

**API shape:**
```ts
type DashboardLiveSummary = {
  eligible_now:          number
  potential_matches:     number
  closing_soon:          number
  today_tasks_done:      number
  today_tasks_total:     number
  weekly_focus_minutes:  number
  latest_mock_score:     number | null
  profile_readiness_pct: number
}
```

**Acceptance criteria:**
- [ ] Dashboard loads with StatsBar collapsed by default
- [ ] Collapsed state shows exactly four stats
- [ ] Expand/collapse preference persists across page reloads
- [ ] On mobile, StatsBar always loads collapsed

---

#### P0-5: Notification verdict labels — Replace "New exam match"

**Files:** `components/dashboard/NotificationsFeed.tsx`, `app/dashboard/notifications/page.tsx`, `lib/db/notifications.ts`

| Condition | Label shown |
|---|---|
| verdict = eligible, deadline open | "Confirmed match" |
| verdict = needs_profile_data | "Potential match — [field] required" |
| verdict = not_eligible | "Not eligible" |
| deadline_status = closed | "Closed — track next cycle" |
| verdict = conditional | "Conditionally eligible" |

**Acceptance criteria:**
- [ ] String "New exam match" does not appear in any user-facing component output
- [ ] NPCIL ET card shows "Potential match — GATE details required" with "Add GATE details" CTA

---

#### P0-6: ProfileCard — Remove from main dashboard

**Files:** `components/dashboard/DashboardShell.tsx`

Remove `<ProfileCard />` from right sidebar. Profile accessible via nav dropdown and `/dashboard/profile`.

---

#### P0-7: Notification grouping — Group by `(user_id, recruitment_id)`

**Files:** `lib/db/notifications.ts`, `app/dashboard/notifications/page.tsx`, migration `040_notification_group_state.sql`

```sql
create table public.notification_group_state (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  recruitment_id          uuid not null references public.recruitments(id) on delete cascade,
  latest_event_at         timestamptz,
  unread_count            int default 0,
  current_match_status    text,
  current_deadline_status text,
  unique(user_id, recruitment_id)
);
```

**Acceptance criteria:**
- [ ] NPCIL ET appears exactly once regardless of how many `notification_alerts` rows exist
- [ ] Expanded card shows event timeline: "Discovered → Potential match → Deadline expired"
- [ ] Unread count badge clears on open

---

#### P0-8: Profile field → exact onboarding step routing (college name optional)

**Files:** `app/api/dashboard/profile-impact/route.ts`, `components/dashboard/ProfileImpactCard.tsx`

**Education onboarding label correction:**
- **Degree-awarding university / board / authority** → Required
- **College / institute name** → Optional (for form autofill; never blocks eligibility)

Exact field → route mapping:

| Missing field | Route |
|---|---|
| DOB, gender, category, domicile, PwBD | `/onboarding/identity` |
| Degree level, stream, university/board | `/onboarding/education` |
| GATE, NET, SET, CTET, TET score | `/onboarding/exam-credentials` _(new step)_ |
| Certificates (caste, EWS, domicile, PwBD) | `/onboarding/certifications` |
| Work experience | `/onboarding/experience` |
| Target exams, state preferences | `/onboarding/preferences` |

**Acceptance criteria:**
- [ ] "Add GATE score" routes to `/onboarding/exam-credentials`, not `/onboarding`
- [ ] College/institute name never appears in the missing-fields list
- [ ] University/board absent → triggers "Add university/board" CTA

---

### P1 — Should-Have (Decision Layer + Education Registry)

---

#### P1-1: Notification decision cards — Full details panel

**Files:** new `components/dashboard/NotificationDecisionCard.tsx`

Each grouped notification card renders: recruitment header, type badge, match status pill, profile match % (expand → matched/missing/failed criteria), deadline status, official URLs, primary action, secondary actions, feedback control.

---

#### P1-2: User feedback — Wrong match, deadline dispute, broken link

**Files:** migration `041_user_recruitment_feedback.sql`, `actions/feedback.ts`, `components/ReportFeedbackModal.tsx`, `app/admin/recruitment-feedback/page.tsx`

```sql
create table public.user_recruitment_feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id),
  recruitment_id  uuid not null references public.recruitments(id),
  feedback_type   text not null check (feedback_type in (
    'wrong_match','deadline_wrong','official_link_broken',
    'duplicate_notification','not_interested','already_applied','other'
  )),
  message         text,
  status          text default 'open' check (status in ('open','reviewing','resolved','rejected')),
  created_at      timestamptz default now(),
  resolved_at     timestamptz
);
```

Admin queue at `/admin/recruitment-feedback`. Resolution must call `logAdminAction('resolve_feedback', ...)`.

**Acceptance criteria:**
- [ ] Every notification card has a "Report issue" control
- [ ] Report submission shows confirmation
- [ ] Admin `/admin/recruitment-feedback` shows queue grouped by type
- [ ] Resolving calls `logAdminAction('resolve_feedback', ...)`

---

#### P1-3: Match percentage — Transparent criteria breakdown

**Files:** `lib/eligibility/engine.ts`, `lib/db/mission-control.ts`

```ts
type StructuredVerdict = {
  verdict:          EligibilityVerdict
  match_percent:    number
  matched_criteria: string[]
  missing_criteria: string[]
  failed_criteria:  string[]
  next_profile_action: { label: string; route: string; field_key: string } | null
}
```

UI: collapsible "Why shown to you" panel. Never shows "You are eligible" unless `verdict = 'eligible'`.

---

#### P1-4: Recruitment type badge

New `components/RecruitmentTypeBadge.tsx`. Labels: "Direct", "Exam-based", "GATE-score based", "Certificate required", "Experience required", "Physical standard", "Apprenticeship".

---

#### P1-5: Education Authority & Grading Registry

**Files:** migration `042_education_authority_registry.sql`

Normalises universities, boards, professional councils, open universities, ITI/NCVT/SCVT systems, and grading rules. Not a college/institution directory.

```sql
create table public.education_authorities (
  id                  uuid primary key default gen_random_uuid(),
  official_name       text not null,
  normalized_name     text not null,
  aliases             text[],
  authority_type      text not null check (authority_type in (
    'central_board','state_board','central_university','state_university',
    'deemed_university','open_university','technical_university',
    'medical_council','professional_council','iti_ncvt','iti_scvt','other'
  )),
  state               text,
  official_website    text,
  recognition_status  text default 'recognized'
    check (recognition_status in ('recognized','provisional','de_recognized','unknown')),
  last_verified_at    timestamptz,
  source_url          text
);

create table public.education_program_catalog (
  id                     uuid primary key default gen_random_uuid(),
  authority_id           uuid not null references public.education_authorities(id),
  degree_level           text not null,
  degree_name            text not null,
  normalized_degree_name text not null,
  stream                 text,
  branch                 text,
  professional_body      text,
  is_active              boolean default true
);

create table public.grading_conversion_rules (
  id                   uuid primary key default gen_random_uuid(),
  authority_id         uuid references public.education_authorities(id),
  grading_system       text not null check (grading_system in (
    'percentage','cgpa_10','cgpa_9','cgpa_7','gpa_4',
    'letter_grade','division','semester_gpa','aggregate_marks'
  )),
  scale                numeric,
  formula_expression   text,
  applicable_from_year int,
  applicable_to_year   int,
  source_url           text,
  verification_status  text default 'unverified'
    check (verification_status in ('verified','unverified','authority_published'))
);
```

---

#### P1-6: Grading variation support — Safe CGPA handling

**Files:** `lib/eligibility/engine.ts`, onboarding education step

The engine must not convert CGPA to percentage without a verified `grading_conversion_rules` row.

Extended education fields:
```ts
{
  grading_system:       string   // 'percentage' | 'cgpa_10' | 'cgpa_9' | 'gpa_4' | 'letter_grade' | 'division'
  cgpa_scale:           number | null
  converted_percentage: number | null   // only set when conversion_rule_id is set
  conversion_rule_id:   string | null
  conversion_status:    'not_applicable' | 'converted' | 'unknown_formula' | 'self_declared'
  active_backlogs:      number | null
  result_status:        'completed' | 'appearing' | 'withheld'
  authority_id:         string | null
}
```

**UI copy when conversion is unknown:**
> "Your CGPA is saved, but percentage conversion is not verified for this university/board. Some recruitments may require official percentage or marksheet evidence."

**Engine rule:** recruitment requires `min_percentage` + aspirant has `conversion_status = 'unknown_formula'` → push `marks_conversion_unverified` to `missing_criteria` (not `fail_reasons`); verdict = `needs_profile_data`, not `not_eligible`.

**Acceptance criteria:**
- [ ] Aspirant with CGPA 8.5 (10-point) + no verified formula → `needs_profile_data`, not `not_eligible`
- [ ] Aspirant with CGPA 8.5 + verified formula `cgpa * 9.5` → `converted_percentage = 80.75`
- [ ] Engine never applies a conversion without a `grading_conversion_rules` row

---

#### P1-7: Stream-wise pathway registry — Advisory only

**Files:** `lib/db/pathway-registry.ts`, migration `043_pathway_registry.sql`

```sql
create table public.education_pathway_registry (
  id                    uuid primary key default gen_random_uuid(),
  degree_level          text not null,
  stream_pattern        text not null,
  suggested_credentials text[],
  suggested_exams       text[],
  pathway_notes         text,
  is_active             boolean default true
);
```

Seed rows:

| Stream | Suggested credentials / pathways |
|---|---|
| Engineering — Mechanical | GATE ME, PSU ET, ESE, State AE/JE |
| Engineering — Civil | GATE CE, State AE/JE, PWD, Irrigation |
| B.Com / Finance | CA/CMA/CS, Banking, NISM |
| Law | Bar Council registration, Judiciary, Legal officer |
| B.Ed / D.Ed | CTET, State TET |
| MBBS | NMC / state medical council registration |
| Nursing | State nursing council registration |
| Pharmacy | PCI registration |
| ITI (any trade) | NCVT/SCVT trade certificate, Apprenticeship |

**This registry is advisory only.** It drives profile prompts ("You are B.E. Mechanical — many PSU ET posts require GATE. Have you appeared?") but does not produce eligibility verdicts. Final eligibility remains deterministic from recruitment/post-specific rules.

**Acceptance criteria:**
- [ ] Aspirant with B.E. Mechanical sees onboarding prompt suggesting GATE — skippable, does not block
- [ ] Pathway registry result is never returned as an eligibility verdict

---

#### P1-8: Fix `matched_exam` / `matched_sector` explanation flags

**Files:** `lib/db/notifications.ts`

Currently hardcoded `false` (TODO P1 in code). Wire to `preferences.target_exams` and `preferences.preferred_sectors`.

---

#### P1-9: Fix `profileBlockers` summary card

**Files:** `lib/db/mission-control.ts` line 83

Bug: `profileBlockers` mirrors `conditional` count. Fix: count `needs_profile_data` items where at least one missing field is user-resolvable.

---

### P2 — Could-Have (Rule Versioning + Study Accountability)

---

#### P2-1: Eligibility rule versioning pipeline

**Files:** migration `044_eligibility_rule_versions.sql`

```sql
create table public.eligibility_rule_versions (
  id                  uuid primary key default gen_random_uuid(),
  recruitment_id      uuid not null references public.recruitments(id),
  post_id             uuid references public.posts(id),
  rule_version        int not null default 1,
  source_document_id  uuid,
  status              text default 'draft'
    check (status in ('draft','under_review','published','superseded')),
  effective_from      timestamptz,
  effective_to        timestamptz,
  verified_by         uuid references public.profiles(id),
  verified_at         timestamptz,
  created_at          timestamptz default now()
);

create table public.extracted_rule_evidence (
  id               uuid primary key default gen_random_uuid(),
  recruitment_id   uuid not null references public.recruitments(id),
  post_id          uuid references public.posts(id),
  rule_version_id  uuid references public.eligibility_rule_versions(id),
  field_name       text not null,
  extracted_value  text not null,
  source_url       text,
  page_number      int,
  text_snippet     text,
  confidence_score numeric check (confidence_score between 0 and 1),
  reviewer_status  text default 'pending'
    check (reviewer_status in ('pending','accepted','rejected')),
  created_at       timestamptz default now()
);
```

**Pipeline:**
```
official notification / corrigendum
  → scraper / AI-assisted extraction → extracted_rule_evidence (pending)
  → admin review at /admin/rule-evidence
  → accepted evidence → new eligibility_rule_version (published)
  → eligibility recompute triggered for affected users
  → notification_group_state updated → users notified
```

AI may assist extraction; admin must verify before a rule version is published. This satisfies the governance principle: AI proposes, humans decide.

---

#### P2-2: Weekly focus / mock-test stats in LiveStatsBar

`weekly_focus_minutes` and `latest_mock_score` already included in `DashboardLiveSummary` shape (P0-4). May return `null` until Study OS data is validated as reliable.

---

#### P2-3: Accountability partner placeholder

Renders "Accountability: Not set up →" in expanded StatsBar. Functional in Phase 9.

---

#### P2-4: Community widget placeholder

"Join exam discussion →" CTA per top eligible exam. Routes to Phase 8 community when live.

---

## Data Model Summary

| Table | Migration | Status |
|---|---|---|
| `recruitment_classification` | 039 | New |
| `recruitment_required_exam_credentials` | 039 | New |
| `aspirant_exam_credentials` | 039 | New |
| `notification_group_state` | 040 | New |
| `user_recruitment_feedback` | 041 | New |
| `education_authorities` | 042 | New |
| `education_program_catalog` | 042 | New |
| `grading_conversion_rules` | 042 | New |
| `education_pathway_registry` | 043 | New |
| `eligibility_rule_versions` | 044 | New (P2) |
| `extracted_rule_evidence` | 044 | New (P2) |
| `user_recruitment_state` (view) | 028 | Exists — add deadline_status, match_status |
| `v_notification_feed` (view) | 003 | Exists — add match_status, grouped shape |

---

## Implementation Phases

### Phase A — Schema & Engine (Week 1)

1. Migration 039: `recruitment_classification`, `recruitment_required_exam_credentials`, `aspirant_exam_credentials`
2. Migration 040: `notification_group_state`
3. Migration 041: `user_recruitment_feedback`
4. Migration 042: `education_authorities`, `education_program_catalog`, `grading_conversion_rules`
5. Migration 043: `education_pathway_registry` + seed rows for 9 stream patterns
6. Extend `lib/eligibility/engine.ts` — exam credential dimension (P0-1)
7. Add `needs_profile_data` / `expired` verdicts (P0-2)
8. Add safe CGPA handling — no conversion without verified rule (P1-6)
9. Add `deadline_status` derivation (P0-3)
10. Smoke test: NPCIL ET 2026 + aspirant with no GATE → `needs_profile_data`

### Phase B — API Layer (Week 1–2)

11. `app/api/dashboard/live-summary/route.ts` — new (P0-4)
12. Update `lib/db/mission-control.ts` — `deadline_status`, `match_status`, `recruitment_type`, `StructuredVerdict`
13. Update `app/api/dashboard/profile-impact/route.ts` — exact `fillHref` per field; university/board required, college optional (P0-8)
14. Update `lib/db/notifications.ts` — grouping query via `notification_group_state` (P0-7)
15. Wire `matched_exam` / `matched_sector` flags (P1-8)
16. `lib/db/pathway-registry.ts` — query pathway hints by `degree_level` + `stream` (P1-7)

### Phase C — UI (Week 2)

17. `components/dashboard/LiveStatsBar.tsx` — collapsible, four collapsed stats, expanded detail (P0-4)
18. Remove `ProfileCard` from `DashboardShell` (P0-6)
19. Replace notification status labels — purge "New exam match" (P0-5)
20. `components/dashboard/NotificationDecisionCard.tsx` — full decision card (P1-1)
21. `components/RecruitmentTypeBadge.tsx` (P1-4)
22. `components/ReportFeedbackModal.tsx` + `actions/feedback.ts` (P1-2)
23. Onboarding education step — university/board required, college optional, grading system selector, pathway hint prompt (P1-6 + P1-7)
24. New `/onboarding/exam-credentials` step (P0-8)

### Phase D — Admin & Cleanup (Week 3)

25. `/admin/recruitment-feedback` queue (P1-2)
26. Admin seeding UI for `recruitment_classification` (add type to queue-review workflow)
27. Fix `profileBlockers` bug (P1-9)
28. Transparent `match_percent` + `StructuredVerdict` UI (P1-3)
29. (P2) Migration 044: `eligibility_rule_versions`, `extracted_rule_evidence`
30. (P2) `/admin/rule-evidence` review queue

---

## Acceptance Criteria Summary

### Dashboard is shippable when:
- [ ] StatsBar loads collapsed by default, showing exactly four stats
- [ ] Mobile StatsBar always loads collapsed
- [ ] Collapsed/expanded preference persists across page reloads
- [ ] StatsBar no longer shows Education, Attempts used, Exams targeted, Sectors
- [ ] ProfileCard not rendered in main dashboard
- [ ] No notification shows "New exam match"
- [ ] NPCIL ET 2026 shows "Potential match — GATE details required"
- [ ] Expired recruitment shows "Closed" not "Open"
- [ ] "Add GATE score" routes to `/onboarding/exam-credentials`, not `/onboarding`

### Education onboarding is shippable when:
- [ ] University/board field labelled "University / Board that awarded your degree" — required
- [ ] College/institute name field labelled "College / Institute name (optional)" — never a blocker
- [ ] CGPA field includes grading system selector and scale
- [ ] Unknown conversion → UI shows: "Percentage conversion not verified for this board"
- [ ] Pathway hint shown and skippable (e.g., "B.E. Mechanical → Many PSU posts require GATE")

### Eligibility engine is shippable when:
- [ ] System never emits `confirmed_match` when mandatory exam credential is absent
- [ ] System never emits `confirmed_match` when deadline is expired
- [ ] CGPA never converted to percentage without a verified `grading_conversion_rules` row
- [ ] `marks_conversion_unverified` pushes to `missing_criteria`, not `fail_reasons`

---

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| Should `education_authorities` be seeded from a government source (UGC, AICTE, NMC) or curated manually? | Admin ops / Engineering | Yes — P1-5 |
| Should `/onboarding/exam-credentials` be a new route or a `?step=exam-credentials` param in the existing onboarding flow? | Engineering + Design | Yes — P0-8 |
| Who populates `recruitment_classification`? Admin during queue review, or scraper inference? | Engineering + Admin ops | Yes — P0-1 |
| Is `match_percent` shown to free users, or only Pro/Elite? | Product | No |
| Is the UGC formula (CGPA × 9.5) acceptable as a default for unverified universities with a disclaimer? | Product + Legal | No |
| Does resolving a `user_recruitment_feedback` item trigger a re-scrape or just flag for human review? | Engineering | No |
| Can we seed `recruitment_classification` for 10–15 active recruitments via a direct migration before the admin UI is built? | Admin ops | No — workaround available |

---

## Success Metrics

**Leading (1–2 weeks post-ship):**
- Notification open-to-action rate: ≥ 35% (up from ~15%)
- "Report issue" valid submissions per week: < 50
- Profile field add rate from dashboard CTAs: ≥ 20% of sessions seeing a missing-field prompt
- StatsBar expand rate: > 40% of active sessions

**Lagging (4–6 weeks post-ship):**
- Notification opt-out rate: < 5%
- False-positive wrong-match reports confirmed valid: < 10% of all notifications sent
- Dashboard session-to-apply-tracker-entry rate: ≥ 8%
- University/board field completion rate in education onboarding: ≥ 85%

---

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build

# Domain regression
grep -R "public.exams\|from(\"exams\"\|from('exams'" app actions lib supabase --exclude-dir=node_modules || true
grep -R "is_admin\|profile?.is_admin" app actions lib components --exclude-dir=node_modules || true

# Trust regression
grep -R "New exam match" components app --exclude-dir=node_modules || true

# Grading regression — ensure no raw CGPA multiplication without a rule lookup
grep -R "cgpa \*\|cgpa\*" lib app --exclude-dir=node_modules || true
```

---

## Cross-links

Once implemented, link this document from:
- `docs/00-ai-context.md` under "Key file paths" and "Strategic rule"
- `docs/product/roadmap.md` under Phase 5/7 refinements and Phase 8 prep
- `docs/operations/implementation-checklist.md` as a P0/P1 trust-hardening section
- `docs/engineering/ai-strategy.md` under deterministic eligibility and AI explanation guardrails
- `docs/engineering/domain-model.md` under education and eligibility data model
