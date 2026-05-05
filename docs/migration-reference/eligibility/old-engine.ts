/**
 * Eligibility Engine — Career Copilot
 *
 * Given a user's full profile and a post's criteria, determines whether
 * the user is eligible and returns a structured result with reasons.
 *
 * This is pure TypeScript — no Supabase imports. All data is passed in,
 * making it fully testable and reusable in both server actions and API routes.
 *
 * Phase 3B additions:
 *  - Rule #1 (age): correct ex-serviceman formula (age − service_years − 3)
 *  - Rule #1 (age): fix PwBD relaxation bug (use Math.max, not +=)
 *  - Rule #2 (education): 'appearing' candidates → is_conditional result
 *  - Rule #5 (domicile): state PSC posts require matching domicile_state
 */

// ─── Input types ─────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string
  dob: string | null
  date_of_birth: string | null
  category: string | null           // general | obc | sc | st | ews
  pwbd_status: string | null
  ex_serviceman: boolean
  service_years: number | null      // Phase 3B: years of military service
  govt_employee: boolean
  domicile_state: string | null
  nationality: string | null
}

export type UserEducation = {
  level: string                     // graduate | postgraduate | phd | diploma | 12th | 10th
  degree: string | null
  stream: string | null
  percentage: number | null
  cgpa: number | null
  is_completed: boolean
}

export type UserExamCredential = {
  exam_key: string
}

export type UserExamAttempts = {
  recruitment_id: string
  attempts_used: number
}

export type AgeCriteria = {
  min_age: number | null
  max_age: number | null
  cutoff_date: string | null
}

export type EducationCriteria = {
  min_qualification_level: string | null
  min_percentage: number | null
  allowed_disciplines: Record<string, unknown> | null
}

export type AttemptLimit = {
  category: string | null           // null means applies to all categories
  max_attempts: number | null
}

export type PostCriteria = {
  post_id: string
  recruitment_id: string
  age_criteria: AgeCriteria | null
  education_criteria: EducationCriteria | null
  attempt_limits: AttemptLimit[]
  org_state: string | null          // Phase 3B: non-null = state PSC post; null = central govt
  required_exam_keys?: string[]
}

// ─── Output types ────────────────────────────────────────────────────────────

export type EligibilityCheckResult = {
  is_eligible: boolean
  is_conditional: boolean           // Phase 3B: true when user is in final year of required edu
  checks: EligibilityCheck[]
  fail_reasons: string[]
}

export type EligibilityCheck = {
  rule: string
  passed: boolean
  detail: string
}

// ─── Education level ordering ─────────────────────────────────────────────────

const EDU_LEVEL_ORDER: Record<string, number> = {
  "10th":         1,
  "12th":         2,
  diploma:        3,
  graduate:       4,
  postgraduate:   5,
  phd:            6,
}

function eduLevelRank(level: string): number {
  return EDU_LEVEL_ORDER[level.toLowerCase()] ?? 0
}

// ─── Age relaxation rules (GoI standard) ─────────────────────────────────────
//
// Returns the number of years to add to max_age for non-ex-serviceman cases.
// Ex-serviceman uses a DIFFERENT formula (see age check below):
//   effective_age = actual_age − service_years − 3
// which is applied directly in the age check, not via this function.
//
// PwBD fix (Phase 3B): previous code used += which double-counted category
// relaxation. Correct values per DOPT OM 2019:
//   General + PwBD : 10 yrs total
//   OBC + PwBD     : 13 yrs total  (NOT 3 + 13 = 16)
//   SC/ST + PwBD   : 15 yrs total  (NOT 5 + 15 = 20)
// Use Math.max so PwBD replaces (rather than stacks on) category relaxation.

/**
 * Map any onboarding category value to the engine's canonical bucket.
 * Central categories: general | obc | sc | st | ews
 * State-specific OBC variants: obc_ncl, vjnt, sebc, sbc, mbc, bc, mbc_dnc, bcm,
 *   cat_2a, cat_2b, cat_3a, cat_3b — all map to "obc"
 * Compound PwBD categories (pwd_obc, pwd_sc_st, pwd_general) — extract the
 *   base reservation bucket; PwBD relaxation is handled separately via pwbd_status.
 */
