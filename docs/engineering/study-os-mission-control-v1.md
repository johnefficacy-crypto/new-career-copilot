# Study OS Mission Control — v1 (PR3)

## Purpose

PR3 connects the deterministic persona layer (PR1) and the progressive
tiny-question layer (PR2) to the Study OS by composing them into one
read endpoint, `GET /api/study/mission-control`, and rendering them as
the upgraded `/app/today` page.

It is intentionally a **composition layer**. Nothing about how plans,
tasks, focus sessions, mocks, or weekly reviews are written has
changed. PR3 reads what already exists, attaches deterministic
explanations, and chooses one next-best action.

## Why mission-control exists

The frontend used to fetch `/api/study/plan` and render a basic task
list. With PR1+PR2 the backend now has:

- a per-user persona snapshot,
- a derived `study_policy`,
- per-user tiny-question answers,
- focus / weekly-review / mock data,

…but no single shape that puts them together. Each surface used to
re-fetch its own pieces and rebuild context. PR3's mission-control
endpoint does that once on the server so the Today page renders
consistently and the data path is auditable.

## Input signals

- `aspirant_persona_snapshots` (PR1) — latest snapshot. Auto-computed
  if missing.
- `aspirant_persona_snapshots.study_policy` (PR1) — `daily_minutes_target`,
  `preferred_task_size`, `task_mix`, `constraints`, `nudge_style`.
- `persona_question_bank` + `persona_question_answers` +
  `persona_question_dismissals` (PR2) — used via `select_next_question`.
