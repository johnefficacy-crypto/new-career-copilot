# Internal Aspirant Persona — v1 (PR1 Foundation)

## Purpose

Persona v1 is an **internal backend layer** that turns the facts we already
have about an aspirant — profile, onboarding answers, study task history,
focus sessions, mock attempts, weekly reviews — into a deterministic
*persona snapshot*. The Study OS will eventually consume the snapshot's
`study_policy` to schedule tasks at the right size, mix and cadence for
each aspirant.

PR1 ships **only** the foundation:

- new persona-specific tables,
- a defensive signal collector,
- a rule-based classifier (no AI),
- a study-policy deriver,
- snapshot persistence helpers,
- a small `GET /api/persona/me` + `POST /api/persona/recompute` API,
- unit tests.

Nothing in PR1 changes the user-visible product. The Study OS pages,
onboarding flow, eligibility verdict logic, and recruitment/scraper flows
are untouched.

## What persona IS

- An internal model of how an aspirant prepares.
- Derived signals such as time availability, planning vs. execution
  balance, mock engagement, deadline proximity.
- A starting point for the future Study OS to choose task sizes, daily
  targets and nudges.

## What persona IS NOT

- Not a public identity label. Aspirants are never shown "you are a
  working\_beginner" copy.
- Not a psychological diagnosis. No claims about personality, mental
  state, or aptitude.
- Not financial inference from caste, category, location or social
  background. `budget_sensitive` only fires when an explicit financial-
  constraint field is present (no such field exists in PR1; the dimension
  defaults to `unknown`).
- Not an eligibility decision. Eligibility remains deterministic and
  owned by `app/backend/app/eligibility/`.
- Not a recruitment-truth source. Recruitment publishing and scraper
  approval are unchanged.
- Not an AI classifier. PR1 uses only deterministic rules.

## Layer responsibilities

```
profile facts + onboarding answers          ┐
+ study tasks / focus / mocks / reviews     │  signals
+ eligibility/recruitment (future hook)     ┘
            │
            ▼
     persona snapshot  (immutable row in aspirant_persona_snapshots)
            │
            ▼
        study_policy  (consumed by future Study OS scheduler)
```

- **Profile / onboarding** stays the canonical source of facts.
- **Persona** is a derived, recomputed projection — never a write-back.
- **Study OS** in PR1 is unchanged; future PRs will pull `study_policy`
  from the latest snapshot.

## Supported dimensions

| Dimension | Allowed values |
|---|---|
| `discovery_stage` | `confused_explorer`, `targeted_exam_aspirant`, `multi_exam_optimizer`, `recruitment_specific_applicant`, `unknown` |
| `preparation_stage` | `beginner`, `intermediate`, `repeater`, `final_window_aspirant`, `unknown` |
| `time_constraint` | `low_availability`, `standard_availability`, `high_availability`, `working_professional`, `unknown` |
| `learning_behavior` | `insufficient_data`, `planner_poor_executor`, `mock_avoider`, `high_mock_low_review`, `revision_backlog_heavy`, `consistent_executor` |
| `execution_risk` | `low`, `medium`, `high`, `unknown` |
| `motivation_state` | `stable`, `deadline_sensitive`, `dropoff_risk`, `unknown` |
| `resource_constraint` | `unknown`, `budget_sensitive` (only via explicit field) |

`primary_persona` is a coarse internal label derived from the dimensions
above (e.g. `working_beginner`, `final_window_aspirant`, `exploring_aspirant`).
It is **not** displayed to users in PR1.

## Signal sources (PR1)

