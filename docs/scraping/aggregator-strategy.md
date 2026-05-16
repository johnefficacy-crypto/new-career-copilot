# Aggregator-First Ingestion Strategy

_Last updated: 2026-05-09_

## 1. Purpose

This document defines the recommended ingestion strategy for Career Copilot's scraper pipeline.

The goal is to use aggregator sources, RSS feeds, WordPress feeds, and government feeds for fast discovery, while preserving official government or parent-organization sources as the canonical source of truth for recruitment data, eligibility computation, and user alerts.

The strategy is:

```text
Aggregator / RSS discovery
  -> candidate creation
  -> official source resolution
  -> official page / PDF download
  -> structured extraction
  -> scrape_queue
  -> admin review
  -> canonical recruitments / posts / criteria
  -> eligibility recompute
  -> user alerts
```

The scraper should never treat aggregator text as final recruitment truth when an official source is available.

---

## 2. Strategic decision

Career Copilot should follow an aggregator-first discovery model with official-source-first verification.

This means:

1. Aggregators are useful for discovering that a new recruitment, result, admit card, date change, interview schedule, or other update may exist.
2. Official organization websites, official PDFs, official RSS feeds, official APIs, and official career pages remain the canonical source of truth.
3. Aggregator-only data should not directly create user-facing recruitment records.
4. Aggregator-origin data should not trigger eligibility-based user alerts until it has been resolved to official evidence and promoted through the trust gate.
5. AI extraction is allowed as an assistant, but not as a trust decision-maker.
6. The deterministic eligibility engine should consume only canonical, reviewed recruitment data.

Recommended operating principle:

```text
Use aggregators to know what to look for.
Use official sources to decide what is true.
```

---

## 3. Why this strategy is feasible

The strategy is feasible because most government recruitment data follows a discoverable lifecycle:

1. Aggregators or employment portals publish a short notice.
2. The notice often links to the parent organization, application portal, or PDF.
3. The parent organization hosts the official advertisement, corrigendum, admit card notice, result PDF, or date-change circular.
4. The official document contains the reliable details required for eligibility and notifications.

RSS / JSON / WordPress feeds are especially useful for the first stage because they usually provide:

- faster polling,
- lower payload size,
- lower anti-bot risk,
- cheaper change detection,
- reduced AI cost,
- stable published timestamps,
- direct links to detail pages.

However, feeds usually do not contain complete post-wise eligibility details. Most feeds provide only title, summary, date, and link. Therefore, they should be treated as discovery inputs, not final structured recruitment data.

---

## 4. Current repository alignment

The existing repository already points toward this direction.

Relevant existing concepts include:

1. `source_registry`
   - supports source metadata such as source type, adapter type, RSS URL, notification URL, trust score, anti-bot risk, and scrape interval.

2. Aggregator source entries
   - existing migrations include aggregator and RSS-style sources such as Employment News, FreeJobAlert, Sarkari Result, Rojgar Samachar, and IBPS.

3. Official-source confirmation gate
   - aggregator sources are expected to require official confirmation before promotion.
   - `scrape_queue` includes fields such as `official_source_resolved` and `official_source_host`.

4. Trust-gate scraper design
   - scraped items enter `scrape_queue` first.
   - admin review controls promotion into canonical `recruitments`, `posts`, and related criteria tables.
   - alerts should be downstream of deterministic eligibility results, not the scraper.

This document formalizes how these pieces should work together.

---

## 5. Target ingestion architecture

### 5.1 Layer 1: Source registry

All sources should be managed through `source_registry`.

Each source should be classified as one of the following:

```text
official_central
official_state
official_psu
official_bank
official_insurance
aggregator
rss_feed
manual
research
oportunity_feed
```

Each source should also define an adapter type:

```text
rss
json
html
pdf
playwright
manual
```

Recommended fields:

```text
source_name
source_type
category
jurisdiction
official_url
notification_url
rss_url
api_url
adapter_type
scrape_interval_hours
tier
trust_score
anti_bot_risk
requires_playwright
requires_official_confirmation
is_active
parser_config
notes
```

### 5.2 Layer 2: Discovery ingestion

Discovery ingestion reads from aggregators, RSS feeds, WordPress JSON APIs, official RSS feeds, and lightweight listing pages.

Its output should be discovery records, not canonical recruitments.

Target table:

```text
aggregator_listings
```

Purpose:

