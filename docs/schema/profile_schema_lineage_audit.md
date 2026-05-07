# P0 Schema Lineage Audit (Pre-Progressive Profile)

_Date: 2026-05-07_

## Scope & Inputs

This audit compares:
1. **Live canonical schema snapshot** from `app/docs/supabase -Schema.md`.
2. **Current `ccp-mainbuild-v1` assumptions** in backend (`canonical.py`, eligibility runner/schemas) and frontend onboarding/profile pages.
3. **Reference project guidance** requested from `career-copilot` paths.

### Reference-project availability note
The requested reference files (`types/onboarding.ts`, `types/aspirant.types.ts`, onboarding actions/pages under `career-copilot`) are **not present in this repository checkout**. Only product docs under `docs/product/**` and migration/history docs are available. Therefore, “career-copilot reference field” below is inferred from:
- existing comments in backend that explicitly mention TS reference parity, and
- domain-language in product docs/migration history.

---

## Schema Drift Summary

### Key finding
`ccp-mainbuild-v1` currently mixes two profile models:
- **Legacy flat profile model** (many fields written/read from `profiles` directly: qualification/percentage/goals/hours/year).
- **Normalized aspirant model** already present in live schema (`aspirant_education`, `aspirant_certifications`, `aspirant_experience`, `aspirant_preferences`, etc.).

### Highest-risk drift
1. **Frontend writes fields not represented in backend `ProfileUpdate` or `_PROFILE_COLS`** (`qualification`, `percentage`, `target_exam_year`, `onboarded`). These are sent in onboarding/profile PUTs but are not canonical in live schema usage.
2. **DOB duplication** (`dob` and `date_of_birth`) exists in live schema and backend uses both; completion checker only requires `date_of_birth`, while eligibility engine reads `dob || date_of_birth`.
3. **Exam attempts table mismatch**:
   - Live schema lists `aspirant_exam_attempts`.
   - Eligibility runner reads `user_exam_attempts`.
4. **Goal exam duplication**:
   - Frontend sends `goal_exams` (list).
   - `profiles` has `target_exam` (scalar).
   - `aspirant_preferences` has `target_exams` (array) — likely canonical for multi-select.
5. **State/domicile duplication**:
   - Frontend uses `state` and backend maps it to `domicile_state`.
   - Also separate `aspirant_location.state` exists.

---

## Canonical Mapping Table

| Concept | Live table | Live columns (current) | ccp-mainbuild-v1 frontend field | ccp-mainbuild-v1 backend field | career-copilot reference field (available/inferred) | Decision |
|---|---|---|---|---|---|---|
| Base identity | `profiles` | `id, full_name, phone, gender, nationality, avatar_url, plan_id, onboarding_*` | `name, phone, gender` | `full_name/name, phone, gender` | “single user profile root” (inferred) | **Keep** in `profiles` |
| Reservation basics | `profiles` + `aspirant_reservations` | `category, pwbd_status, ex_serviceman, service_years` (+ detailed reservation flags in `aspirant_reservations`) | `category` | `category, pwbd_status, ex_serviceman, service_years` | deterministic eligibility relies on reservation dims (docs/history) | **Keep + Map** (short-term in `profiles`, long-term richer flags in `aspirant_reservations`) |
| Domicile | `profiles` and `aspirant_location` | `domicile_state` ; `aspirant_location.state,district,...` | `state` | `state -> domicile_state` mapping | domicile used by eligibility engine (inferred from engine docs/code) | **Map** to `profiles.domicile_state` now; avoid dual-writes for now |
| DOB | `profiles` | `dob`, `date_of_birth` | `date_of_birth` | both accepted; engine checks `dob or date_of_birth` | DOB required by eligibility (docs/history + runner parity) | **Migrate (logical)**: choose one canonical write target (`date_of_birth`), maintain read fallback |
| Education rows | `aspirant_education` | `level, degree, stream, institution, university, graduation_year, percentage, cgpa, is_completed` | `qualification, qualification_year, percentage` | currently coerces `qualification_year -> graduation_year` in `profiles` patch; no row insert | runner reads `aspirant_education` | **Map/Migrate** to row-based table; stop treating as profile scalar |
| Certifications | `aspirant_certifications` | `certification_name, issuing_body, year_completed, is_active` | none currently | none currently | aspirant-domain entity (inferred) | **Keep (future use)** |
| Experience | `aspirant_experience` | `sector, role, organization, start_date, end_date, years_experience` | none currently | none currently | aspirant-domain entity (inferred) | **Keep (future use)** |
| Preferences (exam/state/sector) | `aspirant_preferences` | `target_exams[], preferred_states[], preferred_sectors[], willing_to_relocate, study_mode, study_hours_per_day` | `goal_exams`, `weekly_hours_goal` | `goal_exams` accepted in schema but not stored canonically; `weekly_hours_goal` treated as profile completion field | runner reads `aspirant_preferences.target_exams` | **Migrate**: write goals to `target_exams`; weekly rhythm to study profile/preferences |
| Study rhythm | (proposed) `aspirant_study_profile` (not in schema yet) or temporary `aspirant_preferences` | currently `study_mode`, `study_hours_per_day` in preferences | `weekly_hours_goal` | `weekly_hours_goal` | plan/rhythm domain in product docs | **Map** to existing `aspirant_preferences` for now; defer new table to later migration |
| Exam attempts | `aspirant_exam_attempts` | `exam_id, attempts_used` | none | runner currently queries `user_exam_attempts` | attempts dimension in eligibility domain | **Migrate/Fix code**: runner should read live canonical table |
| Application lifecycle | `user_recruitment_applications` | status/application metadata columns | tracker UI | tracker endpoints already use this table | lifecycle entity in roadmap/docs | **Keep** canonical |
| Tracked shortlist | `tracked_recruitments` | `user_id,recruitment_id,tracked_at` | save actions | canonical router uses correctly | same concept in historical flow | **Keep** canonical |
| Eligibility cache | `eligibility_results` | `user_id,recruitment_id,post_id,is_eligible,is_conditional,fail_reasons,computed_at` | dashboard/list status consumers | canonical + runner use this | deterministic source in docs/history | **Keep** canonical |

