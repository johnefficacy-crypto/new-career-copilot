# Study OS — Comparison, Benchmark & Social Commitment Spec

## Product principle

This is a **Behavior Benchmark Engine**, not an intelligence leaderboard.

Do not say:

> "You are smarter than 80% of aspirants."

Say:

> "Your consistency is ahead of 72% of similar aspirants this week."

Compare only behavior: plan adherence, consistency, task completion, focused minutes, mock review discipline, backlog recovery, correction-task completion, revision regularity, social commitment.

Mock score comparison stays separate and is visibly labelled by trust tier.

Sequence: **private behavior analytics → anonymous cohort benchmark → opt-in leaderboard → persona feedback loop.** Do not start with a public leaderboard or mock-score ranking.

---

## Repo fit

- Persona is already an internal derived layer with `aspirant_persona_snapshots`, `user_signal_events`, `persona_recompute_queue`. It is explicitly backend-owned and not user-facing. Social and benchmark traits can feed into persona without changing core architecture.
- Persona signal collector already reads study tasks, focus sessions, mocks, weekly review, target exams, study preferences, tiny-question answers.
- Classifier already computes execution, consistency, mock engagement, planning, learning-behavior dimensions (`planner_poor_executor`, `high_mock_low_review`, `revision_backlog_heavy`, `consistent_executor`).
- Mock service already persists score, weak topics, error patterns, review state, subject breakdown, correction tasks; correction-task generation is rule-based and explainable.
- `competition_context` in Mission Control is exam/vacancy pressure, **not** peer behavioral comparison.
- No existing leaderboard / compare / study-group / accountability-partner / mentor-verification module was found in repo search.

Conclusion: build this as a **new Study OS module**, not as a patch.

---

## Three-layer comparison model

```text
Layer 1 — Behavior Benchmark
Exam-agnostic. Platform tracked. Pooled once per user.

Layer 2 — Exam Benchmark
Exam-specific. Keyed by exam_id + exam_cycle_id + exam_phase_id.
One board per exam/attempt/cohort.

Layer 3 — Social Commitment
Group, partner, mentor witnessed effort.
Increases trust weight + adds persona signals. Does not replace Layer 1.
```

---

## Cohorts (default for all comparison)

Do not use a global leaderboard as default. Global = optional inspiration only.

Cohort key:

```text
exam_id + exam_phase_id + preparation_stage + availability_bucket + study_mode
```

Examples:

```text
"SSC CGL Tier 1 · final window · 1–2 hrs/day"
"MPSC Group B · working aspirants · beginner/intermediate"
"UPSC Prelims 2026 · full-time · 30+ hrs/wk"
```

Cohort fallback ladder when sample is small:

```text
exam_phase → exam → exam_family → all competitive-exam aspirants
```

- Minimum cohort size: **30**. Below that, show *"Not enough comparable data yet."*
- Do **not** cohort by caste / category / PwBD / income. Those exist for eligibility, never for social comparison.
- Surfaces: global (inspiration), cohort (default), friends/group (social).

---

## Multi-exam handling

Multi-exam aspirants must not be unfairly compared to single-exam aspirants.

Rules:

```text
Behavior metrics: pooled once across all exams.
Plan metrics:     split per exam plan.
Mock metrics:     split per exam / mock type / phase.
```

Attribution of each task/session:

```text
single_exam       → credit to that exam
shared_syllabus   → split credit by goal weight, no double count
general_skill     → behavior only
unassigned        → behavior only
```

Add normalized goal table `user_exam_goals` (see Data model). Credit allocation uses `weekly_weight_pct`.

Useful aggregate:

```text
multi_exam_load = active_exam_count × pending_backlog × days_remaining_pressure
```

Feeds persona as `multi_exam_optimizer` (manages well) or `overloaded_multi_exam_risk` (too many active targets).

Multi-exam dashboard shows:

```text
Overall discipline score
Exam-wise adherence
Shared syllabus efficiency
Switching load
Risk: too many active targets
```

---

## Metrics

### Layer 1 — Behavior

System-verified (high trust):

```text
focus_minutes
focus_session_count
avg_focus_session_minutes
active_study_day
planned/completed/missed/skipped tasks
backlog_count
mock_review_count
correction_tasks_completed
```

Derived scores:

```text
behavior_adherence_score
consistency_score
focus_depth_score
discipline_score
```

