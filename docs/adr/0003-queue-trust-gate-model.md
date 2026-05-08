# ADR 0003: Queue trust-gate model and no-auto-approval invariant

## Status
Accepted

## Decision
Scraped items must enter `scrape_queue` as reviewable records (`pending` or `duplicate`) and must never be auto-approved.
Promotion to canonical records is an explicit admin action.

## Consequences
- Duplicate rows remain visible for audit/review.
- Failed promotion attempts must leave queue items retryable (not marked success).
- Queue API ordering prioritizes risk review (low data quality first where available).
