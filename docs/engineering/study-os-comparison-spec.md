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
- No existing leaderboard / compare / cohort-percentile / trust-tier / mentor-verification module was found in repo search.

Conclusion: build this as a **new Study OS module**, not as a patch.

### Current repo implementation status

Before adding any new tables/routes, integrate with what already ships:

- **Frontend `/app/accountability`** (`app/frontend/src/pages/Accountability.jsx`, registered in `app/frontend/src/routes/appRoutes.jsx`) — already renders suggested partners, study groups, and mentor bookings. Calls `GET /api/accountability/partners`, `POST /api/accountability/partners/request`, `GET /api/accountability/groups`, `POST /api/accountability/groups/join`, `GET /api/accountability/mentors/bookings`. The new spec must **reuse this page as the social-commitment entry point** (or redirect from it to `/app/study/compare` social tabs); do not ship a parallel social page that orphans these flows.
- **Backend accountability router** (`app/backend/app/api/accountability.py`, prefix `/accountability`) — Supabase-backed as of PR #266. Partners/groups delegate to `app.study_os.social_sessions`; mentor bookings write to the real `mentor_bookings` table (migration 099). The placeholder `router_acc` in `placeholders.py` still loads but is shadowed by route order and will be deleted in a follow-up cleanup PR.
- **Existing accountability tables** (migration `019_accountability_telemetry_schema.sql`): `accountability_groups`, `accountability_group_members`, `accountability_partner_requests`, `mentor_bookings`. RLS is enabled on all four but **no policies are defined yet** (rows are inaccessible to authenticated clients today). The new tables proposed below (`study_groups`, `accountability_pairs`, etc.) **must not duplicate these** — either extend the existing tables with the new columns (`group_type`, `exam_phase_id`, `max_members`, `visibility`, etc.) or add a one-time data migration that backfills the new tables and deprecates the old. Pick one explicitly per PR.
- **Existing study tables** that PR 1 aggregates from: `study_sessions` (migration `002`, extended in `009` / `010` with `subject`, `topic`, `duration_minutes`), `study_tasks` (`002`), `mock_tests` + mock review state (migrations `063` / `064`).
- **Persona infra** to feed into (PR 13): `aspirant_persona_snapshots`, `user_signal_events`, `persona_recompute_queue` (migration `052`).
- **Backend module layout**: existing study-OS code lives at `app/backend/app/study_os/*.py` (mastery, mission_control, mocks, planner, …) — the new files (`behavior_scores.py`, `peer_benchmark.py`, …) drop into this same package, not a new top-level module.

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

Schema is split into PR-sized migrations. Each migration ships **one new migration file** under `app/supabase/migrations/`, follows the repo's `if not exists` + `do $$ … $$` policy idiom (see `063_study_os_mocks_analysis.sql`), and ends with `notify pgrst, 'reload schema';`. Migration numbers below are placeholders — use the next free number at PR time.

### PR 1 migration — private behavior analytics

Tables touched: `study_behavior_daily_snapshots`, `study_comparison_settings`, `user_exam_goals`. **No cohort, leaderboard, social or mock-verification tables in this migration.** Self-view only.

```sql
-- 0NN_study_os_behavior_foundation.sql
create table if not exists public.study_behavior_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,

  total_study_minutes int not null default 0 check (total_study_minutes >= 0),
  focus_minutes int not null default 0 check (focus_minutes >= 0 and focus_minutes <= total_study_minutes),
  focus_session_count int not null default 0 check (focus_session_count >= 0),
  avg_focus_session_minutes numeric check (avg_focus_session_minutes is null or avg_focus_session_minutes >= 0),
  active_study_day boolean not null default false,

  planned_tasks int not null default 0 check (planned_tasks >= 0),
  completed_tasks int not null default 0 check (completed_tasks >= 0 and completed_tasks <= planned_tasks),
  missed_tasks int not null default 0 check (missed_tasks >= 0),
  skipped_tasks int not null default 0 check (skipped_tasks >= 0),
  backlog_count int not null default 0 check (backlog_count >= 0),

  mock_count int not null default 0 check (mock_count >= 0),
  mock_review_count int not null default 0 check (mock_review_count >= 0 and mock_review_count <= mock_count),
  correction_tasks_completed int not null default 0 check (correction_tasks_completed >= 0),

  behavior_adherence_score numeric check (behavior_adherence_score is null or behavior_adherence_score between 0 and 1),
  consistency_score numeric check (consistency_score is null or consistency_score between 0 and 1),
  focus_depth_score numeric check (focus_depth_score is null or focus_depth_score between 0 and 1),
  discipline_score numeric check (discipline_score is null or discipline_score between 0 and 1),

  source_trust text not null default 'platform_tracked',
  created_at timestamptz not null default now(),

  unique(user_id, snapshot_date)
);

create table if not exists public.study_comparison_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  comparison_enabled boolean not null default true,
  public_leaderboard_enabled boolean not null default false,
  friends_leaderboard_enabled boolean not null default true,
  visibility text not null default 'private'
    check (visibility in ('private','anonymous','group','public')),
  anonymous_display_name text,
  solo_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_exam_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  exam_phase_id uuid,
  priority_rank int not null check (priority_rank >= 1),
  weekly_weight_pct numeric not null check (weekly_weight_pct >= 0 and weekly_weight_pct <= 100),
  status text not null default 'active' check (status in ('active','paused','completed')),
  target_date date,
  created_at timestamptz not null default now(),
  unique(user_id, exam_id, exam_phase_id)
);
```

