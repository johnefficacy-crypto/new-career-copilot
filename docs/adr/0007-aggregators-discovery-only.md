---
owner: ops
status: live
last_verified_against_code: 2026-05-16
source_of_truth: code
related_code:
  - app/backend
related_migrations:
  - app/supabase/migrations
review_cadence: per-sprint
---

# ADR 0007: Aggregators are discovery-only

- Status: Accepted
- Date: 2026-05-16

Aggregators can discover potential notices; official sources must verify facts before promotion.
