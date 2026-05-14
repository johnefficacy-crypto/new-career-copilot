import React from "react";
import { Link, useParams } from "react-router-dom";
import UnifiedOnboardingShell from "../onboarding-chat/UnifiedOnboardingShell";

// CTA / funnel entry into the unified guided onboarding engine.
// Route: /go/:intent/:recruitmentSlug/:postSlug?
//
// A blog/SEO CTA links here with a known intent and a recruitment (and
// optionally a post). The same UnifiedOnboardingShell that powers the
// cold homepage path resolves the funnel context here — if a verified
// recruitment question contract exists it is used; if not, the shell
// shows a safe fallback and offers generic eligibility discovery.
// Unverified or generated questions are never exposed.
export default function FunnelLandingRouter() {
  const { intent, recruitmentSlug, postSlug } = useParams();

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
          <UnifiedOnboardingShell
            mode="cta"
            intent={intent}
            recruitmentSlug={recruitmentSlug}
            postSlug={postSlug}
          />
        </div>
      </div>
    </div>
  );
}
