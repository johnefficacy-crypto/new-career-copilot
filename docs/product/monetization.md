# Career Copilot — Monetization Strategy

_Last updated: 2026-04-30_

## Core principle

Eligibility intelligence is genuinely valuable to aspirants — it saves hours of manual cross-checking and prevents costly mis-applications. The public/free layer shows the promise. The paid layer delivers continuous personalized intelligence.

Do not put everything behind the paywall. Enough public and free value must exist to drive trust and conversion. The goal is to make the demo so useful that paying feels obvious.

---

## Tier design

### Public (unauthenticated)

Available without creating an account:

- Landing page and feature explanation
- Pricing page
- Public exam discovery (limited — latest 10-20 open recruitments)
- Demo eligibility checker (fixed sample data, not user's actual profile)
- Marketplace browse (institutes, course types — no personalization)
- Public forum read-only preview (if community is enabled)
- Public resource library browse

**Purpose:** Show the promise. Convert to signup.

---

### Free (authenticated, no paid plan)

After account creation and onboarding:

- Full profile setup and 5-step onboarding
- Basic dashboard shell
- Limited exam browsing (latest open, no eligibility badges)
- Eligibility preview only: "You may match 8 recruitments — upgrade to see which ones"
- Generic official alerts (deadline approaching for popular exams — not personalized)
- Limited marketplace browsing (no personalized recommendations)
- Forum read access + limited posting (5 posts/day)
- Study plan preview (see what a plan looks like — cannot generate for own profile)
- Apply tracker (available free — tracks manually what user enters)

**Purpose:** Get users invested in their profile, convert to paid.

---

### Pro

Core intelligence tier. Recommended for active aspirants.

**Eligibility and matching:**
- Full personalized eligibility engine
- Post-wise eligibility results
- "Why am I eligible / not eligible" explanations
- Conditional eligibility diagnostics
- Missing field impact analysis
- Eligibility change alerts

**Notifications:**
- Personalized `new_match` alerts
- Deadline reminders (3-day, 1-day)
- Vacancy and status change alerts
- Admit card and result released alerts

**Study OS:**
- AI study plan generation
- Daily task generation and regeneration
- Focus timer with session logging
- Mock-test tracking with subject breakdowns
- Weekly review dashboard
- AI Career Chat (limited — N messages/month)

**Exam intelligence:**
- PYQ subject-weight trend charts
- Cutoff trend analysis
- Vacancy trend charts
- Competition metrics
- Exam cycle timeline

**Community:**
- Forum: unlimited posting
- Study group: create groups (max 3 members)
- 1 accountability partner
- Resource saving and private notes
- Mentor session booking at per-session price

**Resources:**
- Personalized free resource recommendations
- Personalized course recommendations

---

### Elite

Full intelligence. For serious aspirants with active preparation timelines.

Everything in Pro, plus:

- AI Career Chat (unlimited)
- Advanced PYQ analytics (topic-level, difficulty heatmap)
- Downloadable study plan PDF
- Downloadable weekly review report
- Priority support
- Study group: create groups (max 8 members)
- Up to 3 accountability partners
- 1 mentor session included per month (or discount)
- Early access to new features

---

## Feature paywall matrix

| Feature | Public | Free | Pro | Elite |
|---|:---:|:---:|:---:|:---:|
| Exam browse (limited) | ✅ | ✅ | ✅ | ✅ |
| Profile setup | — | ✅ | ✅ | ✅ |
| Eligibility demo | ✅ | ✅ | ✅ | ✅ |
| Full eligibility engine | — | — | ✅ | ✅ |
| Why eligible explanation | — | — | ✅ | ✅ |
| Personalized match alerts | — | — | ✅ | ✅ |
| Deadline reminders | — | Generic | ✅ | ✅ |
| AI study plan | — | Preview | ✅ | ✅ |
| AI Career Chat | — | — | Limited | ✅ |
| PYQ analytics | Preview | Preview | ✅ | Advanced |
| Cutoff/vacancy trends | Preview | Preview | ✅ | ✅ |
| Marketplace browse | ✅ | ✅ | ✅ | ✅ |
| Personalized recommendations | — | — | ✅ | ✅ |
| Forum read | ✅ | ✅ | ✅ | ✅ |
| Forum post | — | 5/day | Unlimited | Unlimited |
| Study group create | — | — | 3 members | 8 members |
| Accountability partner | — | — | 1 | 3 |
| Resource saving | — | — | ✅ | ✅ |
| Mentor booking | — | — | Per-session | 1 included/mo |
| Downloadable reports | — | — | — | ✅ |
| Priority support | — | — | — | ✅ |

---

## Community monetization specifics

### Forum access

Community participation is a Pro/Elite perk that drives retention. Free users can read and post up to 5 threads/day to reduce barrier to entry, but creating study groups and accountability partnerships require a paid plan.

### Study groups

- Free: join existing groups only
- Pro: create groups up to 3 members
- Elite: create groups up to 8 members

Rationale: group creation is where the coordination value lives. Joining is a network benefit — locking joining behind a paywall would kill cold-start.

### Mentor sessions

Per-session microtransaction, not subscription-gated:

- Price: ₹99–₹299 per aspirant (mentor sets price within range)
- Capacity: up to 50 aspirants per session
- Platform cut: 30%
- Mentor payout: 70% (T+2 settlement)
- Booking: Razorpay (existing integration)
- Available to: Pro and Elite users only (not free tier)
- Elite: 1 session per month included in subscription, additional at per-session price

### Resource sharing

- Public resources: visible to everyone (even unauthenticated)
- Private resources: Pro/Elite only
- Group-shared resources: accessible to all group members (group requires Pro/Elite)

---

## Demo eligibility design

The demo must show real product value without giving away the full intelligence.

**Public demo (unauthenticated):**
> "Check eligibility for SSC CGL with sample profile data"
> Shows: sample profile → sample matching → 3 posts shown → blur after 3

**Free preview (authenticated, after onboarding):**
> "Based on your profile, you may match up to 8 open recruitments."
> Shows: count only, no exam names, no post details
> Upgrade CTA: "See exactly which exams match and why"

**Paid result:**
> Exact exam name → post-wise eligibility → official link → why eligible → deadline countdown

---

## Pricing guidance (to be finalized)

Suggested positioning anchors:

- Pro: ₹299–₹499/month or ₹2,499–₹3,999/year
- Elite: ₹699–₹999/month or ₹5,999–₹7,999/year

Annual plans should offer 30-40% savings to drive commitment.

Mentor sessions are additive revenue, not substitutes for subscription. The subscription buys access; the session buys experience.

---

## Upgrade prompt principles

1. Show upgrade prompts in context, not just on a pricing page.
2. When a free user tries to see eligibility details → show blurred result with upgrade CTA.
3. When a free user tries to create a study group → gate with upgrade prompt.
4. When a free user reaches the 5-post/day limit → invite to upgrade.
5. Never show an upgrade prompt immediately after signup — let the user explore first.
6. Upgrade copy should state the specific value unlocked, not generic "get more features."