function normalizeCategory(raw: string | null): "general" | "obc" | "sc" | "st" | "ews" {
  const cat = (raw ?? "general").toLowerCase().trim()

  // OBC variants (central + all mapped states)
  const OBC_VARIANTS = new Set([
    "obc", "obc_ncl",
    // State OBC equivalents
    "vjnt", "sebc", "sbc", "mbc",
    "bc", "mbc_dnc", "bcm",           // Tamil Nadu
    "cat_2a", "cat_2b", "cat_3a", "cat_3b",  // Karnataka
    // Compound PwBD+OBC
    "pwd_obc",
  ])
  if (OBC_VARIANTS.has(cat)) return "obc"

  if (cat === "sc" || cat === "pwd_sc_st") return "sc"
  if (cat === "st")  return "st"
  if (cat === "ews") return "ews"

  // ex_serviceman category value: the ex-serviceman flag is handled separately
  // in the age check (ex_serviceman boolean + service_years). Treat as general here.
  return "general"
}

function getCategoryRelaxationYears(profile: UserProfile): number {
  const cat = normalizeCategory(profile.category)
  let relaxation = 0

  if (cat === "obc")                    relaxation = 3
  if (cat === "sc" || cat === "st")     relaxation = 5
  if (cat === "ews")                    relaxation = 0   // EWS: no age relaxation for central

  // PwBD: total relaxation replaces category relaxation (DOPT OM 2019)
  if (profile.pwbd_status && profile.pwbd_status !== "none") {
    const pwbdTotal = cat === "general" || cat === "ews" ? 10
                    : cat === "obc"                      ? 13
                    :                                      15  // sc / st
    relaxation = Math.max(relaxation, pwbdTotal)
  }

  return relaxation
}

// ─── Core engine ─────────────────────────────────────────────────────────────

