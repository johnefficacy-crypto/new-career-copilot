# Exam Intelligence Contracts — v1 (PR5)

## Purpose

PR5 adds a thin **contract layer** on top of the exam-intelligence
tables introduced in migrations 029–034 (`subjects`, `topics`, `exams`,
`exam_topic_coverage`, `syllabus_documents`, `syllabus_topic_mentions`,
`pyq_papers`, `pyq_questions`, `pyq_question_topic_tags`, etc.). It
turns those tables into:

1. A **verified-only read API** that the rest of the product can call
   without having to know the schema or worry about pending/rejected
   rows leaking into user-facing surfaces.
2. A small **admin review API** that lets operators move
   `reviewer_status` between `pending`, `verified`, `rejected`, and
   `needs_correction` — *without* introducing any new data
   creation/edit paths.
3. A **mission-control integration** that finally flips the
   `Exam intelligence` step in `engine_trace` from `not_connected` to
   `available` when an admin has actually verified something for the
   user's target exam.

This PR adds **no new tables** and **no AI**. The only writes are the
admin review-status PATCH and a `reviewed_by` / `reviewed_at` audit
stamp.

## What "verified" means

Every read in `app/exam_intelligence/` filters on
`reviewer_status = 'verified'` for the underlying row types:

| Row | Required status | Reason |
|---|---|---|
| `syllabus_topic_mentions.reviewer_status` | `verified` | Mention must be explicitly checked by an operator. |
| `pyq_questions.reviewer_status` | `verified` | The PYQ row itself must be verified before its tags count. |
| `pyq_question_topic_tags.reviewer_status` | `verified` | The tag linking the question to a topic must also be verified. |
| `exam_topic_coverage.is_active` | `true` | Coverage is an editable taxonomy choice, not extracted evidence; we only require it to be active. |

A PYQ tag whose `reviewer_status='verified'` but whose underlying
`pyq_question` is still `pending` is **excluded** — both must be
verified. There is an explicit test for this.

## Backend service (`app/backend/app/exam_intelligence/`)

- `lookup.py` — `resolve_exam_by_slug`, `resolve_exam_by_id`,
  `list_active_exams`.
- `coverage.py` — `verified_topic_coverage(exam_id)`,
  `verified_pyq_topic_counts(exam_id)`.
- `status.py` — `exam_intelligence_status(exam_id_or_slug)` returns
  `{available, exam_id, exam_slug, exam_name, verified_topics, verified_pyq_tags, verified_syllabus_mentions}`; `exam_intelligence_summary(...)` adds the per-topic payload with
  `verified_pyq_count` per topic. Both always return a dict and never
  raise.

The service uses **two-query joins** (read `exam_topic_coverage` then
`topics` then `subjects`) instead of Supabase's embedded-select
syntax, so it behaves identically against the live client and against
the unit-test stub.

## User-facing API (`/api/exam-intelligence/*`)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/exams` | Active exams list. Auth required. |
| `GET` | `/exams/{slug}` | `exam_intelligence_summary` shape with `verified_only: true`. Empty/unknown exam → `{exam: null, available: false, topics: []}` without raising. |

These endpoints are read-only, defensive, and explicitly marked
`verified_only: true` in every payload so the frontend can trust it.

## Admin API (`/api/admin/exam-intelligence/*`)

All endpoints require `require_permission("exam_intelligence.review")`
(super_admin bypasses). Non-admin → HTTP 403. Tests cover all four
endpoints.

| Method | Path | Purpose |
|---|---|---|
| `GET`   | `/overview` | Counters for syllabus mentions, PYQ tags, PYQ questions across all statuses; plus exam totals. |
| `GET`   | `/exams` | Per-exam roll-up: `coverage_active`, `syllabus_verified`, `syllabus_pending`. |
| `GET`   | `/exams/{exam_id}/items` | Review queue list. `kind=syllabus_topic_mention\|pyq_question_topic_tag\|pyq_question`. `status=pending\|verified\|rejected\|needs_correction\|all`. PYQ rows are scoped to the exam through `pyq_papers`. |
| `PATCH` | `/items/{kind}/{row_id}/review` | Body `{reviewer_status, reviewer_notes?}`. Stamps `reviewed_by` and `reviewed_at`. `reviewer_notes` is only persisted for `syllabus_topic_mentions` (the only table with that column today). Unknown kind → 400; unknown status → 422; missing row → 404. |