- store raw discovered feed/listing items,
- detect new items,
- classify item type,
- deduplicate repeated feed entries,
- queue items for official source resolution.

Suggested fields:

```text
id
source_id
source_name
source_type
listing_title
listing_url
listing_summary
published_at
content_hash
raw_payload
event_type
status
created_at
updated_at
```

Suggested statuses:

```text
discovered
duplicate
needs_official_source
official_source_found
rejected
```

### 5.3 Layer 3: Candidate merge layer

The same opportunity may appear across multiple aggregators.

Example:

```text
FreeJobAlert -> IBPS PO 2026 notification
Sarkari Result -> IBPS PO online form
Employment News -> IBPS CRP PO recruitment
```

These should merge into one candidate before admin review.

Target tables:

```text
recruitment_candidates
candidate_observations
listing_observations
```

`recruitment_candidates` represents the merged possible opportunity.

Suggested candidate statuses:

```text
unverified
aggregator_confirmed
needs_official_source
official_notification_found
extraction_pending
extraction_complete
needs_review
verified
promoted
rejected
```

`candidate_observations` links each aggregator or feed item to the candidate.

Suggested fields:

```text
candidate_id
source_id
listing_id
source_url
title_seen
summary_seen
confidence_score
match_reason
raw_payload
observed_at
```

### 5.4 Layer 4: Official-source resolution

Official-source resolution is the most important trust step.

The resolver tries to convert an aggregator listing into an official parent-organization source.

Resolution methods:

1. Extract direct official links from aggregator pages.
2. Follow outbound links and detect official domains.
3. Match the organization against known `source_registry` entries.
4. Visit the parent organization's career/recruitment page.
5. Search the page for title/year/post keywords.
6. Detect and download matching official PDFs.
7. Compare PDF title/content against the candidate title.
8. Store the official document and host metadata.

Target tables:

```text
official_notification_documents
notification_document_fetches
```

Suggested `official_notification_documents` fields:

```text
id
candidate_id
official_url
official_host
document_url
document_type
content_hash
source_registry_id
is_first_party
resolved_at
resolution_method
created_at
```

Suggested document types:

```text
html_page
pdf
rss_item
json_item
application_page
corrigendum
result_pdf
admit_card_notice
interview_notice
answer_key
other
```

Suggested resolution methods:

```text
direct_link_from_aggregator
known_source_registry_match
organization_career_page_match
pdf_link_match
manual_admin_resolution
search_api_resolution
```

### 5.5 Layer 5: Official extraction

After official source resolution, the scraper should fetch and extract from the official source.

Extraction priority:

```text
1. Official JSON/API parser
2. Official RSS parser
3. Official HTML selector parser
4. Official PDF deterministic parser
5. Regex/table parser
6. AI-assisted extraction
7. Manual admin entry
```

AI should be used where deterministic methods are weak, especially for messy PDFs and unstructured HTML.

AI output should still go through:

- validation,
- normalization,
- evidence extraction,
- data quality scoring,
- admin review.

### 5.6 Layer 6: Scrape queue and admin review

Only after official extraction should the item enter `scrape_queue` as a reviewable record.

Required fields on queue item:

```text
source_url
official_notification_url
official_source_resolved
official_source_host
source_name
source_type
extracted_data
confidence_score
data_quality_score
field_evidence
extraction_status
evidence_required
status
scraped_at
```

Default statuses:

```text
pending       -- new item awaiting admin review
duplicate     -- duplicate candidate or recruitment
reviewing     -- admin review in progress
approved      -- promoted successfully
rejected      -- rejected by admin
```

Important rule:

```text
Aggregator-origin queue items must not be promotable unless official_source_resolved = true, except through a restricted manual override with audit logging.
```

### 5.7 Layer 7: Canonical promotion

After admin verification, promotion writes to canonical tables:

```text
organizations
recruitments
posts
age_criteria
education_criteria
fees
important_dates
exam_pattern
recruitment_events
```

Promotion should be idempotent.

The queue item should only be marked `approved` after all required canonical writes succeed.

### 5.8 Layer 8: Eligibility recompute and alerts

After promotion:

1. Enqueue eligibility recomputation for relevant users.
2. Eligibility engine evaluates canonical recruitment/post/criteria data.
3. `eligibility_results` is updated.
4. Alerts are generated from eligibility results.

Important rule:

