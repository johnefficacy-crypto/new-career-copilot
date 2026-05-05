/**
 * Eligibility Runner
 *
 * Loads all necessary data from Supabase for a given user,
 * runs the eligibility engine against all active posts,
 * and writes results to the eligibility_results cache table.
 *
 * Called:
 *  - After onboarding completes (first run)             → uses cookie-bound client
 *  - When user updates their profile                    → uses cookie-bound client
 *  - On demand from the dashboard                       → uses cookie-bound client
 *  - By the eligibility-consumer Edge Function          → uses service-role client
 *    (Phase 3B-follow-up: consumer POSTs to
 *     /api/eligibility/recompute which injects a
 *     service-role SupabaseClient into this runner.
 *     That eliminates the duplicate Deno rule engine
 *     and guarantees one source of truth.)
 *
 * Phase 3B changes:
 *  - Fetch organizations.state via posts → recruitments → organizations join
 *  - Map org_state into PostCriteria for domicile check
 *  - Store is_conditional in eligibility_results upsert
 *  - getEligibleRecruitments also returns conditional results
 *
 * Phase 3B follow-up (review fix — P0 eligibility unification):
 *  - Accept an optional injected SupabaseClient so the same engine runs
 *    whether the caller is a Server Action or an Edge Function proxy.
 *  - After writing eligibility_results, also emit notification_alerts for
 *    newly-matched recruitments with trustworthy `explanation` flags.
 *    This replaces the old "broadcast new_match to every onboarded user
 *    with is_eligible=false" behaviour in approveScrapeItem(), which the
 *    code review correctly flagged as over-claiming personalisation.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient as createCookieClient } from "@/utils/supabase/server"
import type { Database } from "@/types/supabase"
import {
  checkEligibilityBatch,
  type PostCriteria,
  type UserProfile,
  type UserEducation,
  type UserExamAttempts,
  type UserExamCredential,
} from "./engine"

/**
 * Run eligibility check for a single user against all open/upcoming posts.
 * Writes results to eligibility_results table AND inserts notification_alerts
 * for recruitments where the user is newly eligible or conditional.
 *
 * @param userId            - user.id from auth.users
 * @param supabaseOverride  - optional client (service-role) — when omitted a
 *                            cookie-bound server client is created (the usual
 *                            in-app path).
 */