### PR 2 migration — exam-specific snapshots

```sql
-- 0NN_study_os_exam_snapshots.sql
create table if not exists public.study_exam_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  snapshot_date date not null,

  planned_tasks int not null default 0 check (planned_tasks >= 0),
  completed_tasks int not null default 0 check (completed_tasks >= 0 and completed_tasks <= planned_tasks),
  planned_minutes int not null default 0 check (planned_minutes >= 0),
  completed_minutes int not null default 0 check (completed_minutes >= 0),

  plan_adherence_score numeric check (plan_adherence_score is null or plan_adherence_score between 0 and 1),
  completion_score numeric check (completion_score is null or completion_score between 0 and 1),
  revision_coverage_score numeric check (revision_coverage_score is null or revision_coverage_score between 0 and 1),
  exam_priority_alignment_score numeric check (exam_priority_alignment_score is null or exam_priority_alignment_score between 0 and 1),

  created_at timestamptz not null default now(),

  unique(user_id, exam_id, exam_cycle_id, exam_phase_id, snapshot_date)
);
```

### PR 3 migration — cohort definition, membership, percentile snapshots

A free-form `cohort_key text` is not enough: we need a stable definition (key + components + min sample) and a membership table so percentile compute is deterministic and auditable.

```sql
-- 0NN_study_os_cohorts.sql
create table if not exists public.study_cohort_definitions (
  cohort_key text primary key,
  exam_id uuid,
  exam_phase_id uuid,
  preparation_stage text,            -- beginner | intermediate | advanced | final_window
  availability_bucket text,          -- '<1h' | '1-2h' | '2-4h' | '4-6h' | '6h+'
  study_mode text,                   -- full_time | working | student | other
  fallback_level int not null default 0
    check (fallback_level between 0 and 3),  -- 0=phase 1=exam 2=family 3=all
  min_sample_size int not null default 30 check (min_sample_size > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.study_cohort_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_key text not null references public.study_cohort_definitions(cohort_key) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(user_id, cohort_key)
);

create table if not exists public.study_cohort_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  cohort_key text not null references public.study_cohort_definitions(cohort_key) on delete cascade,
  metric_key text not null,
  period_type text not null check (period_type in ('daily','weekly','monthly')),
  period_start date not null,
  period_end date not null,

  sample_size int not null check (sample_size >= 0),
  p10 numeric, p25 numeric, p50 numeric, p75 numeric, p90 numeric,

  created_at timestamptz not null default now(),

  unique(cohort_key, metric_key, period_type, period_start, period_end),
  check (period_end >= period_start)
);
```

### PR 4 migration — opt-in behavior leaderboards (group/pair-aware)

Leaderboard subject is **not always a user** — group and partner boards rank a `study_group` row or an `accountability_pair` row. Replace the user-only schema with a tagged-subject pattern, with a check constraint enforcing exactly one of (`user_id`, `group_id`, `pair_id`) is set per row.

