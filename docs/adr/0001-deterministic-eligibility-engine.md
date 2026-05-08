# ADR 0001: Keep eligibility decisions deterministic and rule-based

- **Status:** Accepted
- **Date:** 2026-05-08

## Context

The platform computes eligibility for high-impact user decisions. Explainability and repeatability are required.

## Decision

Use a deterministic Python eligibility engine as the source of truth for pass/fail/conditional outcomes. AI may support surrounding workflows, but must not decide eligibility verdicts.

## Consequences

- Pros: predictable outcomes, easier testing, clearer auditability.
- Trade-offs: rule updates require explicit code/schema evolution.