### Behavior Index (weighted composite)

```text
Behavior Index =
  25% plan adherence
  20% consistency
  15% focused study minutes
  15% planned task completion
  10% mock review / correction discipline
  10% backlog recovery
   5% revision regularity
```

Each metric ships with raw value + cohort percentile + trust level.

Example payload:

```json
{
  "metric": "consistency",
  "value": 0.71,
  "percentile": 68,
  "cohort": "ssc-cgl-tier-1-working-aspirants",
  "trust_level": "system_verified",
  "explanation": "You studied on 5 of 7 planned days."
}
```

### Layer 2 — Exam

Per exam / cycle / phase:

```text
plan_adherence_score
completion_score
revision_coverage_score
exam_priority_alignment_score
mock score (trust-tiered, see below)
```

### Layer 3 — Social

```text
group_presence_minutes
group_focus_verified_minutes
group_checkin_pass_rate
group_quorum_streak
group_perfect_streak

partner_checkin_rate
partner_mutual_streak
partner_missed_checkins
partner_response_latency
partner_attestation_accuracy
partner_reliability_score

mentor_session_attended
mentor_came_prepared
mentor_follow_through_completed
mentor_action_items_completed
mentor_feedback_uptake
```

---

## Trust tiers

### Mock score tiers

```text
Tier 1   — platform-hosted mock / provider API verified
Tier 1.5 — partner-attested + screenshot + anomaly checks
Tier 2   — screenshot submitted but unverified
Tier 3   — self-reported
```

OCR output is **verification candidate**, not truth. Never mix Tier 1 with self-reported scores on the same board. Each board labels its tier.

### Hours trust hierarchy (weights for trust-adjusted hours)

```text
1.00  platform / provider verified
0.95  mentor / admin verified
0.90  group call, focus-checked
0.75  group call, presence only
0.70  partner co-study
0.60  solo platform timer
0.45  screenshot, unverified
0.25  self-claimed
```

Leaderboard must show **raw hours + trust-adjusted hours + source breakdown**:

```text
18.5 hrs total
13.2 trust-adjusted hrs

Breakdown:
  8.0h  group focus-checked
  4.0h  solo timer
  6.5h  self-logged
```

---

## Study group rules

- Group call hours are **presence hours** unless focus checks are present.
- Focus credit requires lightweight checks:
  ```text
  start intent
  mid-session focus check
  end-session task report
  optional screen/task proof
  ```
- Camera-on alone proves attendance, not attention. Without checks → presence only.
- Two streaks (one-miss should not destroy everyone):
  ```text
  group_quorum_streak  = ≥70% members attended
  group_perfect_streak = all members attended
  ```
- Group titles: *Synced Squad*, *Unbroken Cell*, *Iron Circle*. Avoid *Iron Five* unless group size is fixed.
- Group can be exam-specific (content sync) or mixed (discipline/time-block cohort). User chooses at creation.

---

## Accountability partner rules

- Partner attestation = **Tier 1.5** only with screenshot + anomaly check. Partner word alone is collusion risk.
- Ghosting penalty affects **partner matching only**, never public reputation.
- Partner reliability board is **private / friends-only** by default. Public partner shaming is harmful.
- Pairing goals:
  ```text
  discipline     → cross-exam OK
  same_exam      → content / mock review
  mock_review    → same exam preferred
  revision       → same exam
  ```

---

## Mentor session rules

- Mentor contributes **trust + coaching signals**, never leaderboard rank.
- "Number of mentor sessions" is **not** an achievement. Avoid pay-to-rank optics.
- Mentor can verify a mock score → Tier 1 (mentor/admin verified).
- Mentor session feedback (1–5 on discipline, preparation, follow-through) is **private**, feeds persona internally.
- *Coachable* title is valid **only** when measured by post-feedback action completion:
  ```text
  mentor_action_items_assigned
  mentor_action_items_completed
  plan_changes_followed
  ```

---

## Titles

Behavior:

```text
Plan Keeper        — 90%+ adherence, 60+ days
Deep Focus         — avg focus session > 45 min
Steady             — low variance in daily minutes
Comeback           — broke streak, rebuilt within 3 days, backlog reduced
Mock Reviewer      — high mock review + correction completion
Revision Closer    — revision regularity
Backlog Breaker    — strong backlog recovery
Sustained Effort   — high hours WITH healthy consistency and low variance
```

