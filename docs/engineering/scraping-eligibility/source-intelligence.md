# Source Intelligence Strategy Notes

_Last updated: 2026-05-02_

## Purpose
This note captures source-intelligence decisions that should guide the scraper, eligibility engine, and notification pipeline.

It is intended to be updated whenever we learn something important about:
- source discovery and source quality,
- aggregator behavior,
- RSS / JSON / WordPress endpoints,
- official datasets useful for product strategy,
- qualification-demand patterns,
- changes to trust scoring or promotion rules.

---

## 1. Source Taxonomy

### A. Canonical / Source-of-Truth sources
These are the sources that should be treated as authoritative for user-facing eligibility and alerts.

Examples:
- official recruitment pages
- official vacancy pages
- official career pages
- official PDF notifications / bulletins
- official RSS feeds published by the issuing body
- official JSON APIs published by the issuing body

Rules:
- use these as primary inputs for `source_registry`
- use these for promotion into canonical `recruitments`
- use these for eligibility-triggering and user notifications whenever possible
- preserve manual verification before large bulk registry updates

### B. Secondary discovery / aggregator sources
These sources are useful for finding that a new notification may exist, but are not the preferred source of truth.

Examples:
- GovtJobsBlog
- Sarkari Result
- Free Job Alert
- similar job aggregation blogs / portals / newspaper mirrors

Rules:
- use for discovery, cross-checking, source discovery, and missed-notification detection
- do NOT treat as canonical if an official source is available
- for user-facing alerts, always try to resolve the item to the official URL / official PDF / official notice page first
- lower trust score than official sources
- acceptable to keep as `aggregator` / secondary sources in the registry

### C. Research / enrichment sources
These are official or semi-official data resources useful for strategy, segmentation, analytics, source discovery, or market understanding, but not direct recruitment-notification sources.

Examples:
- OGD India / data.gov.in dataset catalogs and APIs
- service directories
- historical vacancy datasets
- employment statistics snapshots

Rules:
- do not feed directly into the recruitment promotion pipeline
- use for dashboards, TAM estimates, qualification segmentation, and strategy
- can inform prioritization of onboarding, eligibility coverage, and marketplace cohorts

### D. Opportunity / adjacent-opportunity sources
These are not always direct job-notification feeds, but may carry valuable opportunities adjacent to the aspirant journey.

Examples:
- scholarships
- internships
- fellowships
- education opportunities
- sports and cultural opportunities
- skill development / youth programs

Rules:
- these should feed an opportunities layer, not be mixed blindly into recruitments
- use personalization based on profile stage, qualification, location, and preferences
- keep separate opportunity types and alert channels from normal recruitment alerts

---

## 2. RSS / JSON Strategy

### Why RSS matters for Career Copilot
RSS is highly useful when available because it usually provides:
- faster polling,
- cheaper change detection,
- lower anti-bot risk,
- smaller payloads,
- better fit for ETag / Last-Modified caching,
- lower LLM cost than full HTML scraping.

### Practical use
If a site exposes:
- RSS / Atom feed,
- JSON API,
- WordPress REST API,
then prefer those over raw HTML where feasible.

But note:
- RSS is best for discovery and incremental updates
- RSS usually does NOT contain full post-wise eligibility detail
- full HTML / PDF follow-up is often still required

### Product rule
Use RSS / JSON to detect and shortlist likely new items, then enrich via official detail page / PDF before promotion when richer data is needed.

---

## 3. GovtJobsBlog — Working Interpretation

### Observed technical signals
From the page head of `https://www.govtjobsblog.in/govt-jobs/`, the site exposes:
- main RSS feed: `/feed/`
- category RSS feed: `/govt-jobs/feed/`
- WordPress API root: `/wp-json/`
- WordPress category JSON metadata

### Strategic interpretation
GovtJobsBlog appears to be a WordPress-based aggregator / publisher, not an official issuing authority.

### How to use it
Use GovtJobsBlog as:
- a secondary discovery source,
- a missed-notification detector,
- a source-discovery aid,
- a cross-checking input for coverage gaps.

Do NOT use it as the preferred canonical source when the official page / official PDF exists.

