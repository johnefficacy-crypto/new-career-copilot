import React from "react";
import { Outlet } from "react-router-dom";
import ShellSubNav from "../../shared/components/ShellSubNav";

const TABS = [
  { to: "/app/study", label: "Home", end: true, testId: "study-tab-home" },
  { to: "/app/study/plan", label: "Plan", testId: "study-tab-plan" },
  { to: "/app/study/learning", label: "Learning", testId: "study-tab-learning" },
  { to: "/app/study/progress", label: "Progress", testId: "study-tab-progress" },
];

export default function StudyShell() {
  return (
    <div data-testid="study-shell">
      <header className="mb-4">
        <h1 className="font-heading text-2xl font-semibold">Study</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your plan, learning hub, and progress in one place.
        </p>
      </header>
      <ShellSubNav tabs={TABS} ariaLabel="Study sections" testId="study-subnav" />
      <Outlet />
    </div>
  );
}
