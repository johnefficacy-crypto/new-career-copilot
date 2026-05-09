import { z } from 'zod';
import { parseOptionalNumber, parseYear } from '../../shared/forms/numberParsers';
import { parseDateString, validateDOBRange } from '../../shared/forms/dateParsers';

export const profileSchema = z.object({
  name: z.string().trim().min(1),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  category: z.string().optional(),
  pwbd_status: z.string().optional(),
  state: z.string().optional(),
  nationality: z.string().optional(),
  ex_serviceman: z.boolean().optional(),
  service_years: z.union([z.string(), z.number()]).optional(),
  govt_employee: z.boolean().optional(),
  qualification: z.string().optional(),
  education_level: z.string().optional(),
  stream: z.string().optional(),
  qualification_year: z.union([z.string(), z.number()]).optional(),
  percentage: z.union([z.string(), z.number()]).optional(),
  cgpa: z.union([z.string(), z.number()]).optional(),
  goal_exams: z.array(z.string()).optional(),
  preferred_states: z.array(z.string()).optional(),
  preferred_sectors: z.array(z.string()).optional(),
  willing_to_relocate: z.boolean().optional(),
  study_mode: z.string().optional(),
  weekly_hours_goal: z.union([z.string(), z.number()]).optional(),
  target_exam_year: z.union([z.string(), z.number()]).optional(),
}).superRefine((v, ctx) => {
  if (v.date_of_birth && !validateDOBRange(v.date_of_birth)) ctx.addIssue({ code: 'custom', path: ['date_of_birth'], message: 'Date of birth is out of range' });
  try { parseYear(v.qualification_year); } catch { ctx.addIssue({ code: 'custom', path: ['qualification_year'], message: 'Qualification year is invalid' }); }
});

export function toProfilePayload(formValues) {
  const v = profileSchema.parse(formValues);
  return {
    ...v,
    date_of_birth: parseDateString(v.date_of_birth) || undefined,
    qualification_year: parseYear(v.qualification_year),
    percentage: parseOptionalNumber(v.percentage),
    cgpa: parseOptionalNumber(v.cgpa),
    weekly_hours_goal: parseOptionalNumber(v.weekly_hours_goal),
    target_exam_year: parseOptionalNumber(v.target_exam_year),
    service_years: parseOptionalNumber(v.service_years),
  };
}