## Mission Control integration

`build_mission_control(supabase, user_id)` now reads the user's
`profiles.target_exam` (falling back to the first entry of
`aspirant_preferences.target_exams`) and calls
`exam_intelligence_status`. The result is:

- Returned to the frontend in a new `exam_intelligence` block.
- Reflected in the existing `engine_trace` step:
  - `status: "available"` when any verified counts are non-zero, with a
    detail string like `SSC CGL · 2 verified topics · 1 verified PYQ tags`.
  - `status: "not_connected"` otherwise, with the original copy.
- `meta.preview_flags` no longer includes
  `exam_intelligence_not_connected` once the status flips to available.

No task reasoning copy is changed in PR5. Once admins start verifying
real coverage and tags, follow-up PRs can promote `verified_pyq_count`
on a per-task basis without touching this contract.

## Admin viewer (`/admin/exam-intelligence`)

`app/frontend/src/pages/admin/ExamIntelligence.jsx` is the new admin
page, wrapped by the existing
`ProtectedRoute role={["admin", "super_admin"]}` guard and added to the
Governance sidebar with a `GraduationCap` icon.

Tabs:

1. **Overview** — Verified vs pending counts for syllabus mentions, PYQ
   tags, PYQ questions, plus active exam total.
2. **Exams** — One row per registered exam with coverage and syllabus
   verified/pending counts; a "Review queue" action jumps to the
   review tab pre-filtered to that exam.
3. **Review queue** — Pick an exam + kind + status. Each row shows
   `Verify` / `Reject` / `Needs correction` / `Reset to pending`
   buttons. Each button hits the PATCH endpoint and refreshes the
   list. A permanent safety banner reminds operators that user-facing
   exam intelligence reads only verified rows and that no AI was used
   to produce them.

Components live under
`app/frontend/src/features/admin/exam-intelligence/`:
`ExamIntelligenceOverviewCards`, `ExamListTable`, `ReviewQueueTable`.

## Safety contract

- **No new tables.** PR5 only adds API + service modules + admin UI.
- **No AI.** Nothing in PR5 generates or interprets exam content.
- **No marketing claims.** Mission-control and user APIs never use
  phrases like "high-yield", "official update", or "verified exam" in
  user copy. An explicit test enforces this.
- **No leak of pending/rejected rows.** The user-facing API filters on
  `reviewer_status = 'verified'`; the admin review endpoint is the
  only path that can change that status.
- **No edit of intelligence content.** PR5 never updates
  `question_text`, `raw_text`, `tag_weight`, etc. — it only updates the
  review status fields.
- **No deletion.** Admins move things between statuses; nothing gets
  deleted.
- **Verified-only is bi-directional.** Reversal is possible (e.g.
  `verified → rejected`), so a mistake stays auditable rather than
  permanent.

## Tests

Backend tests in `tests/exam_intelligence/`:

- `test_status.py` — service-layer correctness, no-data case, broken
  table case, verified-tag-but-pending-question exclusion.
- `test_admin_api.py` — full FastAPI `TestClient` coverage of all four
  admin endpoints, access control (non-admin → 403 on every endpoint),
  validation (`kind`, `status`, status enum), `reviewer_notes` only
  persisted where the column exists.
- `test_mission_control_integration.py` — mission-control flips
  `engine_trace` to `available` only when verified data is present;
  preview flag clears; preferences fallback path; tag-without-verified-question is excluded.

Combined PR1+PR2+PR3+PR4+PR5 → 149/149 tests pass locally.

## Future PRs

- **PR6 — Task reasoning enrichment** using verified PYQ counts per
  topic and verified syllabus mentions, without any AI.
- **PR7 — Exam intelligence ingestion contracts**: how scraped /
  imported rows land in the `pending` queue, and the trust gate that
  decides whether they qualify for the review queue at all.
- **PR8 — Per-cycle / per-phase intelligence** views and aggregates
  for the admin page once ingestion is producing material volumes.
