# Persona & Study Policy Contract

_Status: contract draft. Phase 1 of the Admin Persona × Admin Exam
Intelligence iteration. Defines the persona snapshot shape, deterministic
derivation rules, and the persona → study policy mapping._

## Conceptual model

```
Profile      = facts about the aspirant
Onboarding   = how we collect / update those facts
Persona      = computed interpretation of facts + behavior
Study OS     = actions generated from persona + exam intelligence + progress
```

Persona is a **derived internal intelligence layer**, not a user-selected
label. It is never shown to aspirants as identity copy.

## Persona snapshot v1

Multi-axis. There is no single hardcoded persona label driving behavior;
`primary_persona` is a convenience summary only.

```json
{
  "user_id": "...",
  "persona_version": "v1",
  "primary_persona": "working_repeater",
  "dimensions": {
    "discovery_stage": "targeted_exam_aspirant",
    "eligibility_complexity": "conditional_edge_case",
    "preparation_stage": "repeater",
    "time_constraint": "working_professional",
    "learning_behavior": "high_mock_low_review",
    "motivation_state": "deadline_anxious",
    "resource_constraint": "budget_sensitive",
    "social_preference": "accountability_seeker"
  },
  "scores": {
    "confidence": 0.78,
    "study_risk": 0.64,
    "dropoff_risk": 0.52,
    "deadline_urgency": 0.81,
    "needs_guided_onboarding": 0.7
  },
  "evidence": [
    "weekly_hours_goal <= 10",
    "3 missed tasks in last 7 days",
    "target exam date within 60 days",
    "mock correction completion below 30%"
  ],
  "computed_at": "2026-05-14T00:00:00Z"
}
```

## Persona dimensions

| Dimension | Allowed values |
|---|---|
| `discovery_stage` | `confused_explorer`, `targeted_exam_aspirant`, `multi_exam_optimizer`, `recruitment_specific_applicant` |
| `eligibility_complexity` | `basic_eligibility`, `conditional_edge_case`, `document_sensitive`, `category_relaxation_sensitive`, `experience_or_certification_sensitive` |
| `preparation_stage` | `beginner`, `restarting_aspirant`, `intermediate`, `repeater`, `final_window_aspirant` |
| `time_constraint` | `full_time_aspirant`, `working_professional`, `college_student`, `family_responsibility_high`, `low_availability` |
| `learning_behavior` | `planner_poor_executor`, `hardworking_inefficient`, `mock_avoider`, `high_mock_low_review`, `revision_backlog_heavy`, `consistent_executor` |
| `motivation_state` | `deadline_anxious`, `low_confidence`, `high_intent`, `dropoff_risk`, `social_accountability_seeker` |
| `resource_constraint` | `budget_sensitive`, `free_first`, `paid_guidance_open`, `mentor_needed`, `resource_overloaded` |

## Deterministic derivation rules (v1, no AI)

| Dimension | Inputs | Rule summary |
|---|---|---|
| `discovery_stage` | onboarding goal answers, saved-exam count | one specific exam → `targeted_exam_aspirant`; multiple overlapping → `multi_exam_optimizer`; none chosen → `confused_explorer`; tied to a posting → `recruitment_specific_applicant` |
| `eligibility_complexity` | eligibility engine result class | mirrors the engine's classification; never recomputed by persona |
| `preparation_stage` | months studied, prior attempts | 0 months → `beginner`; gap then resumed → `restarting_aspirant`; prior attempts → `repeater`; exam within final window → `final_window_aspirant` |
| `time_constraint` | `weekly_hours_goal`, employment status | <= 10 h/week + employed → `working_professional`; student flag → `college_student`; very low hours → `low_availability` |
| `learning_behavior` | 30d task completion, mock submit/review ratio, revision adherence | high mocks + low review → `high_mock_low_review`; few/no mocks → `mock_avoider`; revision debt high → `revision_backlog_heavy`; plans but misses → `planner_poor_executor`; steady → `consistent_executor` |
| `motivation_state` | days to target exam, 7d completion rate, engagement delta | exam soon + anxiety signals → `deadline_anxious`; completion collapse → `dropoff_risk`; steady high engagement → `high_intent` |
| `resource_constraint` | marketplace spend, plan tier, explicit answer | no spend + free plan → `budget_sensitive` / `free_first`; explicit mentor ask → `mentor_needed` |

