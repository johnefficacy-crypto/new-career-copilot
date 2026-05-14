# Admin Persona Controls — v1 (PR4)

## Purpose

PR4 gives operators a single, narrow surface to inspect and lightly
manage the persona system built in PR1–PR3:

- the progressive **question bank** (PR2),
- per-user **persona snapshots** (PR1),
- per-user **study policy** previews (PR1+PR2),
- the **recompute queue** (PR1),
- the **signal events** log (PR1).

It is intentionally read-light. There is no rule-builder UI, no AI, no
exam intelligence, no admin write to canonical profile rows, no
deletion of persona snapshots or answers.

## Route

`/admin/persona` — wrapped by the existing
`ProtectedRoute role={["admin", "super_admin"]}` guard in
`app/frontend/src/routes/adminRoutes.jsx`. Added to the Governance
sidebar in `AdminShell.jsx` with a `Sparkles` icon.

## Backend endpoints (all under `/api/admin/persona`)

All endpoints require either `super_admin` role or the explicit
`persona.manage` permission, via the existing `require_permission`
dependency.

| Method | Path | Purpose |
|---|---|---|
| `GET`   | `/overview` | Compact ops counters for the dashboard. |
| `GET`   | `/question-bank` | List question rows with `active`/`q`/`limit`/`offset` filters. |
| `PATCH` | `/question-bank/{question_key}` | Allowlisted field patch (text, help_text, options, priority, is_active, trigger_rules, applies_when). |
| `GET`   | `/snapshots` | Compact snapshot list with `user_id` / `persona_version` filters. |
| `GET`   | `/users/{user_id}` | One-user debug view: latest snapshot, recent answers, recent events, queue items. |
| `POST`  | `/recompute-user` | Enqueue a recompute via PR1's `enqueue_persona_recompute`. |
| `GET`   | `/recompute-queue` | List queue rows with `status` filter. |
| `POST`  | `/recompute-queue/process` | Drain pending rows using PR1's `process_pending_persona_recompute`. |
| `GET`   | `/signal-events` | List events with `user_id` / `event_type` / `processed` filters. |

The router is registered in `app/backend/server.py` next to the other
admin routers.

### What admins can edit

- Question text and help text.
- Options for select-type questions (`single_select` / `multi_select`).
  Must remain non-empty; values are normalised to `{value, label}`.
- Priority (integer 0–10000; lower = higher).
- `is_active` (activate/deactivate).
- `trigger_rules` / `applies_when` JSON blobs.

### What admins cannot edit

- `question_key` (immutable after creation).
- `data_type` (changes silently dropped; existing row unchanged).
- Anything outside the allowlist (rejected with HTTP 400 if attempted).
- Canonical profile data (`profiles`, `aspirant_preferences`, etc.).
- Persona snapshot contents — snapshots are immutable; the only write
  path is a recompute via the queue.
- Deletion of answers, snapshots, or queue rows.

## Frontend page

`app/frontend/src/pages/admin/Persona.jsx` with six tabs:

1. **Overview** — counters for active questions, 24-h answers,
   24-h snapshots, pending/failed recomputes, 24-h signal events,
   unprocessed events.
2. **Question Bank** — searchable / active-filtered table with a
   side-modal editor and an activate/deactivate quick action.
3. **Snapshots** — compact list with primary persona, condensed
   dimensions, confidence, computed_at, and an "Inspect" jump to the
   User Inspector tab.
4. **User Inspector** — paste a `user_id`; shows latest snapshot,
   recent answers, recent signal events, queue items, plus a
   "Recompute persona" button that enqueues via the admin endpoint
   and refreshes the view.
5. **Recompute Queue** — status-filtered list with an optional
   "Process pending (25)" button that hits
   `/recompute-queue/process`.
6. **Signal Events** — list with `user_id` / `event_type` /
   `processed` filters and expandable JSON payloads via the shared
   `JsonPreview` component.

Components live under
`app/frontend/src/features/admin/persona/`:
- `PersonaOverviewCards`
- `PersonaQuestionBankTable`
- `PersonaQuestionEditor`
- `PersonaSnapshotTable`
- `PersonaUserInspector`
- `PersonaQueueTable`
- `PersonaStudyPolicyPreview`
- `JsonPreview`

The page also surfaces a permanent safety card:

> Persona snapshots are internal personalization metadata. They must not
> override deterministic eligibility results or official recruitment data,
> and persona labels are never shown to users as identity copy.
> This page is read-light: no AI, no exam intelligence, no profile edits.

## Safety constraints

- **Admin-only.** Every endpoint uses `require_permission("persona.manage")`,
  which falls back to `super_admin` role. Non-admins get HTTP 403; tests
  cover all endpoints.
- **No raw service errors leaked.** Internal exceptions are logged and
  return safe defaults or generic 4xx/5xx messages.
- **No user PII leakage.** The user inspector returns persona-specific
  rows only — it never joins back to `profiles` or `aspirant_*` tables.
- **No deletes.** Deactivation is the only "removal" path for questions
  and it is reversible.
- **No bulk recompute-all.** The admin endpoint takes a single
  `user_id`. Bulk operations would need their own design.
- **Internal labels stay internal.** The page surfaces persona labels
  for operator debugging only; user-facing surfaces (PR2 question card,
  PR3 Today page) never display them.

## Future admin roadmap

- **PR5+ — Exam intelligence admin.** Only after persona admin is
  stable. Adds a separate console for syllabus/PYQ/update review with
  its own trust model. PR4 does not pre-shape it.
- **Rules viewer / classifier weights.** Read-only inspection of the
  deterministic rule catalog (`app.persona.classifier`) — useful for
  debugging "why did this user get learning_behavior=mock_avoider".
- **Audit trail.** Every admin write (question patch, recompute
  enqueue, queue drain) should land in the existing audit log; PR4
  defers that to a follow-up so the audit pattern matches whatever the
  admin audit module adopts next.
- **Bulk operations.** Cohort recompute, batched question reordering.
- **Persona answers export.** For research / debugging dumps. PR4
  intentionally has no export endpoint.
