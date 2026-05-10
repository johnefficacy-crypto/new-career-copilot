# Migration history summary

This file summarizes confirmed migration themes under `app/supabase/migrations/`.

## Foundation and core data model

Early migrations establish baseline profile, eligibility, source registry, scraper queue quality, and admin queue review surfaces:

- `003`–`011`: notification feed/preferences, profile/eligibility foundational tables, source registry, scrape queue quality, admin queue review, and recompute enqueue triggers.

## Scraper/trust pipeline hardening

- `012`, `013`, `017`, `018`, `043`, `053`, `071`, `072`, `073`, `075`, `080`
- Themes: observability, provenance/evidence, official-source gating, trust hardening, promoted status tracking, source-intelligence policy alignment, extracted field evidence constraints.

## Eligibility/recompute and candidate fit

- `005`, `024`, `046`, `047`, `078`, `079`
- Themes: conditional eligibility support, queue claim/recompute workflows, exam credentials support, grading/education authority data, queue hardening/indexing.

## Notifications and user lifecycle

- `010`, `014`, `015`, `026`, `048`, `068`, `069`, `070`
- Themes: notification fanout uniqueness, preference governance, state dedupe, run tracking.

## Product feature expansions

- `027`, `028`, `029`, `030`, `031`, `038`, `040`, `041`, `049`, `050`, `067`, `074`, `076`, `077`
- Themes: user events/forms, recruitment state, exam summary, embeddings, apply tracker, ranking, community/forum, marketplace, applications, slug support, recruitment events, certifications metadata.

## Payments and policy/admin

- `019`, `023`, `032`, `035`, `036`, `039`, `054`
- Themes: RBAC/audit and service-role policies, admin settings, AI policy infrastructure, org trust fields, AI chat setup, Razorpay subscriptions.

## Utility and seed/fix migrations

- `022`, `025`, `033`, `034`, `042`, `044`, `045`, `051`, `052`
- Themes: legacy trigger cleanup, promotion payload support, publish workflow, mock tests, seed data, aggregator candidate layers, recruitment feedback, organization uniqueness fixes, official URL support.

## Notes

- For exact DDL and policy statements, inspect the corresponding SQL migration files in `app/supabase/migrations/`.
- This summary is intentionally high-level and should be updated as new migrations are added.
- Queue indexing updates:
  - `081_queue_query_indexes_and_cleanup_candidates.sql` adds base queue indexes and a read-only cleanup-candidates function.
  - `082_queue_query_composite_indexes.sql` adds composite indexes for primary admin queue filter/order paths.
