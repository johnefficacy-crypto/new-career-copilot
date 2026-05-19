# Database Domain Model: Recruitment vs Exam

_Last updated: 2026-04-29_

## Final decision

Career Copilot uses `public.recruitments` as the canonical database table for exam/recruitment notifications.

There is currently no canonical `public.exams` table.

The word `exam` may still be used in frontend/UI copy because aspirants understand terms like `exam summary`, `my exams`, `target exams`, and `exam dashboard`. However, at the database level, these records must map to `public.recruitments`.

## Canonical entity model

Use this mapping consistently:

| Product/UI term | Database table / field |
|---|---|
| Exam | `public.recruitments` |
| Recruitment notification | `public.recruitments` |
| Post / vacancy role | `public.posts` |
| Organization / exam body | `public.organizations` |
| User eligibility result | `public.eligibility_results` |
| Saved/tracked exam | `public.tracked_recruitments` |
| User target exam | `public.user_targets` |
| User activity | `public.user_events` |
| User application/form activity | `public.form_submissions` |

## Naming rule

Frontend and API routes may use `exam` where it improves user clarity.

Allowed examples:

- `/dashboard/exams`
- `/api/exams/summary`
- `ExamSummaryCard`
- `user_exam_summary`

Database joins and foreign keys should use:

- `recruitment_id`
- `public.recruitments`
- `public.posts`
- `public.eligibility_results`

Avoid creating or referencing `public.exams` unless a future architecture decision explicitly introduces a separate exam-master table.

## Migration dependency order

Telemetry must exist before user state views.

Correct order:

```txt
027_user_events_and_form_submissions.sql
028_user_recruitment_state.sql
029_exam_summary_support.sql
```

Reason:

1. `user_recruitment_state` depends on `public.user_events`.
2. `exam_summary` / `user_exam_summary` depends on `public.user_recruitment_state`.
3. `public.exams` does not exist, so exam summary views must be built on `public.recruitments`.

## Do not do this

Do not reference:

```sql
public.exams
```

Do not create a duplicate `public.exams` table just to satisfy old migration code.

Do not use `exam_id` as the main foreign key for new tables.

## Preferred pattern

Use:

```sql
recruitment_id uuid references public.recruitments(id)
```

If legacy compatibility is required, `exam_id` may temporarily exist as a nullable field, but it should not be the source of truth.

## AI / agent instruction

When generating SQL, migrations, APIs, or React components for Career Copilot:

- Treat `recruitments` as the canonical exam/recruitment entity.
- Use `recruitment_id` for joins and foreign keys.
- Use `exam` only as a user-facing label.
- Never assume `public.exams` exists.
- Check migration dependency order before creating views or materialized views.

## Practical project rule

```txt
Database = recruitment
Frontend language = exam
Foreign key = recruitment_id
Avoid = public.exams
```
