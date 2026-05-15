# Study OS Intelligence Contract

_Status: contract draft. Phase 1 of the Admin Persona × Admin Exam Intelligence
iteration. This document defines the joint contract; it does not change
production behavior._

## Purpose

Admin Persona and Admin Exam Intelligence are two independent verified
intelligence layers. This document defines the single, versioned contract
through which they are joined into explainable Study OS actions.

The contract exists so that:

- every Study OS task can be explained (why this, why today, why this topic),
- persona stays internal and never leaks as user-facing identity copy,
- exam intelligence reaches aspirants only after it is verified and locked,
- each layer can degrade independently without breaking `/app/today`.

## The three layers

| Layer | Surface | Source of truth | Failure-safe behavior |
|---|---|---|---|
| Admin Persona Controls | `/admin/persona` | `aspirant_persona_snapshots`, `persona_question_bank`, persona signal events, recompute queue | Planner runs with empty persona; UI shows generic copy, never a label |
| Admin Exam Intelligence Review | `/admin/exam-intelligence` | `syllabus_topic_mention`, `pyq_question_topic_tag`, `pyq_question`, `exam_topic_coverage` (verified/locked only) | Study OS shows progress-only view, no topic intelligence |
| Study OS Intelligence Contract | `/api/study/mission-control`, `/api/study/task-reasoning/:id` | Joined read view of the two layers above + progress + updates | Each section degrades independently; mission-control always returns a renderable shape |

Layers never read each other's internal tables. They communicate only through
the public, versioned shapes below.

## Architecture

```
profile facts ─┐
onboarding ────┤
eligibility ───┤
study history ─┼─► persona classifier (deterministic v1, NO AI) ─► persona snapshot ─┐
focus history ─┤                                                                    │
mock history ──┤                                                                    ▼
exam date ─────┤                                                            study policy
official intel ┘                                                                    │
                                                                                    ▼
exam_topic_coverage (status = 'locked' only) ──────────────► mission-control composition
                                                                                    │
                                                                                    ▼
                                                       GET /api/study/mission-control
                                                       GET /api/study/task-reasoning/:id
```

## GET /api/study/mission-control

Composition rules:

1. Load the latest non-stale persona snapshot. If absent, emit
   `user_context` with `persona_version: "v1"`, empty `dimensions`, empty
   `scores`, and an empty `safe_user_explanation` list.
2. Load the study policy from the snapshot. If absent, return `study_policy`
   as `null` and mark the engine trace `study_policy` row as `missing`.
3. Resolve exam context. `high_yield_topics` is populated **only** from
   `exam_topic_coverage` rows whose `status` is `locked`.
4. `update_context` lists official updates from verified sources only.
   `needs_verification` returns a count, never the unverified text.
5. Build `plan_reasoning[]` so every reason is tagged with
   `reason_type ∈ {persona, exam_intelligence, progress, update}`.
6. `safe_user_explanation[]` is generated from snapshot evidence and never
   reveals raw dimension labels.

Response shape:

```json
{
  "date": "2026-05-14",
  "plan": {
    "id": "...",
    "day": 18,
    "theme": "Arithmetic recovery + English accuracy",
    "target": "SSC CGL 2026 Tier 1"
  },
  "user_context": {
    "persona_snapshot_id": "...",
    "persona_version": "v1",
    "dimensions": {
      "preparation_stage": "repeater",
      "time_constraint": "working_professional",
      "learning_behavior": "high_mock_low_review",
      "motivation_state": "deadline_anxious"
    },
    "scores": {
      "confidence": 0.78,
      "study_risk": 0.64,
      "deadline_urgency": 0.81
    },
    "safe_user_explanation": [
      "Your plan is shorter today because your recent completion rate dropped.",
      "Mock correction is prioritized because your last two mocks had unresolved errors."
    ]
  },
  "exam_context": {
    "exam_id": "...",
    "exam_family": "SSC",
    "exam": "SSC CGL",
    "cycle": "2026",
    "phase": "Tier 1",
    "days_remaining": 68,
    "verified_intelligence_status": "partial",
    "high_yield_topics": [
      {
        "topic": "Percentage",
        "priority_score": 84,
        "confidence_score": 0.78,
        "status": "locked"
      }
    ]
  },
  "update_context": {
    "official_updates": [],
    "needs_verification": [],
    "affects_plan": false,
    "affects_deadline": false,
    "affects_eligibility": false
  },
  "study_policy": {
    "daily_minutes_target": 90,
    "max_tasks_per_day": 4,
    "preferred_task_size": "small",
    "task_mix": {
      "retrieval_practice": 0.3,
      "revision": 0.25,
      "mock_correction": 0.25,
      "concept_learning": 0.2
    },
    "constraints": {
      "avoid_long_theory_blocks": true,
      "require_mock_review_before_next_mock": true
    }
  },
  "today_tasks": [],
  "truth_panel": {},
  "plan_reasoning": [
    { "reason_type": "persona", "summary": "Limited availability and missed tasks reduced today's task count." },
    { "reason_type": "exam_intelligence", "summary": "Percentage is high-priority for SSC CGL Tier 1." },
    { "reason_type": "progress", "summary": "Mock trend is flat, so correction work is prioritized." }
  ]
}
```