| Signal | Source table / column |
|---|---|
| `profile_completeness` | `public.profiles` + `public.aspirant_preferences` |
| `goal_exams_count` | `aspirant_preferences.target_exams` (fallback: `profiles.target_exam`) |
| `preferred_sectors_count` | `aspirant_preferences.preferred_sectors` |
| `preferred_states_count` | `aspirant_preferences.preferred_states` |
| `weekly_hours_goal` | `profiles.weekly_hours_goal` (fallback: `aspirant_preferences.study_hours_per_day × 7`) |
| `study_mode` | `aspirant_preferences.study_mode` |
| `target_exam_year` | `profiles.target_exam_year` |
| `task_completion_rate_14d` / `missed_task_count_14d` / `skipped_task_count_14d` | `study_tasks` filtered by `updated_at >= now() - 14d` |
| `focus_minutes_7d` | `study_sessions.duration_mins` (fallback: legacy `duration_minutes`) over last 7 days |
| `mocks_taken_30d` | `mock_tests` filtered by `attempted_at >= now() - 30d` |
| `weekly_review_available` | derived from completed-task count in current week |

Every read is wrapped defensively — if a table or column is missing the
signal falls back to a safe default and persona classification still
returns a valid snapshot.

## Study policy output

`derive_study_policy(dimensions)` returns:

```json
{
  "daily_minutes_target": 60,
  "max_tasks_per_day": 3,
  "preferred_task_size": "small",
  "task_mix": {
    "concept_learning": 0.40,
    "retrieval_practice": 0.30,
    "revision": 0.20,
    "mock_correction": 0.10
  },
  "constraints": {
    "weekend_catchup_enabled": true,
    "avoid_long_theory_blocks": true,
    "require_mock_review_before_next_mock": false
  },
  "nudge_style": "direct_non_shaming"
}
```

Rules (high level):

- `low_availability` / `working_professional` → small task size, low
  daily-minutes target, weekend catchup enabled.
- `planner_poor_executor` → fewer tasks per day, smaller task size, more
  retrieval, less long theory.
- `mock_avoider` → retrieval share lifted.
- `high_mock_low_review` → `require_mock_review_before_next_mock = true`.
- `revision_backlog_heavy` → revision share lifted, concept share cut.
- `deadline_sensitive` motivation → retrieval + mock-correction share
  lifted, long theory avoided.
- `nudge_style` is always `direct_non_shaming`. PR1 commits to never
  generating shame-based productivity copy.

## API surface (PR1)

- `GET /api/persona/me`
  - Returns latest snapshot for the authenticated user.
  - If none exists, computes one synchronously and saves it.
- `POST /api/persona/recompute`
  - Enqueues a recompute row **and** computes synchronously so the
    caller's next `/me` read is fresh.
  - Body (optional): `{ "reason": "manual_recompute" }`.

No admin endpoint is added in PR1. The deterministic Study-OS-facing
endpoint (`/api/study/mission-control`) is deferred to PR3.

## Migration

`app/supabase/migrations/084_persona_snapshots_and_signal_events.sql`
adds **only** three new tables:

- `aspirant_persona_snapshots`
- `user_signal_events`
- `persona_recompute_queue`

It does **not** modify or duplicate the existing
onboarding/chat/runtime tables from migration 016. RLS is enabled with
no policies; the backend service role is the only authorised reader.

## Recomputation triggers (planned)

PR1 ships the queue plumbing and an API entry point. Future PRs will
wire low-risk emit points without touching unrelated logic:

- after onboarding/profile save (clean backend handler exists)
- after study-task status update (Study OS canonical route)
- after focus session close
- after mock test submission
- after weekly review save
- after eligibility recompute completion (so persona reacts to
  recruitment-readiness changes)

Each trigger inserts into `user_signal_events` and, when appropriate,
enqueues `persona_recompute_queue`. PR1 deliberately does not edit those
handlers — only the API path emits today.

## Non-goals (must not appear in PR1)

- Full Study OS redesign.
- Chat-style "tiny question" onboarding.
- Admin persona console UI or rules viewer.
- Admin exam-intelligence console.
- AI-based persona classification.
- Free-form chatbot.
- Changes to eligibility verdict logic.
- Changes to recruitment publishing or scraper approval flow.
- Shame-based productivity copy.

