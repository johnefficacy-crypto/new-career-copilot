# Career Copilot — Product Vision

_Last updated: 2026-04-30_

## Positioning

Career Copilot is not a Telegram channel replacement. It is a complete **exam preparation operating system** for Indian government-job aspirants.

> Career Copilot is a trusted, official-source-first, eligibility-aware, visually rich exam intelligence and preparation platform for Indian aspirants.

The product competes with the entire fragmented preparation workflow aspirants currently stitch together:

- Telegram alerts for new notifications
- Coaching websites for course discovery
- Government PDFs for eligibility reading
- Manual eligibility cross-checking
- YouTube for strategy
- Spreadsheets for PYQ/cutoff tracking
- WhatsApp groups for peer discussion
- Trial-and-error for course selection

The winning experience is:

```
Discover official exams
→ Check paid eligibility
→ Understand exam trends
→ Prepare with AI and resources
→ Execute with study OS
→ Connect with peers and mentors
→ Track deadlines and apply confidently
```

---

## The user journey loop

```
Official recruitment discovery
→ Deterministic eligibility check
→ Application / form tracking
→ Exam-specific preparation plan
→ Study execution (focus timer, tasks)
→ Performance analytics (mock tests, weekly review)
→ Community and mentorship
→ Adaptive next actions
```

Each stage feeds the next. Community is not a feature bolt-on — it is the retention layer that keeps aspirants on the platform through the months-long preparation journey.

---

## Six product pillars

### 1. Discover

- Official exam notifications from verified sources
- Scraper-first, admin-verified recruitment data
- Central/state/PSU/regulatory body coverage
- No aggregator URLs in user-facing views

### 2. Match

- Deterministic eligibility engine (age, category, education, domicile, PwBD, ex-serviceman, attempts, appearing-candidate)
- Post-wise eligibility results
- "Why am I eligible / not eligible" explanations
- Conditional eligibility with missing-field diagnostics

### 3. Understand

- PYQ subject-weight trends
- Cutoff trend analysis by category and year
- Vacancy trend charts
- Competition ratio metrics
- Difficulty analysis
- Exam cycle timelines

### 4. Prepare

- AI-generated study plans
- Daily tasks and focus timer
- Mock-test tracking with subject breakdowns
- Free and paid resource recommendations
- Marketplace with mode/city/institution/subject filters

### 5. Connect

- Exam-specific forum spaces (official updates + discussion)
- Study groups and accountability partners
- Verified mentor sessions (toppers, senior officers)
- Resource sharing (public and private within groups)

### 6. Act

- Deadline reminders
- Official apply links (always canonical, never aggregator)
- Document checklists
- Application tracker (durable state: not_started → submitted)
- Admit card and result alerts

---

## Core principles

### Official-first trust model

Users must only see official, authoritative recruitment links. Aggregator URLs are internal discovery inputs, visible only to authorized admins. This is non-negotiable.

### Eligibility is premium intelligence

Eligibility matching is a monetizable core feature. It sits behind the paywall except for a limited demo/preview. A paying user gets exact post-wise matching, official links, reasons, and deadlines. A free user gets a preview count only.

### Dashboard must be action-oriented

The dashboard is not a generic SaaS shell. It is an aspirant mission control center that immediately answers:

> What am I eligible for? What is urgent? What is missing? What should I do next?

### Community amplifies everything else

Community is not a nice-to-have. It is the stickiness mechanism. Aspirants who join a study group or accountability pair churn significantly less. The community layer must be exam-specific and moderated — generic chat rooms do not serve aspirants well.

### AI assists, does not decide

AI generates study plans, summarizes, explains, and recommends. AI does not publish recruitments, verify organizations, calculate final eligibility, or override deterministic results. Every AI action must pass the AI action policy layer.

### Statistics must support decisions

Every chart and table must answer a real question. PYQ trends help an aspirant allocate study time. Cutoff trends help them set realistic targets. Vacancy trends inform exam selection. Stats for their own sake are not built.

---

## Target users

**Primary:** Indian government-job aspirants preparing for UPSC, SSC, IBPS, SBI, RBI, SEBI, NABARD, Railway, State PSC, and similar exams.

**Secondary:** Coaching institutes and educators seeking marketplace listing and verified exposure.

**Tertiary:** Verified toppers and senior government officers willing to mentor aspirants through paid short sessions.

---

## What we are not building

- A coaching platform. We recommend, we do not host courses.
- A test series. We recommend, we do not generate test papers.
- A chat app. We provide structured exam-specific community spaces, not open chat.
- A news aggregator. We provide official notifications only, not media coverage.
- An AI eligibility oracle. The engine is deterministic; AI only explains and assists.
