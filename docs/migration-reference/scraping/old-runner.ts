// lib/scraping/runner.ts
// Career Copilot — Legacy Phase 10 runner
// NOTE: The primary scraper is now the Deno Edge Function at
//       supabase/functions/scheduled-scraper/index.ts which reads from
//       source_registry. This file is kept for admin-triggered manual scrapes
//       from Next.js server actions only. It still reads from scrape_sources
//       (legacy) — do NOT add new features here; extend the Edge Function.

import { createClient } from "@/utils/supabase/server"
import { fetchPageText, extractRecruitmentData, computeSimilarityKey } from "./extractor"
import type { ExtractedRecruitment } from "@/types/scraping"
import { toJsonSafe } from "@/types/scraping"
import type { Database } from "@/types/supabase"

// ── Derived types ─────────────────────────────────────────────────────────────

type ScrapeSourceRow = Database["public"]["Tables"]["scrape_sources"]["Row"]

// Normalise nullable DB fields to the shape the rest of this file expects.
// is_healthy is boolean | null in the DB; we coerce null → false here.
type ScrapeSource = Omit<ScrapeSourceRow, "is_healthy" | "consecutive_fails" | "trust_score"> & {
  is_healthy:        boolean
  consecutive_fails: number
  trust_score:       number
}

function normaliseSource(row: ScrapeSourceRow): ScrapeSource {
  return {
    ...row,
    is_healthy:        row.is_healthy        ?? false,
    consecutive_fails: row.consecutive_fails ?? 0,
    trust_score:       row.trust_score       ?? 0.7,
  }
}

// ── Json-safe recruitment key ─────────────────────────────────────────────────

function buildRecruitmentKey(orgName: string, year: number | null, name: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
  return `${norm(orgName)}-${year ?? 0}-${norm(name).slice(0, 30)}`
}

// ── Run a full scrape pass for all active sources ─────────────────────────────

