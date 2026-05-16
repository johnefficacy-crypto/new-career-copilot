# Admin Frontend Review (Critical Gap Analysis)

This document records the latest read-only audit of the admin frontend.

## Executive Classification

**Status: Partially ready, currently overloaded.**

## Key Findings

- Information architecture is grouped into Operations / Governance / Business, but route semantics overlap and create cognitive duplication (notably promotion/eligibility queue naming and aliasing).
- `AdminShell` navigation and responsive structure are solid, but the static page title (`"Admin operations console"`) is misleading on non-operations screens.
- `OperationsConsole` is functionally rich but overloaded in one component (state orchestration + workflow + mutations + drawers/modals), increasing UX and maintenance risk.
- `VerificationGatewayConsole` is still demo/static scaffolding and is not yet wired to production data flows.
- Trust workflow language is mostly clear (including discovery-only handling for aggregators), but status labels/actions should be normalized across screens and backend contracts.
- Frontend route protection exists, but backend enforcement is still the true security boundary; client-side role assumptions must not be treated as authoritative.

## High-Priority Gaps (P0/P1)

1. **P0** — Split overloaded operations workflow into bounded surfaces (Setup/Run vs Review/Publish with explicit current action model).
2. **P0** — Do not present Verification Gateway as production-ready until API wiring and evidence/resolver lifecycle are implemented.
3. **P0** — Reconfirm backend RBAC enforcement for all `/api/admin/*` actions; frontend checks are UX-level only.
4. **P1** — Remove naming drift and duplicate route semantics across Promotion Queue / Eligibility Queue workflows.
5. **P1** — Introduce route-aware shell heading and tighten navigation context clarity.

## Recommended Next UX Moves

- Finalize admin nav around a single canonical operations flow.
- Collapse heavy secondary content into drawers/details to reduce default-page overload.
- Use a single **CurrentActionCard** and a 5-phase rail for operational orientation.
- Keep advanced crawler/source configuration hidden behind explicit advanced affordances.

## Scope Reviewed

- Routes & shell: admin routes + admin shell
- Admin pages: Overview, Operations Console, Verification Gateway, Recruitments, Eligibility Queue/Ops, Sources, Organizations, Scraper, Notifications, Marketplace, Plans, Audit, RBAC, Mentors, Community, AI Policy, Persona, Exam Intelligence
- Supporting frontend: admin feature modules, shared UI/a11y helpers, API/auth/ProtectedRoute layers