```sql
-- 0NN_study_os_leaderboards.sql
create table if not exists public.study_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  board_type text not null
    check (board_type in ('behavior','exam_plan','mock_score','group','partner')),
  subject_type text not null
    check (subject_type in ('user','group','pair')),
  cohort_key text not null,                 -- FK added in PR 3, keep loose here for ordering
  metric_key text not null,

  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid,                            -- FK -> study_groups (PR 6) added there
  pair_id uuid,                             -- FK -> accountability_pairs (PR 8) added there

  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,

  score numeric not null,
  percentile numeric check (percentile is null or percentile between 0 and 100),
  rank int check (rank is null or rank >= 1),
  rank_band text check (rank_band is null or rank_band in ('ahead','on_track','behind')),
  trust_tier text not null
    check (trust_tier in ('tier_1','tier_1_5','tier_2','tier_3')),

  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),

  check (period_end >= period_start),
  check (
    (subject_type = 'user'  and user_id  is not null and group_id is null and pair_id is null) or
    (subject_type = 'group' and group_id is not null and user_id  is null and pair_id is null) or
    (subject_type = 'pair'  and pair_id  is not null and user_id  is null and group_id is null)
  )
);
```

### PR 5 migration — mock verification

```sql
-- 0NN_study_os_mock_verification.sql
create table if not exists public.mock_score_verification (
  id uuid primary key default gen_random_uuid(),
  mock_test_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,

  verification_tier text not null default 'tier_3'
    check (verification_tier in ('tier_1','tier_1_5','tier_2','tier_3')),
  attester_role text check (attester_role is null or attester_role in ('provider','admin','mentor','partner','self')),
  attested_by uuid references public.profiles(id),
  evidence_url text,
  provider_name text,
  provider_attempt_id text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')),

  verified_score numeric,
  verified_max_score numeric check (verified_max_score is null or verified_max_score > 0),
  confidence_score numeric check (confidence_score is null or confidence_score between 0 and 1),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id),

  check (verified_score is null or verified_max_score is null or verified_score <= verified_max_score),
  unique(mock_test_id, user_id)
);
```

### PR 6 migration — study groups + group sessions

> **Reuse note:** `accountability_groups` / `accountability_group_members` already exist (migration `019`). Either (a) `alter table` to add the new columns and rename, or (b) introduce `study_groups` / `study_group_members` and write a one-time data migration that copies rows over and points the `/api/accountability/groups*` placeholder router at the new tables. **Do not run both schemas in parallel.** PR 6 must choose one explicitly in its description.

```sql
-- 0NN_study_os_social_groups.sql
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_type text not null default 'behavior'
    check (group_type in ('behavior','exam_specific')),
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  max_members int not null default 8 check (max_members between 2 and 50),
  visibility text not null default 'private'
    check (visibility in ('private','invite','public')),
  created_by uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  check (group_type = 'behavior' or exam_id is not null)
);

create table if not exists public.study_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin','owner')),
  status text not null default 'active' check (status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  unique(group_id, user_id)
);

create table if not exists public.social_study_sessions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('group','partner','mentor')),
  group_id uuid references public.study_groups(id) on delete cascade,
  partner_pair_id uuid,           -- FK added in PR 8
  mentor_session_id uuid,
  exam_id uuid,
  exam_cycle_id uuid,
  exam_phase_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  planned_minutes int check (planned_minutes is null or planned_minutes >= 0),
  verified_presence_minutes int default 0 check (verified_presence_minutes >= 0),
  verified_focus_minutes int default 0
    check (verified_focus_minutes >= 0 and verified_focus_minutes <= verified_presence_minutes),
  trust_source text not null
    check (trust_source in ('platform_verified','mentor_verified','group_focus_checked','group_presence','partner_costudy','solo_timer','screenshot','self_claimed')),
  trust_weight numeric not null default 0.6 check (trust_weight between 0 and 1),
  created_at timestamptz not null default now(),
  check (
    (session_type = 'group'   and group_id is not null) or
    (session_type = 'partner' and partner_pair_id is not null) or
    (session_type = 'mentor'  and mentor_session_id is not null)
  )
);

create table if not exists public.social_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.social_study_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz check (left_at is null or joined_at is null or left_at >= joined_at),
  presence_minutes int default 0 check (presence_minutes >= 0),
  focus_check_passed int default 0 check (focus_check_passed >= 0),
  focus_check_total int default 0 check (focus_check_total >= focus_check_passed),
  prepared boolean,
  completed_declared_task boolean,
  attendance_status text not null default 'present'
    check (attendance_status in ('present','partial','absent','left_early')),
  created_at timestamptz not null default now(),
  unique(session_id, user_id)
);

-- back-fill FK declared in PR 4
alter table public.study_leaderboard_entries
  add constraint study_leaderboard_entries_group_id_fkey
  foreign key (group_id) references public.study_groups(id) on delete cascade;
```

