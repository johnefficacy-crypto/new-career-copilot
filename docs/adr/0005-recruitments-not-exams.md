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

# ADR 0005: Recruitments are canonical, exams are UI labels

- Status: Accepted
- Date: 2026-05-16

Use recruitment tables and recruitment_id as canonical keys; frontend may display exam terminology.
