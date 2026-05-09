export function validateStep(stepId, form) {
  const errors = {};
  const year = new Date().getFullYear();

  if (stepId === "identity") {
    if (!form.name?.trim()) errors.name = "Name is required.";
    if (!form.date_of_birth?.trim()) errors.date_of_birth = "Date of birth is required.";
    if (!form.gender?.trim()) errors.gender = "Gender is required.";
    if (!form.category?.trim()) errors.category = "Category is required.";
    if (!form.state?.trim()) errors.state = "Domicile state is required.";
  }

  if (stepId === "education") {
    if (!form.education_level?.trim()) errors.education_level = "Education level is required.";
    if (!form.qualification?.trim()) errors.qualification = "Qualification is required.";
    if (!form.qualification_year?.toString().trim()) errors.qualification_year = "Passing year is required.";
    if (form.marks_type === "percentage" && !form.percentage?.toString().trim()) errors.percentage = "Percentage is required.";
    if (form.marks_type === "cgpa" && !form.cgpa?.toString().trim()) errors.cgpa = "CGPA is required.";
  }

  if (stepId === "preferences") {
    if (!(form.goal_exams?.length > 0 || form.preferred_sectors?.length > 0)) {
      errors.preferences = "Select at least one target exam family or preferred sector.";
    }
  }

  if (stepId === "study") {
    if (form.weekly_hours_goal !== "" && Number(form.weekly_hours_goal) <= 0) errors.weekly_hours_goal = "Weekly hours goal must be a positive number.";
    if (form.target_exam_year !== "" && Number(form.target_exam_year) < year) errors.target_exam_year = `Target exam year must be ${year} or later.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