Replace *Marathoner* with *Sustained Effort*. Volume alone should not earn a title — it rewards burnout.

Social:

```text
Synced Squad / Unbroken Cell / Iron Circle  — group
Reliable / Two-Person Engine                 — partner
Coachable                                    — mentor action completion
```

Do not reward mentor count or raw hours.

---

## Persona traits

Persona stays **internal**. Add new dimensions; do not replace existing logic.

### Internal trait mapping

```text
high adherence + moderate/low hours + high completion
  → efficient_executor

high hours + low adherence + high skipped/missed
  → effort_high_direction_low      (do NOT show as "grinder, unfocused")

high streak + low avg focus duration
  → showing_up_not_deep

avg focus > 45 min + low variance + healthy completion
  → deep_worker

high mock variance + low correction completion
  → mock_unstable

mocks taken high + review_state not_reviewed + corrections incomplete
  → review_avoider

low daily-minutes variance + active_days ≥ target + healthy completion
  → steady_executor

streak broken + resumed within 3 days + backlog reduced
  → comeback_pattern

high group ratio + high attendance
  → team_player

high solo consistency + low social usage
  → self_driven

low solo consistency + high group adherence
  → responds_to_accountability

high missed partner checkins
  → reliability_risk (internal only)

mentor action completion high
  → coachable

high hours + zero social + rising backlog
  → isolated_burnout_risk

multiple active exams + high switching load
  → overloaded_multi_exam_risk
```

### User-facing wording (soft)

```text
"You perform better with structure."
"Group sessions are helping your consistency."
"You are mostly self-driven."
"Your effort is high, but your work is not matching your planned priority."
"You may benefit from a weekly accountability check-in."
```

Forbidden in UI (internal/debug only at most):

```text
flaky · grinder · lone wolf · unreliable · unfocused
```

### Persona JSON additions

```json
{
  "behavior_profile": {
    "execution_efficiency": 0.74,
    "focus_depth": 0.62,
    "plan_alignment": 0.81,
    "mock_pressure_stability": 0.44,
    "recovery_strength": 0.68
  },
  "social_commitment_profile": {
    "group_participation_ratio": 0.42,
    "partner_reliability": 0.81,
    "mentor_feedback_uptake": 0.67,
    "self_driven_score": 0.58,
    "needs_structure_score": 0.72,
    "isolated_risk_score": 0.46
  }
}
```

### New persona signals to extend the collector

```text
relative_consistency_percentile
relative_adherence_percentile
focus_reliability
overplanning_index
backlog_recovery_rate
mock_review_rate
correction_completion_rate
multi_exam_load
```

---

## Leaderboard design

Separate boards. **Never merge into one rank.**

```text
Individual behavior board   (cohort-default, opt-in for public)
Exam plan board             (per exam/cycle/phase)
Mock score board            (per trust tier, never mixed)
Group board
Partner reliability board   (private / friends-only)
```

Use **percentile bands and "ahead / on track / behind"** language, not harsh numeric ranks.

Group leaderboard metrics:

```text
quorum_streak
avg_member_adherence
synced_sessions_count
verified_group_minutes
group_completion_rate
```

---

## UX

New page:

```text
/app/study/compare
```

Sections:

1. **My Behavior Score** — Behavior Index, consistency, adherence, focus, completion, backlog recovery, mock review discipline.
2. **Compared with similar aspirants** — percentile bands, cohort label, soft language.
3. **Leaderboards** — weekly consistency, focus streak, mock review discipline, comeback / backlog recovery, group board.
4. **Mock comparison** — score trend (private), self-reported label, verified label, mock review completion.
5. **Titles** — earned titles + how to earn next.
6. **Privacy controls** — private only / anonymous cohort / opt-in leaderboard nickname / group only.

Do **not** expose internal persona names in UI.

---

## Privacy defaults

```text
comparison_enabled         = true   (self-view only)
public_leaderboard_enabled = false
friends_leaderboard_enabled= true
solo_mode                  = false
visibility                 = private | anonymous | group | public
```

Default user is in cohort comparison + friends/group. Public board is opt-in. Partner board never public.

---

## Data model

### Behavior + benchmark