### Registry guidance
Suggested posture:
- `source_type`: aggregator / secondary
- `adapter_type`: prefer `rss` or `json` where stable
- trust score: low-to-medium relative to official sources
- promotion policy: resolve to official source before canonical promotion when possible

### Notification / eligibility implication
Items discovered from GovtJobsBlog should bias toward:
- `pending` or review-first workflows if official source is not yet resolved,
- lower confidence promotion,
- explicit official-link validation before auto-alerting users.

---

## 4. Sarkari Result (sarkariresult.com.cm) — Working Interpretation

### Observed technical signals
From the page head of `https://sarkariresult.com.cm/latest-jobs/`, the site exposes:
- main RSS feed: `/feed/`
- comments feed: `/comments/feed/`
- WordPress API root: `/wp-json/`
- page JSON endpoint via WordPress REST metadata
- Yoast/WordPress publishing structure

### Strategic interpretation
Sarkari Result appears to be a WordPress-based aggregator / publisher, not an official issuing authority.

### How to use it
Use Sarkari Result as:
- a secondary discovery source,
- a coverage-gap detector,
- a missed-notification detector,
- a source-discovery aid.

Do NOT use it as canonical truth when an official source is available.

### Registry guidance
Suggested posture:
- `source_type`: aggregator / secondary
- `adapter_type`: prefer `rss` first, `json` second, `html` fallback
- trust score: low-to-medium relative to official sources
- promotion policy: resolve to official source before canonical promotion whenever possible

### Notification / eligibility implication
Items discovered from Sarkari Result should bias toward:
- review-first or pending workflows,
- lower-confidence promotion,
- official-link resolution before auto-alert fanout,
- use as discovery, not final truth.

---

## 5. OGD India / data.gov.in — Working Interpretation

### What it is
OGD India and `data.gov.in` are official data access/catalog platforms.

### Why it is relevant
Useful for:
- official public datasets,
- public APIs,
- labor / vacancy / qualification / employment related snapshots,
- strategic analysis and product planning.

### Why it is NOT a direct recruitment source by default
Most OGD pages describe datasets, APIs, or service catalogs — not live vacancy notices.

### Product posture
Treat OGD India as:
- research / enrichment source,
- strategy input,
- dataset discovery surface,
- not a normal recruitment `source_registry` item unless a specific dataset/API clearly maps to live openings.

---

## 6. Curated Feed Candidates to Track

### A. Official / semi-official opportunity feeds
1. `https://services.india.gov.in/feed/rss?cat_id=2&ln=en`
   - Jobs category feed from National Government Services Portal / Services India
   - use as official or semi-official discovery layer
   - role: discovery / source expansion / opportunity feed

2. `https://services.india.gov.in/feed/rss?cat_id=1&ln=en`
   - Education and allied opportunities
   - role: scholarships / education schemes / fellowships / admissions / learning opportunities
   - do NOT mix blindly into job recruitments

3. `https://services.india.gov.in/feed/rss?cat_id=13&ln=en`
   - Sports and cultural opportunities
   - role: sports quotas, cultural grants, competitions, youth opportunities, academies, scheme-type opportunities
   - should feed a separate opportunities layer

### B. Aggregator discovery feeds
4. `https://www.govtjobsblog.in/feed/`
5. `https://haryanajobs.in/category/latest-jobs/feed/`
6. `https://www.careersingovernment.com/tools/blog/feed/`
7. `https://www.govtjobsdiary.com/feed/`
8. `https://ap.indgovtjobs.net/rss.xml`
9. `https://mh.indgovtjobs.net/rss.xml`

### Classification guidance
- GovtJobsBlog / HaryanaJobs / GovtJobsDiary / IndGovtJobs regional feeds:
  - discovery / gap-detection / missed-notification detection
  - not canonical if official source exists
- CareersInGovernment:
  - global/public-sector careers context source, but may contain non-India relevance
  - use only if filtered carefully for India-relevant public-sector or governance opportunities
- Services India category feeds:
  - more useful for structured opportunity discovery than pure recruitment truth
  - should be processed into an opportunities layer, not merged directly into core recruitments

---

## 7. Official Qualification Distribution Snapshot (Strategic Reference)