```text
Alerts must never be generated directly from aggregator listings or scrape_queue rows.
```

---

## 6. Event type strategy

The scraper should not treat every feed item as a new recruitment.

Classify each discovery into an event type.

Recommended event types:

```text
new_recruitment
application_open
application_date_extended
application_date_changed
correction_window
admit_card
exam_date
answer_key
result
marks_released
interview_schedule
document_verification
final_merit_list
syllabus
exam_pattern
fee_update
corrigendum
cancellation
unknown
```

Why this matters:

- A result update should not create a new recruitment.
- An admit card update should attach to an existing recruitment.
- A date extension should update important dates.
- A corrigendum should be tracked as an official event and may change eligibility details.

Target table for lifecycle updates:

```text
recruitment_events
```

Suggested fields:

```text
id
recruitment_id
candidate_id
event_type
event_title
event_date
source_url
official_document_id
summary
raw_payload
created_at
```

---

## 7. Deterministic classification rules

Use deterministic rules before AI.

Example keyword mapping:

```text
"recruitment", "vacancy", "online form", "apply online", "notification" -> new_recruitment
"admit card", "hall ticket", "call letter" -> admit_card
"result", "merit list", "selected candidates", "marks" -> result
"interview", "personality test", "document verification" -> interview_schedule / document_verification
"answer key", "response sheet" -> answer_key
"last date extended", "date extended", "closing date" -> application_date_extended
"corrigendum", "addendum", "revised" -> corrigendum
"syllabus", "exam pattern" -> syllabus / exam_pattern
```

AI classification should be used only when deterministic rules return `unknown` or multiple possible event types.

---

## 8. Deduplication and candidate merge strategy

Dedup should happen at multiple levels.

### 8.1 Listing-level dedup

Prevent inserting the same RSS/feed item repeatedly.

Use:

```text
source_id + listing_url
source_id + content_hash
source_id + normalized_title + published_at
```

### 8.2 Candidate-level dedup

Merge the same opportunity discovered across multiple sources.

Use:

```text
normalized_organization
normalized_title
year
event_type
official_url
pdf_hash
application_url
```

### 8.3 Recruitment-level dedup

Before promotion, check existing canonical records.

Use:

```text
organization_id
year
normalized_recruitment_name
official_notification_url
source_pdf_url
```

### 8.4 Document-level dedup

Avoid repeated extraction of the same PDF.

Use:

```text
document_url
content_hash
ETag
Last-Modified
```

---

## 9. Official source resolution rules

An official source should satisfy at least one of the following:

1. Domain matches a trusted official source in `source_registry`.
2. Domain belongs to a known government, PSU, bank, regulator, court, university, or official recruitment authority.
3. The source is an official RSS/API endpoint from the issuing organization.
4. The document is hosted on an official organization domain.
5. Admin manually verifies the source as official.

Aggregator-hosted pages should not be considered official just because they contain accurate information.

For aggregator discoveries:

```text
source_type = aggregator
requires_official_confirmation = true
official_source_resolved must be true before promotion
```

Manual override should require:

- admin role permission,
- reason text,
- audit log entry,
- visible warning in review UI.

---

## 10. External API strategy

Third-party APIs can be used, but they should not become the trust source.

Recommended priority:

```text
1. Official RSS / Atom / JSON API
2. Official organization HTML / PDF
3. Government aggregator feed
4. Private aggregator RSS / WordPress JSON
5. Private aggregator HTML
6. Feed-generation service
7. Search API
8. Paid recruitment data provider
9. Manual admin entry
```

### 10.1 Suitable API categories

Potential categories to evaluate:

1. Official APIs and government feeds
   - best for trust and cost.

2. WordPress REST APIs
   - many aggregators expose `/wp-json/wp/v2/posts`.
   - useful for structured discovery.

3. RSS/Atom feed APIs
   - useful for polling and feed normalization.

4. Search APIs
   - useful for resolving official organization pages from aggregator titles.
   - should be used for discovery only.

5. Feed-generation services
   - useful when a site has no RSS.
   - must be evaluated for reliability and terms.

6. Commercial job-data APIs
   - may provide prestructured data.
   - must be checked for India government-job coverage, licensing, cost, and redistribution rights.

### 10.2 API usage policy

Any third-party API must satisfy:

- clear terms of use,
- predictable pricing,
- caching allowed,
- no user personal data sent unless necessary and permitted,
- no direct promotion into canonical tables,
- fallback path if API fails,
- source attribution retained.