### PR 7 migration — trust-adjusted hours source breakdown

Leaderboards must **show source breakdown** ("8h group focus-checked, 4h solo, 6.5h self-logged"). Storing only `total_study_minutes` + `source_trust` collapses that to one bucket per day. Add a per-source row table so the breakdown is a join, not a re-derivation.

```sql
-- 0NN_study_os_trust_breakdown.sql
create table if not exists public.study_behavior_source_breakdown (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  source text not null
    check (source in ('platform_verified','mentor_verified','group_focus_checked','group_presence','partner_costudy','solo_timer','screenshot','self_claimed')),
  raw_minutes int not null default 0 check (raw_minutes >= 0),
  trust_weight numeric not null check (trust_weight between 0 and 1),
  trust_adjusted_minutes numeric generated always as
    (raw_minutes * trust_weight) stored,
  created_at timestamptz not null default now(),

  unique(user_id, snapshot_date, source),
  foreign key (user_id, snapshot_date)
    references public.study_behavior_daily_snapshots(user_id, snapshot_date)
    on delete cascade
);

-- requires composite unique on the parent for the FK above
alter table public.study_behavior_daily_snapshots
  add constraint study_behavior_daily_snapshots_user_date_key
  unique using index study_behavior_daily_snapshots_user_id_snapshot_date_key;

-- denormalised totals on the parent for fast compare-page reads
alter table public.study_behavior_daily_snapshots
  add column if not exists raw_total_minutes int not null default 0
    check (raw_total_minutes >= 0),
  add column if not exists trust_adjusted_minutes numeric not null default 0
    check (trust_adjusted_minutes >= 0);
```

### PR 8 migration — accountability pairs

```sql
-- 0NN_study_os_pairs.sql
create table if not exists public.accountability_pairs (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  pairing_goal text not null
    check (pairing_goal in ('discipline','same_exam','mock_review','revision')),
  exam_id uuid,
  status text not null default 'active' check (status in ('active','paused','ended')),
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique(user_a, user_b, status)
);

-- back-fill FKs declared earlier
alter table public.social_study_sessions
  add constraint social_study_sessions_partner_pair_id_fkey
  foreign key (partner_pair_id) references public.accountability_pairs(id) on delete cascade;

alter table public.study_leaderboard_entries
  add constraint study_leaderboard_entries_pair_id_fkey
  foreign key (pair_id) references public.accountability_pairs(id) on delete cascade;
```

### PR 10 migration — mentor feedback

```sql
-- 0NN_study_os_mentor_feedback.sql
create table if not exists public.mentor_session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  mentee_id uuid not null references public.profiles(id) on delete cascade,
  discipline_rating int check (discipline_rating between 1 and 5),
  preparation_rating int check (preparation_rating between 1 and 5),
  follow_through_rating int check (follow_through_rating between 1 and 5),
  feedback_private jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (mentor_id <> mentee_id)
);
```

---

## RLS, indexes, and check constraints

Every migration above MUST also ship: (1) `alter table … enable row level security;`, (2) the policies listed below, and (3) the listed indexes. Policy creation follows the `do $$ … if not exists … create policy … end $$;` idiom used by `063_study_os_mocks_analysis.sql`.

### RLS policies (per table)