### Official snapshot captured
Data source: official API-derived qualification summary
Data upto: `2023-09-30`
Grand total vacancies: `1,73,42,279`

| Minimum Qualification | Total Vacancies |
|---|---:|
| 10th Pass | 18,87,511 |
| 11th | 2,182 |
| 12th Pass | 69,64,797 |
| Diploma After 10th | 4,06,920 |
| Diploma After 12th | 6,09,719 |
| Graduate | 48,75,923 |
| ITI | 2,22,396 |
| No Schooling | 7,44,803 |
| NotSpecified | 1,96,856 |
| PG Diploma | 5,641 |
| PHD / Super Specialist | 34,736 |
| Post Graduate | 5,46,575 |
| Upto 8th | 1,46,991 |
| Upto 9th | 6,97,229 |

### Key strategic takeaways
- `12th Pass` is the largest single bucket.
- `Graduate` is also a very large bucket.
- The opportunity pool is NOT only graduate/regulatory/banking aspirants.
- At-or-below-12th cohorts represent a very large share of the vacancy universe.
- Diploma / ITI / technical vocational routes are important enough to deserve first-class modeling.

### Product implications
Career Copilot should support qualification-first filtering and strong cohort segmentation across:
- no schooling / upto 8th / upto 9th,
- 10th pass,
- 12th pass,
- ITI,
- diploma after 10th,
- diploma after 12th,
- graduate,
- post-graduate,
- advanced / specialist qualifications.

### Eligibility implications
The eligibility engine should not assume a graduate-first world.
It must model qualification ladders explicitly and consistently.

### Marketplace / coaching implications
The platform should consider separate growth tracks for:
- school-level and clerical job aspirants,
- 12th-pass candidates,
- ITI / diploma technical candidates,
- graduate / banking / regulator / UPSC aspirants.

---

## 8. Personalization Logic for Opportunity Feeds

### Profile-aware routing rules
The dashboard should not show every feed item to every aspirant. It should route by profile stage and preferences.

Examples:
- Fresh graduate:
  - internships
  - apprenticeships
  - fellowships
  - entry-level skill programs
  - scholarship / higher-education opportunities only if relevant to stated goals

- Current student:
  - scholarships
  - internships
  - fellowships
  - competitions
  - youth / sports / cultural programs
  - education schemes and training opportunities

- 10th / 12th aspirant:
  - scholarships
  - skilling programs
  - apprenticeships
  - 10th/12th-aligned government opportunities

- ITI / diploma user:
  - apprenticeships
  - technical training
  - diploma/ITI-aligned openings
  - PSU / technician / vocational opportunities

### Location-aware filtering
Services India and similar feeds should be filtered by:
- user state
- district if available
- preferred states
- willingness to relocate
- home-state preference / domicile preference

### Notification channel rule
Opportunity feeds should use a separate card group and notification type, for example:
- `recruitment_alert`
- `scholarship_alert`
- `internship_alert`
- `sports_culture_alert`
- `education_opportunity_alert`

This prevents the core job-alert channel from being diluted.

---

## 9. Strategy Update for Scraper + Eligibility + Notification Engine

### Scraper strategy
- keep official sources canonical,
- use aggregators for discovery and gap-detection,
- prefer RSS / JSON over generic HTML when available,
- use HTML / PDF enrichment to fill missing eligibility details,
- retain manual review for low-confidence or aggregator-sourced discoveries,
- add an opportunities ingestion lane separate from core recruitment ingestion.

### Eligibility strategy
- expand onboarding and profile fields around qualification ladders,
- model non-graduate cohorts explicitly,
- treat qualification as a primary routing dimension,
- use strategic datasets to decide which cohorts deserve earliest depth,
- include student / fresh graduate / internship / scholarship routing flags.

### Notification strategy
- alert users from canonical official sources whenever possible,
- avoid high-confidence user alerts based only on aggregator text,
- allow aggregator-discovered notices to enter review / pending states,
- resolve official URL / PDF before fanout when feasible,
- keep opportunity notifications distinct from standard recruitment notifications.

---

## 10. Operating Rule for Future Updates

