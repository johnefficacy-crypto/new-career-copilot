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

# Scraper Runbook

1. Run scheduled/manual scrape pass.
2. Review queue in admin console.
3. Verify official notices before promotion.
4. Promote deterministic records only after human sign-off.
