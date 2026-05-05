"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { runEligibilityForUser } from "@/lib/eligibility/runner"

/**
 * User triggers re-check of their own eligibility.
 * Called from dashboard after profile update.
 */
export async function refreshMyEligibility() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const result = await runEligibilityForUser(user.id)

  if (result.errors.length > 0) {
    console.error("Eligibility errors:", result.errors)
  }

  revalidatePath("/dashboard")
}