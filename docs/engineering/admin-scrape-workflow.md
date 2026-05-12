# Admin Scrape Workflow

Scraping is a discovery and review workflow. It never publishes recruitments and never sends user alerts directly.

## Action Phases

| Phase | Action | Writes to DB | Does not do |
|---|---|---|---|
| Before scraping | Add source | `source_registry` | Verify, scrape, publish |
| Before scraping | Edit source | `source_registry` configs, including `scrape_config` and `adapter_config` | Publish or promote candidates |
| Before scraping | Verify source | source verification status/audit rows | Make aggregator sources official proof |
| Before scraping | Configure scrape limits | `source_registry.scrape_config` | Bypass review gates |
| Before scraping | Configure crawler patterns | `source_registry.adapter_config` | Guarantee official provenance |
| Before scraping | Run dry scrape | `scrape_runs`, review queue output in dry/mock mode | Publish or alert users |
| Before scraping | Run live scrape | `scrape_runs`, `scrape_queue` rows | Publish or alert users |
| During scraping | Show run status/counts/errors | reads `scrape_runs` and `scrape_queue` | Offer publish actions |
| After scraping | Verify field | `extracted_field_evidence` | Change canonical recruitment unless promoted/merged later |
| After scraping | Correct field | `extracted_field_evidence` and `scrape_queue.extracted_data` effective value | Publish |
| After scraping | Reject field | `extracted_field_evidence` | Delete candidate |
| After scraping | Compare duplicate | read existing `recruitments` candidates | Create new recruitment |
| After scraping | Merge into existing recruitment | selected safe fields on `recruitments`, queue `status=merged` | Overwrite non-empty canonical values unless corrected/forced |
| After scraping | Promote to new draft | `recruitments`, `posts`, criteria rows, queue promoted pointer | Publish or alert users |
| After scraping | Reject candidate | queue `status=rejected` | Delete canonical data |
| Recruitment gate | Validate readiness | backend readiness response/audit | Publish |
| Recruitment gate | Verify recruitment | `publish_status=verified` when readiness passes | Send alerts |
| Recruitment gate | Publish recruitment | `publish_status=published` when readiness passes | Recompute eligibility by itself |

## Duplicate Strategy

Queue rows can be duplicate because the scraper found a matching canonical recruitment or because the backend finds a duplicate slug during promotion. Duplicate promotion returns HTTP 409 with the existing recruitment id and next actions. Admins should compare, merge reviewed fields, mark duplicate, or reject the candidate.

## Field Correction Strategy

Corrections are not evidence-only. Correcting a field updates both `extracted_field_evidence.corrected_value` and the queue item's effective `scrape_queue.extracted_data`. Promotion and merge build effective extracted data from the queue plus corrected evidence rows.

## Source Pattern Strategy

Aggregator discovery uses `adapter_config.include_patterns`, `exclude_patterns`, and `allowed_domains`. Include patterns narrow candidate links, exclude patterns block noisy links, and allowed domains permit explicitly trusted cross-domain discovery. Without allowed domains, discovery stays on the source host.

## Publishing Warning

Scrape runs and queue promotion do not publish and do not fan out notifications. Promotion creates `publish_status=needs_review`; publishing remains a separate recruitment readiness-gated backend action.
