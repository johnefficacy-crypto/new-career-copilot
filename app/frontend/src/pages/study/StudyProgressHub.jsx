import React from "react";
import EmptyState from "../../shared/ui/EmptyState";

// PR1 scaffold. Report card, Compare effort, Weekly/monthly review,
// and Reports/export land here in PR3.
export default function StudyProgressHub() {
  return (
    <section data-testid="study-progress-page" aria-labelledby="study-progress-heading">
      <h2 id="study-progress-heading" className="sr-only">Progress hub</h2>
      <EmptyState
        title="Progress hub is moving here"
        description="Report card, compare effort, weekly review, and exports land in PR3."
        actionLabel="Open report card"
        actionHref="/app/study/review"
      />
    </section>
  );
}
