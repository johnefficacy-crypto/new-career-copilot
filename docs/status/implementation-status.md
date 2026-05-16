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

# Implementation Status

| surface | status | evidence | next action |
|---|---|---|---|
| auth | partial | app/backend routes + frontend auth flows | close test gaps |
| profile | partial | profile APIs and UI present | normalize profile events |
| scraper | implemented | scraping runner + queue + admin workflows | improve observability |
| source registry | partial | source tables + admin controls | enforce stricter source SLAs |
| admin review | implemented | admin review endpoints and consoles | tighten SOPs |
| promotion | implemented | deterministic promotion gate | expand edge-case tests |
| eligibility | implemented | deterministic eligibility engine | continue migration hardening |
| notifications | partial | notification pathways exist | unify templates + retries |
| payments | planned | roadmap references | implement payment rails |
| dashboard | partial | mission-control and analytics surfaces | consolidate KPIs |
| community | planned | product strategy docs | define MVP scope |
| marketplace | planned | product strategy docs | define supply-side contracts |
| PYQ | partial | study surfaces + docs | add ingestion pipeline |
| persona | partial | persona controls + question flow | close policy automation gaps |
| exam intel | partial | contracts + admin intelligence docs | productionize end-to-end |
| study OS | partial | mission control + comparison specs | complete planner phases |
