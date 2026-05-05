// lib/scraping/alerts.ts
// Career Copilot — Phase 10
// Generates per-user notification alerts when new matching recruitments appear
// or deadlines are approaching. Designed to run after recruiment promotion.

import { createClient } from "@/utils/supabase/server"

// ── Alert for new recruitment ─────────────────────────────────────────────────
// Called after a recruitment is approved + promoted.
// Finds all users whose eligibility_results contain this recruitment as eligible
// and haven't been alerted yet.

export async function alertUsersForNewRecruitment(recruitmentId: string): Promise<number> {
  const supabase = await createClient()

  // Find eligible users from cache
  const { data: eligibleRows } = await supabase
    .from("eligibility_results")
    .select("user_id")
    .eq("recruitment_id", recruitmentId)
    .eq("is_eligible", true)

  if (!eligibleRows?.length) return 0

  const userIds = eligibleRows.map(r => r.user_id)

  // Batch insert alerts (ignore duplicates via ON CONFLICT DO NOTHING)
  const alerts = userIds.map(uid => ({
    user_id:        uid,
    recruitment_id: recruitmentId,
    alert_type:     "new_match" as const,
  }))

  const { error } = await supabase
    .from("notification_alerts")
    .upsert(alerts, { onConflict: "user_id,recruitment_id,alert_type", ignoreDuplicates: true })

  if (error) console.error("[alerts] alertUsersForNewRecruitment:", error.message)
  return userIds.length
}

// ── Deadline alerts ───────────────────────────────────────────────────────────
// Run daily via a cron-style Supabase Edge Function.
// Alerts users about recruitments closing in 3 days or 1 day.

export async function sendDeadlineAlerts(): Promise<{ threeDay: number; oneDay: number }> {
  const supabase = await createClient()
  const today = new Date()

  const in3Days = new Date(today)
  in3Days.setDate(today.getDate() + 3)
  const in1Day  = new Date(today)
  in1Day.setDate(today.getDate() + 1)

  const format = (d: Date) => d.toISOString().slice(0, 10)

  // Find recruitments closing in exactly 3 days
  const { data: closing3 } = await supabase
    .from("recruitments")
    .select("id")
    .eq("apply_end_date", format(in3Days))
    .eq("status", "open")

  // Find recruitments closing in exactly 1 day
  const { data: closing1 } = await supabase
    .from("recruitments")
    .select("id")
    .eq("apply_end_date", format(in1Day))
    .eq("status", "open")

  let threeDay = 0
  let oneDay   = 0

  for (const r of closing3 ?? []) {
    threeDay += await alertUsersForDeadline(r.id, "deadline_3day", supabase)
  }
  for (const r of closing1 ?? []) {
    oneDay += await alertUsersForDeadline(r.id, "deadline_1day", supabase)
  }

  return { threeDay, oneDay }
}

async function alertUsersForDeadline(
  recruitmentId: string,
  alertType: "deadline_3day" | "deadline_1day",
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  const { data: eligibleRows } = await supabase
    .from("eligibility_results")
    .select("user_id")
    .eq("recruitment_id", recruitmentId)
    .eq("is_eligible", true)

  if (!eligibleRows?.length) return 0

  const alerts = eligibleRows.map(r => ({
    user_id:        r.user_id,
    recruitment_id: recruitmentId,
    alert_type:     alertType,
  }))

  await supabase
    .from("notification_alerts")
    .upsert(alerts, { onConflict: "user_id,recruitment_id,alert_type", ignoreDuplicates: true })

  return eligibleRows.length
}

// ── Get alerts for current user ───────────────────────────────────────────────

export async function getUserAlerts(userId: string, unreadOnly = false, limit = 20) {
  const supabase = await createClient()

  let query = supabase
    .from("notification_alerts")
    .select(`
      *,
      recruitment:recruitments(
        name,
        apply_end_date,
        status,
        organization:organizations(name)
      )
    `)
    .eq("user_id", userId)
    .order("sent_at", { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.eq("is_read", false)

  const { data } = await query
  return data ?? []
}

export async function getUnreadAlertCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("notification_alerts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)
  return count ?? 0
}

export async function markAlertsRead(userId: string, alertIds?: string[]): Promise<void> {
  const supabase = await createClient()
  let query = supabase
    .from("notification_alerts")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)

  if (alertIds?.length) {
    query = query.in("id", alertIds)
  } else {
    query = query.eq("is_read", false)
  }

  await query
}