Third-party APIs may help discover official URLs, but canonical recruitment data should still prefer official documents.

---

## 11. What existed before AI-based extraction

Before AI-based extraction, scraper systems usually relied on deterministic ETL.

Typical pre-AI components:

### 11.1 RSS parser

Extracted:

```text
title
link
description
published_at
author/category if available
```

### 11.2 Site-specific HTML parsers

Each source had selectors such as:

```text
items_selector
title_selector
link_selector
date_selector
table_selector
pdf_link_selector
```

### 11.3 Regex extraction

Used patterns for:

```text
application start date
last date
age limit
upper age
qualification
vacancy count
fee
category relaxation
PDF links
```

### 11.4 PDF extraction

Used text/table extraction from PDFs, followed by rule-based parsing.

### 11.5 Manual admin entry

Admins manually corrected fields that parsers could not reliably extract.

### 11.6 Rule-based normalization

Examples:

```text
"Bachelor Degree" -> graduate
"Senior Secondary" -> 12th
"Matriculation" -> 10th
"Maximum Age 30 years" -> max_age = 30
```

### 11.7 Change detection

Used:

```text
ETag
Last-Modified
content hash
URL hash
PDF hash
```

### 11.8 Human verification

Admin verified extracted values before publication.

AI extraction improves speed and coverage, but it should not replace official-source resolution, evidence tracking, or admin review.

---

## 12. Recommended implementation phases

### Phase 0: Preserve the trust gate

Do not change these rules:

1. New scraped items enter `scrape_queue` as `pending`.
2. Duplicates enter as `duplicate`.
3. Nothing is auto-approved.
4. Admin promotion is required for canonical records.
5. Alerts are generated only after eligibility recompute.

### Phase 1: Populate source registry

Populate `source_registry` with:

1. Official central sources.
2. Official state sources.
3. Banking and regulator sources.
4. PSU and university sources.
5. Aggregator RSS feeds.
6. Government RSS feeds.
7. Opportunity feeds kept separate from recruitments.

Add or confirm:

```text
rss_url
adapter_type
source_type
trust_score
requires_official_confirmation
scrape_interval_hours
parser_config
```

### Phase 2: Build RSS and WordPress JSON adapters

Create adapters:

```text
rss_adapter.py
wordpress_json_adapter.py
html_listing_adapter.py
```

Adapter output should be normalized into one internal shape:

```text
DiscoveredListing
```

Suggested shape:

```python
class DiscoveredListing:
    source_id: str
    source_name: str
    source_type: str
    title: str
    url: str
    summary: str | None
    published_at: str | None
    raw_payload: dict
    content_hash: str
```

### Phase 3: Add discovery table writes

Insert discovery records into `aggregator_listings` or equivalent.

Do not insert directly into `scrape_queue` yet for aggregator discoveries.

### Phase 4: Add event classification

Classify each listing into event types.

Start with deterministic keyword rules.

Use AI only for ambiguous titles or summaries.

### Phase 5: Add candidate merge

Merge repeated listings into `recruitment_candidates`.

The admin should see one candidate with multiple observations, not five duplicated aggregator rows.

### Phase 6: Add official source resolver

Build a resolver that attempts to find the parent organization page or PDF.

Resolver order:

1. Check links inside aggregator item.
2. Match known organization/source registry.
3. Visit official notification page.
4. Look for matching PDF or HTML notice.
5. Optional search API fallback.
6. Manual admin resolution.

### Phase 7: Download and fingerprint official documents

For every resolved official document:

- download it,
- record status code,
- store URL and host,
- compute hash,
- record content type,
- record fetch timestamp,
- avoid reprocessing unchanged documents.

### Phase 8: Extract official data

Use deterministic parser first, AI second.

Extraction output should include:

```text
title
organization_name
org_type
notification_date
apply_start_date
apply_end_date
total_vacancies
year
official_notification_url
source_pdf_url
posts
field_evidence
confidence_score
data_quality_score
```

### Phase 9: Queue for review

Insert into `scrape_queue` only after enrichment from official sources.

Aggregator-origin items must carry:

```text
official_source_resolved = true/false
official_source_host
source_type = aggregator
```

If unresolved, keep blocked from promotion.

### Phase 10: Admin review and promotion

Admin can:

