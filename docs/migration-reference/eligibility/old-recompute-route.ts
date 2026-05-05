/**
 * app/api/eligibility/recompute/route.ts
 *
 * POST /api/eligibility/recompute
 * Body: { user_id: string }
 *
 * Service-role-gated endpoint. Runs `runEligibilityForUser` with an injected
 * service-role SupabaseClient so the Edge Function consumer and the in-app
 * path share ONE rule engine (`lib/eligibility/engine.ts`).
 *
 * Added in Phase 3B-follow-up to fix the eligibility split-brain flagged by
 * the April 19 code review: the `eligibility-consumer` Edge Function used to
 * ship its own minimal engine (age + edu level only, no relaxation, no
 * domicile, no appearing-candidate). Now it just POSTs here and the
 * authoritative engine does the work.
 *
 * Auth:
 *  - Request must carry `Authorization: Bearer <SERVICE_ROLE_KEY>`.
 *  - We compare against `process.env.SUPABASE_SERVICE_ROLE_KEY`.
 *  - No cookie-based session is accepted — this is strictly server-to-server.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"
import { runEligibilityForUser } from "@/lib/eligibility/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json(
      { error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 },
    )
  }

  // ── 1. Auth: caller must present the service-role key ─────────────────
  const auth = req.headers.get("authorization") ?? ""
  const presented = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : ""

  if (presented !== serviceKey) {
    return NextResponse.json(
      { error: "Unauthorized — service role required" },
      { status: 401 },
    )
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const userId = (body as { user_id?: unknown }).user_id
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json(
      { error: "Body must include { user_id: string }" },
      { status: 400 },
    )
  }

  // ── 3. Build service-role client and run the engine ───────────────────
  const supabase = createServiceClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const result = await runEligibilityForUser(userId, supabase)
    return NextResponse.json({ ok: true, user_id: userId, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[/api/eligibility/recompute] user=${userId} failed:`, msg)
    return NextResponse.json(
      { error: "Eligibility recompute failed", detail: msg },
      { status: 500 },
    )
  }
}