```text
study_behavior_daily_snapshots
  select  : auth.uid() = user_id
  all     : service_role

study_exam_daily_snapshots
  select  : auth.uid() = user_id
  all     : service_role

study_comparison_settings
  select  : auth.uid() = user_id
  insert/update : auth.uid() = user_id with check (auth.uid() = user_id)
  all     : service_role

user_exam_goals
  select/insert/update/delete : auth.uid() = user_id
  all     : service_role

study_cohort_definitions
  select  : authenticated   (read-only catalog)
  all     : service_role

study_cohort_memberships
  select  : auth.uid() = user_id
  all     : service_role

study_cohort_metric_snapshots
  select  : authenticated   (aggregates only, no user_id)
  all     : service_role

study_leaderboard_entries
  select  : (subject_type = 'user'  and auth.uid() = user_id)
         or (subject_type = 'group' and exists (
              select 1 from study_group_members m
              where m.group_id = study_leaderboard_entries.group_id
                and m.user_id = auth.uid()
                and m.status = 'active'))
         or (subject_type = 'pair'  and exists (
              select 1 from accountability_pairs p
              where p.id = study_leaderboard_entries.pair_id
                and (p.user_a = auth.uid() or p.user_b = auth.uid())))
         or (exists (
              select 1 from study_comparison_settings s
              where s.user_id = study_leaderboard_entries.user_id
                and s.public_leaderboard_enabled = true))
  all     : service_role

mock_score_verification
  select  : auth.uid() = user_id
         or auth.uid() = attested_by
  insert  : auth.uid() = user_id with check (auth.uid() = user_id)
  all     : service_role

study_groups
  select  : visibility = 'public'
         or auth.uid() = created_by
         or exists (select 1 from study_group_members m
                    where m.group_id = study_groups.id
                      and m.user_id = auth.uid()
                      and m.status = 'active')
  insert/update : auth.uid() = created_by
  all     : service_role

study_group_members
  select  : auth.uid() = user_id
         or exists (select 1 from study_group_members m2
                    where m2.group_id = study_group_members.group_id
                      and m2.user_id = auth.uid()
                      and m2.status = 'active')
  all     : service_role

social_study_sessions
  select  : member-of-group, member-of-pair, or self (mentor sessions)
  all     : service_role

social_session_attendance
  select  : auth.uid() = user_id
         or member-of-same-session
  all     : service_role

accountability_pairs
  select  : auth.uid() in (user_a, user_b)
  insert/update : auth.uid() in (user_a, user_b)
  all     : service_role

mentor_session_feedback
  select  : auth.uid() in (mentor_id, mentee_id)
  insert  : auth.uid() = mentor_id
  all     : service_role

study_behavior_source_breakdown
  select  : auth.uid() = user_id
  all     : service_role
```

Backfill missing policies on the existing `accountability_*` and `mentor_bookings` tables (migration `019` enabled RLS without policies) — do that as part of PR 6.

### Indexes (per table)

```text
study_behavior_daily_snapshots
  idx_sbds_user_date           (user_id, snapshot_date desc)

study_exam_daily_snapshots
  idx_seds_user_exam_date      (user_id, exam_id, snapshot_date desc)
  idx_seds_exam_phase_date     (exam_id, exam_phase_id, snapshot_date desc)

study_cohort_memberships
  idx_scm_user                 (user_id)
  idx_scm_cohort               (cohort_key)

study_cohort_metric_snapshots
  idx_scms_cohort_metric_period (cohort_key, metric_key, period_type, period_end desc)

study_leaderboard_entries
  idx_sle_board_cohort_period  (board_type, cohort_key, period_end desc, score desc)
  idx_sle_user_period          (user_id, period_end desc)        where subject_type = 'user'
  idx_sle_group_period         (group_id, period_end desc)       where subject_type = 'group'
  idx_sle_pair_period          (pair_id, period_end desc)        where subject_type = 'pair'

mock_score_verification
  idx_msv_user                 (user_id, created_at desc)
  idx_msv_mock                 (mock_test_id)

study_group_members
  idx_sgm_user                 (user_id)
  idx_sgm_group_active         (group_id) where status = 'active'

social_study_sessions
  idx_sss_group_time           (group_id, started_at desc)       where group_id is not null
  idx_sss_pair_time            (partner_pair_id, started_at desc) where partner_pair_id is not null

social_session_attendance
  idx_ssa_user_time            (user_id, created_at desc)

accountability_pairs
  idx_ap_user_a                (user_a) where status = 'active'
  idx_ap_user_b                (user_b) where status = 'active'

study_behavior_source_breakdown
  idx_sbsb_user_date           (user_id, snapshot_date desc)
```

### Check-constraint summary

All `*_score` numerics are constrained to `[0,1]`. All `*_minutes` / `*_count` ints are constrained to `>= 0`. All enum-style text columns have explicit `check (col in (…))` (no free-form strings). `period_end >= period_start` on every period-bounded snapshot. `verified_focus_minutes <= verified_presence_minutes`. `completed_tasks <= planned_tasks`. `mock_review_count <= mock_count`. `focus_check_passed <= focus_check_total`. `user_a <> user_b`, `mentor_id <> mentee_id`. See each table block above for exact constraints.

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