## PR2 Progressive Tiny Questions

PR2 (migration `085_progressive_persona_questions.sql`) layered a small
question registry on top of PR1:

- `persona_question_bank` — registry of tiny questions; seeded with 8
  safe, non-sensitive questions targeting `preparation_stage`,
  `time_constraint`, `learning_behavior`, `execution_risk`, and
  `study_policy`.
- `persona_question_answers` — append-only answers (one row per submit;
  classifier reads latest per `question_key`).
- `persona_question_dismissals` — per-user "not now" suppression with an
  expiry timestamp.

API surface added in PR2 (mounted under `/api/persona/questions`):

- `GET /api/persona/questions/next` — selector returns one tiny question
  + a short reason. Skips already-answered + currently-dismissed
  questions. Boosts questions whose `target_dimension` is unknown /
  `insufficient_data` in the latest snapshot.
- `POST /api/persona/questions/answer` — strict validation against the
  question's `data_type`/options, then save → safe profile mapping
  (allowlisted) → emit `user_signal_events` → enqueue persona recompute.
- `POST /api/persona/questions/skip` — record a skip audit row and
  upsert a `persona_question_dismissals` row.
- `GET /api/persona/questions/history` — last 50 rows for the caller.

Classifier integration (deterministic, no AI):

- `preparation_stage_self_assessment` answers override the inferred
  `preparation_stage` (`just_starting` → `beginner`,
  `studied_before_restarting` → `restarting_aspirant`,
  `already_attempted_exam` → `repeater`, `final_revision_phase` →
  `final_window_aspirant`).
- `weekday_study_availability` answers override `time_constraint`
  unless the user is already classified as `working_professional`.
- `mock_behavior` answers set `learning_behavior` to `mock_avoider` or
  `high_mock_low_review`.
- `revision_behavior = rarely` sets `revision_backlog_heavy` only if
  there is no stronger learning-behaviour signal.
- `study_consistency_blocker` answers (phone/unclear plan) raise
  `execution_risk` to at least `medium`; job/family answers flip
  `study_policy.constraints.weekend_catchup_enabled` on.
- `preferred_plan_style` answers shape `study_policy`:
  `short_focus_blocks` → smaller task size + avoid long theory;
  `weekly_targets_only` → cap on max tasks per day;
  `strict_daily_schedule` → new `constraints.strict_daily_schedule`
  flag for the future scheduler.

Safety constraints reinforced in PR2:

- One tiny question at a time. No chat thread, no AI follow-ups.
- Persona labels are never shown in the card. The reason text uses
  plain language ("Improves Study OS personalization").
- Tiny questions never block app usage; any API failure simply hides
  the card.
- The profile adapter allowlist is intentionally tiny — only safely
  fillable, non-overwriting fields. Caste / category / financial /
  family answers are deliberately not in the seed.

See `docs/engineering/progressive-persona-questions.md` for the full
PR2 design.

## Consumed by Study OS Mission Control (PR3)

`GET /api/study/mission-control` reads the latest persona snapshot via
`app.persona.snapshots.get_latest_persona_snapshot` (auto-computing one
via `compute_persona_snapshot` if absent), and forwards
`dimensions`, `scores`, and `study_policy` into the response. The
frontend `/app/today` page renders them through `EngineTrace`,
`StudyPolicyPreview`, `StudyTaskCard` (with per-task `reasoning`), and
`NextBestActionCard`. The internal `primary_persona` label is **never**
shown as user-facing identity copy.

See `docs/engineering/study-os-mission-control-v1.md` for the full
contract.

## Future PR path

- **PR2 — shipped.** Progressive tiny-question card + classifier
  integration.
- **PR3 — shipped.** Study OS Mission Control endpoint + `/app/today`
  page upgrade.
- **PR4** — admin persona rules viewer (read-only): expose the rule
  catalog + a single user's evidence trail to operators for debugging.
