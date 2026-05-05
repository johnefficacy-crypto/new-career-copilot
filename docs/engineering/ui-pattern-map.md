# Career Copilot UI Pattern Map (P1)

_Last updated: 2026-05-03_

This map defines approved UI primitives and where they should be used, so teams can finish light-theme parity without introducing new visual drift.

## 1) Core shell/navigation patterns

### Root shell navigation
- **Source of truth:** `app/layout.tsx`, `app/globals.css` (`.root-shell-*`, `.cc-focus-ring`, `.cc-skip-link`)
- **Use for:** top-level aspirant IA routes (`/today`, `/exams`, `/study`, `/community`, `/marketplace`, `/profile`)
- **Rules:**
  - Keep `aria-label="Primary"` on the navigation landmark.
  - Keep skip-link target at `main#main-content`.
  - Avoid inline styles; update `.root-shell-*` classes instead.

### Dashboard shell
- **Source of truth:** `components/dashboard/DashboardShell.tsx`
- **Use for:** authenticated execution UI with mission-control first ordering.
- **Rules:**
  - Priorities/actions panels must stay deterministic-first.
  - New widgets must preserve keyboard tab order and card heading hierarchy.

### Admin shell
- **Source of truth:** `app/admin/layout.tsx`
- **Use for:** governance/control workflows.
- **Rules:**
  - Do not ship admin-only color/status patterns outside shared governance tokens.
  - Queue/table actions should use consistent CTA hierarchy (primary/secondary/destructive).

## 2) Reusable primitive patterns

### Card containers
- **Primitive:** `Card` from `components/ui/index.tsx`
- **Use for:** primary content groupings across dashboard/admin/community/marketplace.
- **Avoid:** introducing one-off `div` card wrappers when `Card` already fits.

### Row cards
- **Primitive:** `RowCard`
- **Use for:** list rows with compact metadata and actions.

### Status pills
- **Primitive:** `Pill` with tones (`success`, `warning`, `danger`, `gold`, `muted`)
- **Use for:** eligibility, trust, deadline urgency, moderation state.
- **Avoid:** introducing ad-hoc badge color classes for the same semantic meanings.

### Buttons
- **Primitive:** `Button` with variants (`primary`, `ghost`, `link`)
- **Use for:** default CTA hierarchy.
- **Avoid:** new bespoke button classes unless there is a documented exception.

### Progress indicators
- **Primitive:** `ProgressBar`
- **Use for:** profile completeness, plan completion, workflow progress.

## 3) Accessibility baseline requirements

Mandatory for all new UI surfaces:

1. Visible keyboard focus (`.cc-focus-ring` or equivalent focus-visible style).
2. Semantic landmarks (`header/nav/main`) on top-level shells.
3. Icon-only actions require `aria-label`.
4. Color-coded status must not be conveyed by color alone.

Automated baseline currently enforced by smoke tests:
- `lib/ui/__tests__/root-layout.a11y-smoke.test.tsx`

## 4) Migration policy (remaining P1)

When touching legacy pages:

1. Replace inline styles with tokenized classes/primitives.
2. Replace bespoke badges/buttons with `Pill`/`Button` where equivalent.
3. Add/verify focus-visible states for any newly added controls.
4. Do not add new legacy global classes unless no primitive exists.

## 5) Exception process

If a new visual pattern is required:

1. Add the pattern to this file with rationale and target modules.
2. Add shared styling in one place (prefer `components/ui` or tokenized global class).
3. Add at least one automated smoke/assertion check when accessibility semantics change.