- verify fields,
- correct extracted values,
- reject candidate,
- resolve official source manually,
- approve promotion,
- add notes.

Promotion should:

1. upsert organization,
2. insert recruitment,
3. insert posts,
4. insert criteria,
5. insert important dates/events,
6. mark queue item approved only after success.

### Phase 11: Eligibility recompute

After promotion:

1. enqueue recompute for users,
2. run eligibility engine,
3. write eligibility results,
4. generate alerts from eligibility results.

### Phase 12: Add metrics and monitoring

Track:

```text
% aggregator listings resolved to official sources
% unresolved aggregator listings
median discovery -> official source time
median official source -> extraction time
median extraction -> admin approval time
% duplicates merged before queue
% approved records with official source host
% alerts emitted after eligibility recompute
source failure rate
feed staleness
PDF parse failure rate
AI extraction failure rate
```

---

## 13. Admin review UX requirements

Admin review should show:

1. Discovery source
   - aggregator name,
   - RSS item URL,
   - published date,
   - raw title.

2. Candidate merge evidence
   - how many sources reported the same item,
   - source list,
   - confidence of merge.

3. Official source resolution
   - official URL,
   - official host,
   - PDF link,
   - resolution method,
   - unresolved warning if missing.

4. Extracted fields
   - title,
   - organization,
   - dates,
   - posts,
   - age,
   - education,
   - vacancies,
   - fees,
   - apply link.

5. Evidence panel
   - source text snippet,
   - page/PDF location,
   - field confidence,
   - reviewer verification status.

6. Actions
   - verify field,
   - edit field,
   - reject field,
   - resolve official source,
   - reject candidate,
   - promote to canonical record.

---

## 14. Safety rules

1. Do not auto-approve based on AI confidence.
2. Do not promote aggregator-only data unless official confirmation is present or manually overridden with audit logging.
3. Do not generate user alerts from aggregator listings.
4. Do not let scraper output directly update eligibility results.
5. Do not overwrite canonical recruitment data without event/change tracking.
6. Do not treat result/admit-card/date-change updates as new recruitment records.
7. Do not send user profile data to third-party discovery APIs.
8. Do not scrape high-risk sites aggressively; use RSS/JSON/cache first.

---

## 15. Release checklist

Before enabling aggregator-first ingestion in production:

- [ ] `source_registry` has aggregator and official sources classified correctly.
- [ ] Aggregator sources have `requires_official_confirmation = true`.
- [ ] RSS adapter works with ETag / Last-Modified / content hash.
- [ ] Aggregator listings are stored separately from canonical recruitments.
- [ ] Candidate merge layer prevents duplicate admin queue noise.
- [ ] Official source resolver stores official host and document evidence.
- [ ] Aggregator-only items cannot be promoted by normal path.
- [ ] Admin manual override is permission-gated and audit-logged.
- [ ] Extraction stores confidence score, data quality score, and field evidence.
- [ ] Promotion is idempotent.
- [ ] Eligibility recompute triggers only after canonical promotion.
- [ ] Alerts are generated only from eligibility results.
- [ ] Tests cover unresolved aggregator item, resolved official item, duplicate candidate, lifecycle update, and failed promotion.

---

## 16. Recommended MVP scope

For the first production-ready version, implement only the following:

1. RSS adapter.
2. WordPress JSON adapter.
3. `aggregator_listings` discovery table.
4. Deterministic event classification.
5. Simple candidate merge.
6. Official URL resolver using known source registry and links inside aggregator posts.
7. Official PDF/HTML fetch with hashing.
8. AI-assisted extraction from official source only.
9. `scrape_queue` insertion with official-source flags.
10. Admin review and manual correction.
11. Promotion into canonical recruitment tables.
12. Eligibility recompute after promotion.

Avoid in MVP:

- fully automated official web search,
- heavy Playwright crawling,
- paid third-party APIs,
- auto-promotion,
- multi-service architecture,
- complex event streaming.

---

## 17. Final recommendation

Career Copilot should use aggregators first for speed, but official sources first for truth.

The correct production strategy is not:

```text
Aggregator -> AI extraction -> recruitment -> alert
```

The correct strategy is:

```text
Aggregator -> discovery -> candidate -> official source -> extraction -> review -> canonical recruitment -> eligibility -> alert
```

This gives the platform broad coverage while preserving the trust required for government recruitment eligibility, alerts, and user-facing recommendations.