Build **private analytics first**, social layer second, leaderboards last. Do not start with video infra or public boards. Each PR ships one migration file (see "Data model" above) and its corresponding backend + frontend slice.

```text
PR 1   Private behavior analytics — self-view only
       SCOPE LOCK: no cohort, no leaderboard, no social, no mock verification,
                   no public/anonymous surface. Single user reading their own
                   numbers. If a section needs another user's data, it belongs
                   in a later PR.
       - migration: 0NN_study_os_behavior_foundation.sql
           study_behavior_daily_snapshots
           study_comparison_settings
           user_exam_goals
         + RLS owner-select + service_role policies
         + indexes listed above
         + check constraints listed above
       - backend: app/backend/app/study_os/behavior_scores.py
           aggregate from study_sessions, study_tasks, mock_tests, mock_review state
       - API (auth required, owner-only):
           GET  /api/study/compare/me        → behavior index + raw metrics, self only
           GET  /api/study/compare/settings  → study_comparison_settings row
           PUT  /api/study/compare/settings  → update settings
         Do NOT add /cohort, /leaderboard, /titles, /social/* in this PR.
       - frontend: /app/study/compare
           Render only the "My Behavior Score" section. The Cohort, Leaderboards,
           Mock comparison, Titles, Privacy-controls-with-public-toggle, and
           Social sections from the UX list are stubbed/empty in PR 1 and wired
           up in their respective PRs.
       - /app/accountability is untouched in PR 1.

PR 2   Exam-specific snapshots
       - migration: 0NN_study_os_exam_snapshots.sql (study_exam_daily_snapshots)
       - exam-aware compare view; still self only.

PR 3   Cohort percentiles
       - migration: 0NN_study_os_cohorts.sql
           study_cohort_definitions, study_cohort_memberships, study_cohort_metric_snapshots
       - cohort assignment job (writes memberships from user_exam_goals + preferences)
       - anonymous cohort comparison (min sample 30 + fallback ladder)
       - API: GET /api/study/compare/cohort

PR 4   Opt-in behavior leaderboard (users only)
       - migration: 0NN_study_os_leaderboards.sql
           study_leaderboard_entries (subject_type='user' rows only in this PR)
       - system-verified metrics only, no mock score yet
       - API: GET /api/study/leaderboard
       - Privacy: only writes a user row when public_leaderboard_enabled = true.

PR 5   Mock verification tiers
       - migration: 0NN_study_os_mock_verification.sql (mock_score_verification)
       - score trend (private) + tier labels in UI

PR 6   Social trust schema + group sessions
       - migration: 0NN_study_os_social_groups.sql
           study_groups, study_group_members, social_study_sessions, social_session_attendance
         + back-fill FK study_leaderboard_entries.group_id
       - migration choice: extend existing accountability_groups OR copy-and-deprecate
         (see PR 6 reuse note in Data model).
       - replace placeholders.router_acc endpoints (/api/accountability/groups*)
         with Supabase-backed handlers; backfill RLS policies missing from
         migration 019 (groups, group_members, partner_requests, mentor_bookings).
       - manual start/end/check-in, NO video yet.

PR 7   Trust-weighted snapshots
       - migration: 0NN_study_os_trust_breakdown.sql
           study_behavior_source_breakdown (+ raw/trust totals on parent snapshot)
       - trust_weights.py: write per-source rows, recompute parent totals
       - source breakdown surfaced in compare view + leaderboard rows
       - API: GET /api/study/social/trust-breakdown

PR 8   Partner check-ins + reliability
       - migration: 0NN_study_os_pairs.sql
           accountability_pairs + back-fill FKs
           (social_study_sessions.partner_pair_id, study_leaderboard_entries.pair_id)
       - matching + ghosting penalty (private)
       - replace placeholders.router_acc partner endpoints

PR 9   Mock attestation flow
       - link partner/mentor/admin attestations to mock_score_verification

PR 10  Mentor feedback + action items
       - migration: 0NN_study_os_mentor_feedback.sql (mentor_session_feedback)
       - mentor-vouched mock score path → Tier 1
       - replace placeholders.router_acc mentor-booking endpoints

PR 11  Group + pair leaderboards
       - write subject_type in ('group','pair') rows into study_leaderboard_entries
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
       - RLS: non-owner cannot read another user's snapshot / settings
       - leaderboard subject-type check constraint
       - source-breakdown rows sum to parent totals
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
