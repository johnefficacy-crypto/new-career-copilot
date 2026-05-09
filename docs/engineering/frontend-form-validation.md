# Frontend form validation foundation (phase 1)

## Scope in this PR
- Added shared parser utilities for numbers and dates.
- Added zod schemas + payload normalizers for onboarding and profile core fields.
- No page migration to `react-hook-form` yet.

## Example valid onboarding payload
```json
{
  "name": "Asha",
  "date_of_birth": "2002-08-14",
  "gender": "female",
  "category": "obc",
  "state": "Karnataka",
  "education_level": "graduate",
  "qualification": "B.Tech",
  "qualification_year": "2024",
  "marks_type": "percentage",
  "percentage": "76.5",
  "goal_exams": ["ssc"],
  "preferred_sectors": ["banking"],
  "preferred_states": ["Karnataka"],
  "willing_to_relocate": true
}
```

## Example invalid onboarding payloads
- `date_of_birth` in the future or too old (before configured DOB min year).
- `qualification_year` outside allowed year range.
- `marks_type="percentage"` without `percentage`.
- `weekly_hours_goal <= 0`.

## Example valid profile core payload
```json
{
  "name": "Ravi",
  "date_of_birth": "1998-01-10",
  "qualification_year": "2020",
  "weekly_hours_goal": "12",
  "target_exam_year": "2027"
}
```

## Planned migration (phase 2)
1. Migrate onboarding form state to `react-hook-form` + `zodResolver`.
2. Migrate profile core sections to the same foundation.
3. Keep certifications/experience/exam attempts on existing state path initially.
4. Add unit tests once frontend test runner is introduced.
