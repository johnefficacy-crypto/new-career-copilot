# Exam Intelligence Data Fill Runbook (Production-Safe)

## Purpose

This runbook defines a safe, repeatable workflow to activate Exam Intelligence for Study OS without faking production truth and without prematurely promoting unverified data into planner-visible channels.

Use this for:
- local/dev demo refresh (SSC CGL demo seed);
- real exam onboarding via reviewed import templates;
- readiness validation before any planner-facing promotion.

## Trust & Review Model (must-follow)

- **Draft / Pending** = ingest stage. Never planner-ready.
- **Reviewed** = human-reviewed for context channels that allow reviewed reads (e.g., competition context can read reviewed/locked).
- **Verified** = required for official policy updates to carry `affects_*` flags and for verified evidence channels.
- **Locked** = planner-ready for topic coverage (`exam_topic_coverage.reviewer_status='locked'`).

Hard rules:
1. Never mark rows `locked` or `verified` without reviewer evidence.
2. Never fabricate official URLs, PYQ questions, or syllabus mentions.
3. Discovery sources (`aggregator`, `research`, `opportunity`) are awareness-only and must not set any `affects_* = true`.

## Minimum Data Required to Activate One Exam

Load in this exact order (foreign keys + downstream readers depend on it):

1. `exam_families`
2. `exams`
3. `exam_cycles`
4. `exam_phases`
5. `subjects`
6. `topics`
7. `topic_aliases`
8. `topic_prerequisites`
9. `exam_phase_sections`
10. `syllabus_documents`
11. `syllabus_topic_mentions`
12. `pyq_sources`
13. `pyq_papers`
14. `pyq_questions`
15. `pyq_options`
16. `pyq_question_topic_tags`
17. `exam_topic_coverage`
18. `exam_competition_metrics`
19. `exam_policy_updates`
20. Optional user seed: `profiles.target_exam`, `user_topic_mastery`, `user_topic_error_patterns`

## Safe Fill Workflow

### 1) Create import SQL from template
- Start with `app/supabase/seeds/templates/exam_intelligence_import_template.sql`.
- Keep defaults at `draft` / `pending` trust states.
- Use idempotent inserts (`on conflict do nothing` or explicit upsert logic with guarded `where` clauses).

### 2) Fill evidence-first
- Insert official syllabus + mentions with source URL and fetched date/hash notes.
- Insert PYQ sources/papers/questions/tags with explicit trust status.
- Ensure tag verification is tracked independently from question verification.

### 3) Add coverage only after evidence exists
- Add `exam_topic_coverage` initially as `reviewed` or `pending`.
- Promote to `locked` only after reviewer confirms evidence chain (syllabus or verified PYQ, or documented admin review rationale).

### 4) Add competition and policy context safely
- `exam_competition_metrics`: keep `reviewed`/`pending` until validated.
- `exam_policy_updates`:
  - only `source_type='official'` + `reviewer_status='verified'` may carry `affects_* = true`;
  - discovery rows keep all `affects_* = false`.

### 5) Validate readiness before planner activation
Run:

```bash
python app/backend/scripts/validate_exam_intelligence_seed.py --exam-slug <exam-slug>
python app/backend/scripts/validate_exam_intelligence_seed.py --exam-slug <exam-slug> --strict
```

Interpretation:
- Non-strict: prints PASS/WARN/FAIL report, exits 0.
- Strict: exits non-zero if hard failures are present.

## Local/Dev Demo Refresh

The demo seed is intentionally non-production truth and for local/dev exercise only:

```bash
psql "$DATABASE_URL" -f app/supabase/seeds/exam_intelligence_demo_ssc_cgl.sql
python app/backend/scripts/validate_exam_intelligence_seed.py --exam-slug ssc-cgl
```

Do not copy demo literals (URLs, papers, counts) into production imports.

## Real Exam Import (without premature lock)

1. Copy template SQL to a new import file per exam/cycle.
2. Keep all rows at pending/draft defaults.
3. Attach reviewer evidence notes and official links.
4. Run validation script; resolve FAILs/WARNs.
5. Promote statuses in controlled steps:
   - pending → reviewed
   - reviewed → verified (where required)
   - reviewed/verified → locked (coverage only when planner-ready)
6. Re-run strict validation before enabling planner reliance.

## Readiness Gate Summary

Exam can be considered planner-ready only when all are true:
- exam + cycle + phase + taxonomy present;
- locked topic coverage exists and resolves to active topics;
- each locked topic has verified evidence or explicit admin-review rationale;
- PYQ verified counts are based on verified question + verified tag pairs;
- competition rows used for context are reviewed/locked;
- policy rows with `affects_*` true are official+verified;
- discovery policy rows remain non-impacting (`affects_*` all false).