---

## Duplicate / Overlap Inventory

1. **Qualification vs education rows**
   - Overlap between frontend/profile scalar fields (`qualification`, `qualification_year`, `percentage`) and normalized `aspirant_education` rows.
   - Decision: education belongs in `aspirant_education`.

2. **percentage/cgpa in profiles vs aspirant_education**
   - Live schema clearly places `%/cgpa` in `aspirant_education`.
   - Avoid profile-level `%` writes.

3. **state vs domicile_state**
   - `state` is UI alias; backend maps to `domicile_state`.
   - Keep alias at API boundary only.

4. **date_of_birth vs dob**
   - Both exist and are read by engine.
   - Canonical write should converge on one (`date_of_birth`) with fallback reads until migration.

5. **target_exam vs goal_exams vs target_exams**
   - `target_exam` = scalar in `profiles`.
   - `goal_exams` = frontend multi-select payload.
   - `target_exams[]` = canonical normalized array in `aspirant_preferences`.
   - Decision: canonical should be `target_exams[]`.

6. **study_hours vs weekly_hours_goal**
   - Live has `aspirant_preferences.study_hours_per_day`; frontend/backend use `weekly_hours_goal`.
   - Requires mapping formula or explicit weekly column later.

7. **certification fields**
   - Canonical table exists (`aspirant_certifications`) but not wired in app flows.
   - Safe to defer until Progressive Profile phases.

8. **exam family fields**
   - Exam preference fields split across profile scalar (`target_exam`) and preferences array (`target_exams`).
   - Use normalized array for multi-family targeting.

---

## Fields Safe to Use Now

### Safe (already canonical + used)
- `profiles`: `full_name`, `phone`, `gender`, `category`, `pwbd_status`, `domicile_state`, `nationality`, `ex_serviceman`, `service_years`, `onboarding_step`, `onboarding_completed`.
- `tracked_recruitments`: `user_id`, `recruitment_id`, `tracked_at`.
- `user_recruitment_applications`: current tracker lifecycle fields.
- `eligibility_results`: verdict/cache consumption fields.
- `aspirant_education` read path in eligibility runner.
- `aspirant_preferences.target_exams` read path in eligibility runner.

### Requires migration or compatibility shim
- `dob` vs `date_of_birth` (write convergence).
- `qualification*` + `percentage` from UI/profile PUT into `aspirant_education` row model.
- `goal_exams` from UI into `aspirant_preferences.target_exams`.
- `weekly_hours_goal` into normalized rhythm location (`aspirant_preferences.study_hours_per_day` or future study table).
- Eligibility attempts source from `user_exam_attempts` -> `aspirant_exam_attempts`.

### Fields to avoid for new work (until reconciled)
- New writes to profile scalar education (`qualification`, `percentage`, `qualification_year`) patterns.
- Relying on both `target_exam` and `goal_exams` as truth.
- Writing only `dob` without `date_of_birth` compatibility.

---

## Recommended Canonical Profile Model (P0 decision)

Adopt the following model immediately for Progressive Profile design (without schema add/drop now):

1. `profiles`: base identity/account + minimal eligibility primitives.
2. `aspirant_education`: education rows.
3. `aspirant_certifications`: certificates.
4. `aspirant_experience`: work history.
5. `aspirant_preferences`: exam families, states, sectors, relocation, and temporary study preferences.
6. `aspirant_study_profile`: **deferred** (design target only; no schema change in P0).
7. `user_recruitment_applications`: application lifecycle.

---

## Recommended P2-H Implementation Plan

### P2-H.1 Contract freeze (no schema changes)
- Freeze API contract for onboarding/profile update payloads.
- Introduce backend translation layer:
  - `state -> domicile_state`
  - `goal_exams -> aspirant_preferences.target_exams`
  - education scalar payload -> upsert `aspirant_education` row(s)
  - `weekly_hours_goal` -> mapped temporary storage rule.

### P2-H.2 Read precedence rules
- Profile read endpoints should assemble response from canonical sources with explicit precedence:
  1) normalized aspirant tables,
  2) legacy profile fields fallback.
- Continue dual-read for DOB until migration.

### P2-H.3 Eligibility runner alignment
- Update runner attempts source to `aspirant_exam_attempts` (or provide compatibility adapter that checks both tables in order).
- Keep `aspirant_preferences.target_exams` as primary for exam-family matching.

### P2-H.4 Progressive Profile UI rebinding
- Rebind onboarding/profile forms to the canonical model sections:
  - identity (profiles)
  - education rows (aspirant_education)
  - preferences (aspirant_preferences)
- Keep existing UI labels; change only data binding and payload mapping.

### P2-H.5 Data lineage observability
- Add internal audit logging around profile save transformations (payload->table writes) to detect drift early.
- Add profile completion metrics by canonical group (identity/education/preferences/applications).

### P2-H.6 Post-P0 migration prep (future)
- Plan migration scripts for:
  - backfilling `aspirant_education` from legacy profile scalars,
  - normalizing DOB into one canonical column,
  - deprecating redundant profile scalar fields after safe backfill + release window.