```sql
create table public.study_behavior_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,

  total_study_minutes int not null default 0,
  focus_minutes int not null default 0,
  focus_session_count int not null default 0,
  avg_focus_session_minutes numeric,
  active_study_day boolean not null default false,

  planned_tasks int not null default 0,
  completed_tasks int not null default 0,
  missed_tasks int not null default 0,
  skipped_tasks int not null default 0,
  backlog_count int not null default 0,

  mock_count int not null default 0,
  mock_review_count int not null default 0,
  correction_tasks_completed int not null default 0,

  behavior_adherence_score numeric,
  consistency_score numeric,
  focus_depth_score numeric,
  discipline_score numeric,

  source_trust text not null default 'platform_tracked',
  created_at timestamptz not null default now(),

  unique(user_id, snapshot_date)
);
```

```sql
create table public.study_exam_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  snapshot_date date not null,

  planned_tasks int not null default 0,
  completed_tasks int not null default 0,
  planned_minutes int not null default 0,
  completed_minutes int not null default 0,

  plan_adherence_score numeric,
  completion_score numeric,
  revision_coverage_score numeric,
  exam_priority_alignment_score numeric,

  created_at timestamptz not null default now(),

  unique(user_id, exam_id, exam_cycle_id, exam_phase_id, snapshot_date)
);
```

```sql
create table public.study_cohort_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  cohort_key text not null,
  metric_key text not null,
  period_type text not null,        -- daily | weekly | monthly
  period_start date not null,
  period_end date not null,

  sample_size int not null,
  p10 numeric, p25 numeric, p50 numeric, p75 numeric, p90 numeric,

  created_at timestamptz not null default now(),

  unique(cohort_key, metric_key, period_type, period_start, period_end)
);
```

```sql
create table public.study_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  board_type text not null,          -- behavior | exam_plan | mock_score | group | partner
  cohort_key text not null,
  metric_key text not null,

  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,

  score numeric not null,
  percentile numeric,
  rank int,
  rank_band text,
  trust_tier text not null,

  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now()
);
```

```sql
create table public.study_comparison_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  comparison_enabled boolean not null default true,
  public_leaderboard_enabled boolean not null default false,
  friends_leaderboard_enabled boolean not null default true,
  visibility text not null default 'private',  -- private | anonymous | group | public
  anonymous_display_name text,
  solo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

```sql
create table public.user_exam_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  exam_phase_id uuid,
  priority_rank int not null,
  weekly_weight_pct numeric not null,
  status text not null default 'active',   -- active | paused | completed
  target_date date,
  created_at timestamptz not null default now()
);
```

### Mock verification

```sql
create table public.mock_score_verification (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,

  verification_tier text not null default 'self_reported',  -- tier_1 | tier_1_5 | tier_2 | tier_3
  attester_role text,                                       -- provider | admin | mentor | partner | self
  attested_by uuid references public.profiles(id),
  evidence_url text,
  provider_name text,
  provider_attempt_id text,
  verification_status text not null default 'unverified',   -- pending | verified | rejected

  verified_score numeric,
  verified_max_score numeric,
  confidence_score numeric,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid
);
```

### Social commitment

```sql
create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_type text not null default 'behavior',   -- behavior | exam_specific
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  max_members int not null default 8,
  visibility text not null default 'private',
  created_by uuid not null references public.profiles(id),
  status text not null default 'active',
  created_at timestamptz not null default now()
);
```

```sql
create table public.study_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  unique(group_id, user_id)
);
```

```sql
create table public.social_study_sessions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null,         -- group | partner | mentor
  group_id uuid,
  partner_pair_id uuid,
  mentor_session_id uuid,
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  planned_minutes int,
  verified_presence_minutes int default 0,
  verified_focus_minutes int default 0,
  trust_source text not null,
  trust_weight numeric not null default 0.6,
  created_at timestamptz not null default now()
);
```

```sql
create table public.social_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.social_study_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  presence_minutes int default 0,
  focus_check_passed int default 0,
  focus_check_total int default 0,
  prepared boolean,
  completed_declared_task boolean,
  attendance_status text not null default 'present',
  created_at timestamptz not null default now(),
  unique(session_id, user_id)
);
```

```sql
create table public.accountability_pairs (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id),
  user_b uuid not null references public.profiles(id),
  pairing_goal text not null,         -- discipline | same_exam | mock_review | revision
  exam_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
```

```sql
create table public.mentor_session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  mentor_id uuid not null references public.profiles(id),
  mentee_id uuid not null references public.profiles(id),
  discipline_rating int check (discipline_rating between 1 and 5),
  preparation_rating int check (preparation_rating between 1 and 5),
  follow_through_rating int check (follow_through_rating between 1 and 5),
  feedback_private jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