export async function runScrapingPass(
  triggeredBy: "scheduled" | "manual" | "admin" = "scheduled",
  triggeredByUserId?: string,
  sourceIds?: string[]
): Promise<string> {
  const supabase = await createClient()

  // Create scrape run record
  const { data: run, error: runErr } = await supabase
    .from("scrape_runs")
    .insert({
      status:       "running",
      triggered_by: triggeredBy,
    })
    .select("id")
    .single()

  if (runErr || !run) throw new Error("runScrapingPass: Failed to create scrape run")
  const runId = run.id

  // Fetch active sources
  // Use select("*") so TypeScript infers the complete ScrapeSourceRow type.
  // A partial column list would exclude `created_at` (and others) from the
  // inferred type, making it incompatible with ScrapeSourceRow and
  // causing the "Types of parameters incompatible" error in .map(normaliseSource).
  // This is legacy code — select("*") is acceptable here.
  let sourceQuery = supabase
    .from("scrape_sources")
    .select("*")
    .eq("is_active", true)
    .order("last_scraped_at", { ascending: true, nullsFirst: true })

  if (sourceIds?.length) {
    sourceQuery = sourceQuery.in("id", sourceIds)
  }

  const { data: rawSources } = await sourceQuery
  const activeSources: ScrapeSource[] = (rawSources ?? []).map(normaliseSource)

  let totalFound    = 0
  let totalNew      = 0
  let totalDuplicate = 0
  const errorLog: { source: string; error: string; at: string }[] = []

  // Get existing recruitment similarity keys for dedup
  const { data: existingRecruitments } = await supabase
    .from("recruitments")
    .select("id, name, year, organizations(name)")
  const existingKeys = new Set<string>()
  const existingMap  = new Map<string, string>()
  for (const r of existingRecruitments ?? []) {
    // organizations is a joined object — cast from Supabase's Json union type
    const orgRow = r.organizations as { name: string } | null
    const key = buildRecruitmentKey(orgRow?.name ?? "", r.year, r.name)
    existingKeys.add(key)
    existingMap.set(key, r.id)
  }

  // Also check existing queue items for dedup
  const { data: queuedItems } = await supabase
    .from("scrape_queue")
    .select("extracted_data, status")
    .not("status", "in", '("rejected","duplicate")')
  const queuedKeys = new Set<string>()
  for (const item of queuedItems ?? []) {
    // extracted_data is jsonb — narrow via type guard before using as ExtractedRecruitment
    const d = item.extracted_data
    if (
      d !== null &&
      typeof d === "object" &&
      !Array.isArray(d) &&
      typeof (d as Record<string, unknown>).organization_name === "string"
    ) {
      queuedKeys.add(computeSimilarityKey(d as unknown as ExtractedRecruitment))
    }
  }

  // Process each source
  for (const source of activeSources) {
    const targetUrl = source.base_url + (source.notification_path ?? "")

    try {
      const rawText = await fetchPageText(targetUrl)
      if (!rawText) {
        errorLog.push({ source: source.name, error: "Empty response", at: new Date().toISOString() })
        continue
      }

      const result = await extractRecruitmentData(rawText, targetUrl, source.name)
      if (!result) {
        errorLog.push({ source: source.name, error: "Extraction returned null", at: new Date().toISOString() })
        continue
      }

      const { data, confidence } = result
      totalFound++

      // Dedup check
      const simKey = computeSimilarityKey(data)
      const isDuplicate = existingKeys.has(simKey) || queuedKeys.has(simKey)
      const duplicateOf  = existingMap.get(simKey) ?? null

      if (isDuplicate) {
        totalDuplicate++
        // Still insert with duplicate status so admins can see it
        await supabase.from("scrape_queue").insert({
          source_url:       targetUrl,
          source_name:      source.name,
          // Cast to Json-safe shape — posts: unknown[] is not assignable to Json[]
          extracted_data:   toJsonSafe(data) as unknown as Database["public"]["Tables"]["scrape_queue"]["Insert"]["extracted_data"],
          confidence_score: confidence,
          status:           "duplicate",
          scrape_run_id:    runId,
          duplicate_of:     duplicateOf,
        })
        continue
      }

      // Safety hardening (May 2026):
      // Never auto-approve based on confidence. All scrape outputs must pass
      // evidence + official-source validation in the admin review flow before
      // promotion into canonical recruitments.
      const status = "pending"
      await supabase.from("scrape_queue").insert({
        source_url:       targetUrl,
        source_name:      source.name,
        extracted_data:   toJsonSafe(data) as unknown as Database["public"]["Tables"]["scrape_queue"]["Insert"]["extracted_data"],
        confidence_score: confidence,
        status,
        scrape_run_id:    runId,
        duplicate_of:     null,
      })

      totalNew++
      queuedKeys.add(simKey)

      // Update source last_scraped_at + health
      await supabase
        .from("scrape_sources")
        .update({
          last_scraped_at:   new Date().toISOString(),
          last_success_at:   new Date().toISOString(),
          consecutive_fails: 0,
          is_healthy:        true,
        })
        .eq("id", source.id)

    } catch (err) {
      errorLog.push({
        source: source.name,
        error:  err instanceof Error ? err.message : String(err),
        at:     new Date().toISOString(),
      })

      // Increment consecutive_fails
      await supabase
        .from("scrape_sources")
        .update({
          consecutive_fails: (source.consecutive_fails ?? 0) + 1,
          is_healthy:        false,
        })
        .eq("id", source.id)
    }
  }

  // Finalise run record
  const finalStatus = errorLog.length === activeSources.length ? "failed"
    : errorLog.length > 0 ? "partial"
    : "completed"

  await supabase.from("scrape_runs").update({
    finished_at:      new Date().toISOString(),
    status:           finalStatus,
    sources_checked:  activeSources.length,
    items_found:      totalFound,
    items_new:        totalNew,
    items_duplicate:  totalDuplicate,
    error_log:        errorLog as unknown as Database["public"]["Tables"]["scrape_runs"]["Update"]["error_log"],
  }).eq("id", runId)

  return runId
}

// ── Promote an approved scrape item into recruitments ─────────────────────────

