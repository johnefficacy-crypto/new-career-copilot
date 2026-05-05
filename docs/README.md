# Career Copilot — Docs

_Last updated: 2026-04-30_

This directory is the single source of context for the product, engineering strategy, and operations of Career Copilot.

## How to navigate

| If you want to know... | Read... |
|---|---|
| What the product is and where it is going | [product/vision.md](product/vision.md) |
| The full phased build roadmap | [product/roadmap.md](product/roadmap.md) |
| Pricing tiers and paywall design | [product/monetization.md](product/monetization.md) |
| Forum, mentor sessions, and community strategy | [product/community-platform.md](product/community-platform.md) |
| Database canonical rules (recruitment vs exam) | [engineering/domain-model.md](engineering/domain-model.md) |
| Admin, RBAC, and automation strategy | [engineering/admin-strategy.md](engineering/admin-strategy.md) |
| AI governance, personalization, and PYQ strategy | [engineering/ai-strategy.md](engineering/ai-strategy.md) |
| Source taxonomy and scraper intelligence | [engineering/source-intelligence.md](engineering/source-intelligence.md) |
| What has been built (current truth) | [operations/implementation-checklist.md](operations/implementation-checklist.md) |
| How to operate the system (runbook) | [operations/runbook.md](operations/runbook.md) |
| AI/agent context summary | [00-ai-context.md](00-ai-context.md) |
| Build history and past sprint reports | [history/README.md](history/README.md) |

## Doc types

- **Product docs** — live strategy documents. Updated as direction changes.
- **Engineering docs** — technical decisions and architectural constraints. Updated when a decision changes.
- **Operations docs** — current implementation state and procedures. Updated every sprint.
- **History** — immutable sprint reports and strategy chat summaries. Never edited after filing.

## Non-negotiable domain rules

```
Database entity  = recruitment        (public.recruitments)
Frontend label   = exam               (UI language only)
Foreign key      = recruitment_id
Avoid            = public.exams
```

See [engineering/domain-model.md](engineering/domain-model.md).

## Strategic rule

```
Trust > Speed
Control > Automation
Determinism > Heuristics
```

See [engineering/admin-strategy.md](engineering/admin-strategy.md).