---

## Backend modules

```text
app/backend/app/study_os/behavior_scores.py    -- daily snapshot aggregation
app/backend/app/study_os/peer_benchmark.py     -- cohort percentile compute
app/backend/app/study_os/leaderboards.py       -- leaderboard build
app/backend/app/study_os/social_sessions.py    -- group/partner/mentor session lifecycle
app/backend/app/study_os/trust_weights.py      -- trust-adjusted hour calc
app/backend/app/study_os/mock_verification.py  -- attestation flow
```

---

## API surface

### Compare / benchmark

```text
GET  /api/study/compare/me
GET  /api/study/compare/cohort
GET  /api/study/compare/titles
PUT  /api/study/compare/settings

GET  /api/study/leaderboard
```

### Social commitment

```text
GET  /api/study/social/groups
POST /api/study/social/groups
POST /api/study/social/groups/:id/join

POST /api/study/social/sessions/start
POST /api/study/social/sessions/:id/checkin
POST /api/study/social/sessions/:id/end

GET  /api/study/social/partner/me
POST /api/study/social/partner/request
POST /api/study/social/partner/checkin

GET  /api/study/social/compare
GET  /api/study/social/trust-breakdown
```

### Mock verification

```text
POST /api/study/mocks/:id/attest
```

---

## Implementation order

Build **private analytics first**, social layer second, leaderboards last. Do not start with video infra or public boards.

```text
PR 1   Behavior foundation
       - migrations: study_behavior_daily_snapshots, study_comparison_settings, user_exam_goals
       - behavior_scores.py: aggregate from study_tasks, study_sessions, mock_tests
       - API: GET /api/study/compare/me, PUT /api/study/compare/settings
       - Frontend: /app/study/compare → "My Behavior Score" only

PR 2   Exam-specific snapshots
       - study_exam_daily_snapshots
       - exam-aware compare view

PR 3   Cohort percentiles
       - study_cohort_metric_snapshots
       - anonymous cohort comparison (min sample 30 + fallback ladder)

PR 4   Opt-in behavior leaderboard
       - study_leaderboard_entries
       - system-verified metrics only, no mock score yet

PR 5   Mock verification tiers
       - mock_score_verification
       - score trend (private) + tier labels in UI

PR 6   Social trust schema + group sessions
       - study_groups, study_group_members
       - social_study_sessions, social_session_attendance
       - manual start/end/check-in, NO video yet

PR 7   Trust-weighted snapshots
       - integrate social hours into behavior snapshot
       - source breakdown in compare view

PR 8   Partner check-ins + reliability
       - accountability_pairs
       - matching + ghosting penalty (private)

PR 9   Mock attestation flow
       - link partner/mentor/admin attestations to mock_score_verification

PR 10  Mentor feedback + action items
       - mentor_session_feedback
       - mentor-vouched mock score path → Tier 1

PR 11  Group leaderboard
       - quorum/perfect streaks + group titles

PR 12  Video integration + live focus checks
       - start intent, mid-session check, end report
       - graduate group sessions from presence → focus

PR 13  Persona feed-in
       - extend persona signals with new metrics
       - update classifier with new internal dimensions
       - keep persona internal; surface only soft user-facing wording

PR 14  Tests
       - adherence / consistency / mock review discipline calc
       - manual mock score marked low-trust
       - comparison off when user disabled it
       - cohort size fallback
       - multi-exam credit attribution
```

---

## Final rules

```text
1. Compare behavior, not intelligence.
2. Group call hours are PRESENCE unless focus checks exist.
3. Mock score never central. Tier 1 vs self-reported never mixed.
4. Partner attestation is Tier 1.5 only with evidence.
5. Mentor verification can be Tier 1, but mentor count never ranks users.
6. Group uses quorum streak + perfect streak (one miss does not destroy all).
7. Social metrics feed persona privately. No harsh public labels.
8. Trust-adjusted hours must always show source breakdown.
9. Multi-exam: behavior pooled once, plan + mock split per exam.
10. Cohort min sample 30. No caste/income cohorting.
11. Public leaderboards are opt-in. Partner board never public.
12. Persona traits stay internal. User UI uses soft language.
13. Start with private behavior analytics. Public ranking comes last.
```
