import React from "react";
import EmptyState from "../../shared/ui/EmptyState";

// PR1 scaffold. The existing Tracker.jsx is migrated into this page in PR3.
export default function EligibilityTrackerPage() {
  return (
    <section data-testid="eligibility-tracker-page" aria-labelledby="eligibility-tracker-heading">
      <h2 id="eligibility-tracker-heading" className="sr-only">Application tracker</h2>
      <EmptyState
        title="Tracker is moving here"
        description="One timeline for applications, documents, results, and policy lands in PR3."
        actionLabel="Open current Tracker"
        actionHref="/app/tracker"
      />
    </section>
  );
}
