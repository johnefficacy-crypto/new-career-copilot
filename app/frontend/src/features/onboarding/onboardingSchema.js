import { z } from 'zod';
import { parseOptionalNumber, parseYear } from '../../shared/forms/numberParsers';
import { parseDateString, validateDOBRange } from '../../shared/forms/dateParsers';

const currentYear = new Date().getFullYear();

export const onboardingSchema = z.object({
  name: z.string().trim().min(1),
  date_of_birth: z.string().refine((v) => validateDOBRange(v), 'Enter a valid date of birth'),
  gender: z.string().trim().min(1),
  category: z.string().trim().min(1),
  pwbd_status: z.string().optional(),
  state: z.string().trim().min(1),
  education_level: z.string().trim().min(1),
  qualification: z.string().trim().min(1),
  stream: z.string().optional(),
  qualification_year: z.union([z.string(), z.number()]).optional(),
  marks_type: z.enum(['percentage', 'cgpa']),
  percentage: z.union([z.string(), z.number()]).optional(),
  cgpa: z.union([z.string(), z.number()]).optional(),
  goal_exams: z.array(z.string()).default([]),
  preferred_sectors: z.array(z.string()).default([]),
  preferred_states: z.array(z.string()).default([]),
  willing_to_relocate: z.boolean().default(true),
  study_mode: z.string().optional(),
  weekly_hours_goal: z.union([z.string(), z.number()]).optional(),
  target_exam_year: z.union([z.string(), z.number()]).optional(),
}).superRefine((v, ctx) => {
  try { parseYear(v.qualification_year); } catch { ctx.addIssue({ code: 'custom', path: ['qualification_year'], message: 'Passing year is invalid' }); }
  if (v.marks_type === 'percentage' && parseOptionalNumber(v.percentage) == null) ctx.addIssue({ code: 'custom', path: ['percentage'], message: 'Percentage is required' });
  if (v.marks_type === 'cgpa' && parseOptionalNumber(v.cgpa) == null) ctx.addIssue({ code: 'custom', path: ['cgpa'], message: 'CGPA is required' });
  const weekly = parseOptionalNumber(v.weekly_hours_goal);
  if (weekly != null && weekly <= 0) ctx.addIssue({ code: 'custom', path: ['weekly_hours_goal'], message: 'Weekly hours goal must be positive' });
  const targetYear = parseOptionalNumber(v.target_exam_year);
  if (targetYear != null && targetYear < currentYear) ctx.addIssue({ code: 'custom', path: ['target_exam_year'], message: `Target exam year must be ${currentYear} or later` });
});

export function toOnboardingPayload(formValues) {
  const v = onboardingSchema.parse(formValues);
  return {
    name: v.name || undefined,
    date_of_birth: parseDateString(v.date_of_birth) || undefined,
    gender: v.gender || undefined,
    category: v.category || undefined,
    pwbd_status: v.pwbd_status || undefined,
    state: v.state || undefined,
    qualification: v.qualification || undefined,
    education_level: v.education_level || undefined,
    stream: v.stream || undefined,
    qualification_year: parseYear(v.qualification_year),
    percentage: v.marks_type === 'percentage' ? parseOptionalNumber(v.percentage) : undefined,
    cgpa: v.marks_type === 'cgpa' ? parseOptionalNumber(v.cgpa) : undefined,
    goal_exams: v.goal_exams,
    preferred_states: v.preferred_states,
    preferred_sectors: v.preferred_sectors,
    willing_to_relocate: v.willing_to_relocate,
    study_mode: v.study_mode || undefined,
    weekly_hours_goal: parseOptionalNumber(v.weekly_hours_goal),
    target_exam_year: parseOptionalNumber(v.target_exam_year),
  };
}
