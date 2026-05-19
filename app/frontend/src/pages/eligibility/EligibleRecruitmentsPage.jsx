import React from "react";
import EmptyState from "../../shared/ui/EmptyState";

// PR1 scaffold. Recruitment list + detail content lands in PR3.
export default function EligibleRecruitmentsPage() {
  return (
    <section data-testid="eligibility-recruitments-page" aria-labelledby="eligibility-recruitments-heading">
      <h2 id="eligibility-recruitments-heading" className="sr-only">Eligible recruitments</h2>
      <EmptyState
        title="Recruitments view coming online"
        description="Open recruitments you qualify for will be listed here in PR3."
        actionLabel="Go to Today"
        actionHref="/app/today"
      />
    </section>
  );
}
