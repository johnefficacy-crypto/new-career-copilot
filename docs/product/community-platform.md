# Career Copilot — Community Platform Strategy

_Last updated: 2026-04-30 — Design phase, implementation in Phase 8–10_

## Why community is core, not a feature

Aspirants preparing for government exams face a months-long, often years-long journey. Eligibility intelligence and study tools get them started. Community keeps them going.

Aspirants who join a study group or accountability pair churn significantly less than solo users. Community is the retention mechanism that makes the subscription sticky across preparation cycles.

The community platform must be:

1. **Exam-specific** — generic chat rooms do not serve aspirants. A thread about SSC CGL cutoffs should not be mixed with UPSC discussions.
2. **Trust-preserving** — official updates must be separated from user discussion. Misinformation in the "official updates" channel destroys the platform's credibility.
3. **Moderated-first** — unmoderated aspirant communities devolve into misinformation, spam, and anxiety amplification. Build moderation tooling before the community scales.

---

## Community surface map

### Forum spaces (Phase 8)

Each canonical exam family gets its own community space.

```
Community Space: SSC CGL
├── #official-updates     ← admin-write only; links to official notifications
├── #form-help            ← questions about application process, fee, documents
├── #preparation          ← strategy, resources, books, coaching opinions
├── #pyq-discussion       ← question-level discussion, answer verification
└── #cutoffs-results      ← cutoff sharing, result reactions, rank discussion

Community Space: IBPS PO
└── [same channel structure]

Community Space: UPSC CSE
└── [same channel structure — more active, more channels]

General Space
├── #motivation           ← wins, streaks, milestones, setbacks
├── #study-groups         ← find partners and groups
└── #resources            ← free resource links (admin-curated and community)
```

### Thread model

Reddit-style threaded discussions with upvotes. Not a chronological chat feed.

- Threads have title + body (markdown supported)
- Replies are flat (one level deep — not nested trees)
- Upvotes visible on threads and replies
- Pinned posts per channel (admin or verified users)
- `Verified Topper` badge on user accounts (admin-granted, based on rank/roll verification)
- `Verified Officer` badge for serving government employees
- Thread flairs per channel (e.g., "Question", "Strategy", "Resource", "Discussion")

### What channels are admin-write only

`official_updates` channels are admin-write only without exception. This is a governance rule, not a preference. Users cannot post into official update channels under any circumstance.

User discussion must never appear in the same stream as official notifications.

---

## Study groups (Phase 9)

### Group model

```
Study Group
├── Name (e.g., "SSC CGL 2026 — Morning Batch")
├── Target exam (canonical exam family)
├── Max capacity: 2–8 members
├── Visibility: open (anyone can join) | invite-only
├── Status: active | paused | completed
└── Members: list with join date
```

### What groups can do

- Shared weekly goals (set by group)
- Daily check-in thread (automated: "What did you study today?")
- Shared resource library (group-visible PDFs, links, notes)
- Study room scheduling (user provides Zoom/Meet link; platform provides coordination)
- Post-session logging (hours studied, topics covered)

### Study rooms (no-build video approach)

Do not build or embed video conferencing. The coordination value comes from scheduling, reminders, and post-session tracking — not from owning the video call.

```
Study Room Session
├── Title (e.g., "Quant revision — Percentage and Ratio")
├── Date and time
├── Duration estimate
├── Meeting link (user provides — Zoom, Meet, Jitsi)
├── Agenda (what we plan to cover)
├── Max participants
├── Status: scheduled | live | completed | cancelled
└── Post-session: actual hours logged, topics covered, notes
```

Group members get in-app and email reminders before a session. Hours logged feed the study OS analytics.

---

## Accountability partners (Phase 9)

### Partner model

An accountability partner relationship is a structured, bilateral commitment between two users.

```
Accountability Partnership
├── Partner A ↔ Partner B
├── Target exam (must match or overlap)
├── Weekly commitment: "I will study X hours and complete Y tasks"
├── Daily check-in: ✅ Did you study today?
├── Weekly review: shared progress comparison
├── Partnership duration: rolling (until either party exits)
└── Streak: consecutive days both partners checked in
```

### Matching algorithm (minimum viable)

Match accountability partners by:

1. Same target exam (hard requirement)
2. Similar experience level (based on mock test scores if available, else onboarding self-assessment)
3. Similar daily availability window (morning / afternoon / evening)
4. Similar geography (optional — for possible local study groups later)

A mismatch on exam or availability kills the partnership within two weeks. Prioritize exam match above all else.

### Partner finding

- Auto-match: system suggests 3 compatible partners
- Browse: user browses opt-in partner pool filtered by exam and availability
- Invite: user invites a specific person from the forum

---

## Mentor session marketplace (Phase 10)

### The model

Live, small-cohort (max 50 aspirants) paid video sessions with verified toppers or senior government officers.

A session costs ₹99–₹299 per aspirant. The platform takes 30%. The mentor receives 70%, paid T+2 after the session.

### Why this works

- Aspirants pay ₹99–₹299 for one hour with someone who has been through the exact exam they are preparing for. At that price point, it is an impulse-buy decision.
- Mentors (verified toppers, officers) earn ₹3,500–₹10,000+ per session for an hour of their time. This is a credible incentive.
- The platform earns ₹1,000–₹3,000+ per session with no content production cost.

### Mentor onboarding