export async function promoteToRecruitments(
  data: ExtractedRecruitment,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  // NOTE: errors here MUST throw — never swallow. The caller (approveScrapeItem)
  // depends on real error messages to decide whether to mark the queue row
  // 'approved' or 'pending'. Previous version returned null on failure which
  // caused "ghost approved" rows (status='approved', duplicate_of=null,
  // recruitments table empty). See migration 008 for the backfill.

  // ── Upsert organization ────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .upsert(
      { name: data.organization_name, type: data.org_type },
      { onConflict: "name", ignoreDuplicates: false }
    )
    .select("id")
    .single()

  if (orgErr) throw new Error(`[promote] organization upsert failed: ${orgErr.message}`)
  if (!org)   throw new Error(`[promote] organization upsert returned no row`)

  // ── Insert recruitment ─────────────────────────────────────────────────────
  // ExtractedRecruitment also carries total_vacancies, official_notification_url
  // and source_pdf_url — write them so /dashboard/exams and the "Open official
  // notification" link work. Columns added by migration 010.
  //
  // Note the `as unknown as ... & { extras }` cast: the generated types/supabase.ts
  // is UTF-16-encoded and was last regenerated before migration 010 added the two
  // URL columns. The columns DO exist in the DB; the cast bypasses the stale
  // generated Insert type until the next `supabase gen types` run.
  const dataAny = data as Record<string, unknown>
  type RecruitmentInsertWithUrls =
    Database["public"]["Tables"]["recruitments"]["Insert"] & {
      official_notification_url?: string | null
      source_pdf_url?:            string | null
    }
  const recruitmentInsert: RecruitmentInsertWithUrls = {
    organization_id:           org.id,
    name:                      data.title,
    year:                      typeof data.year === "string" ? parseInt(data.year, 10) : data.year,
    notification_date:         data.notification_date ?? null,
    apply_start_date:          data.apply_start_date  ?? null,
    apply_end_date:            data.apply_end_date     ?? null,
    status:                    deriveStatus(data.apply_start_date, data.apply_end_date),
    total_vacancies:           (dataAny.total_vacancies as number | null) ?? null,
    official_notification_url: (dataAny.official_notification_url as string | null) ?? null,
    source_pdf_url:            (dataAny.source_pdf_url as string | null) ?? null,
  }
  const { data: recruitment, error: recErr } = await supabase
    .from("recruitments")
    .insert(
      recruitmentInsert as unknown as Database["public"]["Tables"]["recruitments"]["Insert"]
    )
    .select("id")
    .single()

  if (recErr)      throw new Error(`[promote] recruitment insert failed: ${recErr.message}`)
  if (!recruitment) throw new Error(`[promote] recruitment insert returned no row`)

  // ── Insert posts (each post creates age_criteria + education_criteria) ─────
  for (const post of data.posts ?? []) {
    const postAny = post as Record<string, unknown>
    const { data: postRow, error: postErr } = await supabase
      .from("posts")
      .insert({
        recruitment_id: recruitment.id,
        post_name:      postAny.post_name as string,
        group_type:     (postAny.group_type as string | null)  ?? null,
        pay_level:      (postAny.pay_level as string | null)   ?? null,
        job_type:       "direct",
      })
      .select("id")
      .single()

    if (postErr) {
      console.error(`[promote] post insert failed (continuing): ${postErr.message}`)
      continue
    }
    if (!postRow) continue

    if (postAny.min_age || postAny.max_age) {
      const { error: ageErr } = await supabase.from("age_criteria").insert({
        post_id:     postRow.id,
        min_age:     (postAny.min_age as number | null) ?? null,
        max_age:     (postAny.max_age as number | null) ?? null,
        cutoff_date: data.apply_end_date ?? null,
      })
      if (ageErr) console.error(`[promote] age_criteria insert failed: ${ageErr.message}`)
    }

    if (postAny.education_required) {
      const { error: eduErr } = await supabase.from("education_criteria").insert({
        post_id:                 postRow.id,
        min_qualification_level: mapEducationLevel(postAny.education_required as string),
        allowed_disciplines:     postAny.disciplines
          ? (postAny.disciplines as unknown as Database["public"]["Tables"]["education_criteria"]["Insert"]["allowed_disciplines"])
          : null,
      })
      if (eduErr) console.error(`[promote] education_criteria insert failed: ${eduErr.message}`)
    }
  }

  return recruitment.id
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveStatus(start: string | null, end: string | null): string {
  const now = new Date()
  const e   = end   ? new Date(end)   : null
  const s   = start ? new Date(start) : null
  if (e && e < now) return "closed"
  if (s && s > now) return "upcoming"
  if (s && s <= now) return "open"
  return "upcoming"
}

// Keep the returned strings in sync with EDU_LEVEL_ORDER in
// lib/eligibility/engine.ts — these go straight into education_criteria and
// are compared string-equal against the user's declared level. Before the
// April 19 review, this returned "class_12"/"class_10" while the engine
// expected "12th"/"10th", so every 12th-pass / matric-pass eligibility
// check silently evaluated as rank 0 ("unknown level, assume not met").
function mapEducationLevel(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes("phd") || lower.includes("doctorate")) return "phd"
  if (lower.includes("postgraduate") || lower.includes("post graduate") || lower.includes("master")) return "postgraduate"
  if (lower.includes("graduate") || lower.includes("bachelor") || lower.includes("degree")) return "graduate"
  if (lower.includes("diploma")) return "diploma"
  if (lower.includes("12") || lower.includes("xii") || lower.includes("senior secondary") || lower.includes("intermediate")) return "12th"
  if (lower.includes("10") || lower.includes("x") || lower.includes("matriculation") || lower.includes("secondary")) return "10th"
  return "graduate"
}