export async function runEligibilityForUser(
  userId: string,
  supabaseOverride?: SupabaseClient<Database>,
): Promise<{
  processed: number
  eligible: number
  conditional: number
  alerts_inserted: number
  errors: string[]
}> {
  const supabase = (supabaseOverride ?? (await createCookieClient())) as SupabaseClient<Database>
  const errors: string[] = []

  // ── 1. Load user data ──────────────────────────────────────────────────
  const [profileRes, educationRes, attemptsRes, trackedRes, examCredsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("aspirant_education")
      .select("level, degree, stream, percentage, cgpa, is_completed")
      .eq("user_id", userId),
    supabase
      .from("user_exam_attempts")
      .select("recruitment_id, attempts_used")
      .eq("user_id", userId),
    supabase
      .from("tracked_recruitments")
      .select("recruitment_id")
      .eq("user_id", userId),
    (supabase as unknown as { from: (t: string) => { select: (q: string) => { eq: (k: string, v: string) => Promise<{ data: { exam_key: string }[] | null }> } } })
      .from("aspirant_exam_credentials")
      .select("exam_key")
      .eq("user_id", userId),
  ])

  if (!profileRes.data) {
    return {
      processed: 0,
      eligible: 0,
      conditional: 0,
      alerts_inserted: 0,
      errors: ["Profile not found"],
    }
  }

  const profile = profileRes.data as unknown as UserProfile
  const education = (educationRes.data ?? []) as unknown as UserEducation[]
  const examAttempts = (attemptsRes.data ?? []) as unknown as UserExamAttempts[]
  const examCredentials = (examCredsRes.data ?? []) as unknown as UserExamCredential[]
  const trackedSet = new Set(
    (trackedRes.data ?? []).map((t: { recruitment_id: string }) => t.recruitment_id as string),
  )

  // ── 2. Load all active posts with their criteria + org state ──────────
  // Phase 3B: include organizations(state) so domicile check works.
  // org_state is non-null for state PSC orgs, null for central govt.
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(`
      id,
      recruitment_id,
      recruitments!inner (
        status,
        ingestion_trust_status,
        organizations ( state )
      ),
      age_criteria ( min_age, max_age, cutoff_date ),
      education_criteria ( min_qualification_level, min_percentage, allowed_disciplines ),
      attempt_limits ( category, max_attempts )
    `)
    .in("recruitments.status", ["open", "upcoming"])
    .in("recruitments.ingestion_trust_status", ["legacy", "verified", "manual_override"])

  if (postsError || !posts) {
    return {
      processed: 0,
      eligible: 0,
      conditional: 0,
      alerts_inserted: 0,
      errors: ["Failed to load posts: " + postsError?.message],
    }
  }

  // ── 3. Map to PostCriteria shape ──────────────────────────────────────
  const postCriteriaList: PostCriteria[] = posts.map((p: unknown) => {
    // Supabase returns recruitments as array from !inner join
    const row = p as {
      id: string
      recruitment_id: string
      recruitments: unknown
      age_criteria: unknown
      education_criteria: unknown
      attempt_limits: unknown
    }
    const recruitment = Array.isArray(row.recruitments)
      ? row.recruitments[0]
      : row.recruitments
    const org = Array.isArray((recruitment as { organizations?: unknown })?.organizations)
      ? (recruitment as { organizations: unknown[] }).organizations[0]
      : (recruitment as { organizations?: unknown })?.organizations

    return {
      post_id: row.id,
      recruitment_id: row.recruitment_id,
      age_criteria: (row.age_criteria as PostCriteria["age_criteria"][])?.[0] ?? null,
      education_criteria:
        (row.education_criteria as PostCriteria["education_criteria"][])?.[0] ?? null,
      attempt_limits: (row.attempt_limits as PostCriteria["attempt_limits"]) ?? [],
      org_state: (org as { state?: string | null })?.state ?? null,
    }
  })

  // ── 4. Run batch engine ───────────────────────────────────────────────
  const { data: requiredCreds } = await (supabase as unknown as {
    from: (t: string) => {
      select: (q: string) => { in: (k: string, v: string[]) => Promise<{ data: { recruitment_id: string; exam_key: string }[] | null }> }
    }
  })
    .from("recruitment_required_exam_credentials")
    .select("recruitment_id, exam_key")
    .in("recruitment_id", postCriteriaList.map((p) => p.recruitment_id))

  const requiredMap = new Map<string, string[]>()
  for (const row of (requiredCreds ?? [])) {
    const arr = requiredMap.get(row.recruitment_id) ?? []
    arr.push(row.exam_key)
    requiredMap.set(row.recruitment_id, arr)
  }

  for (const pc of postCriteriaList) {
    pc.required_exam_keys = requiredMap.get(pc.recruitment_id) ?? []
  }

  const results = checkEligibilityBatch(profile, education, examAttempts, examCredentials, postCriteriaList)

  // ── 5. Write results to cache ─────────────────────────────────────────
  const upsertRows = results.map((r) => ({
    user_id: userId,
    post_id: r.post_id,
    recruitment_id: r.recruitment_id,
    is_eligible: r.result.is_eligible,
    is_conditional: r.result.is_conditional,
    fail_reasons: r.result.fail_reasons,
    computed_at: new Date().toISOString(),
  }))

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("eligibility_results")
      .upsert(upsertRows, { onConflict: "user_id,post_id" })

    if (upsertError) {
      errors.push("Cache write failed: " + upsertError.message)
    }
  }

  // ── 6. Emit notification_alerts for matched recruitments (P0 fix) ─────
  // A recruitment is "matched" if ANY of its posts is eligible or conditional
  // for this user. We dedupe to one alert per (user, recruitment). The
  // upsert is idempotent via the unique index on
  // (user_id, recruitment_id, alert_type) so repeat runs don't spam the feed.
  //
  // This is the SINGLE path that produces `new_match` alerts. approveScrapeItem
  // used to broadcast `new_match` to every onboarded user with explanation
  // flags all false — that was the "new match ≠ actually relevant" bug the
  // review flagged. The fix: only the engine's own verdict unlocks an alert.
  const eligibleByRec = new Map<string, boolean>()   // true = eligible, false = conditional only
  for (const r of results) {
    if (r.result.is_eligible) {
      eligibleByRec.set(r.recruitment_id, true)
    } else if (r.result.is_conditional && !eligibleByRec.has(r.recruitment_id)) {
      eligibleByRec.set(r.recruitment_id, false)
    }
  }


  const { data: prefs } = await supabase
    .from("aspirant_preferences")
    .select("target_exams, preferred_sectors")
    .eq("user_id", userId)
    .maybeSingle()

  const { data: recMeta } = await supabase
    .from("recruitments")
    .select("id, name, organizations(type)")
    .in("id", Array.from(eligibleByRec.keys()))

  const targetExams = ((prefs?.target_exams as string[] | null) ?? []).map((x) => x.toLowerCase())
  const preferredSectors = ((prefs?.preferred_sectors as string[] | null) ?? []).map((x) => x.toLowerCase())
  const metaMap = new Map((recMeta ?? []).map((r: { id: string; name?: string | null; organizations?: { type?: string | null } | null }) => [r.id as string, r]))

  let alertsInserted = 0
  if (eligibleByRec.size > 0) {
    const now = new Date().toISOString()
    const alertInserts = Array.from(eligibleByRec.entries()).map(
      ([recruitmentId, isEligibleStrict]) => ({
        user_id: userId,
        recruitment_id: recruitmentId,
        alert_type: "new_match" as const,
        is_read: false,
        priority: 3,
        sent_at: now,
        alert_event_id: null,
        // `event_type` is not a column on notification_alerts — it lives on
        // v_notification_feed. Don't set it here.
        explanation: {
          is_tracked: trackedSet.has(recruitmentId),
          is_eligible: isEligibleStrict === true,
          matched_exam: (() => { const m = metaMap.get(recruitmentId); const n = String(m?.name ?? "").toLowerCase(); return targetExams.some((t) => n.includes(t)); })(),
          matched_sector: (() => { const m = metaMap.get(recruitmentId); const orgType = String((m?.organizations as { type?: string } | null)?.type ?? "").toLowerCase(); return preferredSectors.includes(orgType); })(),
          matched_type: false,
        },
      }),
    )

    const { data: inserted, error: alertErr } = await supabase
      .from("notification_alerts")
      .upsert(alertInserts, {
        onConflict: "user_id,recruitment_id,alert_type",
      })
      .select("id")

    if (alertErr) {
      errors.push("Alert write failed: " + alertErr.message)
    } else {
      alertsInserted = inserted?.length ?? 0
    }
  }

  const eligible = results.filter((r) => r.result.is_eligible).length
  const conditional = results.filter((r) => r.result.is_conditional).length

  return {
    processed: results.length,
    eligible,
    conditional,
    alerts_inserted: alertsInserted,
    errors,
  }
}

