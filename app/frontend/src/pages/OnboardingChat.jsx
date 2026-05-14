import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import UnifiedOnboardingShell from "../features/onboarding-chat/UnifiedOnboardingShell";

// Cold / homepage entry into the unified guided onboarding engine.
// Route: /app/onboarding/chat?mode=discovery
//
// This is intentionally a public, standalone page (not inside the
// protected DashShell): a guest can answer 2-3 questions here before ever
// signing in. The CTA / funnel entry uses the same shell via
// FunnelLandingRouter.
export default function OnboardingChat() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "discovery";
  const intent = searchParams.get("intent") || undefined;

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
          <UnifiedOnboardingShell mode={mode} intent={intent} />
        </div>
      </div>
    </div>
  );
}