Score formulas (all clamped to `0.0`–`1.0`):

| Score | Formula intent |
|---|---|
| `confidence` | data completeness × signal agreement; low when inputs are sparse or conflicting |
| `study_risk` | weighted blend of missed tasks, revision backlog, low adherence |
| `dropoff_risk` | recent completion-rate decline + engagement-gap length |
| `deadline_urgency` | inverse of days remaining, scaled by preparation_stage |
| `needs_guided_onboarding` | profile-fact incompleteness + `confused_explorer` weighting |

Every snapshot stores its `evidence[]` so any reviewer can replay why a
dimension or score was produced.

## Study policy v1

Derived from the snapshot plus exam context by a pure function
`derive_policy(snapshot, exam_context) -> StudyPolicy`.

```json
{
  "user_id": "...",
  "policy_version": "v1",
  "daily_minutes_target": 90,
  "max_tasks_per_day": 4,
  "preferred_task_size": "small",
  "task_mix": {
    "concept_learning": 0.20,
    "retrieval_practice": 0.30,
    "revision": 0.25,
    "mock_correction": 0.25
  },
  "constraints": {
    "avoid_long_theory_blocks": true,
    "require_mock_review_before_next_mock": true,
    "weekend_catchup_enabled": true,
    "prefer_free_resources": true
  },
  "nudge_style": "direct_non_shaming",
  "reasoning": [
    "limited weekly availability",
    "mock corrections pending",
    "revision backlog high"
  ]
}
```

## Persona → policy mapping

| Persona signal | Policy effect |
|---|---|
| `working_professional` | shorter weekday blocks, weekend catch-up, fewer daily tasks |
| `beginner` | orientation tasks, concept-first plan, low-pressure retrieval |
| `repeater` | reduce theory, increase PYQs, mocks, and error-log review |
| `mock_avoider` | micro-quizzes before full mocks |
| `high_mock_low_review` | block next mock suggestion until correction tasks are done |
| `revision_backlog_heavy` | prioritize spaced revision and recall tasks |
| `deadline_anxious` | show one clear next action; avoid an overloaded dashboard |
| `budget_sensitive` | recommend free resources before paid marketplace resources |
| `conditional_edge_case` | show document checklist and eligibility-risk reminders |
| `multi_exam_optimizer` | build a shared-syllabus plan across overlapping exams |

When dimensions conflict, tie-breaking precedence is:
`deadline_urgency` > `study_risk` > `learning_behavior` > `time_constraint`.

## User-facing copy rules

Persona labels are internal. The aspirant UI shows friendly explanations,
not labels.

- Do **not** show: "You are a planner poor executor."
- Do show: "Your plan was shortened because several tasks were missed
  last week."

The only persona-derived strings that may reach an aspirant are
`safe_user_explanation[]` (mission-control) and `safe_user_copy`
(task reasoning).

## Safety rules

1. Persona never overrides deterministic eligibility.
2. Persona never overrides official recruitment truth.
3. Persona labels are internal and not user-facing identity copy.
4. Persona classification v1 is deterministic — no AI.
5. Admin overrides (question-bank patches, recompute requests) are
   auditable.
6. The User Inspector is read-only with respect to profile facts and
   eligibility — no edits, no overrides from that surface.

## Versioning

Adding or changing a dimension, score, or policy field bumps
`persona_version` / `policy_version`. The change is recorded here and in
`study-os-intelligence-contract.md`. Consumers keep handling the previous
version for at least one release.
