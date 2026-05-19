import React from "react";
import { Outlet } from "react-router-dom";
import ShellSubNav from "../../shared/components/ShellSubNav";

const TABS = [
  { to: "/app/eligibility/exams", label: "Exams", testId: "eligibility-tab-exams" },
  { to: "/app/eligibility/recruitments", label: "Recruitments", testId: "eligibility-tab-recruitments" },
  { to: "/app/eligibility/tracker", label: "Tracker", testId: "eligibility-tab-tracker" },
];

export default function EligibilityShell() {
  return (
    <div data-testid="eligibility-shell">
      <header className="mb-4">
        <h1 className="font-heading text-2xl font-semibold">Eligibility</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exams and recruitments you can apply to, plus the tracker that follows each application.
        </p>
      </header>
      <ShellSubNav tabs={TABS} ariaLabel="Eligibility sections" testId="eligibility-subnav" />
      <Outlet />
    </div>
  );
}
