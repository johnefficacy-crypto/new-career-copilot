import React from "react";
import EmptyState from "../../shared/ui/EmptyState";

// PR1 scaffold: page is reachable so PR2 (aliases) and PR3 (content migration)
// have something concrete to redirect into. Real content lands in PR3.
export default function EligibleExamsPage() {
  return (
    <section data-testid="eligibility-exams-page" aria-labelledby="eligibility-exams-heading">
      <h2 id="eligibility-exams-heading" className="sr-only">Eligible exams</h2>
      <EmptyState
        title="Exams view is moving here"
        description="The exam catalogue lands in this shell during PR3. For now, use /app/exams."
        actionLabel="Open current Exams"
        actionHref="/app/exams"
      />
    </section>
  );
}
