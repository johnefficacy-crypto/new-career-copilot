import React from "react";
import EmptyState from "../../shared/ui/EmptyState";

// PR1 scaffold. Learning hub grid (Notes, Flashcards, Revision, Mocks,
// Mistakes, Subjects, Reminders, Exam intelligence) lands in PR3.
export default function StudyLearningHub() {
  return (
    <section data-testid="study-learning-page" aria-labelledby="study-learning-heading">
      <h2 id="study-learning-heading" className="sr-only">Learning hub</h2>
      <EmptyState
        title="Learning hub is moving here"
        description="A grid linking Notes, Flashcards, Revision, Mocks, Mistakes, Subjects, Reminders, and Exam intelligence lands in PR3."
        actionLabel="Open notes"
        actionHref="/app/notes"
      />
    </section>
  );
}