export function checkEligibility(
  profile: UserProfile,
  education: UserEducation[],
  examAttempts: UserExamAttempts[],
  examCredentials: UserExamCredential[],
  criteria: PostCriteria
): EligibilityCheckResult {
  const checks: EligibilityCheck[] = []
  let isConditional = false

  // ── 1. Age check ─────────────────────────────────────────────────────────
  if (criteria.age_criteria) {
    const ac = criteria.age_criteria
    const dobStr = profile.dob ?? profile.date_of_birth
    const cutoff = ac.cutoff_date ? new Date(ac.cutoff_date) : new Date()

    if (!dobStr) {
      checks.push({
        rule: "age",
        passed: false,
        detail: "Date of birth not provided — cannot verify age eligibility.",
      })
    } else {
      const dob = new Date(dobStr)
      const ageAtCutoff = Math.floor(
        (cutoff.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      )

      // Ex-serviceman: use the DOPT formula effective_age = age − service_years − 3.
      // This effective age is compared against the upper limit; min age uses actual age.
      // If service_years is unknown, fall back to standard category relaxation.
      let ageForMaxCheck: number
      let relaxationNote: string

      if (profile.ex_serviceman && profile.service_years != null) {
        ageForMaxCheck = ageAtCutoff - profile.service_years - 3
        // Category relaxation (OBC/SC/ST/PwBD) still applies on top
        const catRelaxation = getCategoryRelaxationYears(profile)
        relaxationNote = `ex-serviceman formula: ${ageAtCutoff} − ${profile.service_years} yrs service − 3 = ${ageForMaxCheck}`
          + (catRelaxation > 0 ? ` + ${catRelaxation} yr category relaxation` : "")
        ageForMaxCheck -= catRelaxation   // subtract from effective age (lower is more favourable)
      } else {
        const relaxation = getCategoryRelaxationYears(profile)
        // Ex-serviceman without service_years: grant minimum 3-year relaxation as fallback
        const totalRelaxation = profile.ex_serviceman ? Math.max(relaxation, 3) : relaxation
        ageForMaxCheck = ageAtCutoff - totalRelaxation
        relaxationNote = totalRelaxation > 0
          ? `${totalRelaxation} yr relaxation applied`
          : "no relaxation"
      }

      const effectiveMax = ac.max_age ?? Infinity
      const minOk = ac.min_age === null || ageAtCutoff >= ac.min_age
      const maxOk = ac.max_age === null || ageForMaxCheck <= effectiveMax

      if (!minOk) {
        checks.push({
          rule: "age",
          passed: false,
          detail: `Age ${ageAtCutoff} is below minimum age ${ac.min_age} as of ${ac.cutoff_date ?? "today"}.`,
        })
      } else if (!maxOk) {
        checks.push({
          rule: "age",
          passed: false,
          detail: `Age ${ageAtCutoff} exceeds maximum ${ac.max_age} after ${relaxationNote} as of ${ac.cutoff_date ?? "today"}.`,
        })
      } else {
        checks.push({
          rule: "age",
          passed: true,
          detail: `Age ${ageAtCutoff} is within range (${ac.min_age ?? "—"}–${ac.max_age ?? "—"}; ${relaxationNote}).`,
        })
      }
    }
  }

  // ── 2. Education check ───────────────────────────────────────────────────
  if (criteria.education_criteria) {
    const ec = criteria.education_criteria
    const completedEdu = education.filter((e) => e.is_completed)
    const allEdu = education   // includes in-progress (is_completed=false)

    if (completedEdu.length === 0 && allEdu.length === 0) {
      checks.push({
        rule: "education",
        passed: false,
        detail: "No education records found.",
      })
    } else {
      const requiredRank = ec.min_qualification_level
        ? eduLevelRank(ec.min_qualification_level)
        : 0

      // ── 2a. Check completed education first ──────────────────────────────
      const highestCompleted = completedEdu.length > 0
        ? completedEdu.sort((a, b) => eduLevelRank(b.level) - eduLevelRank(a.level))[0]
        : null

      const completedLevelOk = highestCompleted
        ? eduLevelRank(highestCompleted.level) >= requiredRank
        : false

      // ── 2b. Phase 3B: 'Appearing' candidate check ────────────────────────
      // If completed edu doesn't meet requirement, check if any in-progress
      // edu entry has the required level. If so, mark as conditionally eligible.
      if (!completedLevelOk) {
        const appearingMatch = allEdu.find(
          (e) => !e.is_completed && eduLevelRank(e.level) >= requiredRank
        )
        if (appearingMatch) {
          isConditional = true
          checks.push({
            rule: "education",
            passed: false,   // not fully eligible yet
            detail: `Conditionally eligible: currently appearing in ${appearingMatch.level} `
              + `(${appearingMatch.degree ?? "degree not specified"}). `
              + `Full eligibility confirmed on completion of ${ec.min_qualification_level ?? "required qualification"}.`,
          })
        } else {
          // No completed AND no appearing match — genuinely ineligible
          const detail = highestCompleted
            ? `Education level ${highestCompleted.level} is below required ${ec.min_qualification_level}.`
            : "No completed education meets the requirement."
          checks.push({ rule: "education", passed: false, detail })
        }
      } else {
        // Completed education meets level requirement — check marks and discipline
        const edu = highestCompleted!

        let marksOk = true
        let marksDetail = ""
        if (ec.min_percentage) {
          const userPct = edu.percentage
            ?? (edu.cgpa ? edu.cgpa * 10 : null)

          if (userPct === null) {
            marksOk = false
            marksDetail = `Minimum ${ec.min_percentage}% required but marks not recorded.`
          } else if (userPct < ec.min_percentage) {
            marksOk = false
            marksDetail = `Score ${userPct}% is below the required ${ec.min_percentage}%.`
          } else {
            marksDetail = `Score ${userPct}% meets the required ${ec.min_percentage}%.`
          }
        }

        let disciplineOk = true
        let disciplineDetail = ""
        if (ec.allowed_disciplines && Object.keys(ec.allowed_disciplines).length > 0) {
          const allowed = ec.allowed_disciplines as Record<string, string[]>
          const userStream = edu.stream?.toLowerCase() ?? ""
          const userDegree = edu.degree?.toLowerCase() ?? ""

          const allAllowed = Object.values(allowed).flat().map((d) => d.toLowerCase())
          const matched = allAllowed.some(
            (d) => userStream.includes(d) || userDegree.includes(d)
          )

          if (!matched) {
            disciplineOk = false
            disciplineDetail = `Your stream/degree (${edu.stream ?? edu.degree ?? "unknown"}) is not in the allowed disciplines.`
          } else {
            disciplineDetail = `Discipline ${edu.stream ?? edu.degree} is accepted.`
          }
        }

        const passed = marksOk && disciplineOk
        const details = [
          `Education level ${edu.level} meets requirement of ${ec.min_qualification_level ?? "any"}.`,
          marksDetail,
          disciplineDetail,
        ].filter(Boolean).join(" ")

        checks.push({ rule: "education", passed, detail: details })
      }
    }
  }

  // ── 3. Attempt limit check ───────────────────────────────────────────────
  if (criteria.attempt_limits.length > 0) {
    const userCategory = profile.category?.toLowerCase() ?? "general"
    const userAttemptRecord = examAttempts.find(
      (a) => a.recruitment_id === criteria.recruitment_id
    )
    const attemptsUsed = userAttemptRecord?.attempts_used ?? 0

    const applicableLimit =
      criteria.attempt_limits.find(
        (l) => l.category?.toLowerCase() === userCategory
      ) ??
      criteria.attempt_limits.find((l) => l.category === null) ??
      null

    if (applicableLimit?.max_attempts !== null && applicableLimit !== null) {
      const maxAttempts = applicableLimit.max_attempts!
      const passed = attemptsUsed < maxAttempts

      checks.push({
        rule: "attempts",
        passed,
        detail: passed
          ? `${attemptsUsed} of ${maxAttempts} attempts used.`
          : `Attempt limit reached: ${attemptsUsed}/${maxAttempts} for category ${userCategory}.`,
      })
    }
  }

  // ── 4. Required exam credential check ───────────────────────────────────
  if (criteria.required_exam_keys && criteria.required_exam_keys.length > 0) {
    const userKeys = new Set(examCredentials.map((c) => c.exam_key.toLowerCase().trim()))
    const missing = criteria.required_exam_keys.filter((key) => !userKeys.has(key.toLowerCase().trim()))

    checks.push({
      rule: "exam_credential",
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `Required exam credentials present (${criteria.required_exam_keys.join(", ")}).`
        : `Missing required exam credentials: ${missing.join(", ")}.`,
    })
  }

  // ── 4. Nationality check (basic) ─────────────────────────────────────────
  {
    const nat = profile.nationality?.toLowerCase() ?? "indian"
    const passed = nat === "indian"
    checks.push({
      rule: "nationality",
      passed,
      detail: passed ? "Indian nationality confirmed." : "Only Indian nationals are eligible.",
    })
  }

  // ── 5. Domicile / state PSC check (Phase 3B) ─────────────────────────────
  // Only applies when the recruiting organization is a state-level body
  // (org_state is non-null). Central govt posts skip this check entirely.
  if (criteria.org_state) {
    const userState = profile.domicile_state?.toLowerCase().trim() ?? ""
    const postState = criteria.org_state.toLowerCase().trim()
    const passed = userState === postState

    checks.push({
      rule: "domicile",
      passed,
      detail: passed
        ? `Domicile state ${profile.domicile_state} matches the recruiting state.`
        : `This post is for ${criteria.org_state} domicile only. `
          + `Your domicile state is ${profile.domicile_state ?? "not set"}.`,
    })
  }

  // ── Aggregate result ─────────────────────────────────────────────────────
  const failedChecks = checks.filter((c) => !c.passed)

  // A result is eligible only if ALL checks passed (no fails at all).
  // A result is conditional if the ONLY failure is the 'appearing' education check.
  const isEligible = failedChecks.length === 0

  // If the result was already marked conditional by the education check,
  // verify no OTHER checks failed. If other checks also failed, it's just ineligible.
  const nonEduFailures = failedChecks.filter((c) => c.rule !== "education" && c.rule !== "exam_credential")
  const finalConditional = isConditional && nonEduFailures.length === 0 && !isEligible

  return {
    is_eligible: isEligible,
    is_conditional: finalConditional,
    checks,
    fail_reasons: failedChecks.map((c) => c.detail),
  }
}

// ─── Batch engine — run against multiple posts ────────────────────────────────

export type BatchEligibilityResult = {
  post_id: string
  recruitment_id: string
  result: EligibilityCheckResult
}

export function checkEligibilityBatch(
  profile: UserProfile,
  education: UserEducation[],
  examAttempts: UserExamAttempts[],
  examCredentials: UserExamCredential[],
  postCriteriaList: PostCriteria[]
): BatchEligibilityResult[] {
  return postCriteriaList.map((criteria) => ({
    post_id: criteria.post_id,
    recruitment_id: criteria.recruitment_id,
    result: checkEligibility(profile, education, examAttempts, examCredentials, criteria),
  }))
}
