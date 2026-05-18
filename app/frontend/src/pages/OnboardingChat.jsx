import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProfileOnboardingShell from "../features/onboarding-chat/ProfileOnboardingShell";
import UnifiedOnboardingShell from "../features/onboarding-chat/UnifiedOnboardingShell";

// Cold / homepage entry into the guided onboarding engine.
// Route: /app/onboarding/chat?mode=discovery
//
// The cold/discovery path is now driven by ProfileOnboardingShell —
// a Supabase anonymous sign-in fires on mount, all subsequent state
// lives on the user's profile row, no anonymous_id, no resolve loop.
// The CTA / funnel path still uses the legacy UnifiedOnboardingShell
// (it depends on the recruitment_question_requirements flow); that
// will be migrated in item 8.
export default function OnboardingChat() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "discovery";
  const intent = searchParams.get("intent") || undefined;
  const isFunnel = mode === "cta";

  return (
    <div className="min-h-screen bg-clay-50">
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <Link
          to="/"
          className="text-sm font-heading font-semibold text-clay-700 hover:text-clay-900"
        >
          Career Copilot
        </Link>
        <div className="mt-5">
          {isFunnel ? (
            <UnifiedOnboardingShell mode={mode} intent={intent} />
          ) : (
            <ProfileOnboardingShell />
          )}
        </div>
      </div>
    </div>
  );
}
