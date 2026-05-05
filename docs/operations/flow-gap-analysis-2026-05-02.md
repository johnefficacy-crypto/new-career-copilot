# Full user-flow critical examination (2026-05-02)

## Scope
Auth → onboarding → profile completeness → dashboard mission control → exam intelligence layer → decision/action layer → activity/study OS → support/help → community forum → marketplace/mentorship.

## Executive diagnosis
- The product is strong on **trust/governance + deterministic matching + action surfaces**.
- The product is weak on **closed-loop learning + explainability + social retention layers** that are explicitly part of the stated positioning.
- The biggest near-term risk is a **promise-delivery gap**: roadmap/vision highlight exam intelligence, community, and mentor marketplace, while implementation is still largely pre-community and pre-intelligence-hub.

## Stage-by-stage assessment

### 1) Auth
**Current status**
- Login/signup/reset/forgot flows exist and are routed.

**Gaps**
- No evidence of adaptive auth friction controls (progressive profiling, social auth fallback, low-trust signaling).
- No explicit conversion instrumentation documented from anonymous → signup → first value.

**Impact**
- Top-of-funnel drop-off may be hard to diagnose beyond raw page views.

### 2) Onboarding + profile
**Current status**
- Multi-step onboarding exists (identity, education, experience, preferences, attempts, certifications).
- Profile impact surfacing exists and links to route-specific completion actions.

**Gaps**
- Onboarding completion quality is not explicitly tied to confidence scoring in user-facing eligibility explanations.
- No documented SLA/UX for stale profile data (e.g., age category transitions, changed domicile/certification validity).

**Impact**
- Users may over-trust outputs without understanding data freshness risk.

### 3) Dashboard (mission control)
**Current status**
- Mission-control state view, exam summary cards, recruitment detail timeline, tracker, notifications preferences are implemented.
- Trust language has been adjusted (e.g., “Confirmed match”).

**Gaps**
- Mission control prioritizes states, but not yet user-specific “next best action” with explicit deterministic rationale.
- Potential card fragmentation: multiple useful modules, but no visible single orchestrated daily plan across exam/apply/study/community actions.

**Impact**
- Users can see data but may still ask “what should I do first today?”

### 4) Exam intelligence layer
**Current status**
- Ranking v1 exists (eligibility × urgency × trust × behavior).
- Semantic retrieval and explanation-with-provenance are still incomplete/planned.

**Gaps**
- Core “Understand” pillar features (PYQ trends, cutoff trends, vacancy history, competition metrics) are roadmap-level, not delivered as a dependable layer.
- Explanation provenance layer absent → limited transparency for why rankings/actions are recommended.

**Impact**
- Intelligence claims can outpace delivered product evidence, weakening trust among serious aspirants.

### 5) Decision layer (eligibility and actionability)
**Current status**
- Deterministic eligibility engine is in place with governance constraints.
- Notification generation is engine-gated and governance-hardened.

**Gaps**
- “Why eligible/not eligible” appears in strategy/monetization narrative but evidence of end-to-end surfaced, auditable explanation UX is limited.
- No visible confidence/uncertainty language when profile fields are missing/conditional.

**Impact**
- Deterministic core is strong, but user mental model may still be opaque.

### 6) Activity layer (study OS)
**Current status**
- Focus timer, mock tracking, weekly review, study plan foundations are shipped.

**Gaps**
- Weak coupling between eligibility urgency and study task prioritization (e.g., deadline-aware topic allocation loops).
- No explicit adaptive loop connecting mock performance deterioration to planner task regeneration policy.

**Impact**
- Study OS may feel parallel to eligibility rather than integrated with decision outcomes.

### 7) Support layer
**Current status**
- Admin governance surfaces are mature (RBAC, audit, queue visibility).

**Gaps**
- End-user support workflow maturity is unclear (ticketing, escalation, SLA visibility, issue categorization).
- No obvious “explain my mismatch” guided support path for false negatives/positives.

**Impact**
- Trust issues may route into manual support load without tooling for fast resolution.

### 8) Community/forum
**Current status**
- Forum routes and admin community route exist; strategy and phased design are detailed.
- Roadmap marks community foundation as next (Phase 8).

**Gaps**
- Canonical community data model + moderation workflows are not yet listed as complete implementation truth.
- Notification loops for replies/community health and quota/paywall enforcement need production validation.

**Impact**
- Retention flywheel is conceptually strong but not yet operationally realized.

### 9) Marketplace/mentor
**Current status**
- Marketplace and instructor surfaces exist; mentor marketplace strategy is defined.

**Gaps**
- Verification/legal-operational model for mentors (especially serving officers) remains a major unresolved risk.
- Payout, compliance, disputes/refunds, and quality governance are not yet represented as done execution layers.

**Impact**
- Revenue upside is high but execution risk is the highest among upcoming pillars.

## Cross-cutting system gaps
1. **Promise vs implementation parity**: Product vision and monetization pages promise capabilities still largely planned.
2. **Explainability deficit**: Deterministic decisions exist but explainability/provenance layer is not complete.
3. **Loop integration deficit**: Eligibility, ranking, study OS, and community are not yet fully stitched into a single adaptive loop.
4. **Supportability deficit**: Governance is admin-strong; aspirant issue-resolution flows are less explicit.
5. **Measurement deficit**: Telemetry exists, but journey-level conversion KPIs and intervention experiments are not clearly encoded in docs as operational KPIs.

## Priority gap-closure sequence (critical)
1. **Close explanation gap (P0-P1)**
   - Ship deterministic-to-human explanation API with provenance references.
   - Expose “insufficient profile data” confidence/state labels everywhere eligibility appears.
2. **Unify daily action orchestration (P1)**
   - Single “Today’s priorities” block combining urgent forms, profile blockers, and study tasks.
3. **Operationalize community foundation (P1)**
   - Launch minimal but strict moderation + admin-write-only official channels + reply notifications.
4. **Define support operating model (P1)**
   - User-facing mismatch report path; SLA and resolution taxonomy.
5. **Gate marketplace launch on compliance checklist (P1-P2)**
   - Legal sign-off, mentor verification SOP, payout/dispute policy before opening paid sessions.

## Release-readiness lens by flow segment
- Auth/Onboarding/Profile: **B+** (strong structure, moderate measurement/quality gaps)
- Dashboard/Decision core: **A-** (strong deterministic/governance base, explanation UX gap)
- Exam intelligence layer: **C+** (ranking foundation only; key analytics pending)
- Activity/study integration: **B-** (good primitives, weak closed-loop adaptation)
- Support: **C** (admin support strong, aspirant support model underdefined)
- Community: **C** (designed, not fully shipped)
- Marketplace: **C-** (strategic clarity, high unresolved compliance/ops risk)

## Recommended immediate OKRs (next 4–6 weeks)
- Increase onboarding→first-confirmed-match conversion with explainability rollout.
- Reduce “unknown/conditional” confusion via profile confidence labels and blockers.
- Launch Phase 8 community MVP with moderation SLA adherence.
- Publish marketplace go/no-go checklist with legal/compliance completion gates.
