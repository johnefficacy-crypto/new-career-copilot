import React from "react";
import EmptyState from "../../shared/ui/EmptyState";

// PR1 scaffold for Study Home. Plan summary, focus entry, next study action,
// reminders, exam calendar, truth panel summary, and recent plan change land in PR3.
export default function StudyHome() {
  return (
    <section data-testid="study-home-page" aria-labelledby="study-home-heading">
      <h2 id="study-home-heading" className="sr-only">Study home</h2>
      <EmptyState
        title="Study home is coming together"
        description="Plan summary, focus session entry, reminders, and your study calendar land here in PR3."
        actionLabel="Open plan"
        actionHref="/app/study/plan"
      />
    </section>
  );
}