- `study_plans` (active row), `study_tasks` (today's row),
  `study_sessions` (7d / week), `mock_tests` (week) — read-only.

Every read is wrapped — a missing optional table simply yields a safe
default value. The endpoint never raises.

## Response contract

```json
{
  "user_context": {
    "persona_version": "v1",
    "primary_persona": "internal_label_not_for_display",
    "dimensions": { ... },
    "scores": { "confidence": 0.72, "study_risk": 0.44, ... }
  },
  "study_policy": {
    "daily_minutes_target": 90,
    "max_tasks_per_day": 4,
    "preferred_task_size": "small",
    "task_mix": { ... },
    "constraints": { ... },
    "nudge_style": "direct_non_shaming"
  },
  "plan": { "id": "...", "theme": "...", "target": "...", "source": "existing_study_plan" } | null,
  "today_tasks": [
    {
      "id": "...",
      "title": "...",
      "time": "...",
      "status": "planned|in_progress|completed|skipped|missed|carried_forward|rescheduled",
      "done": false,
      "subject": null,
      "topic": null,
      "task_type": "revision",
      "planned_minutes": null,
      "priority_score": null,
      "reasoning": {
        "summary": "...",
        "user_signal": "...",
        "study_policy_signal": "...",
        "plan_signal": "...",
        "evidence": ["active_study_plan", "persona_snapshot", "study_policy", "task_type_metadata"]
      }
    }
  ],
  "metrics": {
    "tasks_total": 0, "tasks_completed": 0, "task_completion_rate": 0,
    "hours_studied_7d": 0, "hours_planned_week": 0, "adherence": null,
    "backlog_count": 0, "mocks_taken": 0, "revision_coverage": null
  },
  "next_best_action": {
    "title": "...",
    "description": "...",
    "action_type": "study_task|progressive_question|focus_session|mock_review|weekly_review|study_plan",
    "task_id": "..."|null,
    "question_key": "..."|undefined,
    "reason": "..."
  },
  "truth_panel": { "summary": "...", "corrections": [], "warnings": [] },
  "progressive_question": { ... PR2 question shape ... } | null,
  "engine_trace": [
    { "label": "User signals",     "status": "available|missing",       "details": "..." },
    { "label": "Study policy",     "status": "available|missing",       "details": "..." },
    { "label": "Study plan",       "status": "available|missing",       "details": "..." },
    { "label": "Exam intelligence","status": "not_connected",           "details": "..." }
  ],
  "meta": {
    "generated_at": "...",
    "source": "mission_control_v1",
    "preview_flags": ["exam_intelligence_not_connected", "no_active_study_plan"]
  }
}
```

## Deterministic next-best-action

```
1. incomplete today task   → study_task           (first non-skipped pending)
2. no tasks + question     → progressive_question
3. no focus minutes 7d     → focus_session
4. high_mock_low_review    → mock_review
5. adherence < 0.4         → focus_session
6. all today tasks complete→ weekly_review
fallback                    → study_plan
```

No fake task IDs, no AI generation. The action_type maps to a real
in-app route on the frontend (`NextBestActionCard.ACTION_TO_LINK`).

## Task reasoning

Per task, the response includes:

```json
{
  "summary": "This task is from your active study plan. Preferred task size is small. Your current signals suggest short focused tasks.",
  "user_signal": "...",
  "study_policy_signal": "...",
  "plan_signal": "...",
  "evidence": ["active_study_plan", "persona_snapshot", "study_policy", "task_type_metadata"]
}
```

When inputs are missing the summary degrades to the fixed fallback
string and `evidence` shrinks accordingly. The reasoning is purely
template-driven (no AI). It never claims PYQ trends, official updates,
or "high-yield" topics.

## Safe fallback behavior

- If the persona snapshot doesn't exist, the loader tries to compute
  one; if that also fails, dimensions/policy fall back to empty.
- If the active study plan doesn't exist, `plan = null`, `today_tasks = []`,
  and `preview_flags` includes `no_active_study_plan`.
- If `select_next_question` fails, `progressive_question = null`.
- If anything else raises, the FastAPI handler in `app.api.study_os`
  returns a minimal "degraded" payload tagged with
  `preview_flags: ["mission_control_degraded"]` — the Today page still
  renders.
- On the frontend, if `/api/study/mission-control` fails, Today falls
  back to the legacy `/api/study/plan` shape.

## How persona / study_policy affects the UI

- `study_policy.preferred_task_size = small` →
  task-reasoning copy "Preferred task size is small." +
  `StudyPolicyPreview` highlights it.
- `study_policy.constraints.weekend_catchup_enabled` →
  badge in `StudyPolicyPreview`.
- `dimensions.time_constraint = working_professional` → reasoning copy
  flags work-friendly blocks.
- `dimensions.learning_behavior = mock_avoider` → reasoning + NBA mock
  copy.
- `dimensions.execution_risk = high` → `scores.study_risk` rises;
  truth panel may surface a backlog warning.

The frontend never displays the internal persona label (e.g.
`working_beginner`) as identity copy. The `EngineTrace` component
shows the data pipeline status without naming the user.

## What is intentionally NOT connected yet

- **Plan generation / task creation** — PR3 only reads. Writes still
  go through existing `/api/study/plan/toggle` and `/api/study/tasks/...`
  routes; mission-control composes around them.

## Exam intelligence wiring (PR5)

PR5 introduced the verified-only `exam_intelligence` contract. The
mission-control response now includes:

- A top-level `exam_intelligence` block carrying
  `{available, exam_id, exam_slug, exam_name, verified_topics, verified_pyq_tags, verified_syllabus_mentions}`.
- An `engine_trace` `Exam intelligence` step that flips from
  `not_connected` to `available` only when at least one verified row
  exists for the user's target exam.
- `meta.preview_flags` no longer includes
  `exam_intelligence_not_connected` once verified data is present.

No marketing copy (`high-yield`, `official update`, etc.) appears
anywhere. See `docs/engineering/exam-intelligence-contracts-v1.md`.

## Admin visibility (PR4)

`PR4 adds admin visibility/control for persona question bank,
snapshots, queue, and signal events`. The same `study_policy` block
that mission-control returns to `/app/today` is also surfaced (via
`PersonaStudyPolicyPreview`) inside the admin User Inspector tab so
operators can verify what a user actually sees. See
`docs/engineering/admin-persona-controls-v1.md`.

## Future PRs

- **PR4 — shipped.** Admin persona controls (read-light) for question
  bank, snapshots, queue, and signal events.
- **PR5 (or later) — Exam intelligence integration.** Once an
  admin-reviewed source exists, mission-control adds a new
  `engine_trace` step transitioning from `not_connected` to
  `available` and the task reasoning gains exam-aware bullets.
- **Plan generator / task adaptation.** Generation will live in its
  own module; mission-control will keep composing reads.