Whenever a new source-learning is found, capture:
1. what the source technically exposes (HTML / RSS / JSON / PDF / WordPress / API),
2. whether it is official, secondary, research-only, or opportunity-only,
3. whether it can be canonical,
4. how it should affect trust score / adapter choice / promotion policy,
5. whether it changes eligibility or notification strategy.

This file should evolve as the source strategy evolves.


---

## 11. Aggregator Strategy v1 (Operational)

This section is the explicit operating policy for aggregator-origin discoveries.

### 11.1 Non-negotiable policy

1. Aggregators are discovery inputs only.
2. Canonical rows in `public.recruitments` should prefer official notification/apply URLs.
3. `new_match` user notifications must be driven only by deterministic eligibility verdicts.
4. Aggregator-only items without resolved official URLs remain review-first and must not be auto-promoted.

### 11.2 Required state machine for aggregator items

For `source_type='aggregator'` queue items:

- initial: `status='pending'`, `extraction_status='unverified'`
- evidence review: `status='reviewing'`, `extraction_status='needs_review'` when critical evidence is missing
- promotable only when:
  - required extracted fields are present (`title`, `organization_name`, `official_notification_url`, non-empty `posts`)
  - evidence rows exist and required fields are `reviewer_status='verified'`
  - extraction status is `verified` (unless explicit manual override with `evidence_required=false`)

### 11.3 Official-link resolution requirements

Before promotion of aggregator-discovered rows:

- Try to resolve a first-party official source URL/PDF.
- If official URL cannot be resolved:
  - keep item in review,
  - record reviewer notes with why unresolved,
  - do not expose aggregator URL as primary user-facing truth.

### 11.4 Operational verification checklist (weekly)

Run these checks to verify coordination quality:

1. **Coverage:** recently approved scrape items have `duplicate_of` recruitment ids.
2. **Evidence:** approved items have required verified evidence rows.
3. **Eligibility fanout path:** approved items created eligibility queue rows and were consumed.
4. **Alert truthfulness:** `new_match` alerts were emitted only after eligibility recompute.
5. **Source health drift:** no accidental split-brain between `source_registry` and any legacy source table names.

### 11.5 Metrics to track

- `% approved rows with official_notification_url from official domain`
- `% approved rows from aggregator sources requiring manual review`
- `median time pending -> approved for aggregator rows`
- `% aggregator discoveries rejected due to unresolved official links`
- `% eligibility queue jobs completed < 10 minutes after recruitment approval`

---

## 12. Trusted Ingestion Implementation Strategy (Detailed)

This section translates current findings into an implementation sequence. It is intentionally technical and execution-focused.

### 12.1 Current hardening already in place

- Legacy manual runner no longer auto-approves by confidence.
- Aggregator host-vs-official host guard is enforced before promotion.
- `scrape_queue` now stores `official_source_resolved` and `official_source_host`.
- `source_registry` supports `requires_official_confirmation` (aggregators default to true).

These controls reduce unsafe promotion risk but do not yet complete end-to-end trusted ingestion.

### 12.2 Remaining gaps (ordered)

#### P0 — must complete before eligibility can rely on scraper data

1. **Unify source-of-truth path**
   - Remove policy drift between `source_registry` and any legacy source tables.
   - All scrape entry paths (scheduled/manual/admin) must share one ingestion pipeline.

2. **Promotion contract hardening**
   - Promotion must be blocked unless all required trust gates pass:
     - `official_source_resolved=true`
     - evidence-required fields verified
     - extraction status verified
   - Manual overrides must be role-restricted and audit-logged with reason.

3. **Eligibility gate**
   - Eligibility query path must consume only canonical rows marked as verified/promoted in trust workflow.
   - Unverified candidate data must not affect `new_match`.

#### P1 — required for robust discovery quality

4. **Aggregator cross-source candidate model**
   - Build candidate merge layer so same opportunity across multiple aggregators converges before promotion review.

5. **Official source discovery stage**
   - Explicit stage to resolve issuing organization source and official notification document.
   - Distinguish discovery URL vs canonical official notification URL.

6. **Deterministic dedup strategy**
   - Add durable candidate keys and observation-level dedup.
   - Separate lifecycle updates (result/admit card/etc.) from fresh recruitment openings.

#### P2 — extraction depth and analytics completeness

