export const ELIGIBILITY_CRITICAL_FIELDS = ["date_of_birth", "category", "graduation_year"];

export const STAGE_ORDER = [
  "apply_now",
  "continue_application",
  "submit_form",
  "prepare_after_submission",
  "monitor_result",
  "complete_profile",
  "check_eligibility",
  "low_priority",
  "closed",
];

export function toDays(value) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function normalizeState(state) {
  return state ? String(state).trim().toLowerCase() : "";
}

export function hasGoalMatch(recruitment, goalExams = []) {
  const goals = new Set((goalExams || []).map((x) => String(x).toLowerCase()));
  const keys = [recruitment?.slug, recruitment?.exam_code, recruitment?.exam_family]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return keys.some((k) => goals.has(k));
}

export function getProfileGaps(user) {
  const profile = user?.profile || {};
  return ELIGIBILITY_CRITICAL_FIELDS.filter((field) => !profile?.[field]);
}

export function scoreRecruitment(recruitment, user, context = {}) {
  const profile = user?.profile || {};
  const app = context?.appByRecruitmentId?.[recruitment.id] || null;
  const missingCritical = getProfileGaps(user);
  const backlogHigh = !!context.backlogHigh;

  const deadlineDays = toDays(recruitment?.apply_end_date);
  const startDays = toDays(recruitment?.apply_start_date);
  const windowClosed = deadlineDays !== null && deadlineDays < 0;
  const windowNotStarted = startDays !== null && startDays > 0;
  const deadlineNear = deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 3;

  const weeklyGoal = Number(profile?.weekly_hours_goal || profile?.weekly_study_capacity || 0);
  const weeklyStudied = Number(context?.studyHoursWeek || 0);
  const lowCapacity = weeklyGoal > 0 && weeklyStudied < weeklyGoal * 0.4;

  const hasEligibility = recruitment?.eligibility?.verdict === "eligible" || recruitment?.eligibility?.eligible === true;
  const isConditional = recruitment?.eligibility?.verdict === "conditional" || recruitment?.eligibility?.conditional === true;

  let score = 0;
  const reasons = [];
  const risks = [];

  if (hasEligibility) {
    score += 30;
    reasons.push("Deterministic eligibility confirmed");
  } else if (isConditional) {
    score += 10;
    reasons.push("Eligibility has conditional checks");
    risks.push("Eligibility is conditional");
  } else {
    risks.push("Eligibility not confirmed yet");
  }

  if (missingCritical.length > 0) {
    score -= 20;
    risks.push(`Missing profile fields: ${missingCritical.slice(0, 2).join(", ")}`);
  }

  if (hasGoalMatch(recruitment, user?.goal_exams)) {
    score += 12;
    reasons.push("Matches your target exams");
  }

  if (normalizeState(profile?.domicile_state) && normalizeState(recruitment?.state) === normalizeState(profile?.domicile_state)) {
    score += 8;
    reasons.push("Matches domicile state");
  }

  if (Array.isArray(profile?.preferred_states) && profile.preferred_states.map(normalizeState).includes(normalizeState(recruitment?.state))) {
    score += 6;
    reasons.push("Matches preferred state");
  }

  if (Array.isArray(profile?.preferred_sectors) && recruitment?.sector) {
    const recruitmentSector = String(recruitment.sector).toLowerCase();
    const inPreferredSector = profile.preferred_sectors
      .map((x) => String(x).toLowerCase())
      .some((sector) => recruitmentSector.includes(sector));
    if (inPreferredSector) {
      score += 6;
      reasons.push("Matches preferred sector");
    }
  }

  if ((recruitment?.vacancies || 0) > 500) {
    score += 4;
    reasons.push("Higher vacancy volume");
  }

  if (recruitment?.saved || app) {
    score += 6;
    reasons.push("Already saved/tracked");
  }

  if (!app?.submitted_at && deadlineNear) {
    score += 10;
    reasons.push("Deadline approaching");
    risks.push("Deadline is near");
  }

  if (windowClosed && !app?.submitted_at) {
    score -= 40;
    risks.push("Application window closed");
  }

  if (app?.clicked_apply_at && !app?.submitted_at) {
    score += 8;
    reasons.push("Application started");
  }

  if (app?.submitted_at) {
    score += 12;
    reasons.push("Application submitted");
  }

  if (backlogHigh) {
    score -= 8;
    risks.push("High study backlog risk");
  }

  if (lowCapacity) {
    score -= 5;
    risks.push("Low weekly study capacity vs goal");
  }

  const appStatus = app?.status || "not_started";
  const submitted = !!app?.submitted_at;

  let recommendation_stage = "check_eligibility";
  let next_action = "Verify deterministic eligibility status before applying.";

  if (windowClosed && !submitted) {
    recommendation_stage = "closed";
    next_action = "Application window closed. Track future cycles.";
  } else if (missingCritical.length > 0) {
    recommendation_stage = "complete_profile";
    next_action = `Complete profile fields: ${missingCritical.join(", ")}.`;
  } else if (!hasEligibility) {
    recommendation_stage = "check_eligibility";
    next_action = "Verify deterministic eligibility status before applying.";
  } else if (submitted) {
    if (windowClosed) {
      recommendation_stage = "monitor_result";
      next_action = backlogHigh ? "Recover backlog while monitoring result notifications." : "Monitor result updates and keep revision steady.";
    } else {
      recommendation_stage = "prepare_after_submission";
      next_action = backlogHigh ? "Recover backlog first, then continue exam preparation." : "Shift from application to preparation strategy.";
    }
  } else if (app?.clicked_apply_at) {
    recommendation_stage = "continue_application";
    next_action = "Complete or update your application status.";
  } else if (appStatus === "in_progress") {
    recommendation_stage = "submit_form";
    next_action = deadlineNear ? "Submit form now — deadline is near." : "Complete and submit your form early.";
  } else if (windowNotStarted) {
    recommendation_stage = "low_priority";
    next_action = "Application window not open yet. Set a reminder for start date.";
  } else {
    recommendation_stage = "apply_now";
    next_action = deadlineNear ? "Apply now — deadline is near." : "Proceed to application and submit early.";
  }

  return {
    ...recruitment,
    match_score: Math.max(0, Math.min(100, score)),
    match_reasons: reasons,
    risk_flags: risks,
    next_action,
    recommendation_stage,
  };
}

export function rankRecruitments(recruitments = [], user, context = {}) {
  return (Array.isArray(recruitments) ? recruitments : [])
    .map((r) => scoreRecruitment(r, user, context))
    .sort((a, b) => (b.match_score - a.match_score) || (STAGE_ORDER.indexOf(a.recommendation_stage) - STAGE_ORDER.indexOf(b.recommendation_stage)));
}

/*
Fixture cases for stage verification:
1) clicked_apply_at && !submitted_at -> continue_application (next_action exact text)
2) status=in_progress && !submitted_at -> submit_form
3) submitted_at && window open -> prepare_after_submission
4) submitted_at && window closed -> monitor_result
5) window closed && !submitted_at -> closed
6) missing critical profile fields -> complete_profile
7) no confirmed eligibility -> check_eligibility
*/
