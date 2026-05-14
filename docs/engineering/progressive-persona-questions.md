# Progressive Persona Questions — PR2

## Purpose

Ask one tiny, deterministic question at a time to improve internal
persona signals (and therefore Study OS personalization quality) without
overwhelming the aspirant. PR2 is the second layer on top of the PR1
persona snapshot.

It is **not** a chatbot. There is no AI in the loop. The selector,
validation, and classifier integration are all deterministic.

## Data model (migration 085)

- **`persona_question_bank`** — registry of tiny questions. One row per
  `question_key`. Stores `data_type`, `options`, `target_dimension`,
  optional `field_key` / `profile_column` hints, `priority`,
  `trigger_rules`, `applies_when`, and `is_active`. Seeded with 8 safe,
  non-sensitive questions.
- **`persona_question_answers`** — append-only answers. The latest
  non-skipped row per `(user_id, question_key)` is the source of truth
  for the classifier. Skip audit rows live here too (`skipped = true`).
- **`persona_question_dismissals`** — per-user "not now". Unique on
  `(user_id, question_key)`. `dismissed_until` is a timestamp; the
  selector ignores rows whose `dismissed_until` has passed.

RLS is enabled with no policies — backend service role only, matching
the PR1 persona tables.

## Seeded question bank (v1)

| Priority | Question key | Target dimension |
|---:|---|---|
| 10 | `preparation_stage_self_assessment` | `preparation_stage` |
| 20 | `weekday_study_availability` | `time_constraint` |
| 30 | `weekend_study_availability` | `time_constraint` |
| 40 | `study_consistency_blocker` | `execution_risk` |
| 50 | `mock_behavior` | `learning_behavior` |
| 60 | `revision_behavior` | `learning_behavior` |
| 70 | `preferred_plan_style` | `study_policy` |
| 80 | `primary_weak_area` | `learning_behavior` |

All eight are `single_select` with non-sensitive options. We deliberately
do **not** ask about caste, category, financial status, family, or
location in PR2.

## Selector rules (v1)

1. Drop questions the user has already answered (any non-skipped row in
   `persona_question_answers`).
2. Drop questions currently dismissed (an unexpired row in
   `persona_question_dismissals`).
3. Among the remaining active questions, **boost** those whose
   `target_dimension` is currently `unknown` / `insufficient_data` in
   the latest persona snapshot (sort key `(0, priority)` vs `(1, priority)`).
4. Within each tier, order by `priority` ascending.
5. Return the first match — or `None` when the pool is empty.

Selector responses also include a short, plain-language `reason` and a
`persona_context` block (`unknown_dimensions`, `confidence`). The
frontend uses these to render a one-line rationale; no internal persona
label is ever surfaced.

## Answer validation

Validation in `app.persona_questions.answers.validate_answer` is
strict:

- `single_select` / `multi_select` answers must come from the
  question's registered options.
- `boolean` accepts `True`/`False`, `1`/`0`, and the strings
  `"yes"/"no"/"true"/"false"/"1"/"0"`.
- `number` accepts ints, floats, or numeric strings; rejects booleans
  and empty strings.
- `text` rejects empty/whitespace-only input.
- `date` requires an ISO-8601 string parseable by
  `datetime.fromisoformat`.
- Inactive questions are rejected before persistence.

Invalid answers return HTTP 400. We never AI-interpret an answer.

## Profile adapter (allowlist)

`app.persona_questions.profile_adapter.apply_safe_profile_mapping`
intentionally keeps a tiny allowlist in PR2:

- `weekday_study_availability` → `aspirant_preferences.study_hours_per_day`
  (mid-band estimate), but **only if the existing canonical value is
  empty**. Existing non-null values are preserved.

Everything else stays answer-only. The classifier reads from
`persona_question_answers` directly.

Failures in the adapter never block the answer save — the answers row
is the source of truth.

## Recompute flow

After a valid answer:

1. `persona_question_answers` insert.
2. `apply_safe_profile_mapping` (best-effort).
3. `user_signal_events` insert (`event_type = persona_question_answered`).
4. `enqueue_persona_recompute(...)` (best-effort).
5. Selector re-runs and the next question (if any) is returned in the
   same response so the card can chain.

Skips emit a `persona_question_skipped` event but **do not** enqueue a
recompute.

## Frontend behavior

- `PersonaQuestionCard` lives in
  `app/frontend/src/features/persona-questions/`. Today's only mount
  point is `pages/Today.jsx`, placed below the existing "One thing
  today" card.
- It loads via `GET /api/persona/questions/next`. If the response has
  no question (or the call fails) the card renders nothing — Study OS
  is never blocked.
- One question at a time. Save button submits to
  `/answer`; "Not now" submits to `/skip` with a 14-day dismissal.
- Header copy: "Personalize your Study OS". Subtitle:
  "Answer one small question to improve your next plan." We do **not**
  show persona labels.

## Consumed by Study OS Mission Control (PR3)

PR3's `GET /api/study/mission-control` calls
`app.persona_questions.selector.select_next_question` to pick the
single tiny question shown on `/app/today`. When no tasks are
scheduled, the deterministic next-best-action rule promotes the
selected question to `action_type: "progressive_question"`. The
question card itself is still rendered through PR2's
`PersonaQuestionCard` — mission-control simply exposes the same
question alongside the rest of the day's shape so the action panel can
reference it.

The persona snapshot (now shaped by PR2 answers via the classifier +
`derive_study_policy(dimensions, answers)`) is what mission-control
reads to populate `today's policy`:

- `preferred_task_size` (`short_focus_blocks` → small)
- `max_tasks_per_day` cap (`weekly_targets_only` → ≤3)
- `constraints.strict_daily_schedule` (`strict_daily_schedule` answer)
- `constraints.weekend_catchup_enabled` (job/family blockers)
- `constraints.require_mock_review_before_next_mock` (PR1 + mock_behavior)

See `docs/engineering/study-os-mission-control-v1.md` for the full
contract.

## Admin visibility (PR4)

`PR4 adds admin visibility/control for persona question bank,
snapshots, queue, and signal events`. Operators can list/search/patch
question rows (text, help_text, options, priority, is_active,
trigger_rules, applies_when) and inspect a single user's recent
answers and queue items at `/admin/persona`. `question_key` and
`data_type` remain immutable. See
`docs/engineering/admin-persona-controls-v1.md`.

## Non-goals (must not appear in PR2)

- No free-form AI chatbot.
- No recruitment-specific eligibility chatbot.
- No Study OS redesign.
- No admin console / exam-intelligence console.
- No AI-based answer interpretation or persona classification.
- No changes to deterministic eligibility verdicts.
- No scraper / admin promotion changes.
- No paid marketplace recommendation logic.
- No shame-based productivity copy.
- No exposing internal persona labels to the user.
