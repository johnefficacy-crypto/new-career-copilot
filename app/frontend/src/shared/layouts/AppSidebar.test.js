import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { CalendarRange, ShieldCheck, GraduationCap, LineChart, FileText } from "lucide-react";
import AppSidebar from "./AppSidebar";

// Mirrors the DashShell primary section after PR4 of the Today /
// Eligibility / Study reorg: three primary items only. Exams /
// Study Plan / Tracker live inside the Eligibility + Study shells.
// Profile is reached via UserMenu, not the sidebar.
const SECTIONS = [
  {
    id: "primary",
    items: [
      { to: "/app/today", label: "Today", icon: CalendarRange, testId: "sidebar-today" },
      { to: "/app/eligibility", label: "Eligibility", icon: ShieldCheck, testId: "sidebar-eligibility" },
      { to: "/app/study", label: "Study", icon: GraduationCap, testId: "sidebar-study" },
    ],
  },
  {
    label: "Learning",
    testId: "sidebar-section-learning",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/app/study/subjects", label: "Subjects", icon: LineChart, testId: "sidebar-subjects" },
    ],
  },
  {
    label: "Progress",
    testId: "sidebar-section-progress",
    collapsible: true,
    defaultOpen: false,
    items: [
      { to: "/app/study/review", label: "Report Card", icon: FileText, testId: "sidebar-report-card" },
    ],
  },
];

function renderSidebar() {
  return render(
    <MemoryRouter>
      <AppSidebar brandTitle="Career Copilot" brandSubtitle="Aspirant OS" sections={SECTIONS} />
    </MemoryRouter>,
  );
}

test("renders three primary sidebar items always visible", () => {
  renderSidebar();
  ["Today", "Eligibility", "Study"].forEach((label) => {
    expect(screen.getByText(label)).toBeTruthy();
  });
});

test("does not show the legacy primary items in the sidebar", () => {
  renderSidebar();
  // Exams / Study Plan / Tracker moved inside Eligibility + Study shells.
  // Profile is reached via UserMenu in the top bar, not from the sidebar.
  expect(screen.queryByTestId("sidebar-exams")).toBeNull();
  expect(screen.queryByTestId("sidebar-study-plan")).toBeNull();
  expect(screen.queryByTestId("sidebar-tracker")).toBeNull();
  expect(screen.queryByTestId("sidebar-profile")).toBeNull();
});

test("secondary section items are hidden when section is collapsed by default", () => {
  renderSidebar();
  // Subjects lives under collapsed "Learning" group, so it shouldn't render until expanded.
  expect(screen.queryByTestId("sidebar-subjects")).toBeNull();
  // The group label itself is still visible as an expand toggle.
  expect(screen.getByText("Learning")).toBeTruthy();
});

test("renders Report Card label instead of Weekly review", () => {
  renderSidebar();
  expect(screen.queryByText("Weekly review")).toBeNull();
});
