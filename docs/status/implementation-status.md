---
owner: ops
status: live
last_verified_against_code: 2026-05-16
last_modified: 2026-05-16
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
| personal notes | implemented | migration 090, /api/notes, /app/notes UI | add rich-text + attachments |
| flashcards | implemented | migration 091, /api/flashcards + SM-2-lite, /app/flashcards UI | add deck sharing/import |
| mistake book | implemented | migration 092, /api/mistakes + promote-to-card, /app/study/mistakes UI | auto-capture from mocks |
| revision calendar | implemented | migration 093, /api/revision, /app/study/revision UI | per-source auto-scheduling hooks |
| downloadable reports | partial | migration 094, /api/reports inline CSV/JSON, /app/reports UI | PDF worker + signed-URL storage |
| moderation queue | implemented | migration 095, /api/moderation + /admin/moderation, severity rubric v1 | wire report buttons across surfaces |
| leadership KPIs | partial | migration 096, /admin/kpis + recompute, four families seeded | nightly snapshot job |
| copyright/takedown | implemented | migration 097, public /dmca + /admin/copyright | DMCA agent contact + counter-notice flow |
