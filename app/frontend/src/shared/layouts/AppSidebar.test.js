import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { CalendarRange, BookOpenCheck, ListChecks, Activity, User, LineChart, FileText } from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    id: "primary",
    items: [
      { to: "/app/today", label: "Today", icon: CalendarRange, testId: "sidebar-today" },
      { to: "/app/exams", label: "Exams", icon: BookOpenCheck, testId: "sidebar-exams" },
      { to: "/app/study-plan", label: "Study Plan", icon: ListChecks, testId: "sidebar-study-plan" },
      { to: "/app/tracker", label: "Tracker", icon: Activity, testId: "sidebar-tracker" },
      { to: "/app/profile", label: "Profile", icon: User, testId: "sidebar-profile" },
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

test("renders five primary sidebar items always visible", () => {
  renderSidebar();
  ["Today", "Exams", "Study Plan", "Tracker", "Profile"].forEach((label) => {
    expect(screen.getByText(label)).toBeTruthy();
  });
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