1. Mentor applies via `/mentor/apply`
2. Provides: name, exam qualified, year, rank/roll number, brief bio, session topics offered
3. Admin verifies: cross-checks rank/roll with official UPSC/SSC result PDFs
4. Admin approves → mentor receives `Career Copilot Verified` badge
5. Mentor creates first session listing

**Verification is non-negotiable.** One unverified mentor claiming false credentials destroys the trust model. Build the admin verification workflow before enabling mentor listing.

### Session creation (mentor flow)

```
Session
├── Title (e.g., "How I cracked UPSC CSE with a full-time job")
├── Topic tags (exam, subject, stage: Prelims/Mains/Interview)
├── Description (what aspirants will learn/discuss)
├── Date and time (IST)
├── Duration: 60 or 90 minutes
├── Max capacity: up to 50 aspirants
├── Price per aspirant: ₹99–₹299 (mentor sets within range)
├── Video platform: embedded Daily.co room or Jitsi instance
└── Status: draft | listed | booking_open | live | completed | cancelled
```

### Aspirant booking flow

1. Aspirant browses `/mentor/sessions` (filtered by exam, topic, date)
2. Selects session → sees mentor profile + verification badge + past ratings
3. Pays via Razorpay
4. Receives confirmation email with calendar invite and session link
5. Reminder: 24h before, 1h before (in-app + email)
6. Joins session at scheduled time via embedded video
7. Rates mentor (1-5 stars + text) after session

### Video technology choice

Use **Daily.co** (managed WebRTC — free up to 10,000 participant-minutes/month, then usage-based) or self-hosted **Jitsi Meet** (zero cost, requires server).

Do not embed Zoom. Zoom requires per-host licensing, controls the UX, and creates a dependency.

Daily.co is recommended for launch: faster to integrate, reliable, and the free tier covers early sessions comfortably.

### Legal risk note

Government employees (IAS, IPS, RBI/SEBI Grade A officers in service) are subject to conduct rules that may restrict private paid engagements. Research required before launch:

- Frame as "educational content honorarium" not "commercial service"
- Consult legal on whether serving officers can participate
- May need to restrict serving officers from paid sessions; allow verified toppers (who are private citizens after selection) without restriction
- Retired officers have no such restriction

**This is the highest-risk assumption in the community platform. Validate before building the payout flow.**

### Mentor earnings dashboard

```
Mentor Profile → Earnings
├── Sessions completed: 12
├── Total aspirants served: 287
├── Average rating: 4.7 / 5
├── Total earned: ₹43,050
├── Pending payout: ₹8,750
└── Payout history (date, amount, bank reference)
```

---

## Resource sharing library (Phase 11)

### Resource types

```
Resource
├── type: pyq_paper | notes | strategy_guide | video_link | course_link | book
├── exam_id (canonical recruitment family)
├── subject / topic (optional)
├── source_trust: official | community | coaching | unknown
├── visibility: public | group | private
├── contributed_by (user or admin)
├── upvotes
├── verified_by_topper: boolean (admin-granted flag)
├── admin_flagged: boolean (DMCA / copyright concern)
└── created_at
```

### Copyright risk management

Users will upload copyrighted Adda247, Testbook, and coaching PDFs. Before the resource library goes live:

1. ToS must explicitly prohibit copyright violations
2. DMCA takedown form and process must be documented
3. Admin moderation queue for flagged resources must exist
4. Copyright-sensitive resource types (PDFs) require admin approval before going public
5. Video links (YouTube) are generally safe; PDF uploads require more scrutiny

---

## Admin tools for community (Phase 8+)

### Required admin surfaces

```
/admin/community
├── Pending reports (flagged threads/replies)
├── Moderation actions (hide, delete, warn, ban)
├── Channel management (create, configure, set admin-only)
├── Mentor applications (review, verify, approve/reject)
├── Mentor session management (monitor, cancel if needed)
├── Resource library moderation (approve, flag, remove)
└── User badge management (grant/revoke Verified Topper, Verified Officer)
```

### Moderation philosophy

Moderators are a scarce resource at launch. Build the tooling to make moderation efficient:

- Community report → surfaces in admin queue with context
- One-click hide (reversible) before investigation
- Pattern detection for spam (same user, multiple reports in 24h)
- Trusted users can temporarily suppress a post pending review (not delete)

Do not rely on automated AI moderation for community content without human review at launch. AI can flag; humans decide.

---

## Cold-start strategy

An empty forum is worse than no forum. Before public launch of community:

1. Seed with 20-30 high-quality threads written by the product team, curated from common aspirant questions
2. Recruit 10-15 beta users from existing waitlist/telegram to be founding contributors
3. Give founding contributors a `Founding Member` badge (permanent cosmetic)
4. Do not open community to all users until there is visible activity in each exam space
5. Consider inviting 2-3 verified toppers as "founding mentors" with a higher revenue share (50%) during the first 3 months to build supply-side credibility

---

## Key constraints (non-negotiable)

1. `official_updates` channels are admin-write only. No exceptions.
2. Mentor verification must complete before listing goes live.
3. Copyright moderation tooling must exist before resource library goes public.
4. Video conferencing for group study: no build, users provide Zoom/Meet link.
5. AI moderation may flag; humans approve all moderation actions at launch.
6. Government-employee legal framing must be validated before payout flow is built.