/**
 * Get cached eligibility results for a user — for the dashboard feed.
 * Returns posts the user IS eligible for OR conditionally eligible for.
 * Ordered: eligible first, then conditional.
 */
export async function getEligibleRecruitments(userId: string) {
  const supabase = await createCookieClient()

  const { data, error } = await supabase
    .from("eligibility_results")
    .select(`
      post_id,
      recruitment_id,
      is_eligible,
      is_conditional,
      fail_reasons,
      computed_at,
      posts (
        post_name,
        group_type,
        pay_level,
        salary_details ( pay_level, basic_pay_min, basic_pay_max, in_hand_estimate ),
        vacancies ( category, vacancy_count ),
        recruitments (
          name,
          year,
          notification_date,
          apply_start_date,
          apply_end_date,
          status,
          organizations ( name, type )
        )
      )
    `)
    .eq("user_id", userId)
    .or("is_eligible.eq.true,is_conditional.eq.true")   // Phase 3B: include conditional
    .order("is_eligible", { ascending: false })          // eligible first
    .order("computed_at", { ascending: false })

  if (error) return []
  return data ?? []
}

/**
 * Get ALL eligibility results for a user (eligible + conditional + ineligible).
 * Used on the "All Exams" page to show why certain exams don't match.
 */
export async function getAllEligibilityResults(userId: string) {
  const supabase = await createCookieClient()

  const { data, error } = await supabase
    .from("eligibility_results")
    .select(`
      post_id,
      recruitment_id,
      is_eligible,
      is_conditional,
      fail_reasons,
      computed_at,
      posts (
        post_name,
        group_type,
        pay_level,
        recruitments (
          name,
          year,
          apply_end_date,
          status,
          organizations ( name, type )
        )
      )
    `)
    .eq("user_id", userId)
    .order("is_eligible", { ascending: false })
    .order("is_conditional", { ascending: false })

  if (error) return []
  return data ?? []
}