The degraded fallback (already shipped in `app/backend/app/api/study_os.py`)
is preserved: any unhandled error returns a minimal renderable shape rather
than failing the Today page.

## GET /api/study/task-reasoning/:task_id

Splits a single task's reasoning into independent signal channels so the UI
can show "why this task" with separated evidence.

```json
{
  "task_id": "...",
  "task_title": "35 min Retrieval Quiz · Quant · Percentage",
  "task_type": "retrieval_practice",
  "reasoning": {
    "user_signals": ["recent mock accuracy below threshold", "missed revision twice"],
    "persona_signals": ["working_professional", "high_mock_low_review"],
    "exam_signals": ["Percentage is locked high-yield for SSC CGL Tier 1", "PYQ frequency high"],
    "update_signals": [],
    "planner_action": "retrieval quiz selected over theory"
  },
  "evidence": [
    { "type": "mock", "label": "Last mock Quant accuracy", "value": "52%" },
    { "type": "exam_intelligence", "label": "Topic priority score", "value": 84, "status": "locked" }
  ],
  "safe_user_copy": "This task is prioritized because Percentage is important for your exam and your recent mock shows it needs recall practice."
}
```

Note: `persona_signals` are exposed in the **admin** task-reasoning view only.
The aspirant-facing surface renders `safe_user_copy` and the non-persona
signal channels.

## Joint data contract

```
PersonaSnapshot.v1 ──► StudyPolicy.v1 ──► MissionControl.v1
                                              ▲
ExamTopicCoverage (status = locked) ──────────┘
```

- mission-control reads persona only via the latest-snapshot accessor.
- mission-control reads exam intelligence only via a locked-coverage
  accessor — never raw review-queue tables.
- Any new persona dimension or policy field bumps `persona_version` /
  `policy_version` and is recorded here and in
  `persona-study-policy-contract.md`. Consumers must keep handling the
  previous version for at least one release.

## Trust and safety rules

These rules are enforced in code, not only documented here.

1. Persona never overrides deterministic eligibility results.
2. Persona never overrides official recruitment truth.
3. Persona labels are internal. Only `safe_user_explanation` / `safe_user_copy`
   leave the backend toward aspirants.
4. Exam intelligence reaches users only when its coverage `status` is `locked`.
5. Pending or rejected syllabus / PYQ mappings never reach aspirants.
6. Aggregator updates are discovery-only until an official source is resolved.
7. Study OS must explain every generated task with tagged reasoning.
8. Persona classification v1 is deterministic — no AI.
9. No AI auto-verification of exam intelligence.
10. Every admin override (review / coverage / question-bank patch) is
    auditable.

## Acceptance criteria

1. Existing `/admin/persona` continues to work.
2. Existing `/admin/exam-intelligence` continues to work.
3. Existing Study OS pages continue to work.
4. No persona label is exposed as user identity copy.
5. Persona does not affect eligibility verdicts.
6. Pending exam intelligence does not reach aspirants.
7. The verified-only contract is preserved.
8. Task reasoning separates persona / exam / progress / update signals.
9. mission-control works even if persona or exam intelligence is unavailable.
10. UI handles partial metadata safely.
11. No AI auto-verification is introduced.
12. Build and tests pass.

## Implementation phases

- **Phase 1** — Document this contract and the persona/study-policy
  contract. No production behavior change.
- **Phase 2** — Admin Persona polish: study policy preview in the inspector,
  evidence rendering, safety copy, signal-event filtering.
- **Phase 3** — Admin Exam Intelligence polish: evidence drawers, review
  queue detail, score breakdown, read-only topic coverage preview.
- **Phase 4** — Plan Impact Preview: read-only, no backend writes, no
  planner mutation.
- **Phase 5** — Full `GET /api/study/mission-control` composition plus
  `GET /api/study/task-reasoning/:task_id`.
- **Phase 6** — `/app/today` consumes mission-control; shows why-this-task
  and safe explanations; no raw persona labels.
- **Phase 7** — `/app/study/subjects` shows topic intelligence only when
  verified / locked; otherwise progress-only.

## First PR scope

Documentation plus read-only admin UI polish. No backend endpoints, no
eligibility change, no scraper change, no planner connection to unverified
intelligence, no persona labels exposed to aspirants. See section 13 of the
iteration plan for the exact file list.
