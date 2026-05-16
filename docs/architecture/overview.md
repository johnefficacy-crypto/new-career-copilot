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

# Architecture Overview

System map: ingestion -> trust gate -> deterministic eligibility -> admin review -> publish/promote -> user-facing experiences.