7. **Schema for richer fields**
   - fees/fee-relaxations
   - exam pattern
   - syllabus
   - application links (including official apply URL)
   - category-wise vacancy breakdown

8. **Evidence completeness matrix**
   - Define required fields by source type and promotion mode.
   - Add reviewer UX for missing/incorrect evidence corrections.

### 12.3 Target data-layer additions

Additive design (do not break existing `source_registry`/`scrape_queue` flows):

1. `aggregator_listings`
   - discovery-only records from aggregator/RSS surfaces
   - statuses: `discovered | duplicate | needs_official_source | official_source_found | rejected`

2. `listing_observations`
   - raw observation snapshots per listing/source with hashes

3. `recruitment_candidates`
   - merged candidate entity across observations
   - statuses: `unverified | aggregator_confirmed | official_notification_found | extraction_pending | extraction_complete | needs_review | verified | promoted | rejected`

4. `candidate_observations`
   - links candidate to listings/sources with confidence + provenance payload

5. `official_notification_documents` and `notification_document_fetches`
   - canonical document references + fetch history (hash, status, headers, parsed host)

6. Reuse/extend `extracted_field_evidence`
   - keep single evidence table, expand required field policy and reviewer workflows

### 12.4 Code-level execution plan

1. **`supabase/functions/scheduled-scraper/index.ts`**
   - Split into explicit phases:
     - Phase A: discovery ingestion (`aggregator_listings`)
     - Phase B: official-source resolution
     - Phase C: official-document fetch + extraction queueing
   - Stop treating listing URLs as canonical official URLs.

2. **`lib/scraping/runner.ts`**
   - Keep pending-only behavior.
   - Route manual/admin-triggered runs through same core ingestion stages as scheduled scraper.

3. **`lib/db/notifications.ts`**
   - Move from queue-item-centric approval to candidate-centric promotion guard.
   - Preserve strict validation, expand required-field checks by schema.

4. **Admin review surfaces**
   - Show: candidate merge signals, official source resolution state, evidence completeness, and rejection reasons.
   - Provide reviewer actions: verify/correct/reject fields with audit rows.

5. **`lib/eligibility/runner.ts`**
   - Add trust-state filter so only verified/promoted canonical rows are evaluated.

### 12.5 Testing and release gate

Required automated checks for rollout:

1. Aggregator-only listing cannot be promoted.
2. Same opportunity from multiple aggregators merges into one candidate.
3. Missing official notification document keeps candidate unverified.
4. Multi-post extraction persists post-wise rows and vacancy counts.
5. Eligibility ignores non-verified candidate-origin data.
6. Verified candidate promotion is idempotent (promotes once).
7. `new_match` alerts emit only after deterministic eligibility recompute.

Operational release gate:

- lint/typecheck/tests/build clean (or documented known failures),
- no `public.exams` regressions,
- no direct confidence-only or source-host-only bypasses to promotion,
- audit trail present for all admin overrides.


---

## 13. Status cross-check (2026-05-02)

This status is cross-checked against current code and migrations (not intent docs).

### Implemented in code

1. Legacy manual runner no longer auto-approves by confidence; new rows are forced to `pending`.
2. `scrape_queue` persists `official_source_resolved` and `official_source_host` (migration 043 + scheduled scraper write path).
3. Promotion validation blocks when `official_source_resolved=false` and blocks aggregator-host == official-host cases.
4. Discovery foundation tables exist for aggregator/candidate layers (migration 044) and scheduled scraper writes `aggregator_listings`, `recruitment_candidates`, and `candidate_observations` for aggregator sources.

### Not yet implemented (important)

1. Candidate-centric admin promotion flow is not yet the canonical path; approval is still queue-item-centric.
2. Eligibility runner does not yet filter by candidate trust status/verified promotion lineage; it evaluates canonical open/upcoming posts.
3. Full field schema coverage (fees, exam pattern, syllabus, category-wise vacancy breakdown, apply-link model) is still pending in canonical promotion.
4. Source unification is incomplete: legacy and scheduled ingestion stacks still coexist.

### Operational truth

Current state should be treated as: 

`partially hardened ingestion with safer promotion gates, but not yet full trusted-candidate architecture.`
